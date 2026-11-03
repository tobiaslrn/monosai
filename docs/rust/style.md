# Monosai Rust Style Guide

Status: proposal, 2026-11-02
Companion documents: [architecture.md](architecture.md) (structure and boundaries),
[migration.md](migration.md) (how to get there)

This guide is binding for every line of Rust in the repository, whoever writes
it. It builds on Microsoft's
[Pragmatic Rust Guidelines](https://microsoft.github.io/rust-guidelines/)
(cited by their `M-…` ids) and the
[Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) (`C-…`).
Where this guide is stricter, this guide wins. Where it deviates, section 17
says so and why.

**MUST** and **MUST NOT** are rules: a review rejects code that breaks one.
**SHOULD** is the default: breaking it needs a reason written next to the code.
Most rules are also enforced by a lint (section 16); a rule without a lint is
not optional.

---

## 1. The shape of the code

The engine is written as a **functional core with an imperative shell**.

- **Decide, then do.** A function either computes a decision from values, or
  carries out effects (database, network, clock, browser). It MUST NOT do both.
  Rules live in pure functions; workflows call them and then perform the
  effects the result asks for.
- **Pure code is the default.** Everything in `kernel/*` and `domain/*`, every
  `task-*`, `prompts`, `ipadic`, `zip-reader`, `anki-markup`, `webm`, and the
  routing in `bridge-http` is pure: data in, data out, no I/O, no async, no
  clock, no randomness, no logging.
- **Inputs are explicit.** Time, ids, configuration, and anything else a
  function depends on are parameters. Nothing is read from a global, a
  thread-local, or the environment.
- **Effects are visible in signatures.** A function that can reach the database
  takes `&Db`; one that can reach the network takes `&Transport` or
  `&OpenRouter`. If a parameter is not there, the function cannot do it.
- **State changes are values.** Prefer `fn apply(state: &State, input) -> State`
  or `fn next(&mut self, event) -> Vec<Action>` on an owned state machine over
  methods that mutate shared state as a side effect.
- **Free functions over associated functions** (M-REGULAR-FN). `impl` blocks
  hold constructors, accessors, and operations whose receiver is the obvious
  subject. Everything else is a free function in the module it belongs to.

```rust
// Decide: pure, tested with plain values.
pub fn plan_window(reading: &ReadingShape, anchor: ParagraphIndex, size: WindowSize) -> Window { … }

// Do: a thin workflow that reads, decides, writes.
pub async fn open_window(req: OpenWindow, db: &Db) -> Result<WindowView, OpenWindowError> {
    let shape = db.read(|tx| store::readings::shape(tx, req.reading))?;
    let window = reading::plan_window(&shape, req.anchor, req.size);
    db.read(|tx| store::paragraphs::load(tx, req.reading, window.range()))
}
```

## 2. Types

### 2.1 Newtypes

Every value with a meaning beyond its representation is a newtype: ids,
offsets, indexes, counts with a unit, revisions, hashes, model names, URLs,
secrets. Primitive types (`u32`, `String`, `bool`) appear only where the value
really is just a number, text, or flag.

Newtypes are written by hand. No newtype macros (`nutype`, `derive_more`
wrappers, local `macro_rules!` generators): the definition should read as
plain Rust (M-MACRO-LAST-RESORT, M-MACROS-DONT-LIE).

A newtype that carries an invariant (M-STRONG-TYPES-GUARD):

- MUST keep its field private;
- MUST be built only through a fallible constructor (`parse`, `TryFrom`,
  `FromStr`) that checks the invariant;
- MAY offer a panicking `const fn new` for literals, used as `const { … }`;
- MUST NOT implement `From` a weaker type, `Default` (unless the default value
  is valid and meaningful), or `Deref`/`DerefMut` to its inner type;
- MUST deserialize through its checking constructor:
  `#[serde(try_from = "String", into = "String")]`.

Access to the inner value is explicit: `as_str()`, `get()`, `into_inner()`.

```rust
/// A model identifier as OpenRouter names it, such as `google/gemini-2.5-flash`.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ModelName(Box<str>);

impl ModelName {
    pub fn parse(value: &str) -> Result<Self, ModelNameError> { … }
    pub fn as_str(&self) -> &str { &self.0 }
}

impl TryFrom<String> for ModelName { … }
```

Ids are `kernel::Id<K>` with a marker type per kind (`ReadingId =
Id<marker::Reading>`), so mixing kinds does not compile.

### 2.2 Make illegal states unrepresentable

- An enum, not a `bool` or a `String`, wherever the set of values is known.
  Function parameters MUST NOT be `bool`: `Visibility::Hidden` reads at the
  call site, `true` does not.
- `Option<T>`, not a sentinel (`-1`, `""`, `0`).
- A state that only exists in one phase lives in that phase's variant, not in
  an `Option` field that "is set when …".
- Struct fields that must change together live in one type.

### 2.3 Common traits

- Every type implements `Debug` (M-PUBLIC-DEBUG). A type holding a secret has a
  hand-written `Debug` that redacts, and a test proving it does.
- Types meant to be read by people implement `Display` (M-PUBLIC-DISPLAY).
- Derive `Clone`, `Copy`, `PartialEq`, `Eq`, `Hash`, `PartialOrd`, `Ord` when
  they are meaningful (C-COMMON-TRAITS). Small plain values are `Copy`.
- Constructors are `new`, `parse`, `from_*`, `with_*`; conversions follow
  `as_`/`to_`/`into_` (C-CONV); getters have no `get_` prefix (C-GETTER).

## 3. Ownership and memory

- **Borrow in parameters, own in fields, return owned values.** Parameters are
  `&str`, `&[T]`, `&T` unless the function keeps the value.
- **No shared mutable state outside handle types.** `Rc`, `Arc`, `RefCell`,
  `Cell`, `Mutex`, and `RwLock` MUST NOT appear outside the private
  implementation of a handle type (section 4). The lint `disallowed_types`
  enforces this. Each permitted use carries
  `#[expect(clippy::disallowed_types, reason = "…")]`.
- **No trait objects** except at the FFI boundary where generated bindings
  require them (`bridge-ffi`). No `Box<dyn Trait>`, no `&dyn Trait`, no
  `BoxFuture`/`LocalBoxFuture`.
- **No globals.** No `static mut`, no `thread_local!`, no `OnceCell`/`LazyLock`
  holding state (M-AVOID-STATICS). `LazyLock` is permitted only for immutable
  tables computed once for speed.
- **Clone deliberately.** A `.clone()` exists because a second owner is needed,
  not to quiet the borrow checker; restructure first. Cloning a handle is cheap
  and normal.
- **Cleanup is `Drop`.** Anything that must be undone (a registered request, a
  held lock, a started encoder) is undone by a guard's `Drop`, never by a call
  the author has to remember.
- **Lifetimes on structs only for short-lived views** (`Write<'_>`,
  `Paragraph<'a>` borrowed from a loaded page). Long-lived types own their data.
- **Immutable owned sequences** that are built once and kept (dictionary
  entries, loaded vocabulary) SHOULD be `Box<[T]>` / `Box<str>` (M-BOX-DST).
- Collections whose size is known are created with that capacity
  (M-INITIAL-CAPACITY).

## 4. Handle types (the imperative shell)

A **handle** is the only kind of type that touches the outside world: `Db`,
`Transport`, `OpenRouter`, `AnkiConnect`, `Analyzer`, `OpusEncoder`,
`Collator`, `Clock`, `Ids`, `Locks`. The engine's own shared state (`Requests`,
`Jobs`) uses the same pattern. Handles follow one pattern:

