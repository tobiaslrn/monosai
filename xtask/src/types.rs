//! The TypeScript declarations of the engine contract, written by ts-rs.
//!
//! `cargo xtask wasm` writes them into the web app, where they are committed
//! so that type-checking, linting, and unit tests of the web app need no Rust
//! build. `cargo xtask check` regenerates them elsewhere and fails when the
//! committed files differ.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use anyhow::{Context, Result, bail};
use monosai_engine_api::{Inbound, Outbound};
use ts_rs::{Config, TS};

use crate::process::note;

/// Where the declarations are committed, relative to the repository root.
const COMMITTED: &str = "apps/web/src/app/engine/api";

/// Where `check` regenerates them for comparison, inside the target directory.
const SCRATCH: &str = "target/xtask/engine-api";

/// Rewrites the committed declarations from the current contract.
pub(crate) fn write(root: &Path) -> Result<()> {
    let directory = root.join(COMMITTED);
    export(&directory)?;
    note(&format!("wrote the engine contract types to {COMMITTED}"));
    Ok(())
}

/// Fails when the committed declarations differ from what the contract produces now.
pub(crate) fn check(root: &Path) -> Result<()> {
    let scratch = root.join(SCRATCH);
    export(&scratch)?;
    let expected = read_all(&scratch)?;
    let committed = read_all(&root.join(COMMITTED))?;
    if expected != committed {
        let mut stale: Vec<&String> = expected
            .keys()
            .chain(committed.keys())
            .filter(|name| expected.get(*name) != committed.get(*name))
            .collect();
        stale.dedup();
        bail!(
            "the engine contract types in {COMMITTED} are stale ({}); run `cargo xtask wasm`",
            stale
                .iter()
                .map(|name| name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    note("engine contract types are current");
    Ok(())
}

/// Replaces every declaration in `directory` with those the contract produces.
fn export(directory: &Path) -> Result<()> {
    if directory.exists() {
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path.extension().is_some_and(|extension| extension == "ts") {
                fs::remove_file(path)?;
            }
        }
    }
    let config = Config::new().with_out_dir(directory);
    Inbound::export_all(&config).context("exporting the inbound types")?;
    Outbound::export_all(&config).context("exporting the outbound types")?;
    Ok(())
}

/// The `.ts` files of `directory` by name, with their contents.
fn read_all(directory: &Path) -> Result<BTreeMap<String, String>> {
    let mut files = BTreeMap::new();
    if !directory.exists() {
        return Ok(files);
    }
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.extension().is_some_and(|extension| extension == "ts") {
            let name = path
                .file_name()
                .context("a directory entry has a name")?
                .to_string_lossy()
                .into_owned();
            // Git may check the files out with CRLF line endings on Windows.
            files.insert(name, fs::read_to_string(&path)?.replace("\r\n", "\n"));
        }
    }
    Ok(files)
}
