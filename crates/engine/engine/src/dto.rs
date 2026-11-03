//! Errors as the UI receives them.

use std::fmt;

use monosai_engine_api::{ErrorDomain, ErrorDto};
use monosai_kernel::{Coded, Domain};

/// The wire form of any coded error: its code, split in two, and its message.
pub fn error_dto(error: &(impl Coded + fmt::Display)) -> ErrorDto {
    let code = error.code();
    ErrorDto {
        domain: match code.domain() {
            Domain::Engine => ErrorDomain::Engine,
            Domain::Platform => ErrorDomain::Platform,
        },
        code: code.name().to_owned(),
        message: error.to_string(),
    }
}
