# DEVIATIONS

Every place this rebuild differs from the live page, and why. This file is meant to be
read adversarially — if something here looks like a convenient omission, say so.

**Status:** in progress. Capture complete. **Scope: desktop only, 1440px and wider**
(see §19). **2 of 28 units pass the gate** (`header`, `sale-banner`). No section is
recorded as passing unless `capture/verify.mjs` reports it within threshold with it listed
in `capture/built.json`.

| Unit | 1440 | 1536 | 1662 | 1920 | worst tile | verdict |
|---|---|---|---|---|---|---|
| `header` | 0.007 / 0.006 | 0.006 / 0.006 | 0.006 / 0.005 | 0.005 / 0.004 | 0.8 % | **PASS** |
| `sale-banner` | 0.008 / 0.003 | 0.008 / 0.003 | 0.007 / 0.003 | 0.006 / 0.002 | 0.3 % | **PASS** |
| `above-the-fold` | — | — | — | — | — | **REPORT-ONLY (§22)** |

(DPR1 / DPR2, percent of differing pixels. Gate: ≤0.5 % per section, ≤5 % worst tile.)

**All four widths are gated.** `header` and `sale-banner` pass at every width and DPR.

**`above-the-fold` is no longer gated, and its old numbers are gone rather than stale.**
It previously read 1.923 / 1.694 at 1440 rising to 3.513 / 3.272 at 1920, worst tile
96.9 %, and it never passed at any width. Those figures describe a state that no longer
reproduces: commits `bfd5718` and `81f54fb` removed content from the section and left it
622 px shorter than the reference, so it now fails on **dimension mismatch** at 100 % —
a number that measures nothing. It is also now mid-redesign (§22). It was dropped from
`capture/built.json` on 2026-08-20 and is **report-only, not passing**; see §22f. The
§20 and §21h matrices are stale for the same reason.

---

## 1. Point-in-time snapshot

The live page carries volatile commercial content. Everything below is a snapshot,
recorded with `capturedAt` in `capture/network/manifest.json`, and **will not match the
live page in future**.

| Item | Value as captured |
|---|---|
| Promo code | `EARLYLABOR` |
| Banner | LABOR DAY EARLY ACCESS: SAVE $1,350 + FREE MATTRESS UPGRADE IN CART |
| Price ladder (Twin, default) | Total Value $2,149 → $799 → $749 with code |
| Lux → Royal upgrade delta | +$340 at Twin (size-dependent; +$900 at Queen) |
| Free bundle | $315 (2 Signature Memory Foam Pillows $240 + Signature Sleep Mask $75) |
| `priceValidUntil` (from ld+json) | 2026-08-27 |
| Sizes / prices | 9 variants, Twin $749 → Split Head King $2,249 |

**Baseline is frozen (plan decision 9).** The brief asked to stop and re-capture on
drift. Re-capturing mid-build would invalidate every already-passed section, so the
first capture is treated as immutable ground truth: drift is reported, the baseline
does not move unless explicitly re-captured. This satisfies the brief's actual concern
— two versions are never mixed — but it is a deliberate departure from its wording.

## 2. Reproduced commercial patterns, and the litigation context

The struck-through reference price, the "Total Value" framing and the urgency devices
are **reproduced faithfully**, because an internal critique baseline cannot critique a
pattern it has deliberately omitted.

The complaint in *Webb v. Puffy LLC* (2:25-cv-06970, C.D. Cal.) makes **allegations**
concerning inflated list/reference prices, perpetual "sale" discounting and countdown
clocks under California FAL / CLRA / UCL. These are allegations, not findings. It is
**not** established that the specific "Total Value $2,149" element on the captured page
is itself at issue, and the docket status after Oct 2025 has not been verified here.
Nothing in this rebuild should be read as a claim about the merits.

## 3. Geography — the reference is not a US visitor's page

Puffy resolves geo server-side from IP (`app.location` cookie) and routes locales
(`puffy.ca` appears in the markup). **Server-side geo cannot be pinned by cookies.**

The capture machine resolved to:

```
ip 203.81.238.210 · city Gilgit · country PK · countryRegion GB · region bom1
```

So the reference is **geo-as-captured** and may differ from what a US visitor sees, in
currency, copy, or price. This was accepted knowingly (plan decision 8) rather than
blocking the build. It is the single largest caveat on the artifact's use as a
US-market critique baseline. Recorded in `manifest.json` under `resolvedGeo`.

## 4. Architecture: the target is not what the brief assumed

The brief anticipated a Shopify Liquid theme. The live page is a **headless Next.js App
Router app on Vercel** (Tailwind, Radix UI, Embla Carousel) with Shopify as
commerce/CDN backend only. Consequences that changed the plan:

- **No `id="shopify-section-*"` wrappers.** Section boundaries had to be derived from
  the live DOM; content sections are anonymous `<div>`s, so selectors are positional
  (`#product-page > *:nth-child(n)`) and slugs come from each block's first heading.
  The derived list is `capture/sections.json` and is part of the reference contract.
- **`/products/puffy-lux-mattress.js` returns 404.** Per-size prices exist **only** in
  the `ld+json` `ProductGroup` block; the size buttons in the DOM carry no price.
- **No stylesheets.** ~556 KB of Tailwind is inlined in a single `<style>`; the only
  linked CSS is a 764 B Affirm file.
- **Below-the-fold content is not in the HTML.** It streams as 245 React Server
  Component pushes across 7 Suspense boundaries, so a headless browser with a full
  scroll pass is mandatory.

## 5. Section count: 28 units, not the brief's 12

Derived from the live DOM, not chosen: **19 content sections**, 2 chrome units, 3
above-fold sub-components, 4 footer sub-sections, plus 3 state-only units. The brief's
12 was a floor. The largest single section is the reviews block at **6,661 px** tall at
1440×900 (9,078 px at 390).

## 6. JS strategy — classic scripts, not ES modules

Chrome blocks `<script type="module">` and `fetch()` from `file://` (opaque origin →
CORS). The brief required `file://` support **and** ES modules **and** JSON-hydrated
copy; those cannot all hold. Resolution (plan decision 1): one **classic** script per
widget, self-registering into `js/main.js`, still `data-`attribute-initialised so
deleting markup removes the widget, still no build step.

Data has exactly one source of truth: `data/product.json` and `data/content.json` are
canonical, and `capture/gen-html.mjs` generates both the inlined JSON block and the
static fallback copy in `index.html`. `verify.mjs` re-runs the generator and **fails if
`index.html` changes**, so stale markup cannot be verified as if fresh.

## 7. Diff matrix — full-page DPR2 is not captured

The page is 26,872 px tall at 1440×900 and 31,122 px at 390. A full-page DPR2 capture
at 390 would be ~780 × 62,000 device px, far beyond Chrome's encoder limit and
useless as a diff target.

| Pass | Gated |
|---|---|
| Per-section, DPR1, 4 widths | yes — ≤0.5 % + worst-tile ≤5 % |
| Per-section, DPR2, 4 widths | yes — ≤0.5 % + worst-tile ≤5 % |
| Full-page, DPR1, 4 widths | yes — ≤1.0 % + height parity |
| Full-page, DPR2 | **not captured** |

This is a **stated narrowing** of the brief's "same DPRs", for the full-page pass only.
Per-section DPR2 remains fully gated, so retina asset errors are still caught.

**Oversized sections are sliced, not skipped.** Sections exceeding 12,000 device px in
height are captured as deterministic vertical slices (verified exact: 12,000 + 6,156 =
18,156 for reviews at 390×844 DPR2), so no section silently loses DPR2 coverage.

## 8. Dev banner is excluded from the fidelity gate

The brief requires a visible dev banner; the banner does not exist on the live page, so
its presence would shift every pixel below it and make the full-page gate unreachable.

Two modes: default **internal-review mode** renders `.dev-banner`; **`?fidelity=1`**
suppresses it, and that is the only mode `verify.mjs` screenshots.

**Stated limitation: the gate proves the page-minus-banner matches the reference. The
banner itself is unverified by construction.**

