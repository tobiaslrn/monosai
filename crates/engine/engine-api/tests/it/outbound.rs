use monosai_engine_api::{ErrorDomain, ErrorDto, Outbound, Reply, RequestId, Response};
use serde_json::json;

#[test]
fn a_reply_is_posted_flat_with_its_kind_and_outcome() {
    let outbound = Outbound::Response(Response::Ok {
        id: RequestId::new(4),
        reply: Reply::Pong,
    });

    let posted = serde_json::to_value(&outbound).expect("outbound messages serialize");

    assert_eq!(
        posted,
        json!({ "kind": "response", "outcome": "ok", "id": 4, "reply": { "type": "pong" } })
    );
}

#[test]
fn an_error_carries_domain_code_and_message() {
    let outbound = Outbound::Response(Response::Err {
        id: RequestId::new(9),
        error: ErrorDto {
            domain: ErrorDomain::Engine,
            code: "open-in-another-tab".to_owned(),
            message: "Monosai is open in another tab".to_owned(),
        },
    });

    let posted = serde_json::to_value(&outbound).expect("outbound messages serialize");

    assert_eq!(
        posted,
        json!({
            "kind": "response",
            "outcome": "err",
            "id": 9,
            "error": {
                "domain": "engine",
                "code": "open-in-another-tab",
                "message": "Monosai is open in another tab"
            }
        })
    );
}