- A concrete public struct, cheap to `Clone` (M-SERVICES-CLONE), with a private
  inner enum of implementations: one per target, plus a test implementation
  behind the `test-util` feature (M-MOCKABLE-SYSCALLS, M-DI-HIERARCHY).
- Test constructors return the handle and its controller:
  `Clock::fixed(at) -> (Clock, ClockCtrl)`. They never accept a controller.
- Functionality is inherent (M-ESSENTIAL-FN-INHERENT). Handles do not implement
  project traits; there is nothing to abstract over, because production has
  exactly one implementation per target.
- Async methods are `async fn` (M-ASYNC-FN).
- Resources that must not be held across an await are lent through a **sync
  closure**: `db.write(|tx| …)`. An `.await` inside the closure does not
  compile, so a transaction cannot span one.

```rust
/// The application database.
#[derive(Clone, Debug)]
pub struct Db(Rc<RefCell<Connection>>);

impl Db {
    #[cfg(feature = "test-util")]
    pub fn in_memory() -> Result<Self, OpenError> { … }

    /// Runs `f` in one write transaction and commits if it returns `Ok`.
    ///
    /// # Panics
    ///
    /// If called from inside another `read` or `write` closure.
    pub fn write<T, E>(&self, f: impl FnOnce(&mut Write<'_>) -> Result<T, E>) -> Result<T, E>
    where
        E: From<SqlError>,
    { … }
}
```

