/**
 * gallery.js — the product gallery carousel.
 *
 * Classic script, no module syntax: see js/main.js for why.
 *
 * Every behaviour here was recorded off the live carousel by
 * capture/probe-gallery.mjs, which drives all six slides and dumps the resulting
 * state per viewport into capture/gallery-probe.json. Where this file makes a
 * choice the reference does not force, the comment says so.
 *
 * WHAT THE SOURCE ACTUALLY DOES
 * -----------------------------
 * Slide transport: the track never moves. Each slide carries its own transform.
 *   active    translateX(-(i) * (slideWidth + 16px)), opacity 1, pointer-events auto
 *   inactive  translateX(slideWidth + 2px),           opacity 0, pointer-events none
 * and the active slide additionally carries `is-snapped is-in-view` and z-index 1.
 * The `+ 2px` on the parked position is reproduced rather than rounded off: it is
 * width + 2 at all four widths (992/1018/1144/1402 against 990/1016/1142/1400).
 *
 * Thumbnail rail: three buttons for six slides, as a sliding window
 *   start = clamp(active - 1, 1, slides - 2)
 * giving 123 / 123 / 234 / 345 / 456 / 456 for slides 1..6. testids and aria
 * labels are SLIDE-indexed, so they change as the window slides.
 *
 * Arrows: the up arrow is disabled only on slide 1, the down arrow only on the
 * last slide.
 *
 * Keyboard: the source does NOT move slides with the arrow keys. The carousel
 * region has no tabindex and cannot take focus, and the probe confirmed
 * ArrowLeft/ArrowRight change nothing. Keyboard operation is therefore what the
 * buttons give: Tab to a thumbnail or an arrow and press Enter/Space. This file
 * deliberately does not add arrow-key navigation the source lacks — that would
 * be a redesign, and this artifact exists to record the "before".
 *
 * Touch: the source ships Embla with `cursor-grab` and drag-to-advance. This
 * rebuild reproduces the VISUAL behaviour (per-slide transform + opacity) and
 * pointer drag, not Embla's momentum physics. See docs/DEVIATIONS.md.
 */
