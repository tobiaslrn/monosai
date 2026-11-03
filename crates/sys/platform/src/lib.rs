//! Browser and operating-system services the engine uses, one handle per service.
//!
//! Handle: the only code here that touches the outside world is the handle
//! types, cheap `Clone` structs with one private implementation per target and
//! a test implementation behind the `test-util` feature. Nothing here decides
//! anything; callers pass in what to do and get back what happened.
//!
//! - [`Locks`]: exclusive locks shared by every tab of the origin, which is how
//!   one engine owns the database at a time.

mod locks;

pub use locks::{AcquireError, Lock, LockName, Locks};
