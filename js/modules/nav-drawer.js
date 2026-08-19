/**
 * nav-drawer — mobile navigation drawer.
 * Focus trap + Escape to close + aria-expanded, per the brief's a11y rules.
 */
(function () {
  'use strict';
  if (!window.PDP) return;

  window.PDP.register('nav-drawer', function (trigger) {
    var panelId = trigger.getAttribute('aria-controls');
    var panel = panelId && document.getElementById(panelId);
    if (!panel) return;

    var lastFocused = null;

    function focusables() {
      return panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
    }

    function open() {
      lastFocused = document.activeElement;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      panel.setAttribute('data-state', 'open');
      var f = focusables();
      if (f.length) f[0].focus();
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      panel.setAttribute('data-state', 'closed');
      document.removeEventListener('keydown', onKeydown);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    trigger.addEventListener('click', function () {
      trigger.getAttribute('aria-expanded') === 'true' ? close() : open();
    });

    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-drawer-close]')) close();
    });
  });
})();
