/**
 * NAV.JS — Üst navigasyon barı
 * DOM'da yok; burada üretilip body'nin başına eklenir.
 */
(function () {
  'use strict';

  var CFG = window.SiteConfig || {};
  var LABELS = CFG.NAV_LABELS || { left: '', right: '' };

  function buildNav() {
    var nav = document.createElement('nav');
    nav.className = 'site-nav';
    nav.setAttribute('aria-label', 'Site navigasyonu');
    nav.innerHTML =
      '<div class="nav-left">' +
        '<span class="nav-left-text" id="navIndexLabel">' + LABELS.left + '</span>' +
      '</div>' +
      '<div class="nav-links">' +
        '<a href="#portfoy"  class="nav-link">Portföy</a>' +
        '<a href="#hakkimda" class="nav-link">Hakkımda</a>' +
        '<a href="#iletisim" class="nav-link">İletişim</a>' +
      '</div>';
    return nav;
  }

  /* Sol etiket fare ekranın sol/sağ yarısına göre değişir.
     Eşik %50 — isim slot makinesinin eşiğinden (%40/%60) kasten farklı,
     nav daha erken tepki versin diye. */
  function initIndexLabel() {
    var label = document.getElementById('navIndexLabel');
    if (!label) return;
    var current = LABELS.left;
    document.addEventListener('mousemove', function (e) {
      var next = e.clientX < window.innerWidth / 2 ? LABELS.left : LABELS.right;
      if (next !== current) { current = next; label.textContent = next; }
    }, { passive: true });
  }

  function init() {
    document.body.insertBefore(buildNav(), document.body.firstChild);
    initIndexLabel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
