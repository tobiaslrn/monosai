//! Running other programs with the project-local tools on `PATH`.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result, bail};

/// Where `cargo xtask tools` installs the project-local cargo tools.
pub(crate) fn tools_root(root: &Path) -> PathBuf {
    root.join(".tools")
}

/// A command run from the workspace root, finding `.tools/bin` before `PATH`.
///
/// Tools CI installs elsewhere are still found through the inherited `PATH`.
pub(crate) fn command(root: &Path, program: &str) -> Result<Command> {
    let mut paths = vec![tools_root(root).join("bin")];
    if let Some(inherited) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&inherited));
    }
    let path: OsString = std::env::join_paths(paths).context("PATH contains a separator")?;
    let mut command = Command::new(program);
    command.current_dir(root).env("PATH", path);
    Ok(command)
}

/// Runs `command` to completion and fails if it does not exit successfully.
pub(crate) fn run(mut command: Command) -> Result<()> {
    note(&format!("running {}", describe(&command)));
    let status = command
        .status()
        .with_context(|| format!("could not start {}", describe(&command)))?;
    if !status.success() {
        bail!("{} failed with {status}", describe(&command));
    }
    Ok(())
}

/// Runs `command` with stderr shown as it happens, then shows and returns its stdout.
pub(crate) fn run_echoed(mut command: Command) -> Result<String> {
    note(&format!("running {}", describe(&command)));
    let output = command
        .stderr(std::process::Stdio::inherit())
        .output()
        .with_context(|| format!("could not start {}", describe(&command)))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    std::io::Write::write_all(&mut std::io::stderr(), stdout.as_bytes())?;
    if !output.status.success() {
        bail!("{} failed with {}", describe(&command), output.status);
    }
    Ok(stdout)
}

/// Runs `command` and returns what it wrote to stdout.
pub(crate) fn output(mut command: Command) -> Result<String> {
    let output = command
        .output()
        .with_context(|| format!("could not start {}", describe(&command)))?;
    if !output.status.success() {
        bail!(
            "{} failed with {}:\n{}",
            describe(&command),
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }
    String::from_utf8(output.stdout)
        .with_context(|| format!("{} wrote non-UTF-8", describe(&command)))
}

/// Reports progress on stderr, so stdout stays free for output other tools read.
#[expect(clippy::print_stderr, reason = "xtask is a command-line program")]
pub(crate) fn note(message: &str) {
    eprintln!("xtask: {message}");
}

fn describe(command: &Command) -> String {
    let mut words = vec![command.get_program().to_string_lossy().into_owned()];
    words.extend(
        command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned()),
    );
    words.join(" ")
}
