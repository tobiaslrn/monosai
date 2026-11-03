use monosai_engine_api::{Call, Cancel, Inbound, Request, RequestId};
use serde_json::{Value, json};

/// A valid message for every inbound payload: each kind of message, and each call.
///
/// The `match` stops compiling when a call is added without a sample here.
fn samples() -> Vec<Value> {
    let calls = [Call::Ping {}].map(|call| match call {
        Call::Ping {} => json!({ "type": "ping" }),
    });
    let mut samples: Vec<Value> = calls
        .into_iter()
        .map(|call| json!({ "kind": "request", "id": 1, "call": call }))
        .collect();
    samples.push(json!({ "kind": "cancel", "id": 1 }));
    samples
}

/// Every object inside `sample`, as a path of keys from the root.
fn objects(value: &Value, path: &[String], found: &mut Vec<Vec<String>>) {
    if let Value::Object(map) = value {
        found.push(path.to_vec());
        for (key, child) in map {
            let mut child_path = path.to_vec();
            child_path.push(key.clone());
            objects(child, &child_path, found);
        }
    }
}

fn with_extra_field(sample: &Value, path: &[String]) -> Value {
    let mut changed = sample.clone();
    let mut target = &mut changed;
    for key in path {
        target = target.get_mut(key).expect("the path came from this sample");
    }
    target
        .as_object_mut()
        .expect("the path leads to an object")
        .insert("unexpected".to_owned(), json!(true));
    changed
}

#[test]
fn every_sample_is_accepted() {
    for sample in samples() {
        let parsed = serde_json::from_value::<Inbound>(sample.clone());
        assert_ne!(parsed.ok(), None, "{sample} should parse");
    }
}

#[test]
fn every_payload_rejects_an_unknown_field() {
    for sample in samples() {
        let mut paths = Vec::new();
        objects(&sample, &[], &mut paths);
        for path in paths {
            let changed = with_extra_field(&sample, &path);
            let parsed = serde_json::from_value::<Inbound>(changed.clone());
            assert_eq!(parsed.ok(), None, "{changed} should be rejected");
        }
    }
}

#[test]
fn a_request_reads_its_id_and_call() {
    let parsed: Inbound =
        serde_json::from_value(json!({ "kind": "request", "id": 7, "call": { "type": "ping" } }))
            .expect("a valid request");
    assert_eq!(
        parsed,
        Inbound::Request(Request {
            id: RequestId::new(7),
            call: Call::Ping {}
        })
    );
}

#[test]
fn a_cancel_reads_its_id() {
    let parsed: Inbound =
        serde_json::from_value(json!({ "kind": "cancel", "id": 3 })).expect("a valid cancel");
    assert_eq!(
        parsed,
        Inbound::Cancel(Cancel {
            id: RequestId::new(3)
        })
    );
}

#[test]
fn rejects_an_id_that_is_not_a_whole_number() {
    for id in [json!(-1), json!(1.5), json!("1"), json!(4_294_967_296_u64)] {
        let message = json!({ "kind": "cancel", "id": id });
        let parsed = serde_json::from_value::<Inbound>(message.clone());
        assert_eq!(parsed.ok(), None, "{message} should be rejected");
    }
}

#[test]
fn rejects_an_unknown_call() {
    let message = json!({ "kind": "request", "id": 1, "call": { "type": "deleteEverything" } });
    serde_json::from_value::<Inbound>(message).expect_err("unknown calls are rejected");
}
