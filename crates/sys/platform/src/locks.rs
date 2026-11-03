//! [`Locks`]: exclusive locks shared by every tab of the origin.

#[cfg(any(not(target_arch = "wasm32"), feature = "test-util"))]
mod local;
#[cfg(target_arch = "wasm32")]
mod web;

use std::fmt;
use std::time::Duration;

use monosai_kernel::{Code, Coded, Domain};

/// The name of a lock, the same in every tab that wants it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct LockName(&'static str);

impl LockName {
    /// A lock name from a literal, checked at compile time when used as `const { … }`.
    ///
    /// # Panics
    ///
    /// If `name` is empty or starts with `-`, which the Web Locks API reserves.
    #[must_use]
    pub const fn new(name: &'static str) -> Self {
        assert!(
            matches!(name.as_bytes().first(), Some(first) if *first != b'-'),
            "a lock name is not empty and does not start with `-`"
        );
        Self(name)
    }

    /// The name as the browser sees it.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        self.0
    }
}

impl fmt::Display for LockName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

/// Takes exclusive locks that every tab of the origin sees.
///
/// On the web this is the Web Locks API. A lock is released when its last
/// [`Lock`] is dropped, or when the tab or worker holding it goes away.
#[derive(Clone, Debug)]
pub struct Locks(Inner);

#[derive(Clone, Debug)]
enum Inner {
    #[cfg(target_arch = "wasm32")]
    Web,
    #[cfg(any(not(target_arch = "wasm32"), feature = "test-util"))]
    Local(local::Table),
}

impl Locks {
    /// The browser's lock manager, reached through the global `navigator`.
    #[cfg(target_arch = "wasm32")]
    #[must_use]
    pub fn web() -> Self {
        Self(Inner::Web)
    }

    /// An in-process lock table standing in for one origin: the lock manager of
    /// native builds, and of tests on any target.
    ///
    /// Clones share the table, as tabs of one origin share the browser's locks;
    /// a second call to `local` is a different origin. A held lock is refused
    /// at once rather than after `wait`, since nothing else can release it
    /// while a test awaits.
    #[cfg(any(not(target_arch = "wasm32"), feature = "test-util"))]
    #[must_use]
    pub fn local() -> Self {
        Self(Inner::Local(local::Table::default()))
    }

    /// Takes the lock `name`, waiting up to `wait` for whoever holds it to let go.
    ///
    /// # Errors
    ///
    /// [`AcquireError::Held`] when someone else still holds the lock after
    /// `wait`, and [`AcquireError::Unavailable`] when this context has no lock
    /// manager or it refuses the request.
    #[cfg_attr(
        not(target_arch = "wasm32"),
        expect(
            clippy::unused_async,
            clippy::unused_async_trait_impl,
            reason = "only the web lock manager answers asynchronously"
        )
    )]
    pub async fn acquire(&self, name: LockName, wait: Duration) -> Result<Lock, AcquireError> {
        match &self.0 {
            #[cfg(target_arch = "wasm32")]
            Inner::Web => web::acquire(name, wait).await.map(Lock::new),
            #[cfg(any(not(target_arch = "wasm32"), feature = "test-util"))]
            Inner::Local(table) => table.acquire(name, wait).map(Lock::new),
        }
    }
}

/// A held lock, released when the last clone of it is dropped.
#[derive(Clone, Debug)]
pub struct Lock {
    #[expect(
        clippy::disallowed_types,
        reason = "a lock is a handle: its clones share one release"
    )]
    held: std::rc::Rc<Held>,
}

impl Lock {
    #[expect(
        clippy::disallowed_types,
        reason = "a lock is a handle: its clones share one release"
    )]
    fn new(held: Held) -> Self {
        Self {
            held: std::rc::Rc::new(held),
        }
    }

    /// The name of the lock this holds.
    #[must_use]
    pub fn name(&self) -> LockName {
        match self.held.as_ref() {
            #[cfg(target_arch = "wasm32")]
            Held::Web(held) => held.name(),
            #[cfg(any(not(target_arch = "wasm32"), feature = "test-util"))]
            Held::Local(held) => held.name(),
        }
    }
}

/// The implementation-specific part of a held lock; dropping it releases the lock.
#[derive(Debug)]
enum Held {
    #[cfg(target_arch = "wasm32")]
    Web(web::Held),
    #[cfg(any(not(target_arch = "wasm32"), feature = "test-util"))]
    Local(local::Held),
}

/// Why a lock could not be taken.
#[derive(Debug, thiserror::Error)]
pub enum AcquireError {
    /// Someone else held the lock for longer than the caller was willing to wait.
    #[error("the lock {name} is held elsewhere")]
    Held {
        /// The lock that was asked for.
        name: LockName,
    },
    /// This context has no lock manager, or the lock manager refused the request.
    #[error("locks are unavailable here, so {name} cannot be taken")]
    Unavailable {
        /// The lock that was asked for.
        name: LockName,
    },
}

impl Coded for AcquireError {
    fn code(&self) -> Code {
        match self {
            Self::Held { .. } => const { Code::new(Domain::Platform, "lock-held") },
            Self::Unavailable { .. } => const { Code::new(Domain::Platform, "locks-unavailable") },
        }
    }
}