(function () {
  'use strict';

  var GAP = 16;        // .atf__track gap-4
  var WINDOW = 3;      // visible thumbnails
  // The parked offset (slideWidth + 2px) is expressed in CSS on .atf__slide;
  // only the ACTIVE slide's offset needs computing, which is what this file does.
  var DRAG_THRESHOLD = 40;

  function init(root) {
    var track = root.querySelector('[data-testid="carousel-content"]');
    var slides = [].slice.call(root.querySelectorAll('.atf__slide'));
    if (!track || slides.length === 0) return;

    var stage = root.parentNode;
    var rail = stage.querySelector('.atf__rail');
    var thumbs = rail ? [].slice.call(rail.querySelectorAll('.atf__thumb')) : [];
    var upArrow = rail ? rail.querySelector('.atf__rail-arrow--up') : null;
    var downArrow = rail ? rail.querySelector('.atf__rail-arrow--down') : null;
    var dots = [].slice.call(root.querySelectorAll('.atf__dot'));
    var mobilePrev = stage.querySelector('.atf__arrow--prev');
    var mobileNext = stage.querySelector('.atf__arrow--next');

    var count = slides.length;
    var active = 0;   // 0-based

    /**
     * Thumbnail art, read out of the markup's initial three buttons plus the
     * three slides the initial window cannot reach. Kept as data rather than in
     * the markup because the rail only ever holds three buttons — exactly as the
     * source does it.
     */
    var THUMB_ART = {};
    (function readThumbArt() {
      // closest(), not parentNode.querySelector(): the attribute is ON .atf__stage,
      // and querySelector only searches DESCENDANTS — so the list was silently
      // never read and thumbs 4-6 kept whatever art the third button last had.
      var declared = root.closest('[data-thumb-art]');
      var raw = declared ? declared.getAttribute('data-thumb-art') : '';
      var parts = raw ? raw.split('|') : [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i]) THUMB_ART[i + 1] = { src: parts[i] };
      }
      // Fall back to whatever the static buttons already carry.
      for (var t = 0; t < thumbs.length; t++) {
        var n = Number(thumbs[t].getAttribute('data-slide'));
        var bg = thumbs[t].style.backgroundImage;
        if (n && !THUMB_ART[n] && bg) {
          THUMB_ART[n] = { src: bg.replace(/^url\(["']?|["']?\)$/g, '') };
        }
      }
    })();

    /**
     * Slides 5 and 6 repeat slide 1's awards header verbatim. The reference
     * ships three literal copies (~52 KB of award SVG each); this ships one and
     * clones it, which yields an identical DOM in the mode the fidelity gate
     * measures. Slide 1 — the only slide visible in the rest state — is static
     * markup, so the page still reads correctly with JS disabled.
     * Logged in docs/DEVIATIONS.md.
     */
    function cloneHeaders() {
      var sourceHeader = slides[0].querySelector('.atf__overlay');
      if (!sourceHeader) return;
      for (var i = 0; i < slides.length; i++) {
        var target = slides[i].querySelector('[data-overlay-clone]');
        if (!target || target.children.length) continue;
        var copy = sourceHeader.cloneNode(true);
        while (copy.firstChild) target.appendChild(copy.firstChild);
        target.removeAttribute('data-overlay-clone');
      }
    }

    /** The parked/active transform, expressed the way the source expresses it. */
    function applyTransport() {
      for (var i = 0; i < count; i++) {
        var slide = slides[i];
        if (i === active) {
          // -(i) * (slideWidth + gap), as a percentage of the slide's own width
          // so it stays correct at every viewport without measuring.
          slide.style.setProperty(
            '--slide-offset',
            i === 0 ? '0px' : 'calc(' + (-100 * i) + '% - ' + (GAP * i) + 'px)'
          );
          slide.classList.add('is-snapped', 'is-in-view');
        } else {
          slide.style.removeProperty('--slide-offset');
          slide.classList.remove('is-snapped', 'is-in-view');
        }
      }
    }

    /**
     * Slide-indexed sliding window of three: start = clamp(active-1, 0, count-3).
     * Recorded windows, slide 1..6: 123 123 234 345 456 456.
     */
    function windowStart() {
      return Math.max(0, Math.min(active - 1, count - WINDOW));
    }

    function applyRail() {
      var start = windowStart();
      for (var i = 0; i < thumbs.length; i++) {
        var slideIndex = start + i;            // 0-based
        var n = slideIndex + 1;                // 1-based, matches the source testid
        var thumb = thumbs[i];
        var art = THUMB_ART[n];
        if (art) thumb.style.backgroundImage = 'url(' + art.src + ')';
        thumb.setAttribute('data-slide', String(n));
        thumb.setAttribute('data-testid', 'pdp_img_carousel_puffy-lux-mattress_thumb' + n);
        thumb.setAttribute('aria-label', 'View Puffy Lux Mattress Gallery image ' + n);
        thumb.setAttribute('aria-current', slideIndex === active ? 'true' : 'false');
      }
      if (upArrow) upArrow.disabled = active === 0;
      if (downArrow) downArrow.disabled = active === count - 1;
    }

    /**
     * Publish the active slide on the media column. The "See What's Inside" pill
     * is a sibling of the gallery container, and the source fades it out on every
     * slide but the first (measured: opacity 1 / pointer-events auto on slide 1,
     * 0 / none on slide 2). The source sets that opacity from script; this
     * exposes the state so CSS can express it.
     */
    function publishActive() {
      var column = root.closest ? root.closest('.atf__media') : null;
      if (column) column.setAttribute('data-active-slide', String(active + 1));
    }

    function applyDots() {
      for (var i = 0; i < dots.length; i++) {
        dots[i].setAttribute('data-active', i === active ? 'true' : 'false');
        if (i === active) dots[i].setAttribute('aria-current', 'true');
        else dots[i].removeAttribute('aria-current');
      }
    }

    function goTo(index) {
      var next = Math.max(0, Math.min(index, count - 1));
      if (next === active) return;
      active = next;
      applyTransport();
      applyRail();
      applyDots();
      publishActive();
    }


    // --- wiring -------------------------------------------------------------

    if (rail) {
      rail.addEventListener('click', function (e) {
        var thumb = e.target.closest ? e.target.closest('.atf__thumb') : null;
        if (thumb) { goTo(Number(thumb.getAttribute('data-slide')) - 1); return; }
        var arrow = e.target.closest ? e.target.closest('.atf__rail-arrow') : null;
        if (!arrow || arrow.disabled) return;
        goTo(active + (arrow.classList.contains('atf__rail-arrow--up') ? -1 : 1));
      });
    }

    if (mobilePrev) mobilePrev.addEventListener('click', function () { goTo(active - 1); });
    if (mobileNext) mobileNext.addEventListener('click', function () { goTo(active + 1); });

    for (var d = 0; d < dots.length; d++) {
      dots[d].addEventListener('click', function (e) {
        goTo(Number(e.currentTarget.getAttribute('data-slide')) - 1);
      });
    }

    /**
     * Pointer drag. The source's Embla instance has momentum and rubber-banding;
     * this is a threshold swipe, which reproduces the outcome (one slide per
     * gesture) without claiming to reproduce the physics.
     */
    var dragStart = null;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragStart = e.clientX;
    });
    track.addEventListener('pointerup', function (e) {
      if (dragStart === null) return;
      var dx = e.clientX - dragStart;
      dragStart = null;
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      goTo(active + (dx < 0 ? 1 : -1));
    });
    track.addEventListener('pointercancel', function () { dragStart = null; });

    cloneHeaders();
    applyTransport();
    applyRail();
    applyDots();
    publishActive();
  }

  window.PDP.register('gallery', init);
})();
