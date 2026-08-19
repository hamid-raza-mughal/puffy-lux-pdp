/**
 * main.js — init + widget registry.
 *
 * Classic script, not an ES module: Chrome blocks module scripts and fetch()
 * from file:// (opaque origin -> CORS), and the brief requires the page to work
 * over file://. See docs/DEVIATIONS.md §6.
 *
 * Widgets self-register into window.PDP.register(name, initFn) and are matched
 * to markup by [data-widget="name"], so deleting a section's markup removes its
 * behaviour with no JS edit.
 */
(function () {
  'use strict';

  var registry = Object.create(null);

  var PDP = {
    register: function (name, init) {
      registry[name] = init;
    },

    /** Read data inlined by capture/gen-html.mjs. No fetch — file:// safe. */
    data: function (id) {
      var el = document.getElementById(id);
      if (!el) return null;
      try {
        return JSON.parse(el.textContent);
      } catch (e) {
        console.warn('[pdp] could not parse #' + id, e);
        return null;
      }
    },

    init: function () {
      // ?fidelity=1 suppresses the dev banner and any other intentional visual
      // divergence. It is the only mode verify.mjs screenshots.
      var params = new URLSearchParams(window.location.search);
      if (params.get('fidelity') === '1') {
        document.documentElement.setAttribute('data-mode', 'fidelity');
      }

      var nodes = document.querySelectorAll('[data-widget]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var names = (el.getAttribute('data-widget') || '').split(/\s+/);
        for (var j = 0; j < names.length; j++) {
          var fn = registry[names[j]];
          if (typeof fn !== 'function') continue;
          try {
            fn(el);
          } catch (e) {
            console.error('[pdp] widget "' + names[j] + '" failed', e);
          }
        }
      }
    },
  };

  window.PDP = PDP;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', PDP.init);
  } else {
    PDP.init();
  }
})();
