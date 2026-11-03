//! `cargo xtask wasm`: the engine, built for the web app.
//!
//! Builds `monosai-engine-wasm` for `wasm32-unknown-unknown`, runs
//! `wasm-bindgen --target web`, and in release also `wasm-opt`, writing the
//! JavaScript glue and the module to `apps/web/src/generated/engine/`. The
//! Angular build copies the module to `assets/engine/`. When the module cargo
//! produced has not changed since the last run, the bindgen and optimisation
//! steps are skipped. It also rewrites the TypeScript declarations of the
//! engine contract, see [`crate::types`].

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use anyhow::{Context, Result};

use crate::check::WASM_TARGET;
use crate::layers::metadata;
use crate::process::{command, note, run as run_command};
use crate::types;

/// The crate whose `cdylib` is the engine module.
const ENGINE_PACKAGE: &str = "monosai-engine-wasm";

/// Where the generated glue and module go, relative to the repository root.
const OUT_DIR: &str = "apps/web/src/generated/engine";

/// File stem of the generated files: `engine.js` and `engine_bg.wasm`.
const OUT_NAME: &str = "engine";

/// Records which cargo output the generated files were made from.
const STAMP: &str = ".stamp";

/// Which cargo profile the module is built with.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Profile {
    /// Fast to build, with debug assertions; for `npm start`.
    Dev,
    /// Size-optimised and run through `wasm-opt`; what ships.
    Release,
}

impl Profile {
    fn directory(self) -> &'static str {
        match self {
            Self::Dev => "debug",
            Self::Release => "release",
        }
    }
}

pub(crate) fn run(root: &Path, profile: Profile) -> Result<()> {
    types::write(root)?;

    let mut cargo = command(root, "cargo")?;
    cargo.args([
        "build",
        "--locked",
        "--package",
        ENGINE_PACKAGE,
        "--target",
        WASM_TARGET,
    ]);
    if profile == Profile::Release {
        cargo.arg("--release");
    }
    run_command(cargo)?;

    let target_directory: PathBuf = metadata(root)?.target_directory.into();
    let module = target_directory
        .join(WASM_TARGET)
        .join(profile.directory())
        .join(format!("{}.wasm", ENGINE_PACKAGE.replace('-', "_")));
    let out = root.join(OUT_DIR);
    let stamp = stamp_of(&module, profile)?;
    let current = fs::read_to_string(out.join(STAMP)).ok();
    if current.as_deref() == Some(stamp.as_str())
        && out.join(format!("{OUT_NAME}_bg.wasm")).exists()
    {
        note("engine module unchanged; generated files are current");
        return Ok(());
    }

    if out.exists() {
        fs::remove_dir_all(&out)?;
    }
    let mut bindgen = command(root, "wasm-bindgen")?;
    bindgen
        .args([
            "--target",
            "web",
            "--no-typescript",
            "--out-name",
            OUT_NAME,
            "--out-dir",
        ])
        .arg(&out)
        .arg(&module);
    run_command(bindgen)?;

    let generated = out.join(format!("{OUT_NAME}_bg.wasm"));
    if profile == Profile::Release {
        optimise(root, &generated)?;
    }
    fs::write(out.join(STAMP), stamp)?;
    let size = fs::metadata(&generated)?.len();
    note(&format!(
        "engine module: {size} bytes ({})",
        generated.display()
    ));
    Ok(())
}

/// Shrinks the module with `wasm-opt` from the `binaryen` npm package.
fn optimise(root: &Path, module: &Path) -> Result<()> {
    let wasm_opt = root.join("apps/web/node_modules/binaryen/bin/wasm-opt");
    if !wasm_opt.exists() {
        anyhow::bail!(
            "{} is missing; run `npm ci` in apps/web",
            wasm_opt.display()
        );
    }
    let mut node = command(root, "node")?;
    node.arg(&wasm_opt)
        .arg(module)
        .arg("-o")
        .arg(module)
        // The features rustc enables by default for wasm32-unknown-unknown.
        .args([
            "-Oz",
            "--enable-bulk-memory",
            "--enable-nontrapping-float-to-int",
            "--enable-sign-ext",
            "--enable-mutable-globals",
            "--enable-reference-types",
            "--enable-multivalue",
        ]);
    run_command(node)
}

fn stamp_of(module: &Path, profile: Profile) -> Result<String> {
    let info =
        fs::metadata(module).with_context(|| format!("cargo produced no {}", module.display()))?;
    let modified = info
        .modified()?
        .duration_since(UNIX_EPOCH)
        .context("module modified before 1970")?;
    Ok(format!(
        "{} {} {}\n",
        profile.directory(),
        info.len(),
        modified.as_nanos()
    ))
}
