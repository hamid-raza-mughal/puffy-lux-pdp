# Retired reference evidence — sub-1440 viewports

These four viewports were captured while the deliverable's scope was a responsive
range from 390px up to 1440px. That scope was corrected: the target is real
desktop monitor widths, **1440px and wider only**.

| Retired label | Was |
|---|---|
| `1024x900` | primary, DPR 1+2 |
| `768x900`  | primary, DPR 1+2 |
| `390x844`  | primary, DPR 1+2 |
| `390x667`  | height-sensitive probe, DPR 1 |

## Status

**Preserved, not deleted. Gating nothing.**

- They are no longer in `profile.mjs` `VIEWPORTS`, so `verify.mjs` neither renders
  nor diffs them. They cannot pass or fail anything.
- `gen-manifest.mjs` walks `reference/` recursively, so every PNG here is still
  covered by `MANIFEST.sha256` under its `_retired/<label>/...` path. The evidence
  stays hash-verifiable; it just doesn't count.
- The paired DOM evidence (`computed.json`, `geometry.json`, `page.html`) moved in
  step with these, to `capture/dom/_retired/<label>/`.

## Provenance caveat

They were captured under profile hash `d70461749bba1f96`, before the viewport list
changed. `profileHash()` is a record, not a control — nothing in the harness
compares it (see `docs/DEVIATIONS.md`) — so the hash difference does not invalidate
these files. It does mean a reader comparing hashes should expect a mismatch and
know why.

Also note `capture/network/manifest.json` records only the `1440x900` passes: an
earlier `--only=` run overwrote the full-matrix manifest before that clobbering was
fixed. The capture-time provenance for these four viewports is therefore not
recoverable beyond what is written here.

## If the range ever widens again

Re-add the entries to `VIEWPORTS`, `git mv` these directories back up one level, and
re-run `gen-manifest.mjs`. Do not trust them as a baseline without re-capturing
first: the live page drifts, and these are a 2026-08-19 snapshot.