Outside tests, only `engine` and `engine-wasm` construct handles. Workflows
receive them as parameters.

## 5. Traits and generics

- Traits are for standard-library traits, for real polymorphism over data, and
  for implementations supplied from outside the workspace (the Kotlin
  `AnkiReads` callbacks). Traits MUST NOT be introduced to make code testable;
  pure functions and handle test variants do that.
- Generic parameters appear in argument position (`impl Fn(&str, &str) ->
  Ordering`, `impl IntoIterator<Item = …>`) and on containers. Service-like
  types have no type parameters (M-SIMPLE-ABSTRACTIONS).
- A function accepts at most one closure, and it comes last
  (M-PARAMETER-CONSISTENCY).
- No abstraction in advance: a trait, generic, or builder exists only once it
  has at least two real uses.

## 6. Errors

- **One error type per operation or closely related group of operations**
  (`ImportError`, `CommitError`), not one per crate and never one per
  workspace. Errors are `thiserror` enums whose variants carry the context a
  caller or a reader of the log needs, as typed fields.
- **No stringly errors.** No `Other(String)`, no `Unknown`, no `Internal`.
- **No error variants for bugs.** A broken invariant is a panic (section 7),
  not a variant (M-PANIC-ON-BUG).
- **Convert with `From`** via `#[from]`, so `?` does the work (M-FROM-ERROR).
  `map_err` is for adding context, never for re-wrapping alone, and never
  discards the source (`map_err(|_| …)` is denied).
- **Every error implements `kernel::Coded`**, an exhaustive `match` from each
  variant to a stable `Code { domain, name }`. The engine turns
  `Coded + Display` into the UI's `ErrorDto`; the UI keys its copy on the code.
- **Errors never contain secrets, request bodies, or provider responses.**
- `anyhow` is allowed only in `xtask` (M-APP-ERROR).
- Fallible public functions document their errors in `# Errors`.

## 7. Panics

A panic means "this program has a bug, stop now" (M-PANIC-IS-STOP). In the
engine it traps the wasm instance and the UI offers a reload.

- **Input never panics.** Anything from JavaScript, storage, the network, Anki,
  a package file, or a model reply is handled with `Result`.
- `unwrap()` MUST NOT be used outside tests.
- `expect("…")` is permitted only for invariants the code itself established.
  The message states the invariant, not the failure: `expect("window range is
  clamped to the paragraph count above")`.
- `unreachable!("…")` with a message for states an earlier match excluded.
  Bare `panic!`, `todo!`, `unimplemented!` MUST NOT be used.
- `assert!` and `debug_assert!` carry a message (M-PANIC-MESSAGE).
- Public functions that can panic document it in `# Panics`.
- No indexing or slicing that can panic: use `get`, iterators, `split_first`,
  `chunks_exact`, `split_at_checked`. String slicing by byte range is denied;
  use `text::Span` (section 9).
- `as` casts are denied; use `From`/`TryFrom`. Integer overflow panics in every
  profile (`overflow-checks = true`), so arithmetic on values derived from
  input uses `checked_*` and returns an error.
- `catch_unwind` is never used (M-PANIC-CONTINUATION).

## 8. Async, concurrency, and cancellation

- `async` exists only in handles, `app/*` workflows, and `engine`. Pure crates
  have nothing to await.
- Only `engine` spawns tasks. Workflows are plain `async fn`s that the engine
  runs.
