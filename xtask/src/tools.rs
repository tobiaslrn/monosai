//! `cargo xtask tools`: the pinned cargo tools, installed into `.tools/`.
//!
//! Nothing is installed globally. `wasm-bindgen-cli` must match the
//! `wasm-bindgen` version in `Cargo.lock` exactly, so its version is read from
//! there; the others are pinned here. `--list` prints them as
//! `name@version,…` for CI, which installs prebuilt binaries of the same
//! versions instead of compiling them.

use std::fs;
use std::path::Path;

use anyhow::Result;

use crate::layers::metadata;
use crate::process::{command, note, run, tools_root};

/// Cargo tools the workspace commands use: name, the exact version they were
/// checked with, and the features their binary needs.
const PINNED: &[(&str, &str, &[&str])] = &[
    ("cargo-nextest", "0.9.150", &[]),
    ("cargo-hack", "0.6.46", &[]),
    ("cargo-shear", "1.14.0", &[]),
    ("cargo-deny", "0.20.2", &[]),
    ("cargo-about", "0.9.3", &["cli"]),
];

/// One tool to install.
struct Tool {
    name: String,
    version: String,
    features: &'static [&'static str],
}

fn wanted(root: &Path) -> Result<Vec<Tool>> {
    let mut tools: Vec<Tool> = PINNED
        .iter()
        .map(|(name, version, features)| Tool {
            name: (*name).to_owned(),
            version: (*version).to_owned(),
            features,
        })
        .collect();
    let metadata = metadata(root)?;
    if let Some(bindgen) = metadata
        .packages
        .iter()
        .find(|package| package.name.as_str() == "wasm-bindgen")
    {
        tools.push(Tool {
            name: "wasm-bindgen-cli".to_owned(),
            version: bindgen.version.to_string(),
            features: &[],
        });
    }
    Ok(tools)
}

#[expect(clippy::print_stdout, reason = "the list is this command's output")]
pub(crate) fn list(root: &Path) -> Result<()> {
    let line = wanted(root)?
        .iter()
        .map(|tool| {
            // CI's installer names the CLI after its binary.
            let name = if tool.name == "wasm-bindgen-cli" {
                "wasm-bindgen"
            } else {
                tool.name.as_str()
            };
            format!("{name}@{}", tool.version)
        })
        .collect::<Vec<_>>()
        .join(",");
    println!("{line}");
    Ok(())
}

pub(crate) fn install(root: &Path) -> Result<()> {
    let tools_root = tools_root(root);
    let installed = fs::read_to_string(tools_root.join(".crates.toml")).unwrap_or_default();
    for tool in wanted(root)? {
        if installed.contains(&format!("\"{} {} (registry", tool.name, tool.version)) {
            continue;
        }
        let mut cargo = command(root, "cargo")?;
        cargo
            .args(["install", "--locked", "--root"])
            .arg(&tools_root)
            .args([tool.name.as_str(), "--version", tool.version.as_str()]);
        if !tool.features.is_empty() {
            cargo.args(["--features", &tool.features.join(",")]);
        }
        run(cargo)?;
    }
    note("tools are current");
    Ok(())
}
