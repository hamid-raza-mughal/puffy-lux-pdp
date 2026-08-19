# NOTICE — third-party assets

Every binary asset in this directory was captured from a live public web page for
**internal design-reference use only**. Nothing here is licensed for
redistribution, and nothing here is the property of the party that built this
rebuild.

This file is written **before** the first asset download, and its presence is
enforced by `capture/verify.mjs`. Assets are confined to this directory; any
third-party binary found outside it fails verification.

## Provenance

Source page: `https://puffy.com/products/puffy-lux-mattress`
Captured: see `capturedAt` in `capture/network/manifest.json`
Per-file original URLs: recorded in `capture/network/manifest.json`

## Rights holders — there is more than one

### Puffy (Puffy LLC)

Product photography, layer/construction art, bundle and upgrade imagery, brand
logotype, page copy, and the site's typographic and colour system as applied.
These are Puffy's property.

### Third-party award marks — NOT Puffy's property

The award badges reproduce trademarks belonging to their respective
publishers, including **Good Housekeeping**, **CNN** and **Healthline**. These
marks are the property of those organisations, not Puffy's, and not ours. They
are reproduced here only because they appear on the captured page.

One badge on the live page is an unattributed gold laurel reading only
"AWARD WINNER", with no publisher named. It is reproduced as found.

### Typefaces

`Mukta` and `PT Serif` are used. Both are released under the **SIL Open Font
License 1.1** and are self-hosted by the source site. Their OFL terms apply;
copies of the licence accompany the font files.

## Deliberately excluded assets

Two fonts present on the live page are **not** captured, because their licensing
does not permit it:

| Asset | Reason | Replacement |
|---|---|---|
| Google Symbols webfont | Served under Google's `googlerestricted` licence; injected by the Google Merchant Center widget, which is stubbed | Inert SVG icon stand-in |
| Affirm icon font (base64) | Affirm's proprietary brand mark | Inert text/SVG stand-in |

## Restrictions

- Internal design-reference and prototyping use only.
- No redistribution, publication, or external hosting.
- No use suggesting affiliation with, or endorsement by, Puffy or any award publisher.
- The rebuilt page carries a visible dev banner by default declaring it is not
  affiliated with Puffy, and sets no canonical URL or favicon pointing at puffy.com.

Removing or relocating this file, or moving assets out of this directory, is a
verification failure — not a documentation lapse.