- **Cancellation is dropping the future.** Code between two `.await`s MUST leave
  stored state consistent: compute, write in one transaction, then await the
  next thing. A workflow never needs a cancellation token.
- Long CPU work is split into steps that return to the scheduler between
  batches (M-YIELD-POINTS).
- Engine handles and workflow futures are single-threaded (`!Send`) by design.
  Plain data types stay `Send` (section 17).

## 9. Text

- Rust strings are UTF-8, the DOM is UTF-16. Stored offsets are
  `text::Utf8Offset`; view models carry `text::Utf16Offset`. They never mix.
- A range into a text is a `text::Span`, created by the text it belongs to
  (`text.span(range) -> Result<Span, SpanError>`), which checks character
  boundaries once. Code slices with `text.slice(span)`, never with `&s[a..b]`.
- Normalization (NFC/NFKC) happens once at the boundary where text enters, and
  the type says so (`NormalizedText`).

## 10. Modules, naming, and visibility

- **Names are short and specific** (M-SHORT-NAMES). No crate or module name
  repeated in an item (`reading::Window`, not `reading::ReadingWindow`).
- **No weasel words** (M-WEASEL-WORDS): no `Manager`, `Service`, `Factory`,
  `Helper`, `Util`, `Data`, `Info`, `Handler`, `Processor`.
- **Modules by use case** (M-BALANCED-MODULES): `window`, `import`, `status`,
  never `types`, `errors`, `utils`, `common`, `misc`. The crate root holds the
  items a reader needs first.
- **One path per item** (M-SINGLE-ITEM-PATH). No preludes (M-NO-PRELUDE), no
  glob re-exports (M-NO-GLOB-REEXPORTS), no re-exports of other crates' items
  (M-FOREIGN-REEXPORTS).
- **Smallest visibility.** Items are private or `pub(crate)` unless another
  crate uses them (`unreachable_pub`).
- **One concept per file.** A file is about one main type or one operation.
  It holds that type or function together with its `impl`s, its error type,
  and its private helpers, and nothing unrelated. Companions stay with what
  they serve, because Rust's privacy boundary is the module: splitting a
  newtype from the code that builds it would force its fields to
  `pub(crate)` and give up its invariant. A file is not split per item, and
  it is not split at an arbitrary point to make it shorter.
- **Files stay small because concepts stay small.** A file that keeps growing
  usually holds two concepts; split it along them, into names a reader would
  look for. A long file is fine when it is one cohesive thing, such as the
  engine's exhaustive dispatch `match` or a wire contract's type list.

  ```
  domain/reading/src/
    lib.rs        crate doc; re-exports the essentials
    window.rs     Window, WindowSize, plan_window(), WindowError
    import.rs     import(), ImportError
    paragraph.rs  Paragraph, ParagraphIndex
    status.rs     TokenStatus, classify()
  ```

- **Files:** `foo.rs` with `foo/` for children. No `mod.rs`.
- **Parameter order** is fixed (M-PARAMETER-CONSISTENCY): the call's own
  request or subject first, then handles in this order: `db`, `transport`,
  `ai`, `anki`, `analyzer`, `encoder`, `collator`, `clock`, `ids`. A closure
  comes last. A workflow that needs more than five handles is doing two jobs
  and is split; call-specific values beyond two go in a request struct
  (M-INIT-CASCADED).
- Types with four or more optional settings get a builder named `FooBuilder`,
  created by `Foo::builder(required)`, with setters named after the field and a
  validating `build()` (M-INIT-BUILDER, M-BUILD-RESULT).

## 11. Constants and limits

Every limit, timeout, cap, retry count, size, and threshold is a named `const`
with a doc comment saying why this value, what changes if it moves, and which
outside system it relates to (M-DOCUMENTED-MAGIC). Literals in logic are
limited to `0`, `1`, and values that are obviously definitional.

## 12. Boundaries and serialization

- **Domain types do not derive `serde`.** Wire formats are separate types in
  boundary crates (`engine-api`, `anki-wire`, `ai-wire`), with explicit
  conversion functions to and from domain types. The one exception is
  `kernel/*` (ids, timestamps, offsets), whose types derive `serde` behind an
  opt-in `serde` feature that only wire crates enable. A change to a wire format is
  always a visible change to a wire crate.
