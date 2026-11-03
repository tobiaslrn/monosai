//! [`Requests`]: the requests in flight, so each can be cancelled by its id.

use std::collections::BTreeMap;

use futures::future::{AbortHandle, AbortRegistration, Abortable, Aborted};
use monosai_engine_api::RequestId;
use monosai_kernel::{Code, Coded, Domain};

/// The requests in flight, shared by every clone of the engine.
#[derive(Clone, Debug, Default)]
pub(crate) struct Requests {
    #[expect(
        clippy::disallowed_types,
        reason = "the request table is a handle shared by every clone of the engine"
    )]
    running: std::rc::Rc<std::cell::RefCell<BTreeMap<RequestId, AbortHandle>>>,
}

impl Requests {
    /// Runs `work` as request `id` until it finishes or [`Requests::cancel`] stops it.
    pub(crate) async fn run<F: Future>(
        &self,
        id: RequestId,
        work: F,
    ) -> Result<F::Output, RunError> {
        let (registered, abort) = self.register(id)?;
        let outcome = Abortable::new(work, abort).await;
        drop(registered);
        outcome.map_err(|Aborted| RunError::Cancelled { id })
    }

    /// Stops request `id` if it is still running.
    pub(crate) fn cancel(&self, id: RequestId) {
        if let Some(handle) = self.running.borrow().get(&id) {
            handle.abort();
        }
    }

    fn register(&self, id: RequestId) -> Result<(Registered, AbortRegistration), RunError> {
        let mut running = self.running.borrow_mut();
        if running.contains_key(&id) {
            return Err(RunError::Duplicate { id });
        }
        let (handle, registration) = AbortHandle::new_pair();
        running.insert(id, handle);
        Ok((
            Registered {
                requests: self.clone(),
                id,
            },
            registration,
        ))
    }
}

/// Removes a request from the table when it ends, however it ends.
#[derive(Debug)]
struct Registered {
    requests: Requests,
    id: RequestId,
}

impl Drop for Registered {
    fn drop(&mut self) {
        self.requests.running.borrow_mut().remove(&self.id);
    }
}

/// Why a request produced no outcome.
#[derive(Debug, thiserror::Error)]
pub(crate) enum RunError {
    /// The page sent a second request with the id of one still running.
    #[error("{id} is already running")]
    Duplicate {
        /// The id both requests carry.
        id: RequestId,
    },
    /// The page cancelled the request before it finished.
    #[error("{id} was cancelled")]
    Cancelled {
        /// The cancelled request.
        id: RequestId,
    },
}

impl Coded for RunError {
    fn code(&self) -> Code {
        match self {
            Self::Duplicate { .. } => const { Code::new(Domain::Engine, "duplicate-request") },
            Self::Cancelled { .. } => const { Code::new(Domain::Engine, "cancelled") },
        }
    }
}

#[cfg(test)]
mod tests {
    use futures::executor::LocalPool;
    use futures::future::pending;
    use futures::task::LocalSpawnExt;

    use super::*;

    const ID: RequestId = RequestId::new(1);

    /// Runs `run` on a pool until it stalls, then hands the pool to `then`.
    fn spawn_pending(
        pool: &mut LocalPool,
        requests: &Requests,
    ) -> futures::future::RemoteHandle<Result<(), RunError>> {
        let requests = requests.clone();
        let handle = pool
            .spawner()
            .spawn_local_with_handle(async move { requests.run(ID, pending::<()>()).await })
            .expect("the pool accepts tasks");
        pool.run_until_stalled();
        handle
    }

    #[test]
    fn a_cancelled_request_ends_as_cancelled_and_leaves_the_table() {
        let mut pool = LocalPool::new();
        let requests = Requests::default();
        let outcome = spawn_pending(&mut pool, &requests);

        requests.cancel(ID);

        let outcome = pool.run_until(outcome);
        assert!(matches!(outcome, Err(RunError::Cancelled { id }) if id == ID));
        assert!(requests.running.borrow().is_empty());
    }

    #[test]
    fn a_second_request_with_a_running_id_is_refused() {
        let mut pool = LocalPool::new();
        let requests = Requests::default();
        let _first = spawn_pending(&mut pool, &requests);

        let second = pool.run_until(requests.run(ID, async {}));

        assert!(matches!(second, Err(RunError::Duplicate { id }) if id == ID));
        assert_eq!(
            requests.running.borrow().len(),
            1,
            "the first keeps running"
        );
    }

    #[test]
    fn an_id_can_be_reused_once_its_request_finished() {
        let mut pool = LocalPool::new();
        let requests = Requests::default();

        pool.run_until(requests.run(ID, async {}))
            .expect("the first request finishes");
        pool.run_until(requests.run(ID, async {}))
            .expect("its id is free again");
    }

    #[test]
    fn cancelling_an_unknown_request_does_nothing() {
        let requests = Requests::default();
        requests.cancel(ID);
        assert!(requests.running.borrow().is_empty());
    }
}
