# Puffy Lux Hybrid PDP — internal UX reference rebuild

A hand-authored, static reconstruction of `puffy.com/products/puffy-lux-mattress`,
verified against the live page by **automated pixel diff rather than by eye**.

> **Not affiliated with Puffy.** This is an internal design-reference and prototyping
> artifact for a UX team. Layout, copy, photography and brand assets belong to Puffy
> (and, for the award badges, to their respective publishers). Nothing here is licensed
> for redistribution. See [`assets/third-party/NOTICE.md`](assets/third-party/NOTICE.md).

## What this is for

It is a trustworthy **"before" artifact**: an editable, documented baseline that
redesign work can be measured against, where every claim about the current page is
checkable against a captured source rather than from memory. The honesty ledger is
[`docs/DEVIATIONS.md`](docs/DEVIATIONS.md) — read it before trusting anything here.

## How to view it

No build step, no bundler, no dependencies.

```bash
open index.html
```

Works over `file://`. It also works over a static server, and must render identically:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

**Two modes.** By default the page shows a dev banner declaring it is not affiliated
with Puffy. Append `?fidelity=1` to suppress the banner and any other intentional
visual divergence — that is the mode the fidelity gate screenshots, and the only mode in
which a pixel comparison against the reference is meaningful.

## Folder map

```
index.html               the page. generated in part — see "Changing content" below
css/
  tokens.css             design tokens as CSS custom properties
  base.css               reset, typography, layout primitives
  components.css         buttons, badges, accordions, pills
  sections/              one file per page section
js/
  main.js                init + widget registry
  modules/               one classic script per interactive widget
                         NOTE: main.js must load BEFORE the modules — each opens
                         with `if (!window.PDP) return;`. See DEVIATIONS §21f.
data/
  product.json           CANONICAL: sizes, prices, promo strings, bundle contents
  content.json           CANONICAL: section headings and body copy
assets/third-party/      all captured brand assets, plus NOTICE.md
capture/                 tooling + ground truth. NOT part of the deliverable page
  profile.mjs            the single shared determinism definition
  capture.mjs            live site -> reference
  verify.mjs             THE ACCEPTANCE GATE
  discover.mjs           derives the section list from the live DOM
  probe-gallery.mjs      drives the gallery carousel through all six slides and
                         records each state. The rest-state capture cannot see
                         five of six slides; see docs/DEVIATIONS.md §21a.
  verify-gallery.mjs     BEHAVIOURAL gate: replays those states against the
                         rebuild. verify.mjs only compares the rest state.
  extract-tokens.mjs     mechanically derives candidate tokens from computed styles
  gen-manifest.mjs       makes the reference evidence portable
  sections.json          the derived section contract (capture and verify share it)
  built.json             which sections are GATED
  masks.json             every declared mask, with a reason
  diff-config.json       exact pixelmatch settings
  reference/             ground-truth screenshots (bundle + sha256 manifest)
    _retired/            sub-1440 evidence, preserved but no longer gating
    states/gallery/      per-slide evidence from probe-gallery.mjs
  gallery-probe.json     recorded live carousel behaviour, per viewport
  network/manifest-gallery.json  assets only reachable past slide 1
  dom/                   rendered DOM, computed styles, geometry per viewport
  network/manifest.json  request manifest, asset provenance, capture conditions
  diffs/                 gate output: heatmaps, side-by-sides, report.json
docs/
  COMPONENT-INVENTORY.md every section and widget
  TOKENS.md              the design system and the reasoning behind it
  INTERACTIONS.md        every behaviour, its states, its keyboard support
  DEVIATIONS.md          every difference from live. read this one.
```

## Changing things

### Copy and prices

Edit **`data/content.json`** or **`data/product.json`** — these are the single source of
truth. Then regenerate:

```bash
cd capture && node gen-html.mjs
```

That writes both the inlined JSON block and the static fallback copy into `index.html`.
The static copy exists so the page reads correctly with JS disabled; the inlined block
exists because `fetch()` is blocked over `file://`.

**Do not hand-edit the generated regions of `index.html`.** `verify.mjs` re-runs the
generator and **fails** if `index.html` changes, so stale markup cannot be verified as
if it were fresh.

### Colours, type, spacing

Edit `css/tokens.css`. Section files are token-driven, so a token change propagates.
`docs/TOKENS.md` explains what each token is, where it came from, and where the source
system was internally inconsistent.

### Images

Replace the file in `assets/third-party/images/` keeping the same name, or update the
`srcset` in the relevant section. Every asset's original URL is recorded in
`capture/network/manifest.json` for provenance.

### Reordering or removing a section

Each section is `<section class="s-{slug}" data-section="{slug}">` with its own CSS file.
Widgets initialise from `data-` attributes, so **deleting a section's markup removes its
behaviour** — no JS edit needed.

## Verifying fidelity

```bash
cd capture
node verify.mjs                    # full gate
node verify.mjs --only=1536x900    # single viewport
node verify.mjs --unit=header      # single unit
node verify.mjs --verbose
```

