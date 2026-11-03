//! `cargo xtask check`: everything a commit must pass before it is made.

use std::path::Path;

use anyhow::Result;

use crate::process::{command, note, run as run_command};
use crate::{layers, types};

/// The target the engine ships on; the workspace is checked for it as well as natively.
pub(crate) const WASM_TARGET: &str = "wasm32-unknown-unknown";

pub(crate) fn run(root: &Path) -> Result<()> {
    let cargo = |args: &[&str]| -> Result<()> {
        let mut cargo = command(root, "cargo")?;
        cargo.args(args);
        run_command(cargo)
    };

    cargo(&["fmt", "--all", "--check"])?;
    cargo(&[
        "clippy",
        "--workspace",
        "--all-targets",
        "--locked",
        "--",
        "-D",
        "warnings",
    ])?;
    // Code behind `cfg(target_arch = "wasm32")` is only seen by this pass.
    // xtask runs on the host only.
    cargo(&[
        "clippy",
        "--workspace",
        "--exclude",
        "xtask",
        "--all-targets",
        "--locked",
        "--target",
        WASM_TARGET,
        "--",
        "-D",
        "warnings",
    ])?;
    layers::run(root)?;
    // Each crate on its own, so none relies on a feature only another member enables.
    cargo(&["hack", "check", "--workspace", "--locked"])?;
    cargo(&[
        "hack",
        "check",
        "--workspace",
        "--locked",
        "--exclude",
        "xtask",
        "--target",
        WASM_TARGET,
    ])?;
    cargo(&["deny", "--locked", "check"])?;
    cargo(&["shear"])?;
    types::check(root)?;
    note("check passed");
    Ok(())
}
