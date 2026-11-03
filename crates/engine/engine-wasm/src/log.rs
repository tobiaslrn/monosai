//! The `tracing` subscriber of the engine worker, which writes to the console.
//!
//! This is the one place that writes to the console; everything else logs
//! through `tracing`. Development builds show debug events, release builds
//! only warnings and errors.

use std::io;

use tracing::{Level, Metadata};
use tracing_subscriber::fmt::MakeWriter;
use wasm_bindgen::JsValue;

/// Installs the subscriber, unless an earlier start in this worker already did.
pub(crate) fn install() {
    let level = if cfg!(debug_assertions) {
        Level::DEBUG
    } else {
        Level::WARN
    };
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(level)
        .without_time()
        .with_writer(Console)
        .finish();
    // A second start in the same worker finds its own subscriber installed.
    if tracing::subscriber::set_global_default(subscriber).is_err() {
        tracing::debug!(name: "engine.log.reused", "the log subscriber was already installed");
    }
}

/// Makes one [`Line`] per event, at the event's level.
struct Console;

impl<'a> MakeWriter<'a> for Console {
    type Writer = Line;

    fn make_writer(&'a self) -> Line {
        Line::new(Level::INFO)
    }

    fn make_writer_for(&'a self, meta: &Metadata<'_>) -> Line {
        Line::new(*meta.level())
    }
}

/// One formatted event, written to the console when it is dropped.
struct Line {
    level: Level,
    text: Vec<u8>,
}

impl Line {
    fn new(level: Level) -> Self {
        Self {
            level,
            text: Vec::new(),
        }
    }
}

impl io::Write for Line {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.text.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Drop for Line {
    fn drop(&mut self) {
        let text = String::from_utf8_lossy(&self.text);
        let text = JsValue::from_str(text.trim_end());
        match self.level {
            Level::ERROR => web_sys::console::error_1(&text),
            Level::WARN => web_sys::console::warn_1(&text),
            _ => web_sys::console::log_1(&text),
        }
    }
}
