//! `cargo xtask check-layers`: the crate dependency rules of the architecture.
//!
//! Every crate lives at `crates/<group>/<name>`, is named `monosai-<name>`, and
//! declares its kind in `[package.metadata.monosai]`. The rules below are the
//! tables of `docs/rust/architecture.md`, section 5: which groups may depend on
//! which, which external crates are confined to which places, and the
//! allowlist pure crates are held to. Dev-dependencies are exempt; they never
//! ship.

use std::fmt;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use cargo_metadata::{DependencyKind, Metadata, MetadataCommand, Package};

use crate::process::note;

/// The groups under `crates/`, in dependency order.
pub(crate) const GROUPS: &[&str] = &[
    "kernel", "domain", "sys", "store", "ai", "anki", "japanese", "audio", "app", "engine",
    "bridge",
];

/// Groups of handle and sync crates that sit between the rules and the workflows.
const IO_GROUPS: &[&str] = &["sys", "store", "ai", "anki", "japanese", "audio"];

/// External crates confined to particular places, as `(crate pattern, places)`.
///
/// A place is `group/name`, `group/*`, a `*` prefix or suffix on the name, or
/// `kind:<kind>` for every crate of that kind.
const CONFINED: &[(&str, &[&str])] = &[
    (
        "web-sys",
        &[
            "sys/*",
            "store/sqlite",
            "japanese/analyzer",
            "engine/*-wasm",
        ],
    ),
    (
        "js-sys",
        &[
            "sys/*",
            "store/sqlite",
            "japanese/analyzer",
            "engine/*-wasm",
        ],
    ),
    (
        "wasm-bindgen*",
        &[
            "sys/*",
            "store/sqlite",
            "japanese/analyzer",
            "engine/*-wasm",
        ],
    ),
    (
        "serde-wasm-bindgen",
        &[
            "sys/*",
            "store/sqlite",
            "japanese/analyzer",
            "engine/*-wasm",
        ],
    ),
    ("rusqlite", &["store/sqlite"]),
    ("sqlite-wasm-rs", &["store/sqlite"]),
    ("lindera*", &["japanese/tokenizer"]),
    ("html5ever", &["anki/anki-markup"]),
    ("symphonia*", &["audio/audio-codec"]),
    ("hyper*", &["bridge/bridge-http", "sys/transport"]),
    ("tokio", &["bridge/bridge-http", "sys/transport"]),
    ("uniffi", &["bridge/bridge-ffi"]),
    ("ts-rs", &["engine/engine-api"]),
    ("schemars", &["ai/task-*"]),
    ("tracing-subscriber", &["engine/engine-wasm"]),
    ("futures*", &["kind:handle", "app/*", "engine/*"]),
];

/// The only external crates a pure crate may depend on, each still subject to
/// [`CONFINED`].
const PURE_ALLOWED: &[&str] = &[
    "serde",
    "serde_bytes",
    "thiserror",
    "uuid",
    "unicode-*",
    "blake3",
    "postcard",
    "miniz_oxide",
    "html5ever",
    "symphonia*",
    "schemars",
    "lindera*",
    "ts-rs",
];

/// Pure crates that may use `serde`: the wire crates, `cache-key`, and the
/// structured-output types of the AI tasks. `kernel/*` may only as an optional
/// `serde` feature.
const PURE_SERDE: &[&str] = &[
    "kernel/*",
    "kernel/cache-key",
    "engine/engine-api",
    "anki/anki-wire",
    "ai/ai-wire",
    "ai/task-*",
];

/// What a crate is allowed to be, declared in `[package.metadata.monosai] kind`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    /// No I/O, no async, no clock, no logging.
    Pure,
    /// Deterministic and never async, but works through an in-process SQLite database.
    Sync,
    /// Owns one kind of effect behind a concrete type.
    Handle,
    /// Composes rules and handles: workflows and the engine.
    Glue,
}

impl Kind {
    pub(crate) fn parse(value: &str) -> Result<Self> {
        match value {
            "pure" => Ok(Self::Pure),
            "sync" => Ok(Self::Sync),
            "handle" => Ok(Self::Handle),
            "glue" => Ok(Self::Glue),
            other => bail!("unknown kind `{other}`; expected pure, sync, handle, or glue"),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Pure => "pure",
            Self::Sync => "sync",
            Self::Handle => "handle",
            Self::Glue => "glue",
        }
    }
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A workspace crate under `crates/`, located by its folder.
#[derive(Debug)]
pub(crate) struct Member {
    pub(crate) package: String,
    pub(crate) group: String,
    pub(crate) folder: String,
    pub(crate) kind: Kind,
}

impl Member {
    fn place(&self) -> String {
        format!("{}/{}", self.group, self.folder)
    }

