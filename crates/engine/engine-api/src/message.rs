//! The two message types that cross the worker boundary.

use serde::{Deserialize, Serialize};

use crate::{Cancel, Event, Request, Response};

/// Everything the page posts to the engine worker.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Inbound {
    /// A call to answer.
    Request(Request),
    /// A request to stop answering.
    Cancel(Cancel),
}

/// Everything the engine worker posts to the page.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Outbound {
    /// The answer to one request.
    Response(Response),
    /// Something changed.
    Event(Event),
}
