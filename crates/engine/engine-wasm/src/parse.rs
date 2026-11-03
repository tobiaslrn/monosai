//! The boundary where messages from the page become engine types.

use monosai_engine_api::{Inbound, RequestId};
use monosai_kernel::{Code, Coded, Domain};
use serde::Deserialize;
use wasm_bindgen::JsValue;

/// What a message from the page turned out to be.
#[derive(Debug)]
pub(crate) enum Parsed {
    /// A valid message.
    Message(Inbound),
    /// An invalid message that still names the request it belongs to, so it can be answered.
    Unanswerable {
        /// The request to answer with the error.
        id: RequestId,
        /// Why the message was rejected.
        error: MessageError,
    },
    /// An invalid message that names no request.
    Unaddressed(MessageError),
}

/// Why a message from the page was rejected.
///
/// It never carries the message or the parser's text, which can quote values.
#[derive(Debug, thiserror::Error)]
pub(crate) enum MessageError {
    /// The message does not match the contract.
    #[error("the engine received a message that does not match its contract")]
    Invalid,
}

impl Coded for MessageError {
    fn code(&self) -> Code {
        match self {
            Self::Invalid => const { Code::new(Domain::Engine, "invalid-request") },
        }
    }
}

/// Only the id of a message, read leniently to address the answer to one that is invalid.
#[derive(Deserialize)]
struct Addressed {
    id: RequestId,
}

#[expect(clippy::disallowed_methods, reason = "boundary parse")]
pub(crate) fn inbound(message: JsValue) -> Parsed {
    match serde_wasm_bindgen::from_value::<Inbound>(message.clone()) {
        Ok(inbound) => Parsed::Message(inbound),
        Err(_) => match serde_wasm_bindgen::from_value::<Addressed>(message) {
            Ok(Addressed { id }) => Parsed::Unanswerable {
                id,
                error: MessageError::Invalid,
            },
            Err(_) => Parsed::Unaddressed(MessageError::Invalid),
        },
    }
}