    fn is_at(&self, place: &str) -> bool {
        if let Some(kind) = place.strip_prefix("kind:") {
            return self.kind.as_str() == kind;
        }
        let Some((group, name)) = place.split_once('/') else {
            return false;
        };
        group == self.group && matches_pattern(name, &self.folder)
    }
}

/// `*` at the start or end of `pattern` matches any run of characters.
fn matches_pattern(pattern: &str, value: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        return value.starts_with(prefix);
    }
    if let Some(suffix) = pattern.strip_prefix('*') {
        return value.ends_with(suffix);
    }
    pattern == value
}

pub(crate) fn metadata(root: &Path) -> Result<Metadata> {
    MetadataCommand::new()
        .current_dir(root)
        .exec()
        .context("cargo metadata failed")
}

pub(crate) fn run(root: &Path) -> Result<()> {
    let metadata = metadata(root)?;
    let mut violations = Vec::new();
    let mut members = Vec::new();
    for package in metadata.workspace_packages() {
        violations.extend(manifest_violations(package));
        match member(root, package) {
            Ok(Some(member)) => members.push(member),
            Ok(None) => {}
            Err(error) => violations.push(format!("{}: {error:#}", package.name)),
        }
    }
    for package in metadata.workspace_packages() {
        let Some(from) = members.iter().find(|m| m.package == package.name.as_str()) else {
            continue;
        };
        for dependency in &package.dependencies {
            if dependency.kind == DependencyKind::Development {
                continue;
            }
            let to = members.iter().find(|m| m.package == dependency.name);
            match to {
                Some(to) => violations.extend(internal_violation(from, to)),
                None => violations.extend(external_violations(
                    from,
                    &dependency.name,
                    dependency.optional,
                )),
            }
        }
    }
    if violations.is_empty() {
        note(&format!("layer rules hold for {} crates", members.len()));
        return Ok(());
    }
    bail!("layer rules broken:\n- {}", violations.join("\n- "))
}

/// Reads the crate's place and kind, or `None` for workspace members outside `crates/`.
pub(crate) fn member(root: &Path, package: &Package) -> Result<Option<Member>> {
    let manifest: PathBuf = package.manifest_path.clone().into();
    let Ok(relative) = manifest.strip_prefix(root.join("crates")) else {
        return Ok(None);
    };
    let parts: Vec<String> = relative
        .iter()
        .map(|part| part.to_string_lossy().into_owned())
        .collect();
    let [group, folder, file] = parts.as_slice() else {
        bail!(
            "crates live at crates/<group>/<name>, found {}",
            relative.display()
        );
    };
    if file != "Cargo.toml" {
        bail!("unexpected manifest {}", relative.display());
    }
    if !GROUPS.contains(&group.as_str()) {
        bail!(
            "unknown group `{group}`; expected one of {}",
            GROUPS.join(", ")
        );
    }
    if package.name.as_str() != format!("monosai-{folder}") {
        bail!("the crate in crates/{group}/{folder} must be named monosai-{folder}");
    }
    let kind = package
        .metadata
        .get("monosai")
        .and_then(|monosai| monosai.get("kind"))
        .and_then(|kind| kind.as_str())
        .context("[package.metadata.monosai] kind is missing")?;
    let kind = Kind::parse(kind)?;
    let required = match group.as_str() {
        "kernel" | "domain" => Some(Kind::Pure),
        "app" => Some(Kind::Glue),
        _ => None,
    };
    if let Some(required) = required
        && required != kind
    {
        bail!("crates in {group}/ are {required}, not {kind}");
    }
    Ok(Some(Member {
        package: package.name.to_string(),
        group: group.clone(),
        folder: folder.clone(),
        kind,
    }))
}

