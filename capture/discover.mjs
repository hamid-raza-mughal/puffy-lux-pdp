/**
 * discover.mjs — derive the ordered list of build units from the live DOM.
 *
 * The target's content sections are anonymous <div>s inside #product-page with no
 * id or data-testid, so selectors are positional (:nth-child) and slugs come from
 * each block's first heading. The result is written to capture/sections.json and
 * becomes part of the reference contract: capture and verify MUST use the same list.
 */

export const OVERLAY_UNITS = [
  { slug: 'email-modal',   selector: '[data-testid="email_popup_close_overlay"]', kind: 'overlay' },
  { slug: 'cookie-banner', selector: '[data-testid="cookie-consent-banner-accept-button"]', kind: 'overlay', closest: '.cookie-consent-banner' },
];

export const DISMISS = [
  { slug: 'email-modal',   selector: '[data-testid="email_popup_close_x_button"]' },
  { slug: 'cookie-banner', selector: '[data-testid="cookie-consent-banner-accept-button"]' },
];

export async function discoverSections(page) {
  return page.evaluate(() => {
    const slugify = (s) =>
      (s || '')
        .toLowerCase()
        .replace(/[’'â€™]/g, '')
        .replace(/&[a-z]+;/g, ' ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .split('-').slice(0, 5).join('-') || 'block';

    const units = [];
    const seen = new Set();
    const push = (u) => {
      let s = u.slug, n = 2;
      while (seen.has(s)) s = `${u.slug}-${n++}`;
      seen.add(s);
      units.push({ ...u, slug: s });
    };
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      const fixed = getComputedStyle(el).position === 'fixed';
      return {
        x: Math.round(r.x),
        y: Math.round(fixed ? r.y : r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };

    // Chrome-level furniture, addressed by stable id.
    // NOTE: #variant-selector (sticky add-to-cart) is deliberately NOT here. It sits
    // at translateY(100%) while scrolled to top, so a clip at scroll 0 is meaningless.
    // It is captured as an interaction state instead (see profile.STATE_UNITS).
    for (const [slug, sel] of [
      ['header', '#header'],
      ['sale-banner', '#sale-banner'],
    ]) {
      const el = document.querySelector(sel);
      if (el) push({ slug, selector: sel, kind: 'chrome', rect: rect(el) });
    }

    // Content sections: direct children of #product-page, in document order.
    const pp = document.querySelector('#product-page');
    if (pp) {
      const kids = Array.from(pp.children);
      kids.forEach((el, i) => {
        const r = rect(el);
        if (r.h < 24) return; // spacers
        const h = el.querySelector('h1,h2,h3');
        const named = el.querySelector('[id]');
        const base = el.id
          ? el.id.replace(/^pdp[-_]?/, '') || el.id
          : h
            ? slugify(h.textContent)
            : named
              ? slugify(named.id)
              : `block-${i + 1}`;
        push({
          slug: base,
          selector: `#product-page > *:nth-child(${i + 1})`,
          kind: 'content',
          rect: r,
          heading: h ? (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 110) : null,
          id: el.id || null,
        });
      });
    }

    // Key above-the-fold sub-components. They overlap #pdp-above-the-fold on purpose:
    // a section-level pass can pass overall while one component is visibly wrong.
    for (const [slug, sel, hs] of [
      ['gallery', '[data-testid="pdp_gallery_carousel"]', false],
      ['layer-scene', '#see-inside-layer-scene', true],
      ['buy-box', '#pdp-description', false],
    ]) {
      const el = document.querySelector(sel);
      if (el) push({ slug, selector: sel, kind: 'subcomponent', heightSensitive: hs, rect: rect(el) });
    }

    // Footer, split into its real sub-sections.
    const footer = document.querySelector('#footer') || document.querySelector('body > footer');
    if (footer) {
      // Sections sit at varying depth inside #footer; take only the outermost ones.
      const all = Array.from(footer.querySelectorAll('section'));
      const secs = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
      if (secs.length) {
        secs.forEach((el, i) => {
          const r = rect(el);
          if (r.h < 24) return;
          const h = el.querySelector('h1,h2,h3');
          push({
            slug: `footer-${slugify(h ? h.textContent : `part-${i + 1}`)}`,
            selector: `#footer section:nth-of-type(${i + 1})`,
            kind: 'footer', rect: r,
            heading: h ? (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 110) : null,
          });
        });
      }
      push({ slug: 'footer', selector: '#footer', kind: 'footer', rect: rect(footer) });
    }

    return units;
  });
}
