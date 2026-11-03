//! The calls the engine answers and the replies it gives.

use serde::{Deserialize, Serialize};

/// What a request asks the engine to do.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Call {
    /// Answers [`Reply::Pong`] once the engine runs; startup sends it first.
    #[expect(
        clippy::empty_enum_variants_with_brackets,
        reason = "serde checks for unknown fields only in a variant with braces"
    )]
    Ping {},
}

/// The successful answer to a [`Call`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Reply {
    /// The answer to [`Call::Ping`].
    Pong,
}
