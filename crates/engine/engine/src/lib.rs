//! The engine: owns the handles, answers requests, and announces what changed.
//!
//! Glue: it composes pure rules and handles and is platform-neutral, so native
//! tests drive the same [`Engine`] the web worker runs. Workflows return
//! outcomes; the engine turns them into [`Response`]s and [`Event`]s and turns
//! errors into [`ErrorDto`]s. Only the engine crates construct handles.
//!
//! One engine owns the data of an origin at a time: [`Engine::start`] takes an
//! exclusive lock first, and an engine that cannot get it answers every
//! request with the reason instead.

mod dispatch;
mod dto;
mod requests;
mod start;

use futures::channel::mpsc::{self, UnboundedReceiver, UnboundedSender};
use monosai_engine_api::{Cancel, ErrorDto, Event, Request, Response};
use monosai_kernel::Coded;
use monosai_platform::{Lock, Locks};

pub use dto::error_dto;

use crate::requests::Requests;
use crate::start::{OWNER, OWNER_WAIT, StartError};

/// The running engine; clones share its state and answer the same requests.
#[derive(Clone, Debug)]
pub struct Engine(State);

#[derive(Clone, Debug)]
enum State {
    /// This engine owns the origin's data.
    Running(Running),
    /// Another engine owns it; every request is answered with this error.
    Refused(ErrorDto),
}

#[derive(Clone, Debug)]
struct Running {
    requests: Requests,
    events: UnboundedSender<Event>,
    #[expect(
        dead_code,
        reason = "held, not read: dropping the last engine releases the lock"
    )]
    lock: Lock,
}

impl Engine {
    /// Starts the engine, refused when another tab's engine holds the lock.
    ///
    /// Also returns the stream of events the engine announces, which ends
    /// when the last clone of a running engine is dropped, and at once for a
    /// refused one.
    pub async fn start(locks: &Locks) -> (Self, UnboundedReceiver<Event>) {
        let (events, announced) = mpsc::unbounded();
        let state = match locks.acquire(OWNER, OWNER_WAIT).await {
            Ok(lock) => {
                tracing::info!(name: "engine.start.done", "engine started");
                State::Running(Running {
                    requests: Requests::default(),
                    events,
                    lock,
                })
            }
            Err(acquire) => {
                let error = StartError::from(acquire);
                tracing::warn!(name: "engine.start.refused", code = %error.code(), "engine refused to start");
                State::Refused(error_dto(&error))
            }
        };
        (Self(state), announced)
    }

    /// Answers one request.
    ///
    /// The request runs until it finishes or is cancelled through
    /// [`Engine::cancel`]; either way exactly one response comes back.
    pub async fn handle(&self, request: Request) -> Response {
        let Request { id, call } = request;
        let running = match &self.0 {
            State::Running(running) => running,
            State::Refused(error) => {
                return Response::Err {
                    id,
                    error: error.clone(),
                };
            }
        };
        match running
            .requests
            .run(id, async move { dispatch::answer(call) })
            .await
        {
            Ok(answer) => {
                running.announce(answer.events);
                Response::Ok {
                    id,
                    reply: answer.reply,
                }
            }
            Err(error) => {
                tracing::debug!(name: "engine.request.failed", request = id.get(), code = %error.code(), "request failed");
                Response::Err {
                    id,
                    error: error_dto(&error),
                }
            }
        }
    }

    /// Stops work on a request; it is then answered as cancelled.
    pub fn cancel(&self, cancel: &Cancel) {
        if let State::Running(running) = &self.0 {
            running.requests.cancel(cancel.id);
        }
    }
}

impl Running {
    fn announce(&self, events: Vec<Event>) {
        for event in events {
            if self.events.unbounded_send(event).is_err() {
                tracing::warn!(name: "engine.event.dropped", "nobody listens for engine events");
            }
        }
    }
}
