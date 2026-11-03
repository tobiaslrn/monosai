//! The in-process lock table behind `Locks::local`.

use std::collections::BTreeSet;
use std::time::Duration;

use super::{AcquireError, Held as AnyHeld, LockName};

/// The names currently held in one simulated origin.
#[derive(Clone, Debug, Default)]
pub(super) struct Table {
    #[expect(
        clippy::disallowed_types,
        reason = "the table is shared by every clone of the Locks handle"
    )]
    held: std::rc::Rc<std::cell::RefCell<BTreeSet<LockName>>>,
}

impl Table {
    /// Takes `name` if it is free; `_wait` is ignored, see `Locks::local`.
    pub(super) fn acquire(&self, name: LockName, _wait: Duration) -> Result<AnyHeld, AcquireError> {
        if !self.held.borrow_mut().insert(name) {
            return Err(AcquireError::Held { name });
        }
        Ok(AnyHeld::Local(Held {
            table: self.clone(),
            name,
        }))
    }
}

/// A name taken from a [`Table`], given back on drop.
#[derive(Debug)]
pub(super) struct Held {
    table: Table,
    name: LockName,
}

impl Held {
    pub(super) fn name(&self) -> LockName {
        self.name
    }
}

impl Drop for Held {
    fn drop(&mut self) {
        self.table.held.borrow_mut().remove(&self.name);
    }
}
