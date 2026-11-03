//! The answer to a request.

use serde::Serialize;

use crate::{ErrorDto, Reply, RequestId};

/// The one answer the engine gives to each [`Request`](crate::Request).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum Response {
    /// The call succeeded.
    Ok {
        /// The request this answers.
        id: RequestId,
        /// What the call returned.
        reply: Reply,
    },
    /// The call failed, was cancelled, or the engine could not take it.
    Err {
        /// The request this answers.
        id: RequestId,
        /// Why.
        error: ErrorDto,
    },
}

impl Response {
    /// The request this answers.
    #[must_use]
    pub fn id(&self) -> RequestId {
        match self {
            Self::Ok { id, .. } | Self::Err { id, .. } => *id,
        }
    }
}
