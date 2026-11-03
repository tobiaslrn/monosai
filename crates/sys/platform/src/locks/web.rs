//! The Web Locks API behind `Locks::web`.
//!
//! A lock is held for as long as the promise its callback returns is pending,
//! so the callback returns a promise that only [`Held`]'s `Drop` resolves.

use std::time::Duration;

use futures::channel::oneshot;
use futures::future::{Either, select};
use js_sys::{Function, Promise, Reflect};
use wasm_bindgen::closure::Closure;
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use web_sys::{DomException, LockManager, LockMode, LockOptions};

use super::{AcquireError, Held as AnyHeld, LockName};

/// How the lock manager reports that its request outlived the `AbortSignal.timeout` it was given.
const TIMED_OUT: &str = "TimeoutError";

/// A lock the browser granted, released by resolving the promise it waits on.
#[derive(Debug)]
pub(super) struct Held {
    name: LockName,
    release: Function,
}

impl Held {
    pub(super) fn name(&self) -> LockName {
        self.name
    }
}

impl Drop for Held {
    fn drop(&mut self) {
        // Calling a promise's resolve function cannot throw.
        drop(self.release.call0(&JsValue::UNDEFINED));
    }
}

pub(super) async fn acquire(name: LockName, wait: Duration) -> Result<AnyHeld, AcquireError> {
    let unavailable = || AcquireError::Unavailable { name };
    let manager = lock_manager().ok_or_else(unavailable)?;

    let options = LockOptions::new();
    options.set_mode(LockMode::Exclusive);
    let wait_ms = u32::try_from(wait.as_millis()).unwrap_or(u32::MAX);
    options.set_signal(&web_sys::AbortSignal::timeout_with_u32(wait_ms));

    let (granted, on_grant) = oneshot::channel::<Function>();
    let callback = Closure::once_into_js(move |_lock: JsValue| -> Promise {
        let held = Promise::with_resolvers::<JsValue, JsValue>();
        let release: Function = held.resolve().unchecked_into();
        if let Err(release) = granted.send(release) {
            // Nobody waits for this lock any more: give it straight back.
            drop(release.call0(&JsValue::UNDEFINED));
        }
        held.promise()
    });
    let request = manager.request_with_options(name.as_str(), &options, callback.unchecked_ref());

    match select(on_grant, JsFuture::from(request)).await {
        Either::Left((Ok(release), _)) => Ok(AnyHeld::Web(Held { name, release })),
        Either::Right((Err(reason), _)) if is_timeout(&reason) => Err(AcquireError::Held { name }),
        // The request failed for another reason, or settled without ever
        // granting the lock: either way this context cannot have it.
        Either::Left((Err(oneshot::Canceled), _)) | Either::Right(_) => Err(unavailable()),
    }
}

/// `navigator.locks` in a window or a worker, if this context has one.
fn lock_manager() -> Option<LockManager> {
    let navigator = Reflect::get(&js_sys::global(), &JsValue::from_str("navigator")).ok()?;
    let locks = Reflect::get(&navigator, &JsValue::from_str("locks")).ok()?;
    let present = !locks.is_undefined() && !locks.is_null();
    present.then(|| locks.unchecked_into())
}

fn is_timeout(reason: &JsValue) -> bool {
    reason
        .dyn_ref::<DomException>()
        .is_some_and(|exception| exception.name() == TIMED_OUT)
}