## 9. Assets deliberately not downloaded

| Asset | Reason |
|---|---|
| Google Symbols webfont | `googlerestricted` licence; injected by the Google Merchant widget, which is stubbed |
| Affirm icon font (base64) | Affirm proprietary brand mark |

Fonts that **are** reproduced: **Mukta** (400/500/600/700) and **PT Serif** (400/700),
both SIL OFL, self-hosted by the source, all 20 `.woff2` subsets fetchable. The
metric-override fallback `@font-face` rules (`Mukta Fallback`, `PT Serif Fallback`, with
their exact `ascent-override` / `descent-override` / `size-adjust` values) are
reproduced verbatim because they prevent CLS and are part of fidelity.

**No font substitution was necessary.** This removes what would otherwise have been the
most likely cause of unfixable text-section failures.

## 10. Live-page defects: reproduced, corrected, or flagged

Found in the captured source. Each is either reproduced for fidelity or corrected with
the divergence logged.

| Defect | Decision |
|---|---|
| `<h1>` appears after seven `<h2>`s (gallery slide headings precede it) | **Corrected** — brief requires correct heading hierarchy and one `<h1>` |
| Duplicate SVG `mask` / `filter` / `clipPath` ids across gallery slides (Figma export artifacts, invalid HTML) | **Corrected** — deduplicated |
| Empty stub `review` object in `ld+json` (`name:""`, `reviewBody:""`) — a schema violation | **Corrected** — omitted |
| Split King carries Twin XL's GTIN-13 `615678830615` and Twin XL's dimensions | **Flagged, not propagated** — Split King = 2× Twin XL ($2,198 = 2 × $1,099) explains the copy-paste |
| `ld+json aggregateRating` says `5827` reviews; on-page copy says `14,072` | **Both reproduced as found** — the contradiction is real and is itself an audit finding |
| Parent `sku` / `gtin12` are both the string `puffy-lux-mattress` (a handle, not a GTIN) | **Flagged** |
| Misspelled icon ids `#pintrest-36`, `#weighted-blanket-soofthing-pressure-48` | **Corrected** in the rebuild's own icon set |

## 10a. `font-variant-ligatures` — reproduced from measurement, not from the declaration

The source puts `[font-variant-ligatures:none]` on `<body>`, that rule genuinely exists
in its stylesheet, and `body` does compute `none`. But **descendants compute `normal`**
on the live page — something in its framework layer resets it below body.

This is not cosmetic. `"Puffy VS"` is the only header label containing an `ff` pair, and
it was the only one that would not match: 89.719 px with ligatures disabled versus the
reference's 88.328 px. Reproducing only the body declaration therefore breaks every word
containing a ligature pair, and it took the header from 0.007 % to 1.364 %.

The rebuild encodes the **measured** state (body `none`, descendants `normal`) rather
than a guess at which subtree performs the reset. `font-variant-ligatures`,
`font-kerning` and `font-feature-settings` were added to the captured property set so
this is verifiable across every element in future captures.

## 11. Accessibility divergences

Where the original is inaccessible, the rebuild ships the accessible version. Split by
whether the change is visible, because only visible changes affect the pixel gate.

| Change | Pixel-affecting? |
|---|---|
| Correct heading hierarchy, one `<h1>` | No |
| `alt` text on every image | No |
| `aria-expanded` / `aria-controls` on accordions | No |
| Labelled form controls | No |
| Deduplicated SVG ids | No |
| Visible focus states | Only when focused — captured as interaction states, not in the rest-state gate |

Any pixel-affecting accessibility fix is routed through the `?fidelity=1` switch and
listed here. *(None required so far.)*

## 12. Third-party stand-ins

**27 distinct vendors** identified in the captured source — far more than the brief
anticipated. All stripped; each replaced by an inert, visually faithful static stand-in
marked `data-stub="…"`.

GTM ×2 · GA4 (`G-TGK5BDGERM`) · Google Ads/gtag server containers · Google Merchant
Center + Customer Reviews · Microsoft Clarity (session recorder, `tt2p2rgsoi`) · Bing
UET ×2 · Meta Pixel · TikTok Pixel ×2 · Criteo · Affirm · Klaviyo · Iubenda CMP ·
Gleen/Alhena AI chat · Talkable · AddShoppers · Opensend · Retention.com · OpenAI
Quantify pixel · Simpli.fi · Attentive · Pinterest · Snap · Taboola · Outbrain ·
Amplitude · Hotjar · Optimizely.

**There is no hosted reviews platform.** Grep found zero hits for Yotpo, Okendo,
Stamped, Judge.me, Reviews.io, Trustpilot, Bazaarvoice, Loox and Junip — reviews are
first-party rendered. So the reviews stub is a **content reproduction**, not a vendor
replacement, and it can in principle pass the pixel gate rather than needing a mask.

**Add-to-cart is a `console.log` no-op wired to no endpoint.**

## 13. A/B testing and personalisation

Split testing is **first-party** (Vercel edge middleware), not a vendor. Experiment
`reposition-celliant-14-08`; allocation is random per visit and carried in cookies.

Pinned for the capture: `experiment-var=a`, `ab-reposition-celliant-14-08-var=a`,
`ab-excluded=true`, `app.client.id` fixed. Recorded in `manifest.json`.

**Consequence:** below-fold section order is not stable across real visitors. The
reference represents one pinned allocation, not "the" page.

## 14. Capture non-determinism that had to be suppressed

Documented because each one silently corrupts a reference if left unpinned.

| Source | Treatment |
|---|---|
| `Order today for delivery by <date>` — client-clock derived | Clock frozen to `2026-08-19T17:00:00.000Z` |
| React-generated SVG gradient ids (`id="star-xxxxxxxxx"`) change per render | `Math.random` seeded; ids are invisible and affect no pixels, but drift comparison also normalises them |
| `motion-reduce:` appears ~40× — reduced motion **changes the design** | Pinned to `no-preference` |
| Lazy modules load on scroll; one pass is insufficient | `scrollAndSettle` repeats until height **and** body text length are stable, and asserts it |
| Email-capture modal | Fires **late** — after the full scroll pass, not at the documented 2–3 s. Cleared and re-asserted immediately before every screenshot (see §17) |
| Cookie banner / modal remain in the DOM and translate off-screen after dismissal | Dismissal asserted by viewport intersection, not `isVisible()` |
| Sticky add-to-cart sits at `translateY(100%)` at rest | Captured as an interaction state, not a gated section |

## 15. Masks

**None declared, and none expected.**

An earlier note in this file claimed the countdown timer was inactive, reading
`--countdown-banner-height: 0px` and the hidden `timer` grid slot as "off". That was
wrong. The announcement bar carries a **live countdown**, and it renders in the
reference at `13h 59m 59s`.

It needs no mask because freezing worked: with the capture clock pinned to
`2026-08-19T17:00:00.000Z` the countdown is **identical across two independent runs
and all four viewports**. That is the plan's preference order working as intended —
freeze first, mask only if freezing demonstrably fails. The rebuild derives its
digits the same way, from a fixed target against `Date.now()`, so it ticks in normal
use and matches the reference exactly under the frozen clock.

Any future mask must appear in `capture/masks.json` with a reason **and** evidence
that deterministic freezing was attempted and failed. Masking and freezing the same
element is incoherent — only one applies.

## 17. Capture defects found and fixed (kept for auditability)

These are recorded because each one produced a *plausible-looking but wrong* reference,
and a reader should be able to see what was caught rather than trust that nothing was.

**The whole reference set was once captured through a modal scrim.** The email-capture
modal fires after the scroll pass. Capture dismissed it at 3.5 s, scrolled, then
screenshotted through a full-viewport `bg-black/80` + `backdrop-blur(10px)` at
`z-index: 200002`. All 242 PNGs were veiled: white countdown tiles read `34,34,36`
instead of `255,255,255`. The header diffed at 42.7% against that reference and 0.007%
against a clean one. Fixed by `profile.blockingOverlays()` / `clearOverlays()`, which
detect *any* large painting overlay by coverage and stacking rather than by a list of
known selectors, and which throw rather than capture through a scrim.

