//! `cargo xtask test`: nextest over the workspace, or over what changed.
//!
//! `--changed` maps the files that differ from `HEAD` (staged, unstaged, and
//! untracked) to the crates that contain them, adds every crate that depends on
//! those, and tests only that set. A change outside every crate, such as to the
//! workspace manifest or the lockfile, tests everything.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use cargo_metadata::{Metadata, PackageId};

use crate::check::WASM_TARGET;
use crate::layers::metadata;
use crate::process::{command, note, output, run, run_echoed};

/// What `--changed` tests.
enum Selection {
    Everything,
    Packages(BTreeSet<String>),
}

pub(crate) fn test(root: &Path, changed: bool, wasm: bool) -> Result<()> {
    let metadata = metadata(root)?;
    let selection = if changed {
        select_changed(root, &metadata)?
    } else {
        Selection::Everything
    };
    if wasm {
        return test_wasm(root, &metadata, &selection);
    }
    let mut nextest = command(root, "cargo")?;
    nextest.args(["nextest", "run", "--locked", "--no-tests", "warn"]);
    match &selection {
        Selection::Everything => {
            nextest.arg("--workspace");
        }
        Selection::Packages(packages) if packages.is_empty() => {
            note("no crate changed since HEAD; nothing to test");
            return Ok(());
        }
        Selection::Packages(packages) => {
            for package in packages {
                nextest.args(["--package", package]);
            }
        }
    }
    run(nextest)
}

/// Runs the `wasm-bindgen-test` suites of the crates that have one.
///
/// They run in Node unless `WASM_BINDGEN_USE_BROWSER` or
/// `WASM_BINDGEN_USE_DEDICATED_WORKER` asks for a browser, as CI does.
fn test_wasm(root: &Path, metadata: &Metadata, selection: &Selection) -> Result<()> {
    let packages: Vec<&str> = metadata
        .workspace_packages()
        .into_iter()
        .filter(|package| {
            package
                .dependencies
                .iter()
                .any(|dependency| dependency.name == "wasm-bindgen-test")
        })
        .map(|package| package.name.as_str())
        .filter(|name| match selection {
            Selection::Everything => true,
            Selection::Packages(selected) => selected.contains(*name),
        })
        .collect();
    if packages.is_empty() {
        note("no selected crate has wasm tests");
        return Ok(());
    }
    let mut cargo = command(root, "cargo")?;
    cargo
        .args(["test", "--locked", "--target", WASM_TARGET])
        .env(
            "CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER",
            "wasm-bindgen-test-runner",
        );
    for package in packages {
        cargo.args(["--package", package]);
    }
    let report = run_echoed(cargo)?;
    // The runner exits successfully when its host ends before the suite does,
    // which Node does once nothing keeps it alive; a suite that started must
    // also report.
    let started = report
        .lines()
        .filter(|line| line.starts_with("running ") && line != &"running 0 tests")
        .count();
    let finished = report
        .lines()
        .filter(|line| line.starts_with("test result: "))
        .count();
    if finished < started {
        bail!("{started} wasm test suites started but only {finished} reported a result");
    }
    Ok(())
}

fn select_changed(root: &Path, metadata: &Metadata) -> Result<Selection> {
    let mut git = command(root, "git")?;
    git.args(["diff", "--name-only", "HEAD"]);
    let mut files = output(git)?;
    let mut untracked = command(root, "git")?;
    untracked.args(["ls-files", "--others", "--exclude-standard"]);
    files.push_str(&output(untracked)?);

    let directories: Vec<(PathBuf, &PackageId)> = metadata
        .workspace_packages()
        .into_iter()
        .filter_map(|package| {
            let manifest: PathBuf = package.manifest_path.clone().into();
            Some((manifest.parent()?.to_path_buf(), &package.id))
        })
        .collect();

    let mut touched = BTreeSet::new();
    for file in files.lines().filter(|line| !line.is_empty()) {
        let path = root.join(file);
        let owner = directories
            .iter()
            .filter(|(directory, _)| path.starts_with(directory))
            .max_by_key(|(directory, _)| directory.components().count());
        match owner {
            Some((_, id)) => {
                touched.insert((*id).clone());
            }
            None if affects_every_crate(file) => return Ok(Selection::Everything),
            None => {}
        }
    }
    let dependents = with_dependents(metadata, touched)?;
    Ok(Selection::Packages(
        dependents
            .iter()
            .map(|id| metadata[id].name.to_string())
            .collect(),
    ))
}

/// Files outside every crate that still change how every crate builds.
fn affects_every_crate(file: &str) -> bool {
    matches!(
        file,
        "Cargo.toml" | "Cargo.lock" | "rust-toolchain.toml" | "clippy.toml" | ".cargo/config.toml"
    )
}

/// `touched` plus every workspace crate that depends on one of them, transitively.
fn with_dependents(
    metadata: &Metadata,
    touched: BTreeSet<PackageId>,
) -> Result<BTreeSet<PackageId>> {
    let resolve = metadata
        .resolve
        .as_ref()
        .context("cargo metadata returned no dependency graph")?;
    let mut selected = touched;
    loop {
        let before = selected.len();
        for node in &resolve.nodes {
            let is_member = metadata.workspace_members.contains(&node.id);
            if is_member && node.dependencies.iter().any(|dep| selected.contains(dep)) {
                selected.insert(node.id.clone());
            }
        }
        if selected.len() == before {
            return Ok(selected);
        }
    }
}
