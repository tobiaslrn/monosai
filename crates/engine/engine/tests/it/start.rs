use futures::StreamExt;
use futures::executor::block_on;
use monosai_engine::Engine;
use monosai_engine_api::{Call, ErrorDomain, ErrorDto, Reply, Request, RequestId, Response};
use monosai_platform::Locks;

fn ping(id: u32) -> Request {
    Request {
        id: RequestId::new(id),
        call: Call::Ping {},
    }
}

#[test]
fn a_started_engine_answers_ping() {
    let (engine, _events) = block_on(Engine::start(&Locks::local()));

    let response = block_on(engine.handle(ping(1)));

    assert_eq!(
        response,
        Response::Ok {
            id: RequestId::new(1),
            reply: Reply::Pong
        }
    );
}

#[test]
fn a_second_engine_of_the_origin_answers_every_request_with_the_refusal() {
    let tab = Locks::local();
    let (_first, _events) = block_on(Engine::start(&tab));
    let (second, mut second_events) = block_on(Engine::start(&tab.clone()));

    let response = block_on(second.handle(ping(5)));

    assert_eq!(
        response,
        Response::Err {
            id: RequestId::new(5),
            error: ErrorDto {
                domain: ErrorDomain::Engine,
                code: "open-in-another-tab".to_owned(),
                message: "Monosai is open in another tab".to_owned(),
            },
        }
    );
    assert!(
        block_on(second_events.next()).is_none(),
        "a refused engine announces nothing"
    );
}

#[test]
fn the_lock_is_released_when_the_last_clone_of_the_engine_goes() {
    let tab = Locks::local();
    let (first, events) = block_on(Engine::start(&tab));
    let clone = first.clone();
    drop((first, events));
    let (still_refused, _) = block_on(Engine::start(&tab));
    assert!(matches!(
        block_on(still_refused.handle(ping(1))),
        Response::Err { .. }
    ));

    drop(clone);

    let (after_reload, _events) = block_on(Engine::start(&tab));
    assert!(matches!(
        block_on(after_reload.handle(ping(2))),
        Response::Ok { .. }
    ));
}
