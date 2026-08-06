/**
 * tv-overlay.js — Kalıcı CRT efektleri
 *   1. Grain canvas animasyonu
 *   2. Barrel clip-path: .page-tv-frame (evenodd) + .page-crt-bevel + .page-tv-stroke
 *   3. Tarayıcı çizgileri: hep tepeden, ara sıra grup patlaması
 */
(function () {
  'use strict';

  var PRM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. GRAIN ─────────────────────────────────────────────── */
  function initPageGrain() {
    var canvas = document.getElementById('pageGrainCanvas');
    if (!canvas || PRM) return;

    var W = 800, H = 600;
    canvas.width = W;
    canvas.height = H;

    var ctx  = canvas.getContext('2d');
    var img  = ctx.createImageData(W, H);
    var data = img.data;
    var tick = 0;

    (function draw() {
      tick++;
      if (tick % 2 === 0) {                 // her 2. frame — CPU tasarrufu
        for (var i = 0; i < data.length; i += 4) {
          var v = (Math.random() * 255) | 0;
          data[i] = data[i + 1] = data[i + 2] = v;
          data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      requestAnimationFrame(draw);
    })();
  }

  /* ── 2. BARREL (fıçı) CRT ŞEKLİ ───────────────────────────── */
  function computeBarrelPaths() {
    // visualViewport sekme gizliyken 0 dönebilir → en büyük geçerli ölçüyü al.
    // 0 alınırsa path bozulur (negatif koordinatlar) ve çerçeve kaybolur.
    var vv = window.visualViewport;
    var de = document.documentElement;
    var W = Math.max(vv ? Math.round(vv.width) : 0, window.innerWidth || 0, de.clientWidth || 0);
    var H = Math.max(vv ? Math.round(vv.height) : 0, window.innerHeight || 0, de.clientHeight || 0);
    if (W <= 0 || H <= 0) return null;
    var isMobile = W <= 768;

    var M_CORNER = isMobile ? 12 : 38;   // köşelerin içeri payı
    var M_MID    = isMobile ? 4  : 8;    // kenar ortasının şişme payı
    var R        = isMobile
      ? Math.min(Math.max(18, W * 0.030), 28)
      : Math.min(Math.max(40, W * 0.042), 70);

    var inner = [
      'M ' + (M_CORNER + R) + ',' + M_CORNER,
      'Q ' + (W / 2) + ',' + M_MID + ' ' + (W - M_CORNER - R) + ',' + M_CORNER,
      'Q ' + (W - M_CORNER) + ',' + M_CORNER + ' ' + (W - M_CORNER) + ',' + (M_CORNER + R),
      'Q ' + (W - M_MID) + ',' + (H / 2) + ' ' + (W - M_CORNER) + ',' + (H - M_CORNER - R),
      'Q ' + (W - M_CORNER) + ',' + (H - M_CORNER) + ' ' + (W - M_CORNER - R) + ',' + (H - M_CORNER),
      'Q ' + (W / 2) + ',' + (H - M_MID) + ' ' + (M_CORNER + R) + ',' + (H - M_CORNER),
      'Q ' + M_CORNER + ',' + (H - M_CORNER) + ' ' + M_CORNER + ',' + (H - M_CORNER - R),
      'Q ' + M_MID + ',' + (H / 2) + ' ' + M_CORNER + ',' + (M_CORNER + R),
      'Q ' + M_CORNER + ',' + M_CORNER + ' ' + (M_CORNER + R) + ',' + M_CORNER,
      'Z'
    ].join(' ');

    var outer = 'M 0,0 L ' + W + ',0 L ' + W + ',' + H + ' L 0,' + H + ' Z';
    return { inner: inner, outer: outer, W: W, H: H };
  }

  function setPageCRTShape() {
    var p = computeBarrelPaths();
    // Ölçü henüz hazır değil (gizli sekme vb.) → bir sonraki frame'de tekrar dene,
    // mevcut (inline script'in yazdığı) doğru clip'i EZME.
    if (!p) { requestAnimationFrame(setPageCRTShape); return; }

    var frame = document.querySelector('.page-tv-frame');
    if (frame) {
      frame.style.clipPath = "path(evenodd, '" + p.outer + ' ' + p.inner + "')";
      frame.style.visibility = 'visible';
    }

    var bevel = document.querySelector('.page-crt-bevel');
    if (bevel) bevel.style.clipPath = "path('" + p.inner + "')";

    var sv = document.querySelector('.page-tv-stroke');
    if (sv) {
      sv.setAttribute('viewBox', '0 0 ' + p.W + ' ' + p.H);
      sv.style.clipPath = "path('" + p.inner + "')";
      var path = sv.querySelector('path');
      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(30,28,26,0.10)');
        path.setAttribute('stroke-width', '6');
        sv.appendChild(path);
      }
      path.setAttribute('d', p.inner);
    }
  }

  /* ── 3. TARAYICI ÇİZGİLERİ ────────────────────────────────── */
  function initScanners() {
    if (PRM) return;
    var container = document.querySelector('.page-scanner-lines');
    if (!container) return;
    var spans = container.querySelectorAll('span');
    if (!spans.length) return;

    // Bir çizgiyi tepeden yeniden başlat (reflow ile animasyon reset)
    function restartFromTop(span, delayS) {
      span.style.setProperty('--del', (delayS || 0).toFixed(3) + 's');
      span.style.animationName = 'none';
      void span.offsetWidth;
      span.style.animationName = '';
    }

    // 3. çizgi ara sıra görünür/gizli → çizgi sayısı değişir
    function randomizeCount() {
      if (spans[2]) {
        spans[2].style.visibility = Math.random() > 0.45 ? 'visible' : 'hidden';
      }
      setTimeout(randomizeCount, 10000 + Math.random() * 12000);
    }

    // Grup patlaması: 2-3 çizgi 70ms arayla birlikte tepeden başlar
    function triggerGroupBurst() {
      var count = Math.random() > 0.45 ? 3 : 2;
      for (var i = 0; i < count && i < spans.length; i++) {
        (function (span, offsetS) {
          setTimeout(function () {
            span.style.visibility = 'visible';
            restartFromTop(span, offsetS);
          }, offsetS * 1000);
        })(spans[i], i * 0.07);
      }
      setTimeout(triggerGroupBurst, 14000 + Math.random() * 16000);
    }

    // Açılışta hepsi aynı anda süpürmesin
    for (var i = 0; i < spans.length; i++) restartFromTop(spans[i], i * 0.25);

    setTimeout(randomizeCount,    2000 + Math.random() * 3000);
    setTimeout(triggerGroupBurst, 7000 + Math.random() * 8000);
  }

  /* ── INIT ─────────────────────────────────────────────────── */
  function init() {
    initPageGrain();

    // clip-path'i bir frame geciktir: içerik boyanmadan pencere açılırsa
    // 1 frame'lik beyaz flash olur.
    requestAnimationFrame(function () {
      setPageCRTShape();
      initScanners();
    });

    var resizeRaf;
    function onViewportChange() {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(setPageCRTShape);
    }
    window.addEventListener('resize', onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
