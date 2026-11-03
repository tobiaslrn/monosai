//! Runs in Node locally and in a headless Chrome dedicated worker in CI.

use std::time::Duration;

use futures::future::join;
use js_sys::{Function, Promise, Reflect};
use monosai_platform::{AcquireError, LockName, Locks};
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use wasm_bindgen_test::wasm_bindgen_test;

/// Long enough for the lock manager to answer, short enough to keep the suite quick.
const WAIT: Duration = Duration::from_millis(200);

/// Resolves after `ms` through a plain `setTimeout`.
///
/// Node does not stay alive for the timer behind `AbortSignal.timeout`, so a
/// test that waits on one alone ends before it fires; this timer keeps it alive.
async fn sleep(ms: i32) {
    let set_timeout: Function = Reflect::get(&js_sys::global(), &JsValue::from_str("setTimeout"))
        .expect("every JavaScript host has setTimeout")
        .unchecked_into();
    let done = Promise::new(&mut |resolve, _reject| {
        set_timeout
            .call2(&JsValue::UNDEFINED, &resolve, &JsValue::from(ms))
            .expect("setTimeout accepts a function and a delay");
    });
    JsFuture::from(done).await.expect("a timer never rejects");
}

#[wasm_bindgen_test]
async fn a_second_request_for_a_held_lock_is_refused_after_the_wait() {
    let name = const { LockName::new("monosai-test-held") };
    let locks = Locks::web();
    let _held = locks.acquire(name, WAIT).await.expect("the lock is free");

    let (refused, ()) = join(locks.acquire(name, WAIT), sleep(400)).await;
    let refused = refused.expect_err("the lock is held");

    assert!(
        matches!(refused, AcquireError::Held { name: refused } if refused == name),
        "the refusal names the held lock"
    );
}

#[wasm_bindgen_test]
async fn a_released_lock_can_be_taken_again() {
    let name = const { LockName::new("monosai-test-released") };
    let locks = Locks::web();
    drop(locks.acquire(name, WAIT).await.expect("the lock is free"));

    let again = locks
        .acquire(name, WAIT)
        .await
        .expect("the lock was released");

    assert_eq!(again.name(), name, "the new lock is the same one");
}