**Page height varied between runs** (26,872 vs 20,483 px) because one scroll pass is not
enough — content revealed by one pass pushes more into view for the next. The settle
routine now repeats until height *and* body text length are both stable, and asserts it.
Under the old height-only check, 1440x700 banked a reference with the reviews module at
272 px and 46 characters instead of 6,661 px.

**Geometry was dumped after the section screenshots**, which leave the page scrolled, so
every recorded box was wrong (`footer` height read 24 px, `header` y read 9452). Dumps
now run at scroll 0 before anything is screenshotted.

**`FREEZE_CSS` paused the overlays' own hide transitions**, so dismissal could never
complete. Freeze is now toggleable and applied only for screenshots.

**Overlay dismissal was asserted with `isVisible()`**, which stays true forever because
both overlays remain in the DOM and merely translate off-screen. Presence is now judged
by viewport intersection.

## 18. Gate changes made after the fact (stated, not buried)

The text-equality signal originally compared `textContent`. That penalised the rebuild
for not reproducing **CSS-hidden** nodes — specifically the announcement bar's two
`aria-hidden` marquee measurement copies, which occupy no visible space. Invisible DOM
is irrelevant to visual fidelity, so the gate now compares `innerText`.

This is a loosened check and is called out as such. No pixel threshold was changed, no
mask was added, and no section was marked passing under the old comparison.

## 19. Scope correction: desktop-only, 1440px and wider

The harness originally gated six viewports from 390 to 1440. That range was wrong for this
deliverable — the target is real desktop monitor widths, not a responsive ladder down to
mobile. Recorded here rather than in git history alone, because it changes what every
number in this file means.

### 19a. What was retired

`1024x900`, `768x900`, `390x844` and `390x667` left `profile.mjs` `VIEWPORTS`. Their
captured evidence was **moved, not deleted**, to `capture/reference/_retired/<label>/` and
`capture/dom/_retired/<label>/`, with `capture/reference/_retired/NOTE.md` explaining the
status. `gen-manifest.mjs` walks `reference/` recursively, so those PNGs are still
hash-covered under their new paths — the evidence stays verifiable, it just no longer
counts. Nothing renders or diffs them.

Consequence for the table above: the 1024/768/390 columns are gone. Those numbers were
real when measured and are preserved in git history; they are not evidence about a build
whose supported range no longer includes them.

### 19b. What was added, and where the bar sits

`1536x900`, `1662x900` and `1920x900` were captured at DPR 1 and 2, same method as 1440 —
no new technique, the existing `capture.mjs` with new widths.

| Viewport | Status |
|---|---|
| `1440x900`, `1440x700` | gated |
| `1536x900` | **gated** |
| `1662x900`, `1920x900` | **captured, diffed, reported — NOT gated** |

`profile.mjs` carries this as a `gated: false` flag on the two report-only entries;
`verify.mjs` renders and diffs them identically and prints their numbers in a **separate
table**, but pushes nothing from them into `failures`. A number in the report-only table
can never be read as a passing gate.

This is a deliberately loosened target, chosen rather than drifted into, and it is stated
here for the same reason §18 is: a loosened check that is not announced is a hidden one.

### 19c. Above 1536, this build is not claimed pixel-faithful

The reason 1662 and 1920 are not gated is that the source genuinely changes there and this
rebuild does not implement those changes. Measured out of the target's own inline Tailwind
build (`capture/dom/1440x900/page.html`), not inferred:

| Source chain | Fires at | Effect | Implemented? |
|---|---|---|---|
| `min-[1640px]:absolute min-[1640px]:left-0 min-[1640px]:w-full min-[1640px]:justify-center` on the primary nav | ≥1640 | primary nav leaves the flex row and becomes an absolutely-positioned full-width centred overlay | **no** |
| `pr-[46px] xl:pr-6 min-[1640px]:pr-4 min-[1740px]:pr-[46px]` on the secondary nav | ≥1640, ≥1740 | padding-right 24 → 16 → 46px | **no** |
| `min-[1600px]:gap-4`, `min-[1600px]:gap-3`, `min-[1600px]:h-14 min-[1600px]:w-[76px]` on the ATF thumbnail rail | ≥1600 | thumbnail size and rail gaps step up | **no** |

Confirmed at the captured width, not just inferred from the class chain. At 1662 the
live page renders the secondary nav with `padding-right: 16px` and width 453.33 (24px /
461.33 at 1440), and the primary nav at `position: absolute; x=0; width=1662` — versus
`position: static; x=174; width=732.67` at 1440. That is the whole of the header's
report-only gap: **2.236 % / 1.429 % at 1662 and 2.035 % / 1.317 % at 1920**, against
0.006 % at 1536.

`sale-banner` passes everywhere — 0.008 % down to 0.002 % across all four widths — which
matches the prediction that it carries no supra-1440 variants at all. It is report-only at
1662/1920 only because its viewport is, not because it has a gap.

The padding steps are two lines and were tempting to add alone. They were not: the
secondary nav's padding sits inside a layout the primary nav restructures at the same
1640 breakpoint, so implementing one half could render 1662 *worse* than implementing
neither. Either the ≥1640 state goes in whole or it stays out whole. It stays out.

### 19d. The 14-breakpoint list is not the complete set

`profile.mjs` `BREAKPOINTS` records the source's **named** Tailwind scale
(…1440, 1536, 1662, 1920). The source also carries arbitrary `min-[Npx]:` variants that
are not on it. In the desktop range alone: `min-[1600px]`, `min-[1640px]`, `min-[1740px]`
on in-scope sections, plus `min-[1341px]` and `min-[2200px]` elsewhere. Counting media
blocks in the source CSS, there are state changes at 1441, 1480, 1514, 1536, 1537, 1540,
1592, 1600, 1640, 1662, 1740, 1775, 1784, 1800, 1836 and 1920 between 1440 and 1920.

Do not read "we capture at the 14 breakpoints" as "we capture every state".

### 19e. The 1536-as-a-margin hypothesis was tested and rejected

The scope correction was proposed on the reasoning that the source's container is
`max-width: 1536px`, so 1662 and 1920 might be 1536-wide content with extra side margin
and nothing else changing — one visual state at three widths.

Measured instead of assumed, and it does not hold. Exactly **one** element in the whole
page computes `max-width: 1536px`, and it sits at document y≈17,054 — far below the fold,
outside every in-scope section. Above the fold the layout is fluid. The source ships 26
`min-width:1536px` blocks, 26 `min-width:1662px` blocks and 4 `min-width:1920px` blocks,
one of the last keyed directly on `#pdp-above-the-fold`, several carrying viewport-relative
arithmetic (`calc(560px - (100vw - 1662px) * 0.25)`, `clamp(…100vw…)`) that cannot collapse
to a fixed state. **1536, 1662 and 1920 are three states, not one.**

### 19f. Dead CSS removed (41 declarations)

With the supported range starting at 1440, any declaration that a later always-applying
rule overrides became unreachable. These were found with a cascade analyser over
`tokens.css`, `base.css`, `header.css` and `above-the-fold.css` — evaluating each
`(selector, property)` at 1440, 1536, 1662 and 1920 — not by reading the files.

**Cut rule, applied strictly:** remove a declaration only when a later rule with the same
selector and the same property applies at *every* supported width. Rules that are dead only
because an ancestor is `display: none` (the mobile menu button, the mobile banner copy)
were **not** touched — that follows the markup, and the markup stays (§19h).

The `@media` wrappers themselves were kept even though `min-width: 768/1025/1201/1341` are
now all always-true. They mirror the source's own variant structure and are what this
file's provenance comments cite. Flattening them would be a larger rewrite for no fidelity
gain.