fn internal_violation(from: &Member, to: &Member) -> Option<String> {
    let group = to.group.as_str();
    let by_group = match from.group.as_str() {
        "kernel" => to.place() == "kernel/kernel" && from.folder != "kernel",
        "domain" => matches!(group, "kernel" | "domain"),
        "app" => matches!(group, "kernel" | "domain") || IO_GROUPS.contains(&group),
        "engine" => group != "bridge",
        "bridge" => group == "kernel" || group == "bridge" || to.place() == "anki/anki-wire",
        _ => matches!(group, "kernel" | "domain") || IO_GROUPS.contains(&group),
    };
    if !by_group {
        return Some(format!(
            "{} may not depend on {} ({}/ may not use {}/)",
            from.place(),
            to.place(),
            from.group,
            to.group
        ));
    }
    let by_kind = match from.kind {
        Kind::Pure => to.kind == Kind::Pure,
        Kind::Sync => to.kind == Kind::Pure || to.place() == "store/sqlite",
        Kind::Handle | Kind::Glue => true,
    };
    (!by_kind).then(|| {
        format!(
            "{} is {} and may not depend on {}, which is {}",
            from.place(),
            from.kind,
            to.place(),
            to.kind
        )
    })
}

fn external_violations(from: &Member, dependency: &str, optional: bool) -> Vec<String> {
    let mut violations = Vec::new();
    for (pattern, places) in CONFINED {
        if matches_pattern(pattern, dependency) && !places.iter().any(|place| from.is_at(place)) {
            violations.push(format!(
                "{} may not depend on {dependency}; it is confined to {}",
                from.place(),
                places.join(", ")
            ));
        }
    }
    if matches!(from.kind, Kind::Pure | Kind::Sync) {
        let allowed = PURE_ALLOWED
            .iter()
            .any(|pattern| matches_pattern(pattern, dependency))
            || (from.kind == Kind::Sync
                && dependency == "ruzstd"
                && from.place() == "anki/anki-package");
        if !allowed {
            violations.push(format!(
                "{} is {} and may not depend on {dependency}",
                from.place(),
                from.kind
            ));
        }
        if matches!(dependency, "serde" | "serde_bytes") {
            let place_allows = PURE_SERDE.iter().any(|place| from.is_at(place));
            let kernel_feature_only = from.group == "kernel" && from.folder != "cache-key";
            if !place_allows {
                violations.push(format!(
                    "{} may not use {dependency}: domain types do not derive serde",
                    from.place()
                ));
            } else if kernel_feature_only && !optional {
                violations.push(format!(
                    "{} may use {dependency} only behind its optional `serde` feature",
                    from.place()
                ));
            }
        }
    }
    violations
}

/// Manifest rules for every workspace member, `xtask` included: dependencies
/// come from `[workspace.dependencies]`, lints and package fields from the
/// workspace.
fn manifest_violations(package: &Package) -> Vec<String> {
    let name = package.name.as_str();
    let text = match std::fs::read_to_string(&package.manifest_path) {
        Ok(text) => text,
        Err(error) => return vec![format!("{name}: cannot read its manifest: {error}")],
    };
    let manifest: toml::Table = match text.parse() {
        Ok(manifest) => manifest,
        Err(error) => return vec![format!("{name}: cannot parse its manifest: {error}")],
    };
    let mut violations = Vec::new();
    let inherits = |value: Option<&toml::Value>| {
        value
            .and_then(toml::Value::as_table)
            .and_then(|table| table.get("workspace"))
            .and_then(toml::Value::as_bool)
            == Some(true)
    };
    if !inherits(manifest.get("lints")) {
        violations.push(format!("{name}: [lints] must be `workspace = true`"));
    }
    let package_table = manifest.get("package").and_then(toml::Value::as_table);
    for field in ["version", "edition", "license", "rust-version", "publish"] {
        if !inherits(package_table.and_then(|table| table.get(field))) {
            violations.push(format!(
                "{name}: package.{field} must come from the workspace"
            ));
        }
    }
    let mut tables: Vec<(&str, &toml::Table)> = Vec::new();
    for section in ["dependencies", "dev-dependencies", "build-dependencies"] {
        if let Some(table) = manifest.get(section).and_then(toml::Value::as_table) {
            tables.push((section, table));
        }
    }
    if let Some(targets) = manifest.get("target").and_then(toml::Value::as_table) {
        for target in targets.values().filter_map(toml::Value::as_table) {
            for section in ["dependencies", "dev-dependencies", "build-dependencies"] {
                if let Some(table) = target.get(section).and_then(toml::Value::as_table) {
                    tables.push((section, table));
                }
            }
        }
    }
    for (section, table) in tables {
        for (dependency, value) in table {
            if !inherits(Some(value)) {
                violations.push(format!(
                    "{name}: [{section}] {dependency} must be declared in [workspace.dependencies] and used with `workspace = true`"
                ));
            }
        }
    }
    violations
}
