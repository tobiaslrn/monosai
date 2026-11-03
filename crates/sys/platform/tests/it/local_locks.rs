use std::time::Duration;

use futures::executor::block_on;
use monosai_kernel::Coded;
use monosai_platform::{AcquireError, LockName, Locks};

const NAME: LockName = LockName::new("monosai-test");
const WAIT: Duration = Duration::from_millis(1);

#[test]
fn a_second_holder_of_the_same_origin_is_refused() {
    let locks = Locks::local();
    let other_tab = locks.clone();
    let _held = block_on(locks.acquire(NAME, WAIT)).expect("the first request takes the lock");

    let refused = block_on(other_tab.acquire(NAME, WAIT)).expect_err("the lock is taken");

    assert!(matches!(refused, AcquireError::Held { name } if name == NAME));
    assert_eq!(refused.code().to_string(), "platform/lock-held");
}

#[test]
fn dropping_the_last_clone_releases_the_lock() {
    let locks = Locks::local();
    let held = block_on(locks.acquire(NAME, WAIT)).expect("the lock is free");
    let shared = held.clone();
    drop(held);
    assert!(
        block_on(locks.acquire(NAME, WAIT)).is_err(),
        "a clone still holds it"
    );

    drop(shared);

    let again = block_on(locks.acquire(NAME, WAIT)).expect("the lock was released");
    assert_eq!(again.name(), NAME);
}

#[test]
fn separate_origins_do_not_share_locks() {
    let _held = block_on(Locks::local().acquire(NAME, WAIT)).expect("the lock is free");
    assert!(
        block_on(Locks::local().acquire(NAME, WAIT)).is_ok(),
        "another origin has its own locks"
    );
}