The gate is **not** a single percentage. All of these are checked, and any gated failure
exits non-zero:

| Signal | Threshold |
|---|---|
| Section pixel difference | ≤ 0.5 % |
| Worst 64×64 tile in a section | ≤ 5 % — so a local defect cannot hide in a tall section |
| Full-page pixel difference (DPR1) | ≤ 1.0 % |
| Page height delta | 0 px |
| Section geometry | ≤ 1 px |
| Section text content | exact, after whitespace normalisation |
| Console errors | 0 |
| External network requests at runtime | 0 |
| Generated files up to date | no diff from `gen-html.mjs` |
| Rights controls | all pass |

Only sections listed in `capture/built.json` are gated; the rest report as *pending*, so
the gate is runnable after every single section.

### Interaction states

`verify.mjs` compares the page's **rest state** only, which says nothing about a widget whose
states you reach by interacting. The gallery carousel has its own behavioural gate:

```bash
cd capture
node verify-gallery.mjs                 # all gated viewports
node verify-gallery.mjs --only=1440x900
node verify-gallery.mjs --verbose
```

It drives the rebuild through all six slides and asserts each state against
`capture/gallery-probe.json` — behaviour recorded off the live page, not expectations invented
here. Currently: **all checks pass at all five gated viewport configs.** Re-record the live
side with `node probe-gallery.mjs`; it writes new state evidence and never touches the frozen
`capture/reference/<vp>/` baseline.

### Viewports

**Desktop only: 1440px and wider.** Real monitor widths, not a responsive range.

| Viewport | DPR | Status |
|---|---|---|
| `1440x900` | 1, 2 | gated |
| `1536x900` | 1, 2 | gated |
| `1662x900` | 1, 2 | gated |
| `1920x900` | 1, 2 | gated |
| `1440x700` | 1 | gated, height-sensitive units only (`@media (max-height: 720px)`) |

**All four widths gate for real; nothing is report-only.** Sections render at their natural
content height at every width — there is no fixed fold height and nothing is clipped at
900px. Height only matters where the source itself keys off it, which is the
`@media (max-height: 720px)` rules on the layer scene, covered by the `1440x700` probe.

`profile.mjs` still supports a `gated: false` flag on a viewport; no viewport uses it. It is
the honest way to carry a width that is captured but knowingly unbuilt — see
`docs/DEVIATIONS.md` §19–§20 for when it was last used and why.

The sub-1440 viewports (1024, 768, 390) were retired when scope was corrected. Their
evidence is preserved under `capture/reference/_retired/` and still hash-verified; it just
no longer gates.

Output lands in `capture/diffs/` as heatmaps, side-by-side composites and `report.json`.

## Re-capturing ground truth

The reference is an **immutable frozen baseline**. If the live page drifts, that gets
reported — the baseline does not move unless you deliberately re-capture, because moving
it would invalidate every section that already passed.

```bash
cd capture
node capture.mjs --probe        # cheap: one viewport, rediscovers the section list
node capture.mjs                # full matrix -> network/manifest.json
node capture.mjs --only=1536x900   # one viewport -> network/manifest-1536x900.json
node gen-manifest.mjs           # refresh MANIFEST.sha256 + bundle
```

Capture is polite: one pass, sequential, no parallel requests, settle pauses throughout.

### Restoring references from a clean checkout

The PNGs are not tracked individually. See
[`capture/reference/README.md`](capture/reference/README.md):

```bash
cd capture && tar -xzf reference-bundle-<date>.tar.gz
cd reference && shasum -a 256 -c MANIFEST.sha256
```

If that check fails, any diff percentage computed against those references is
meaningless. Re-capture instead of proceeding.

## What is stubbed

Every third-party tag is stripped and replaced with an inert, visually faithful static
stand-in carrying `data-stub="…"`. **27 vendors** in total — analytics, tag managers,
pixels, a session recorder, a consent platform, an AI chat widget and a BNPL widget.
Add-to-cart is a `console.log` no-op wired to no endpoint.

Note that reviews are **first-party** on the live page (no Yotpo/Okendo/Trustpilot), so
the reviews module is a content reproduction rather than a vendor replacement.

Full list with what each replaced: [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md) §12.

## Things you should know before relying on this

- **The reference is geo-as-captured.** The capture machine resolved to Pakistan
  (`countryRegion: GB`). Puffy personalises server-side by IP, so this may not be what a
  US visitor sees. `DEVIATIONS.md` §3.
- **Prices and promos are a point-in-time snapshot** with `capturedAt` recorded.
  `priceValidUntil` on the captured page was 2026-08-27.
- **The live page runs first-party A/B tests**, so below-fold section order is not
  stable across real visitors. The reference pins one allocation.
- **The target is a headless Next.js app**, not a Shopify Liquid theme — worth knowing if
  you compare this against the live source.
- **`live_save/`** (the sibling browser export) is incomplete and read-only. It was used
  only as a cross-check, never as a source.
