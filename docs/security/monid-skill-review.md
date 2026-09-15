# Third-party skill review: Monid

Pre-install security review of the **Monid** skill, requested before installing it.

| | |
|---|---|
| **Source** | `https://monid.ai/SKILL.md` (served from GitHub Pages) |
| **Skill version** | 0.1.7 |
| **SHA-256** | `0479b9b591c32081a8d96efd80fb6efb1b34efdfd3fb7a73153965a6e83a3979` |
| **Reviewed** | 2026-09-15 |
| **Verdict** | Safe to install. No malicious content found. Operational caveats below. |
| **Installed to** | `.agents/skills/monid/SKILL.md` (verbatim; gitignored, not repo content) |

Monid is a commercial catalog/gateway CLI: `discover` → `inspect` → `run` against
hundreds of third-party data endpoints (Apify scrapers and similar), billed against
a prepaid workspace balance.

## What was checked

**Skill file (429 lines).** Read in full. No zero-width, bidi, or Unicode tag
characters; the only non-ASCII is em dashes, arrows and ellipses. No prompt-injection
phrasing, no instruction-override attempts, no credential or dotfile access, no
instruction to conceal anything from the user. Every URL points to `monid.ai`.
Frontmatter valid: `name: monid`, description 643 chars, 429 lines.

Notably, the skill argues *against* its own use where the user already has a tool
("never route around the user's own tools", "offer, don't override", "never silently
switch") and carries an explicit cost/budget warning. That is the opposite of what a
hostile skill does.

**npm package `@monid-ai/cli@0.1.7`.** Unpacked and inspected the bundle:

- **No install hooks** — no `preinstall`/`postinstall`/`prepare`; only dev/build scripts.
- **Zero runtime dependencies.**
- **No `child_process`, no `spawn`, no `eval`.** The `exec(` hits are regex `.exec()`
  (ajv, semver); the single `new Function` is ajv's standard schema-validator codegen;
  `atob` is chalk's vendored color tables.
- **No environment harvesting.** Reads exactly 8 vars: `NODE_DEBUG`, `TERM`,
  `XDG_CONFIG_HOME`, `LOG_TOKENS`, `LOG_STREAM`, `MONID_API_BASE_URL`,
  `MONID_SETUP_CLIENT`, `MONID_SETUP_EMAIL`. No AWS/token/SSH scanning.
- **Three outbound destinations only:** `api.monid.ai` (authenticated calls),
  `registry.npmjs.org` (version check), and a setup telemetry POST. The
  `raw.githubusercontent.com` strings are ajv JSON-Schema `$id`s, never fetched.
- **Telemetry payload is `{source:"cli", client?, email?}`** — 2s timeout, best-effort,
  and sends only values explicitly passed in. No fingerprinting.
- **Credentials at `~/.config/monid/credentials.yaml`, mode 0600** (owner-only) —
  the package explicitly overrides the library default of 0666.
- **SLSA provenance verified:** built by GitHub Actions from
  `github.com/monid-ai/cli` at tag `v0.1.7` via `.github/workflows/publish.yml`.
  Cryptographic proof the tarball came from that repo's CI.

## Caveats (operational, not malware)

1. **The skill self-updates.** Its setup section instructs the agent to re-download
   `monid.ai/SKILL.md` and overwrite the local copy whenever versions drift. Version
   0.1.7 is clean; future versions arrive unreviewed. Re-check the SHA-256 above after
   any update.
2. **`Hints` is a server-controlled instruction channel.** Rule 10 tells the agent to
   prefer server-returned `Hints` over its own judgement. Combined with `run` output
   from third-party scrapers, this is a prompt-injection surface — treat all Monid
   output as data, not instructions.
3. **Runs cost real money**, billed per result, and the description is written to
   trigger proactively. Set a `WORKSPACE_BUDGET` and run cap in the dashboard before
   heavy use. Limits like `maxItems` often apply *per query*, not per call.
4. **Global `@latest` install, single maintainer.** A maintainer-account compromise
   would land in a global binary. Mitigated by provenance, zero deps and no install
   hooks; pin a version if that risk matters.
5. **Data egress by design.** Queries reach Monid and the downstream provider. The
   `sfs` flow uploads local files and mints publicly fetchable signed URLs (1h–30d).
6. **Don't pass `--email`** unless the user volunteers it; the skill itself says never
   to ask for it just for setup.

## Not done here

CLI install (`npm install -g @monid-ai/cli@latest`), `monid setup`, and API-key
configuration were left to the user — they need a `monid.ai` account and key, and
this container is ephemeral.