41 declarations removed: 36 in `header.css`, 3 in `above-the-fold.css`, 1 in `base.css`
(`.container` base `padding-inline`), 1 in `tokens.css` (`--header-height: 120px`). The
full list is in the commit message. The largest group is the sale banner's mobile layout —
`grid-template-areas`, `grid-template-columns`, `row-gap`, and the whole sub-1025 countdown
sizing — all of which the `min-width: 1025px` block already replaces at every supported
width.

The named case from the scope brief is worth recording because the brief's premise was
wrong. It read: the `.header__nav-secondary` `46px`/`24px` split can collapse to a single
declaration, since at 1440+ the source's `xl:` variant always applies and the value is
always 24px. The first half is right — the `46px` base is unreachable and was removed. The
second half is not: the full source chain is
`pr-[46px] xl:pr-6 min-[1640px]:pr-4 min-[1740px]:pr-[46px]`, so across supported widths
the value is 24px at 1440 and 1536, **16px at 1662, and 46px again at 1920**. It does not
collapse to one value; it collapses to one *reachable* value within the gated range.

**Proof the cut changed nothing:** re-running the gate at 1440 after all 41 removals gives
`header` 0.007 / 0.006 and `sale-banner` 0.008 / 0.003 — identical to the pre-cut numbers
recorded in this file.

### 19g. `above-the-fold` at 1536: a new failure mode, same unfinished unit

`above-the-fold` was already failing at 1440 (1.923 % / 1.694 %) and still is — unchanged
by this work. At 1536 it fails differently: a **dimension mismatch**, reference 1914px tall
versus the rebuild's 1836px.

Measured cause, so it is not confused with a regression from the scope change. At 1536 the
source's buy-box column takes `2xl:px-8`: it goes from **450px wide with 16px inline
padding at 1440 to 520px wide with 32px at 1536**, and its height grows 1836 → 1914. The
rebuild pins `.atf__buy { width: 450px }` in the `min-width: 1025px` block with no 2xl
variant, so it stays 1836 at every width.

(The awards labels also change at 1536 — the `1.7xl:max-2xl:max-w-[90px]` cap releases and
they go from 2 lines to 3. That is real and the rebuild already scopes it correctly, but it
is **not** what moves the section height: the awards are a fixed overlay row sitting over
the gallery and do not contribute to it.)

This is remaining work on `above-the-fold`, which is the in-progress unit and the agreed
stopping boundary — not a defect introduced here.

### 19g-note. Superseded

§19c said this build was not claimed pixel-faithful above 1536, because the source's
`min-[1600px]` / `min-[1640px]` / `min-[1740px]` states were measured but unimplemented.
**They are now implemented** and 1662/1920 gate for real — see §20. The measurements in
§19c stand; only the "not implemented" verdict is superseded.

### 19h. Sub-1440 markup and JS kept, knowingly unreachable

The mobile menu button, the `nav-drawer` JS module, and the `--mobile`/`--desktop` banner
text variants can no longer render at any supported width. They were **kept**. This was a
viewport-range correction, not a rewrite; the markup mirrors the source DOM, and it is
invisible to the gate's `innerText` comparison. Flagged here rather than silently carried.

### 19i. `profileHash` moved, and it enforces nothing

Retiring and adding viewports moved the hash from `d70461749bba1f96` to
`178dba516dd0396e`, because `VIEWPORTS` is inside its payload.

The 1440 references were banked under the old hash and are still valid — the viewport
*list* does not affect how any single viewport renders. But the honest statement is
stronger than that: **nothing in the harness compares the hash.** It has five call sites —
its definition, two `console.log`s, and two JSON record fields — and is never checked
against anything. Reference integrity comes entirely from per-file sha256 against
`MANIFEST.sha256`. So `profileHash` is documentation, not a control. Making it an actual
audit check is a real improvement and is not done here.

### 19j. Settle warnings on the new captures, and what was done about them

`scrollAndSettle` warns when a pass does not reach two consecutive identical
height+text fingerprints inside 8 rounds. Two of the six new passes warned. They were not
treated the same, because they were not the same.

**`1920x900` — a genuinely bad reference, re-captured.** The first attempt reported dpr-1 at
27,411px / 27,946 chars and dpr-2 as *"stable"* at **20,808px / 21,731 chars** — the exact
`Stable != complete` failure `scrollAndSettle`'s own comment warns about, where the reviews
module has not begun loading and a short page therefore holds still. Caught by a cross-DPR
check: every DPR2 section screenshot must be exactly 2× its DPR1 counterpart, and
`section-16-questions-weve-got-answers` came out 3840×2442 against an expected 3840×2870.
Re-captured; all 27 co-present sections then matched 2× exactly.

**`1536x900` dpr-2 — flag kept, reference accepted.** It warned, but the same cross-DPR
check passed 27/27, and its final fingerprint (27,145px / 27,922 chars) is identical to the
dpr-1 pass that *did* settle. The warning is the round counter running out on text-length
jitter in the reviews module, not a partial page. Accepted with that evidence rather than
re-captured — stated here because the standing rule is "UNSTABLE invalidates a reference",
and this is a documented exception to it, not an oversight.

`1920x900` dpr-1 still warns after re-capture, for the same round-exhaustion reason, and
passes the same 2× check. 1920 is report-only regardless.

The cross-DPR 2× check is not part of `verify.mjs`. It was run by hand for these captures.
Folding it into the harness would make this class of bad reference impossible to bank
silently, and is worth doing.

### 19k. A capture bug fixed on the way through

`capture.mjs` wrote `network/manifest.json` unconditionally on every non-probe run, so a
single-viewport `--only=` run overwrote the whole provenance record. This had already
happened: the committed `manifest.json` holds only the two `1440x900` passes, and the
capture-time record for the original 390/768/1024 run is gone — the reference PNGs
survived, the record of how they were made did not. Now only a full-matrix run writes
`manifest.json`; an `--only=` run writes `network/manifest-<label>.json`.

Not recoverable retroactively. Stated so the gap in `_retired/` provenance is on the
record.

## 16. Known gaps / not yet done

- Rebuild not started; no section has passed the gate yet.
- The saved export in `live_save/` is incomplete (stops at `layers-section`, localised
  zero fonts and 17 of ~229 images). Used only as a cross-check, never as a source.
- `1440×700` reference covers only height-sensitive units, by design.
- Above 1536 the rebuild is not pixel-faithful and is not gated: the ≥1600/1640/1740 states
  are measured but unimplemented (§19c).
- `above-the-fold` does not implement the buy box's `2xl:px-8` step, so it is 78px short at
  1536 and above (§19g).
- The cross-DPR "every DPR2 clip is exactly 2× its DPR1 clip" check is manual; it should be
  in `verify.mjs` (§19j).
- `profileHash` is recorded but never compared — it is documentation, not a control (§19i).
- Interaction-state coverage matrix (`docs/INTERACTIONS.md`) not yet written. The gallery
  carousel is the one widget whose interaction states ARE covered, by
  `capture/verify-gallery.mjs` against `capture/gallery-probe.json` (§21).
- `above-the-fold` cannot pass its text check until the `layer-scene` unit is built: the layer
  scene's copy lives inside `#pdp-above-the-fold` (§21i).

---

## 20. Finishing all four widths for real

1662 and 1920 stopped being report-only. Everything §19c listed as measured-but-unbuilt is
built, and `profile.mjs` carries no `gated: false` entry any more.

### 20a. What was implemented

