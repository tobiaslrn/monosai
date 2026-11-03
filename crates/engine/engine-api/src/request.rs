//! Requests and their cancellation, as the UI sends them.

use serde::{Deserialize, Serialize};

use crate::Call;

/// Identifies one request among those a page has in flight.
///
/// The page's engine client numbers its requests; the engine only echoes the
/// id back in the [`Response`](crate::Response) and uses it to cancel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(transparent)]
pub struct RequestId(u32);

impl RequestId {
    /// A request id, for tests and native callers that number their own requests.
    #[must_use]
    pub const fn new(value: u32) -> Self {
        Self(value)
    }

    /// The number the page chose.
    #[must_use]
    pub const fn get(self) -> u32 {
        self.0
    }
}

impl std::fmt::Display for RequestId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "request {}", self.0)
    }
}

/// One call to the engine, answered by exactly one response with the same id.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Request {
    /// Chosen by the page, unique among its requests in flight.
    pub id: RequestId,
    /// What the page asks for.
    pub call: Call,
}

/// Asks the engine to stop working on a request; dropping its work cancels it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Cancel {
    /// The request to cancel. Cancelling one that already finished does nothing.
    pub id: RequestId,
}
