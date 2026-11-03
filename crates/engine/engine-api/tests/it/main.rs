//! Integration tests of the public API of `monosai-engine-api`.
#![expect(
    clippy::disallowed_methods,
    reason = "these tests parse the wire format they check"
)]

mod inbound;
mod outbound;
