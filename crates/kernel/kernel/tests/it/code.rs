use monosai_kernel::{Code, Domain};

#[test]
fn a_code_reads_as_domain_slash_name() {
    let code = const { Code::new(Domain::Engine, "open-in-another-tab") };
    assert_eq!(code.to_string(), "engine/open-in-another-tab");
}

#[test]
#[should_panic(expected = "kebab-case")]
fn rejects_a_name_with_capitals() {
    let _code = Code::new(Domain::Engine, "OpenElsewhere");
}

#[test]
#[should_panic(expected = "kebab-case")]
fn rejects_a_name_with_a_trailing_dash() {
    let _code = Code::new(Domain::Engine, "open-");
}

#[test]
#[should_panic(expected = "kebab-case")]
fn rejects_an_empty_name() {
    let _code = Code::new(Domain::Platform, "");
}
