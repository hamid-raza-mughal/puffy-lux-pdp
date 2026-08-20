# Reference evidence

These PNGs are the **ground truth** the fidelity gate diffs against. They are the
output of `capture/capture.mjs` run against the live target and are treated as an
**immutable frozen baseline** (see plan decision 9): if the live page drifts, that is
reported, but this baseline does not move unless explicitly re-captured.

## Why this directory is not tracked file-by-file

422 PNGs totalling 426.2 MB. Tracking them individually
would bloat the repository. Portability instead comes from two tracked artifacts:

| Artifact | Purpose |
|---|---|
| `MANIFEST.sha256` | sha256 of every reference file. Tracked in git. |
| `../reference-bundle-2026-08-19.tar.gz` | the PNGs **and** the large derived evidence (`dom/**/computed.json`, `dom/**/page.html`), which git excludes |

`verify.mjs` hash-verifies every reference against `MANIFEST.sha256` before diffing
and refuses to run against unverified references.

## Restoring from a clean checkout

```bash
cd capture
tar -xzf reference-bundle-2026-08-19.tar.gz   # restores reference/ and dom/
cd reference && shasum -a 256 -c MANIFEST.sha256
```

## Bundle identity

```
file    reference-bundle-2026-08-19.tar.gz
size    456395175 bytes
sha256  68b804b9c37d8ee12deacca6353fe330967912b99d7f4776ccde021325c02c9c
files   422 PNG
```

If `shasum -c` fails, the references have been altered and any diff percentage
computed against them is meaningless. Re-capture rather than proceeding.
