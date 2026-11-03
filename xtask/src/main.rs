//! Repository automation for the Rust workspace, run as `cargo xtask <command>`.
//!
//! It builds the engine for the web app, runs the checks every commit must
//! pass, runs tests, installs the project-local cargo tools, and creates new
//! crates from the workspace template. It is the only crate allowed to use
//! `anyhow`, and the only one that shells out to other programs.

mod changed;
mod check;
mod layers;
mod new_crate;
mod process;
mod tools;
mod types;
mod wasm;

use std::path::{Path, PathBuf};

use anyhow::{Result, bail};

const USAGE: &str = "\
usage: cargo xtask <command>

commands:
  check                    fmt, clippy, layer rules, per-package builds, deny, shear
  check-layers             only the crate dependency rules
  test [--changed] [--wasm]
                           nextest; --changed limits it to crates touched since HEAD
                           and their dependents; --wasm runs wasm-bindgen-test instead
  wasm [--release]         build the engine for the web app into apps/web/src/generated
  tools [--list]           install the pinned cargo tools into .tools, or list them
  new-crate <group>/<name> --kind pure|sync|handle|glue
                           create a crate from the workspace template";

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let root = workspace_root();
    let Some((command, rest)) = args.split_first() else {
        bail!("{USAGE}");
    };
    let mut flags = Flags::parse(rest)?;
    match command.as_str() {
        "check" => {
            flags.expect_none()?;
            check::run(&root)
        }
        "check-layers" => {
            flags.expect_none()?;
            layers::run(&root)
        }
        "test" => {
            let changed = flags.take_switch("--changed");
            let wasm = flags.take_switch("--wasm");
            flags.expect_none()?;
            changed::test(&root, changed, wasm)
        }
        "wasm" => {
            let profile = if flags.take_switch("--release") {
                wasm::Profile::Release
            } else {
                wasm::Profile::Dev
            };
            flags.expect_none()?;
            wasm::run(&root, profile)
        }
        "tools" => {
            let list = flags.take_switch("--list");
            flags.expect_none()?;
            if list {
                tools::list(&root)
            } else {
                tools::install(&root)
            }
        }
        "new-crate" => {
            let kind = flags.take_value("--kind")?;
            let path = flags.take_positional()?;
            flags.expect_none()?;
            new_crate::run(&root, &path, &kind)
        }
        other => bail!("unknown command `{other}`\n\n{USAGE}"),
    }
}

/// The repository root, which is also the Cargo workspace root.
fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask lives one level below the workspace root")
        .to_path_buf()
}

/// The arguments after the command, consumed as each command reads them.
struct Flags(Vec<String>);

impl Flags {
    fn parse(args: &[String]) -> Result<Self> {
        if args.iter().any(|arg| arg == "--help" || arg == "-h") {
            bail!("{USAGE}");
        }
        Ok(Self(args.to_vec()))
    }

    fn take_switch(&mut self, name: &str) -> bool {
        let args = &mut self.0;
        let before = args.len();
        args.retain(|arg| arg != name);
        args.len() != before
    }

    fn take_value(&mut self, name: &str) -> Result<String> {
        let args = &mut self.0;
        let Some(index) = args.iter().position(|arg| arg == name) else {
            bail!("missing {name} <value>\n\n{USAGE}");
        };
        if index + 1 >= args.len() {
            bail!("missing value after {name}");
        }
        let value = args.remove(index + 1);
        args.remove(index);
        Ok(value)
    }

    fn take_positional(&mut self) -> Result<String> {
        let args = &mut self.0;
        let Some(index) = args.iter().position(|arg| !arg.starts_with("--")) else {
            bail!("missing argument\n\n{USAGE}");
        };
        Ok(args.remove(index))
    }

    fn expect_none(&self) -> Result<()> {
        let args = &self.0;
        if let Some(extra) = args.first() {
            bail!("unexpected argument `{extra}`\n\n{USAGE}");
        }
        Ok(())
    }
}
