//! Errors as the UI receives them.

use serde::Serialize;

/// The area an error comes from; the UI keys its copy on this and [`ErrorDto::code`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "kebab-case")]
pub enum ErrorDomain {
    /// The engine itself: startup, request handling, and this wire.
    Engine,
    /// Browser and operating-system services.
    Platform,
}

/// An error the engine reports to the UI.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct ErrorDto {
    /// The area the error comes from.
    pub domain: ErrorDomain,
    /// A stable name within the domain, such as `open-in-another-tab`.
    pub code: String,
    /// A sentence for logs and diagnostics; the UI shows its own copy.
    pub message: String,
}