| Source chain | Fires | Effect | Where |
|---|---|---|---|
| `min-[1640px]:absolute left-0 w-full justify-center` | ≥1640 | primary nav becomes a full-width centred overlay | `header.css` |
| `pr-[46px] xl:pr-6 min-[1640px]:pr-4 min-[1740px]:pr-[46px]` | ≥1640, ≥1740 | secondary nav padding 24 → 16 → 46px | `header.css` |
| `px-4 ... lg:px-4 1.5xl:px-4 2xl:px-8` + `pt-4 ... 1.5xl:pt-5 2xl:pt-6` | ≥1536 | buy box 450/16px → 520/32px, inner padding-top 20 → 24 | `above-the-fold.css` |
| nine further `2xl:` steps inside the buy box | ≥1536 | title 28/36 → 32/40, title-row gap 4 → 12, star 16 → 20, upgrades wrapper margin 0 → 8, upgrade card padding 8 → 12, size-grid margin 24 → 36, fine-print gap 8 → 12, bundle image 58 → 80, price row-gap 0 → 4 | `above-the-fold.css` |
| `3xl:gap-6 3xl:px-6`, `3xl:size-[86px]`, `3xl:w-44`, `3xl:scale-[1.5]`, `3xl:h-[212px]` | ≥1662 | awards row 90 → 102 tall, badges 74 → 86, laurel 144 → 176 at scale 1.5, POY badge 140 → 212 | `above-the-fold.css` |
| `min-[1600px]:gap-4 / gap-3 / h-14 w-[76px]` | ≥1600 | thumbnail rail 64×48 → 76×56, gaps 12/8 → 16/12 | `above-the-fold.css` |
| `3xl:top-auto 3xl:bottom-[calc(580px-(100vw-1662px)*0.25)]` | ≥1662 | "See What's Inside" pill switches to a fluid bottom anchor | `above-the-fold.css` |

Each was found the same way: diff every element carrying a wide-variant class between two
captured widths, and read the property the variant targets. Not by eye, and not by guessing
a `width: 100%`.

### 20b. The gallery grows because the grid track does

The visible gap at wide viewports looked like a hardcoded hero width. It was not a cap. The
source's hero is `md:min-w-[1024px] lg:w-[var(--content-width)] max-w-[2200px]`, and
`--content-width` resolves to `calc(100vw - var(--pdp-top-fold-rhs-column-width)) / (1/1)` —
literally the gallery grid track. Measured layout box:

| width | track (`1fr`) | hero box | centred at |
|---|---|---|---|
| 1440 | 990 | 1024 × 1259.52 | x = −17 |
| 1536 | 1016 | 1024 × 1259.52 | x = −4 |
| 1662 | 1142 | 1142 × 1404.66 | x = 0 |
| 1920 | 1400 | 1400 × 1722 | x = 0 |

So the hero is `clamp(1024px, 100%, 2200px)` with a constant 1.23 height ratio, centred and
allowed to overflow the track. The old `left: -17px` was that centring frozen at 1440. The
track needed no work at all once the buy box took its 520px: `1fr` picked up the rest.

Auto margins cannot express the centring — CSS 2.1 §10.3.7 refuses negative auto margins and
left-aligns instead — so it is written as `left: 50%` plus a negative `margin-left`. The
ratio is `aspect-ratio: 1 / 1.23` rather than a `calc`, because a percentage inside a
`height` calc resolves against the containing block's height, not its width.

### 20c. The hero offset was calibrated in two places — SUPERSEDED by §21c, which explains it

§ The 93px hero offset at 1440 was already flagged as calibrated to the reference PNG rather
than derived — the captured geometry puts the hero's layout box at the section top at every
width, and the PNG disagrees with its own geometry dump.

That disagreement is **not constant across widths**. Swept the same way:

| width | best offset | section diff at that offset |
|---|---|---|
| 1440 | +93px | 1.923 % |
| 1536 | +93px | 2.717 % |
| 1662 | −8px | 3.036 % |
| 1920 | −8px | 3.513 % |

Both minima are sharp (at 1662: 5.06 % at −11, 3.04 % at −8, 3.94 % at −7). The step lands
exactly on the 3xl breakpoint, which is suspicious and remains **unexplained** — no source
rule states it. The most likely cause is capture-side: the reference is a `position: sticky`
gallery inside a 27,000px page, while the rebuild is ~2,000px tall, so the sticky column
resolves differently when the section is clipped. Recorded as a known artifact, not a
finding about the source.

> **This was wrong, and §21c corrects it.** Both numbers are the source's own
> `object-position` expression, scaled by the hero's `scale(1.3)`. The reason the sweep looked
> like an unexplained artifact is that `object-position` is not in `profile.STYLE_PROPS`, so it
> is absent from `dom/<vp>/computed.json` — the mechanism was invisible in the evidence the
> sweep was checked against. Both calibrations are now deleted and derived. The "sticky column"
> hypothesis above was never tested and is not the cause. The 3xl step is not suspicious: it is
> where the source changes `--content-position--min` from 42px to −164px.

### 20d. `above-the-fold` still fails, at every width

| width | DPR1 / DPR2 |
|---|---|
| 1440 | 1.923 / 1.694 |
| 1536 | 2.717 / 2.420 |
| 1662 | 3.036 / 2.724 |
| 1920 | 3.513 / 3.272 |

Against a ≤0.5 % gate, all eight cells fail. This is not a regression from this pass — 1440
is byte-identical to what it was before it (1.923 / 1.694), and the wide widths went from
dimension mismatches and ~22 % down to ~3 %. The unit has never passed at any width.

Where the residual sits, measured by splitting the diff by column: at 1440 the gallery column
is 0.63 % and the buy column 4.76 %; at 1920 the gallery is 8.83 % and the buy column 6.14 %.
So the remaining work is roughly half a pre-existing buy-box gap that predates any of the
width work, and half hero-photo registration that the offset sweep can only partly absorb.

`header` and `sale-banner` are unaffected and pass at all four widths.

---

## 21. The gallery carousel: built, and what it cost

The product gallery was on the original build list as *"gallery carousel (keyboard + touch +
dots/arrows)"* and was never implemented: what shipped was a single static image in a
one-slide track. The live gallery is six slides. This section records what was measured to
build it, what the rebuild does differently, and two claims in this file that turned out to
be wrong.

The unit of work was **the carousel's container**, not the carousel:

```html
<div class="relative left-0 top-0 z-[1] h-full w-full md:pb-0 lg:absolute">
```

### 21a. New evidence: `capture/probe-gallery.mjs`

`capture.mjs` records the page in its **rest state only** — slide 1 active, slides 2–6
translated out of view at `opacity: 0`, and their `loading="lazy"` images never decoded. That
is enough to gate the section as it first paints. It is **not** enough to rebuild a carousel,
because five of six slides had never been observed rendered, and three specific things were
therefore unknowable from the existing evidence:

1. **`object-position` and `filter` are not in `profile.STYLE_PROPS`**, so the hero's crop
   mechanism and the thumbnails' selected/unselected states were absent from
   `dom/<vp>/computed.json` entirely. This is the omission that produced §20c's wrong
   conclusion.
2. **`computed.json` puts the slide 3–6 `<img>` layout box at 1024 × 651.688** — which is the
   `width`/`height` *attribute* ratio (1400 × 891) standing in for an undecoded image, not a
   real layout. Building to it would have baked in a load artifact; all six settle to
   ~1024 × 1259.5 once visited.
3. **The thumbnail rail ships three buttons for six slides.** Whether that window scrolls, and
   how, cannot be read off a static DOM dump.

So `probe-gallery.mjs` drives the real carousel through all six slides at each gated viewport
and records the result in `capture/gallery-probe.json` plus per-slide PNGs under
`capture/reference/states/gallery/<vp>/dpr-1/`. It reuses `profile.mjs` unchanged — same
cookies, clock, UA, overlay assertions, one page load per viewport, sequential.

**It does not touch `capture/reference/<vp>/`.** The frozen rest-state baseline is exactly as
it was; this is *additional* state evidence, the same pattern as
`reference/states/overlays/`. As a check, the probe re-downloaded 131 assets the rest-state
capture had already saved: all 131 were byte-identical, so the live page has not drifted.

### 21b. What the source actually does (all measured)

**Slide transport.** The track never moves (`ml-0`, no transform). Every slide carries its own:

| | transform | opacity | pointer-events |
|---|---|---|---|
| active | `translateX(-(i) · (slideWidth + 16px))` | 1 | auto |
| inactive | `translateX(slideWidth + 2px)` | 0 | none |

