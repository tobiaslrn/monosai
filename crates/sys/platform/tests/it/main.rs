//! Integration tests of the public API of `monosai-platform`.

#[cfg(not(target_arch = "wasm32"))]
mod local_locks;
#[cfg(target_arch = "wasm32")]
mod web_locks;