- Every inbound wire type uses `#[serde(deny_unknown_fields)]`, and every field
  with rules is a validating newtype (section 2.1). Together they are the
  runtime validation of external, stored, imported, and AI-generated data.
- Parsing (`serde_json::from_*`, `postcard::from_*`) happens only in the
  boundary module of a crate, marked with
  `#[expect(clippy::disallowed_methods, reason = "boundary parse")]`.
- Stored values map to SQL columns explicitly in `store`. No JSON columns for
  data that is queried.

## 13. Logging

- `tracing` events only (M-LOG-NOT-PRINT); no `println!`, `eprintln!`, `dbg!`,
  or `web_sys::console`.
- Events are named `<area>.<operation>.<state>` and carry typed fields, with a
  message template instead of `format!` (M-LOG-STRUCTURED):
  `info!(name: "reading.import.done", reading.id = %id, paragraphs = n, "imported {{paragraphs}} paragraphs")`.
- Pure crates do not log; they return what happened.
- Secrets, learner text, and provider bodies are never logged. Log codes,
  counts, ids, and durations.

## 14. Documentation

- Every crate starts with a crate doc: what it does, what it may touch, what it
  must not. Every module has a module doc (M-MODULE-DOCS).
- Every public item has a doc comment whose first sentence fits on one line,
  about 15 words (M-FIRST-DOC-SENTENCE). Use `# Errors`, `# Panics`, and
  `# Examples` sections (M-CANONICAL-DOCS).
- Docs describe what the code does now. They do not narrate how it was designed,
  what it replaced, or which TypeScript file it came from
  (M-NO-META-DESIGN-DOCUMENTATION). Reasoning belongs in ADRs.
- Comments explain *why*. A comment restating the code is deleted.

## 15. Tests

- **Pure functions are tested with values.** No mocks of the project's own
  code, ever.
- **Workflows are tested against real implementations in test mode:**
  in-memory SQLite (`Db::in_memory()`), a scripted transport
  (`Transport::scripted()`), a fixed clock, sequential ids.
- **Public-API tests live in `tests/it/`**, one integration binary per crate
  (M-INTEGRATION-TESTS). `#[cfg(test)] mod tests` is for private helpers only.
- **Names state behaviour:** `rejects_entry_outside_the_archive_root`,
  `window_never_extends_past_the_last_paragraph`.
- **Properties over examples** where an invariant exists: offsets round-trip,
  windows stay in bounds, the scheduler never runs two steps of one job, cache
  keys change when any input changes (`proptest`).
- **No tautological tests** (M-TAUTOLOGICAL-TESTS). A test does not restate a
  constant or mirror the implementation's branches. A mutant that only such a
  test could kill is skipped with `#[mutants::skip]` and a reason.
- **Deterministic:** no real time, randomness, network, or filesystem; ordered
  collections (`BTreeMap`) wherever order is observable.
- **Snapshots** (`insta`) for prompts and view models; a changed snapshot is
  reviewed like code.
- Test utilities (in-memory constructors, scripted transports, fixture
  builders) live behind each crate's `test-util` feature, enabled only from
  `[dev-dependencies]` (M-TEST-UTIL).

## 16. Enforcement

### 16.1 Workspace lints

CI runs clippy with `-D warnings`, so `warn` below fails the build.

