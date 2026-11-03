//! The vocabulary every layer shares: stable codes that identify errors.
//!
//! Pure: data in, data out. No I/O, no async, no clock, no randomness, no
//! logging. It depends on no other crate of the workspace.

mod code;

pub use code::{Code, Coded, Domain};
