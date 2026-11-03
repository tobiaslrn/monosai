//! Taking ownership of the origin's data when the engine starts.

use std::time::Duration;

use monosai_kernel::{Code, Coded, Domain};
use monosai_platform::{AcquireError, LockName};

/// The lock whose holder owns the origin's data. Every tab asks for the same one.
pub(crate) const OWNER: LockName = const { LockName::new("monosai-engine") };

/// How long a starting engine waits for the lock before it refuses.
///
/// A reloading tab starts its new engine while the old worker may not have
/// been torn down yet, so its lock can outlive the page by a moment; this
/// covers that. Any longer and a second tab takes that much longer to say
/// why it cannot start.
pub(crate) const OWNER_WAIT: Duration = Duration::from_millis(1500);

/// Why the engine could not take ownership of the origin's data.
#[derive(Debug, thiserror::Error)]
pub(crate) enum StartError {
    /// Another tab's engine holds the lock.
    #[error("Monosai is open in another tab")]
    OpenElsewhere,
    /// The browser offers no way to hold the lock, so ownership cannot be guaranteed.
    #[error("this browser cannot give Monosai sole use of its data")]
    NoLocks,
}

impl From<AcquireError> for StartError {
    fn from(error: AcquireError) -> Self {
        match error {
            AcquireError::Held { .. } => Self::OpenElsewhere,
            AcquireError::Unavailable { .. } => Self::NoLocks,
        }
    }
}

impl Coded for StartError {
    fn code(&self) -> Code {
        match self {
            Self::OpenElsewhere => const { Code::new(Domain::Engine, "open-in-another-tab") },
            Self::NoLocks => const { Code::new(Domain::Engine, "locks-unavailable") },
        }
    }
}
