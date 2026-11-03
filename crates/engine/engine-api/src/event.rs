//! What the engine announces without being asked.

use serde::Serialize;

/// Something that changed in the engine, so the UI re-queries what it shows.
///
/// No call changes engine state yet, so there is nothing to announce.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {}
