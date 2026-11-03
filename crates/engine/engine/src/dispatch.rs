//! Which workflow answers which call.

use monosai_engine_api::{Call, Event, Reply};

/// A call's successful outcome: the reply and the events it implies.
#[derive(Debug)]
pub(crate) struct Answer {
    pub(crate) reply: Reply,
    pub(crate) events: Vec<Event>,
}

/// Answers `call`. The match is exhaustive, so every call has an answer.
pub(crate) fn answer(call: Call) -> Answer {
    match call {
        Call::Ping {} => Answer {
            reply: Reply::Pong,
            events: Vec::new(),
        },
    }
}
