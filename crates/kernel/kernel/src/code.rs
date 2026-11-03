//! Stable error codes: what the UI keys its copy on and the log records.

use std::fmt;

/// The area an error comes from, the first half of a [`Code`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Domain {
    /// The engine itself: startup, request handling, and its wire.
    Engine,
    /// Browser and operating-system services behind the `platform` handles.
    Platform,
}

impl Domain {
    /// The domain as it appears in a code, such as `engine`.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Engine => "engine",
            Self::Platform => "platform",
        }
    }
}

impl fmt::Display for Domain {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A stable identifier for one kind of error, such as `engine/open-in-another-tab`.
///
/// The name is lowercase kebab-case and never changes once released: the UI
/// chooses its copy by it, and logs are searched by it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Code {
    domain: Domain,
    name: &'static str,
}

impl Code {
    /// A code from a literal name, checked at compile time when used as `const { … }`.
    ///
    /// # Panics
    ///
    /// If `name` is empty or not lowercase kebab-case.
    #[must_use]
    pub const fn new(domain: Domain, name: &'static str) -> Self {
        assert!(is_kebab_case(name), "a code name is lowercase kebab-case");
        Self { domain, name }
    }

    /// The area the error comes from.
    #[must_use]
    pub const fn domain(self) -> Domain {
        self.domain
    }

    /// The name within the domain, such as `open-in-another-tab`.
    #[must_use]
    pub const fn name(self) -> &'static str {
        self.name
    }
}

impl fmt::Display for Code {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/{}", self.domain, self.name)
    }
}

/// An error with a stable [`Code`] for every variant.
///
/// Implementations match exhaustively, so a new variant cannot go without one.
pub trait Coded {
    /// The code of this error.
    fn code(&self) -> Code;
}

const fn is_kebab_case(name: &str) -> bool {
    let bytes = name.as_bytes();
    let Some((&first, rest)) = bytes.split_first() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }
    let mut previous = first;
    let mut remaining = rest;
    while let Some((&byte, tail)) = remaining.split_first() {
        let allowed = byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-';
        if !allowed || (byte == b'-' && previous == b'-') {
            return false;
        }
        previous = byte;
        remaining = tail;
    }
    previous != b'-'
}