```toml
[workspace.lints.rust]
unsafe_code = "deny"
missing_docs = "warn"
missing_debug_implementations = "warn"
unreachable_pub = "warn"
elided_lifetimes_in_paths = "warn"
let_underscore_drop = "warn"
unused_must_use = "deny"
ambiguous_negative_literals = "warn"
redundant_imports = "warn"
redundant_lifetimes = "warn"
trivial_numeric_casts = "warn"
unused_lifetimes = "warn"
unsafe_op_in_unsafe_fn = "warn"

[workspace.lints.clippy]
correctness = { level = "warn", priority = -1 }
suspicious = { level = "warn", priority = -1 }
complexity = { level = "warn", priority = -1 }
perf = { level = "warn", priority = -1 }
style = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }

# panics
unwrap_used = "warn"
panic = "warn"
todo = "warn"
unimplemented = "warn"
missing_assert_message = "warn"
indexing_slicing = "warn"
string_slice = "warn"
as_conversions = "warn"

# explicitness
wildcard_enum_match_arm = "warn"
allow_attributes = "warn"
allow_attributes_without_reason = "warn"
clone_on_ref_ptr = "warn"
map_err_ignore = "warn"
unused_result_ok = "warn"
let_underscore_must_use = "warn"
if_then_some_else_none = "warn"
redundant_type_annotations = "warn"
renamed_function_params = "warn"
iter_over_hash_type = "warn"
mod_module_files = "warn"
assertions_on_result_states = "warn"
deref_by_slicing = "warn"
empty_drop = "warn"
empty_enum_variants_with_brackets = "warn"
empty_structs_with_brackets = "warn"
fn_to_numeric_cast_any = "warn"
semicolon_outside_block = "warn"
too_long_first_doc_paragraph = "warn"

# output
dbg_macro = "warn"
print_stdout = "warn"
print_stderr = "warn"

# message templates in tracing
literal_string_with_formatting_args = "allow"
```

### 16.2 `clippy.toml`

```toml
allow-unwrap-in-tests = true
allow-expect-in-tests = true
allow-indexing-slicing-in-tests = true
allow-dbg-in-tests = true
allow-print-in-tests = true

disallowed-types = [
  { path = "std::rc::Rc", reason = "only inside handle types" },
  { path = "std::sync::Arc", reason = "only inside handle types" },
  { path = "std::cell::RefCell", reason = "only inside handle types" },
  { path = "std::cell::Cell", reason = "only inside handle types" },
  { path = "std::sync::Mutex", reason = "only inside handle types" },
  { path = "std::sync::RwLock", reason = "only inside handle types" },
]

disallowed-methods = [
  { path = "std::time::SystemTime::now", reason = "use the Clock handle" },
  { path = "std::time::Instant::now", reason = "use the Clock handle" },
  { path = "std::thread::sleep", reason = "use Clock::sleep" },
  { path = "getrandom::fill", reason = "use the Ids handle" },
  { path = "serde_json::from_str", reason = "parse only in boundary modules" },
  { path = "serde_json::from_slice", reason = "parse only in boundary modules" },
  { path = "serde_json::from_value", reason = "parse only in boundary modules" },
  { path = "serde_wasm_bindgen::from_value", reason = "parse only in boundary modules" },
]
```

### 16.3 Overrides

A lint is overridden only with `#[expect(lint, reason = "…")]` on the smallest
item that needs it (M-LINT-OVERRIDE-EXPECT). `#[allow]` is reserved for
generated code. A stale `expect` fails the build, so overrides cannot pile up.

### 16.4 Formatting and other checks

- `rustfmt` with `rustfmt.toml`: `edition = "2024"`, `style_edition = "2024"`.
- `cargo xtask check` runs fmt, clippy, layer rules, per-package builds,
  `cargo deny`, and `cargo shear`. It passes before every commit.

## 17. Deviations from the Pragmatic Rust Guidelines

| Guideline                   | Here                                                         | Why                                                                                                                             |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| M-TYPES-SEND                | Engine handles and workflow futures are `!Send`              | The engine runs in one single-threaded wasm worker. Data types stay `Send`; `bridge-http`, which runs on tokio, is fully `Send` |
| M-ERRORS-CANONICAL-STRUCTS  | Per-operation `thiserror` enums, no `Backtrace`              | Every caller is in this workspace and matches exhaustively; backtraces carry nothing on `wasm32-unknown-unknown`                |
| M-PANIC-IS-STOP (`unwrap`)  | `unwrap` banned; `expect` with an invariant message instead  | The message is the only diagnostic a wasm trap leaves                                                                           |
| M-STATIC-VERIFICATION tools | `cargo deny` for advisories, `cargo shear` for unused deps, no miri | Same checks on the stable toolchain; there is no `unsafe` code for miri to check                                                |
| M-MIMALLOC-APPS             | Not used                                                     | The engine is wasm; native code ships only as the bridge library inside an Android app                                         |
