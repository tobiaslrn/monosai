//! The engine worker's entry point: the engine as a WebAssembly module.
//!
//! Glue: the only code here turns JavaScript values into engine messages and
//! back, constructs the web implementations of the handles, and installs the
//! `tracing` subscriber. The worker script creates one [`EngineHandle`] with
//! `EngineHandle.start(emit)` and passes every message it receives to
//! `handle.handle(message)`; responses and events reach the page through
//! `emit`.
//!
//! Everything here exists only on `wasm32`; a native build of this crate is
//! empty.

#[cfg(target_arch = "wasm32")]
#[expect(
    clippy::disallowed_types,
    reason = "wasm-bindgen's code for an exported struct shares it with JavaScript through an Rc"
)]
mod export;
#[cfg(target_arch = "wasm32")]
mod log;
#[cfg(target_arch = "wasm32")]
mod parse;
#[cfg(target_arch = "wasm32")]
mod worker;

#[cfg(target_arch = "wasm32")]
pub use export::EngineHandle;