The active slide is pulled back by its own flex offset so it lands on the carousel origin;
every other slide is parked just past the right edge. The recorded inactive offsets are
992 / 1018 / 1144 / 1402 against slide widths 990 / 1016 / 1142 / 1400 — **width + 2 at every
width**, so the `+2` is reproduced rather than rounded away. The active slide additionally
gains `z-[1] is-snapped is-in-view`.

`data-active` stays `"false"` on **all six slides at all times**, so it is not the state
signal. The rebuild keeps it literal for the same reason.

**Thumbnail rail — a sliding window of three, slide-indexed:**

| active slide | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| window | 1,2,3 | 1,2,3 | 2,3,4 | 3,4,5 | 4,5,6 | 4,5,6 |

i.e. `start = clamp(active − 1, 1, 4)`. The `data-testid`s and `aria-label`s are slide-indexed,
not position-indexed: at slide 6 the first button is `…_thumb4`, and clicking it goes to slide
4. The up arrow is disabled only on slide 1, the down arrow only on slide 6.

Painted thumbnail state: the border is `blue-200` on **all** of them — it does not change with
selection. The only differences are `filter: brightness(1)` vs `brightness(0.5)` and the
cursor. (The rebuild previously had the border switching, which was wrong.)

**Keyboard: the source does not do it.** The carousel region has no `tabindex`, so it cannot
take focus, and the probe confirmed ArrowLeft/ArrowRight change nothing. The build list's
"keyboard" therefore describes something the live page does not have. Keyboard operation is
what the buttons give: Tab to a thumbnail or arrow, press Enter/Space. **The rebuild does not
add arrow-key navigation** — that would be a redesign, and this artifact records the "before".
`verify-gallery.mjs` asserts the rebuild does *not* respond to arrow keys, so nobody adds it
by accident later.

**Three missing assets.** Advancing past slide 3 requests three thumbnails the rest-state
capture never asked for (`thumbnail--bundle-1-masks`, `…-lux-top-thumb`, `…-lux-side-thumb`).
They are now in `assets/third-party/images/` with provenance in
`capture/network/manifest-gallery.json` — a **separate** manifest; the frozen `manifest.json`
is not rewritten.

### 21c. §20c was wrong: the hero offset is `object-position`, and it is now derived

The photo's classes end in `lg:object-[var(--content-position)]`, and:

```
--content-position: center clamp(42px, 42px + (90px − 42px)·(100dvh − 697px)/(1024px − 697px), 90px)
```

which resolves to `center 71.798px` at a 900px-tall viewport. §20c reasoned that this could not
matter, because all six assets share the 0.813 aspect ratio of their box, so `object-fit: cover`
has **zero** overflow — `coverOverflow {x: 0, y: 0}` at every gated width, which the probe
confirms.

That reasoning is wrong. Zero overflow makes a *percentage* object-position a no-op, because it
resolves to `(box − content) · pct = 0`. `--content-position` is a **length**, and a length
places the content's edge exactly that far from the box's edge regardless of overflow. So the
photo really is pushed down 71.798px inside its box, leaving 71.798px of box empty at the top
and clipping the same off the bottom.

And **71.798 × 1.3 = 93.3px** — the hero's `scale(1.3)`. That is the "calibrated 93px" §20c
described as an unexplained disagreement between the reference PNG and its own geometry dump.
There was no disagreement: `object-position` is not in `profile.STYLE_PROPS`, so it never
appeared in the dump, and the offset sweep rediscovered it empirically without being able to
name it. The 1662/1920 figure lands the same way: `--content-position--min` is −164px there
(`[data-product-type=mattress]` beats the generic −232px), the clamp gives −6.318px, and
−6.318 × 1.3 = −8.2px — the hardcoded `−8px`.

**Both calibrations are deleted.** The photo's box now sits at the slide's top edge exactly as
the captured geometry says, and its placement comes from the source's own expression. Nothing
in the gallery is calibrated to a PNG any more.

This also settles the `--awards-size` question the per-slide multipliers raise
(`object-[center_calc(var(--awards-size)*1.6)]`, 1.6/1.5/1.4/1.6/1.6/1.6 per slide): from `lg`
up they are all overridden by `lg:object-[var(--content-position)]`, so the per-slide variation
is mobile-only. The *mechanism*, though, is the same one, and it is live and load-bearing here.

### 21d. Structural corrections to the container

Walking the container's children against the reference turned up three things that were wrong
independently of the missing slides:

- **The Product-of-the-Year badge was in the wrong place.** It was a sibling of the carousel;
  in the source it is inside **slide 1**, and the probe records `hasPoyBadge` true for slide 1
  and false for slides 2–6 — *including* slides 5 and 6, which do repeat the awards header. As
  a sibling it would have survived onto every slide. Moved inside slide 1.
- **Two container children were missing entirely**: the `.h-full.is-loop.cursor-grab` wrapper
  inside the carousel, and the mobile dot pagination. Added.
- **`--gallery-height` is 680px, not `calc(100dvh − var(--header-height))`.** The source
  declares both; the `[data-handle=puffy-lux-mattress]` rule wins on specificity at every
  width, so the viewport-height expression is dead code on this product. The probe read 680px
  at all five gated configs.

Beyond that, the container holds **exactly two** children — carousel and navigation wrapper.
The "See What's Inside" pill and the layer scene are siblings of it, not inside it. Confirmed
by reading `container.children` directly rather than by inspecting the pasted markup.

One coupling reaches outside the container and had to be handled anyway: **the pill is visible
only while slide 1 is active.** Measured on the live page — slide 1 gives `opacity: 1 /
pointer-events: auto`, slide 2 gives `0 / none`, and the element carries the source's own
`transition-opacity duration-300 motion-reduce:transition-none`. There is no CSS selector for
it in the source (`:has()` is used for the awards row but not for this), so the opacity is set
from script. The rebuild publishes `data-active-slide` on `.atf__media` from
`js/modules/gallery.js` and keys the pill off that. This only became visible once the carousel
actually moved — before this pass it was permanently on slide 1, so the pill was never wrong.

### 21e. Where the rebuild deliberately differs

- **Slides 5 and 6's awards header is cloned by JS, not duplicated in markup.** The source
  ships three literal copies of it — ~52 KB of award SVG each time, including duplicate SVG
  `id`s. The rebuild ships one and `js/modules/gallery.js` clones it into slides 5 and 6 at
  init, giving an identical DOM in the mode the gate measures. Slide 1 — the only slide visible
  in the rest state — is static markup, so the page still reads correctly with JS disabled.
- **Drag is a threshold swipe, not Embla physics.** The source ships Embla with momentum and
  rubber-banding. The rebuild reproduces the visual model (per-slide transform + opacity) and a
  40px threshold swipe. One slide per gesture, no momentum.
- **Mobile controls are present but hidden.** The dot pagination and the two overlay arrows are
  `lg:hidden` in the source and this build is desktop-only, so they are `display: none` here.
  They are in the markup because they are in the reference DOM at every width and omitting them
  would misreport the container's contents. Their measured mobile geometry is in
  `gallery-probe.json` for whenever the mobile range returns to scope.
