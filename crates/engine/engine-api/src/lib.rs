//! The contract between the UI and the engine: every message either side sends.
//!
//! Pure: types only, no behaviour beyond serialization. The UI posts
//! [`Inbound`] messages to the engine worker and receives [`Outbound`] ones.
//! A [`Request`] carries one [`Call`] and is answered by exactly one
//! [`Response`]; [`Event`]s say what changed, not the new data.
//!
//! Every inbound payload rejects unknown fields, which together with
//! validating newtypes is the runtime validation of what the UI sends. With the
//! `ts` feature, every type also derives its TypeScript declaration, which
//! `cargo xtask wasm` writes to `apps/web/src/app/engine/api/`.

mod call;
mod error;
mod event;
mod message;
mod request;
mod response;

pub use call::{Call, Reply};
pub use error::{ErrorDomain, ErrorDto};
pub use event::Event;
pub use message::{Inbound, Outbound};
pub use request::{Cancel, Request, RequestId};
pub use response::Response;
