//! [`EngineHandle`]: the engine as the worker script sees it.
//!
//! Only the exported shell lives here, because the code `#[wasm_bindgen]`
//! generates for it shares the struct with JavaScript through an `Rc`; the
//! work happens in `worker`.

use js_sys::{Function, Promise};
use monosai_engine::Engine;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::worker;

/// The engine running in this worker, and the function it posts to the page through.
#[wasm_bindgen]
#[derive(Debug)]
pub struct EngineHandle {
    engine: Engine,
    emit: Function,
}

#[wasm_bindgen]
impl EngineHandle {
    /// Starts the engine; `emit` receives every outbound message.
    ///
    /// Resolves once the engine either owns the origin's data or knows it
    /// cannot; a refused engine answers every request with the reason.
    pub async fn start(emit: Function) -> EngineHandle {
        let engine = worker::start(&emit).await;
        EngineHandle { engine, emit }
    }

    /// Handles one inbound message; its response, if any, goes through `emit`.
    ///
    /// The promise resolves once the message has been handled, and rejects
    /// only for a message so malformed that it names no request to answer.
    pub fn handle(&self, message: JsValue) -> Promise {
        worker::handle(self.engine.clone(), self.emit.clone(), message)
    }
}