- **No per-slide accessible name.** The source's slides carry `role="group"
  aria-roledescription="slide"` and no `aria-label`, so a screen reader gets "slide" with no
  position. The rebuild reproduces that gap rather than quietly improving it; it belongs in
  §11 as a live-page finding.
- **The source's self-referential `id` + `aria-labelledby` on icon SVGs is dropped.** The
  pattern (`id="arrow-right-2-36" aria-labelledby="arrow-right-2-36"` on an element also marked
  `aria-hidden="true"`) labels the element with itself and would collide once the icon repeats.

### 21e-bis. Two bugs the behavioural gate did not catch, and what fixed that

Both were found by rendering slides 2-6 and **looking at them** next to the live per-slide
PNGs — not by any automated check:

- **Thumbnails 4, 5 and 6 all showed slide 3's picture.** The rail holds three buttons, so the
  art for the other three slides is declared in `data-thumb-art` on `.atf__stage` — and the
  widget read it with `root.parentNode.querySelector('[data-thumb-art]')`, which searches
  *descendants* and so never matched the attribute's own element. The window slid correctly and
  every `data-testid` was right, which is exactly why the gate passed. `verify-gallery.mjs` now
  also asserts each button's `background-image` against the live URL's filename stem, and that
  the three are distinct.
- **Slide 4's overlay was left-aligned instead of centred.** Plain `.atf__overlay` sets
  `width: 100%` and is declared later in the section file, so the single-class
  `.atf__overlay--gifts` modifier lost the cascade and its `width: fit-content` never applied —
  which matters only for slide 4, whose content is a left-aligned flex row. Both overlay
  modifiers are now doubled-class.

A third, smaller one: **`.atf__bundle*` collided with the buy box.** The buy box already had
`.atf__bundle`, and slide 4's new rules leaked `gap: 24px` into it, shortening the section by
43px and turning the whole unit into a dimension mismatch. Slide 4's classes are now
`.atf__gift*`. Worth a rule of thumb: when adding a block to this file, grep the existing class
names first.

### 21f. Two bugs found on the way through, unrelated to the gallery

- **`main.js` loaded last, so no widget was ever registered.** Every module opens with
  `if (!window.PDP) return;` and `main.js` is what defines `window.PDP`. With `main.js` last,
  `nav-drawer` and `countdown` had been silently registering nothing since they were written —
  the countdown never ticked, and the gate did not notice because the static markup already
  carried the reference digits. `main.js` now loads first (it defers `init()` to
  `DOMContentLoaded`, so modules still register in time).
- **`grid-template-columns: 1fr auto` cannot clip the gallery.** A bare `1fr` is
  `minmax(auto, 1fr)` and so cannot go below its content's min-content width. Six photos at
  `min-width: 1024px` made that ~6224px and the whole grid blew out to it. Now
  `minmax(0, 1fr)`.
- **Slide 1's product name was `visually-hidden`, not hidden.** The source's is `lg:hidden`
  (`display: none` from 1025 up) and therefore absent from the reference's `innerText`;
  `visually-hidden` keeps it in `innerText`, so the section's text differed by a leading
  "Puffy Lux".

### 21g. Asset naming: `/_next/image` proxied assets were extensionless

`capture.mjs`'s `safeName()` derived a filename from the URL path. Puffy serves some gallery
images through Next.js's image proxy, `/_next/image?url=<encoded real url>`, whose path
basename is the constant string `"image"` — so every proxied asset landed as
`image-<queryhash>` with **no extension at all**, and an extensionless AVIF is not reliably
sniffed as an image over `file://`. `safeName()` now takes the stem from the proxied URL and
falls back to the response content-type for an extension. Nine already-captured files were
renamed and every manifest that referenced them was updated in the same pass; each file's
`sha256` was re-verified against the renamed file before any manifest was rewritten, and all
six manifests verify.

### 21h. Results

Two caveats on the new evidence, so nobody over-trusts it:

- **The per-slide PNGs are clipped to the viewport, not to the container.** The container is
  928px tall and starts at doc y=122, so a 900px-tall viewport can only capture 778px of it.
  `capture/reference/states/gallery/<vp>/dpr-1/slide-N.png` is therefore 990x778, covering doc
  y 122-900. Fine for comparing overlays and the rail; it does not show the bottom 150px.
- **The rest-state dump's slide 3-6 numbers are load artefacts, not layout.** Anything measured
  for those slides in `dom/<vp>/computed.json` was measured with the image undecoded — the
  `<img>` box, and on slide 4 the two bundle images (56x56, the attribute square) and therefore
  the whole bundle row's width. The per-slide PNGs are the right reference for slides 2-6.

`node capture/verify-gallery.mjs` — a **behavioural** gate, new in this pass, which drives the
rebuild through all six slides and asserts each state against the recorded live behaviour:

```
ALL CHECKS PASS — 1440x900, 1536x900, 1662x900, 1920x900, 1440x700
```

That covers, per slide and per viewport: the active slide, every slide's `translateX` (against
the live px value, so the per-width 992/1018/1144/1402 is checked, not assumed), opacity,
pointer-events, the thumbnail window's contents, **each thumbnail's picture**, which thumbnail
is selected, both arrows' disabled states, thumbnail-click targeting, and that arrow keys do
nothing. It also asserts no console or page errors while interacting.

Slides 2, 3 and 4 were additionally compared by eye against the live per-slide PNGs; after the
two fixes in §21e-bis they match on copy, icons, badge placement, struck prices, the `$315
VALUE` laurel, and the rail. The only remaining visible difference in those comparisons is the
third-party stub icon overlaying the gallery's bottom-left corner (§12).

The page also works over `file://` with the carousel live: advancing, the sliding rail and the
pill fade all verified there, with zero console errors and no failed requests.

Pixel gate, `above-the-fold` / `gallery` unit, before → after this pass:

| viewport | ATF before | ATF after | gallery before | gallery after |
|---|---|---|---|---|
| 1440×900 DPR1 | 1.923 % | **1.843 %** | 1.537 % | **1.368 %** |
| 1440×900 DPR2 | 1.694 % | **1.617 %** | 1.481 % | **1.316 %** |
| 1536×900 DPR1 | 2.717 % | **2.645 %** | 1.504 % | **1.340 %** |
| 1536×900 DPR2 | 2.420 % | **2.351 %** | 1.469 % | **1.312 %** |
| 1662×900 DPR1 | 3.036 % | **2.882 %** | 1.571 % | **1.121 %** |
| 1662×900 DPR2 | 2.724 % | **2.544 %** | 4.756 % | **4.248 %** |
| 1920×900 DPR1 | 3.513 % | **3.437 %** | 1.612 % | **1.407 %** |
| 1920×900 DPR2 | 3.272 % | **3.191 %** | 1.451 % | **1.230 %** |

Every cell improved, and the gallery now carries five more slides than it did. **`above-the-fold`
still fails the ≤0.5 % gate at every width.** The residual is not the carousel: reading the
heatmap, what is left inside the gallery box is award-badge label text metrics, the gold laurel,
the "See What's Inside" pill, and the third-party stub icons that overlay the gallery's left
edge — all of which were there at 1.5 % before this pass.

### 21i. `above-the-fold`'s text check still fails, and why

The section's text now matches the reference **through the whole gallery** — all six slides,
including the header repeated three times. Diffing word-by-word against
`dom/1440x900/geometry.json`, exactly three differences remain and none is in the gallery:

1. **The layer scene's copy is missing** ("Cover Layer 1 of 8 … Grip Base Cover", ~60 words).
   `#see-inside-layer-scene` is an empty div in this build; `layer-scene` is a separate unit and
   is still pending. Its text lives inside `#pdp-above-the-fold`, so it counts against this
   section's text check and **`above-the-fold` cannot pass the text check until the layer scene
   is built.** That is not a gallery gap.
2. **The buy box's price block** differs: the reference reads `( Total Value $2,149 ) $799
   $749with code EARLYLABOR`, the rebuild `(Total Value $2,149) $749 with code EARLYLABOR` —
   whitespace, plus a missing `$799`. Pre-existing buy-box gap.
3. **The third-party stubs sit inside `#pdp-above-the-fold`** in the rebuild, so the cookie,
   chat and merchant-badge stand-in text counts toward this section. On the live page those
   nodes are elsewhere in the DOM. Pre-existing.

### 21j. Two pre-existing inconsistencies noticed, not fixed

- `assets/third-party/images/morning-step--bg-6abfb7a6.png` fails its `sha256` in
  `manifest-1536x900.json` and `manifest-probe.json` (it matches neither). The committed file is
  unmodified, so those two manifests recorded a different byte-version. Out of scope here.
- Eleven committed `image-<hash>` files are referenced by no manifest at all — leftovers from
  captures predating the current record. Left in place rather than deleted; they are committed
  evidence and not mine to discard.
