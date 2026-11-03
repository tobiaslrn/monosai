//! `cargo xtask new-crate`: a crate from the workspace template.
//!
//! The template inherits everything from the workspace, declares the crate's
//! kind for `check-layers`, starts the crate doc with the rules of its kind,
//! sets up the single integration-test binary, and gives handles their
//! `test-util` feature. The crate is also listed in `[workspace.dependencies]`
//! so other members can depend on it with `workspace = true`.

use std::fs;
use std::path::Path;

use anyhow::{Context, Result, bail};

use crate::layers::{GROUPS, Kind};
use crate::process::note;

/// The line in the root manifest after which internal crates are listed.
const INTERNAL_MARKER: &str =
    "# Internal crates, by path. `cargo xtask new-crate` adds new ones here.\n";

pub(crate) fn run(root: &Path, path: &str, kind: &str) -> Result<()> {
    let kind = Kind::parse(kind)?;
    let Some((group, name)) = path.split_once('/') else {
        bail!("expected <group>/<name>, got `{path}`");
    };
    if !GROUPS.contains(&group) {
        bail!(
            "unknown group `{group}`; expected one of {}",
            GROUPS.join(", ")
        );
    }
    let valid_name = !name.is_empty()
        && name.starts_with(|c: char| c.is_ascii_lowercase())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !valid_name {
        bail!("crate names are lowercase kebab-case, got `{name}`");
    }
    let directory = root.join("crates").join(group).join(name);
    if directory.exists() {
        bail!("{} already exists", directory.display());
    }
    let package = format!("monosai-{name}");

    fs::create_dir_all(directory.join("src"))?;
    fs::create_dir_all(directory.join("tests/it"))?;
    fs::write(directory.join("Cargo.toml"), manifest(&package, kind))?;
    fs::write(directory.join("src/lib.rs"), crate_doc(kind))?;
    fs::write(
        directory.join("tests/it/main.rs"),
        format!("//! Integration tests of the public API of `{package}`.\n"),
    )?;
    register(root, &package, group, name)?;
    note(&format!(
        "created crates/{group}/{name} ({kind}); write its crate doc first"
    ));
    Ok(())
}

fn manifest(package: &str, kind: Kind) -> String {
    let features = if kind == Kind::Handle {
        "\n[features]\n# Test implementations of the handle, enabled only from [dev-dependencies].\ntest-util = []\n"
    } else {
        ""
    };
    format!(
        "[package]
name = \"{package}\"
version.workspace = true
edition.workspace = true
license.workspace = true
rust-version.workspace = true
publish.workspace = true

[package.metadata.monosai]
kind = \"{kind}\"

[lib]
doctest = false
{features}
[dependencies]

[lints]
workspace = true
"
    )
}

fn crate_doc(kind: Kind) -> String {
    let rules = match kind {
        Kind::Pure => {
            "//! Pure: data in, data out. No I/O, no async, no clock, no randomness, no\n\
             //! logging; time and ids arrive as parameters."
        }
        Kind::Sync => {
            "//! Sync: deterministic and never async. It reaches data only through the\n\
             //! SQLite transaction or in-memory database it is handed."
        }
        Kind::Handle => {
            "//! Handle: the only code here that touches the outside world is the handle\n\
             //! type, a cheap `Clone` struct with one private implementation per target\n\
             //! and a test implementation behind the `test-util` feature."
        }
        Kind::Glue => {
            "//! Glue: composes pure rules and handles. Handles arrive as parameters in\n\
             //! the order of the style guide."
        }
    };
    format!("//! (One sentence: what this crate does.)\n//!\n{rules}\n")
}

/// Adds `package` to `[workspace.dependencies]`, keeping the internal list sorted.
fn register(root: &Path, package: &str, group: &str, name: &str) -> Result<()> {
    let path = root.join("Cargo.toml");
    let text = fs::read_to_string(&path)?;
    let start = text
        .find(INTERNAL_MARKER)
        .context("the root Cargo.toml lost its internal-crates marker comment")?
        + INTERNAL_MARKER.len();
    let rest = text.get(start..).context("marker ends the manifest")?;
    let block_len = rest
        .lines()
        .take_while(|line| line.starts_with("monosai-"))
        .map(|line| line.len() + 1)
        .sum::<usize>();
    let block = rest.get(..block_len).context("internal block is cut")?;
    let mut lines: Vec<String> = block.lines().map(str::to_owned).collect();
    lines.push(format!(
        "{package} = {{ path = \"crates/{group}/{name}\" }}"
    ));
    lines.sort();
    let mut updated = String::with_capacity(text.len() + 64);
    updated.push_str(text.get(..start).context("marker is cut")?);
    for line in &lines {
        updated.push_str(line);
        updated.push('\n');
    }
    updated.push_str(rest.get(block_len..).context("internal block is cut")?);
    fs::write(&path, updated)?;
    Ok(())
}
