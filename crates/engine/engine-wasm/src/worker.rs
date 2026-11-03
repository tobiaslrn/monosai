//! Starting the engine in the worker and moving messages between it and the page.

use futures::StreamExt;
use js_sys::{Function, Promise};
use monosai_engine::{Engine, error_dto};
use monosai_engine_api::{Inbound, Outbound, Response};
use monosai_platform::Locks;
use serde::Serialize;
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::{future_to_promise, spawn_local};

use crate::parse::{self, Parsed};

/// Starts the engine with the web handles and forwards its events through `emit`.
pub(crate) async fn start(emit: &Function) -> Engine {
    crate::log::install();
    let (engine, mut events) = Engine::start(&Locks::web()).await;
    let forward_to = emit.clone();
    spawn_local(async move {
        while let Some(event) = events.next().await {
            post(&forward_to, &Outbound::Event(event));
        }
    });
    engine
}

/// Handles one message from the page in its own task; see `EngineHandle::handle`.
pub(crate) fn handle(engine: Engine, emit: Function, message: JsValue) -> Promise {
    future_to_promise(async move {
        match parse::inbound(message) {
            Parsed::Message(Inbound::Request(request)) => {
                let response = engine.handle(request).await;
                post(&emit, &Outbound::Response(response));
            }
            Parsed::Message(Inbound::Cancel(cancel)) => engine.cancel(&cancel),
            Parsed::Unanswerable { id, error } => {
                let error = error_dto(&error);
                post(&emit, &Outbound::Response(Response::Err { id, error }));
            }
            Parsed::Unaddressed(error) => return Err(JsValue::from_str(&error.to_string())),
        }
        Ok(JsValue::UNDEFINED)
    })
}

/// Posts `outbound` to the page, as plain JSON-compatible objects.
fn post(emit: &Function, outbound: &Outbound) {
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    match outbound.serialize(&serializer) {
        Ok(value) => {
            if emit.call1(&JsValue::UNDEFINED, &value).is_err() {
                tracing::error!(name: "engine.post.failed", "the page's message handler threw");
            }
        }
        Err(error) => {
            tracing::error!(name: "engine.post.unserializable", %error, "an outbound message could not be serialized");
        }
    }
}