- `README.md` documents `data/product.json`, `data/content.json`, `capture/gen-html.mjs`,
  `css/components.css` and three `docs/*.md` files that **do not exist**. `index.html` is
  hand-authored today; `verify.mjs` correctly reports `SKIP  gen-html.mjs not present yet`.

---

## 22. REDESIGN D1 — gallery nav rail: left-centre column → bottom-centre row

**This is the first entry in this file that is not a fidelity note.** Everything above
records a place where the rebuild *failed* or *chose not* to reproduce the live page.
This one records a place where the rebuild **deliberately stops reproducing it**. It is a
first-fold redesign decision (D1), not a reproduction error, and it is expected to move
`above-the-fold` further from the frozen reference, not closer.

### 22a. What changed

| | before (live-site baseline) | after (D1) |
|---|---|---|
| Rail orientation | vertical column | horizontal row |
| Rail position | left edge, vertically centred on the stage | horizontally centred, anchored above the fold |
| `.atf__nav` anchor | `left: 0; top: min(55%,662px); translateY(-50%)` | `left: 50%; bottom: 150px; translateX(-50%)` |
| `.atf__nav-col`, `.atf__rail` | `flex-direction: column` | `flex-direction: row` |
| Arrow extra spacing | `--up { margin-bottom }` / `--down { margin-top }` | `--up { margin-right }` / `--down { margin-left }` |
| Chevron direction | up (`rotate(-90deg)`) / down (`rotate(90deg)`) | left (`rotate(180deg)`) / right (`rotate(0deg)`) |
| Short-viewport override | `@media (min-width:1440px) and (max-height:716px)` retuned `top`/`translateY` | removed — see 22c |

All of it is in `css/sections/above-the-fold.css`. **`index.html` and
`js/modules/gallery.js` are untouched**, and that is the point: the change is purely
geometric.

### 22b. Why the `--up` / `--down` class names stay

They are no longer visually accurate — `--up` now points left. They are kept anyway
because `js/modules/gallery.js` resolves direction from them:

```js
goTo(active + (arrow.classList.contains('atf__rail-arrow--up') ? -1 : 1));
```

Renaming to `--prev`/`--next` would force an edit to a JS file this change has no other
reason to touch, for zero user-visible benefit. The class name is an internal
implementation detail; the `aria-label`s ("Previous slide" / "Next slide") were already
function-based rather than direction-based, so no user-facing copy changed either.

### 22c. Why `bottom: 150px` and not `bottom: 0`

`.atf__nav` is absolutely positioned inside `.atf__stage`, whose height comes from
`.atf__carousel`:

```css
height: calc(100dvh - var(--header-height) + 150px);
```

The stage starts at the header's bottom edge, so its bottom edge is **always exactly
150px below the fold** — the `100dvh` and `--header-height` terms cancel. Measured:
stage bottom 1050 against a 900px fold, and 850 against a 700px fold. A literal
`bottom: 0` would therefore have parked the row off-screen at every viewport, which is a
poor outcome for a change whose entire justification is the first fold.

`bottom: 150px` pins the nav box's bottom edge to the fold; the retained
`padding-bottom: var(--space-6)` then lifts the visible row 24px clear of it. Because the
offset is height-invariant, the `max-height: 716px` override — which existed only to
re-centre a percentage-positioned column on a short viewport — became a no-op and was
deleted rather than left as dead code.

Measured result, all five gated configs:

| viewport | stage centre x | rail centre x | rail box | gap above fold |
|---|---|---|---|---|
| 1440x900 | 495 | 495 | 312 x 48 | 24 |
| 1536x900 | 508 | 508 | 312 x 48 | 24 |
| 1662x900 | 571 | 571 | 364 x 56 | 24 |
| 1920x900 | 700 | 700 | 364 x 56 | 24 |
| 1440x700 | 495 | 495 | 312 x 48 | 24 |

`elementFromPoint` at the rail's left, centre and right returns the rail's own controls at
all five, so nothing overlaps it. (The "See What's Inside" pill and the award badges are
not in the DOM at this checkpoint — they were removed by the two panel-cleanup commits,
`bfd5718` and `81f54fb` — so the no-overlap check is against the layer scene and the hero
photo only, and will need re-running when that content returns.)

### 22d. Behaviour is unchanged, and this was verified rather than assumed

`node verify-gallery.mjs` — the behavioural gate — **passes in full** at all five
viewports after the change. Driven by hand in a browser as well:

- Arrows 1→6 and 6→1: windows `123 / 123 / 234 / 345 / 456 / 456`, exactly as recorded.
- Left arrow `disabled` on slide 1, right arrow `disabled` on slide 6; clicking a disabled
  arrow is inert.
- Thumbnails remain slide-indexed: from window `234`, clicking the leftmost button goes to
  slide 2 and the window recentres to `123`.
- Focus order is now left arrow → thumb → thumb → thumb → right arrow, with strictly
  ascending `x` (339 / 391 / 463 / 535 / 615 at 1440), i.e. it matches the new visual
  order without a single DOM move. On slide 1 the disabled left arrow drops out of the tab
  order, as it should.
- No console errors, no failed requests, and no scroll jump when a rail control takes
  focus 24px above the fold.

Keyboard *activation* could not be exercised through the automation pane in use — it
injects `keydown` without producing the button's default activation, and no button on the
page responds, including ones this change does not touch. `Enter`/`Space` activation of a
native `<button>` is browser default and cannot be affected by CSS.

### 22e. Effect on the pixel gate: none, because the section was already at 100 %

The honest reading, and it is not the one this entry was expected to give.

`above-the-fold` does **not** merely regress by the area of the moved rail. As of this
checkpoint it already fails with a **dimension mismatch** — `ref 1440x1836 vs 1440x1214`,
reported as `100.000 %` — at all four widths and both DPRs. That is a consequence of
commits `bfd5718` and `81f54fb`, which removed the "See What's Inside" pill, the award
badges and the layer-scene content and left the section 622px shorter than the reference.

This was checked, not assumed: stashing the CSS change and re-running
`node verify.mjs --unit=above-the-fold --dpr=1` produces **byte-identical failures** — the
same `DIM` lines, the same `100.000 %`, the same text-content failure. **The redesign
changes the gate outcome for this section by exactly nothing.**

Two things follow. First, the pixel numbers for `above-the-fold` in this file's header
table (1.923 / 1.694 at 1440, and the §21h before/after matrix) describe a state that
predates those cleanup commits and no longer reproduces; they are stale for reasons
unrelated to D1. Second, the frozen reference can no longer say anything useful about this
section — it is not "close and drifting", it is dimensionally incomparable, and now
intentionally so as well.

`header` and `sale-banner` are untouched and still pass at every width and DPR.

### 22f. Gating decision: `above-the-fold` dropped to report-only

`capture/built.json` no longer lists `above-the-fold`. This is the same mechanism that
carried the 1662 and 1920 widths while their `min-[1640px]` states were unimplemented
(`profile.mjs`, `isGated`) — the honest way to hold a unit that is measured but not
finished — applied to a section rather than a width.

The alternative was to leave it gated and permanently red. It was rejected because a gate
that can never go green stops being a signal: it reports `100.000 %` whatever anyone does
to the section, so it would have masked a genuine regression just as effectively as
removing it does. Dropping it states the situation instead of encoding it as noise.

**What this costs, stated plainly:** `node verify.mjs` now prints `pending` beside
`above-the-fold` at every viewport instead of `FAIL`, and the section drops out of the
gated results table entirely. The largest and least finished section on the page is
therefore unverified, and nothing in the gate's own output says so — only this entry does.
Section gating now covers `header` and `sale-banner`: **2 of 28 units.**

The run still ends `RESULT: FAIL`, but on two `rights` signals that have nothing to do with
any section and predate this change — `dev banner present in markup — default
internal-review mode` and `git repo has no remote (internal-only)`. Do not read that FAIL
as the pixel gate holding the line on `above-the-fold`; it is not.

Re-add `"above-the-fold"` to `built` when the section is rebuilt against a re-captured
reference that includes the D1 layout. Until then its diff is reported, never gated.
