/**
 * MAIN.JS — Giriş ekranı (TV preloader + BIOS) ve ana sayfa motoru
 *
 * Ana sayfa parçaları:
 *   • Topografik eş yükselti arka planı (marching squares, 9 Gauss tepesi)
 *   • İsim slot makinesi (BEKİR ↔ TAŞ)
 *   • Akışkanla maskelenen portre illüstrasyonu (destination-in)
 *   • Yan etiket durum makinesi, parallax, idle yörünge, özel imleç
 */
(function () {
  'use strict';

  var CFG    = window.SiteConfig || {};
  var BOOT   = CFG.BOOT_SCALE   || 1;
  var REVEAL = CFG.REVEAL_SCALE || 1;
  var PRM    = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── SABİTLER ─────────────────────────────────────────────── */
  var CHARS      = CFG.CHARS || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var NAMES      = CFG.NAMES || { left: 'LEFT', right: 'RIGHT' };
  var MOUSE_EASE = 0.08;
  var RING_EASE  = 0.12;
  var SLIDE_EASE = 0.045;
  var SLIDE_PX   = 250;

  /* ── DOM ──────────────────────────────────────────────────── */
  var body, preloader, tvInner;
  var bgCanvas, bgCtx, fluidCanvas;
  var nameDisplay, nameSection, portraitSection, portraitFrame;
  var illusCanvas, illusCtx, illusImg;
  var slideGroup, cursorDot, cursorRing;

  /* ── DURUM ────────────────────────────────────────────────── */
  var rawX = 0.5, rawY = 0.5;
  var mouseX = -200, mouseY = -200;
  var ringX = -200, ringY = -200;
  var prevMouseX = 0, prevMouseY = 0;
  var currentSide = null, currentName = '', isAnimatingName = false;
  var idleTimer = null, isIdle = true, idleT = 0, idleFluidTimer = 0;
  var bgTime = 0, _hGrid = null, _isMobile = window.innerWidth < 768;
  var _mobileBgDrawn = false;
  var slideOffset = 0, targetSlide = 0, slideReady = false;
  var smoothParaY = 0, smoothParaName = 0, parallaxReady = false;
  var lastTs = 0;

  var _grainRaf = null, _glitchRaf = null, _shakeTimer = null;
  var _loadTimer = null, _biosTimer = null, _skipped = false;

  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ══════════════════════════════════════════════════════════
     GİRİŞ EKRANI
     ══════════════════════════════════════════════════════════ */

  function setCRTShape() {
    var outer = document.getElementById('tvOuter');
    if (!outer) return;
    var W = outer.offsetWidth, H = outer.offsetHeight;
    if (!W || !H) { requestAnimationFrame(setCRTShape); return; }

    var M = window.innerWidth <= 768 ? 12 : 38;
    var R = Math.min(Math.max(40, W * 0.042), 70);

    outer.style.clipPath = "path('" + [
      'M ' + (M + R) + ',' + M,
      'Q ' + (W / 2) + ',0 ' + (W - M - R) + ',' + M,
      'Q ' + (W - M) + ',' + M + ' ' + (W - M) + ',' + (M + R),
      'Q ' + W + ',' + (H / 2) + ' ' + (W - M) + ',' + (H - M - R),
      'Q ' + (W - M) + ',' + (H - M) + ' ' + (W - M - R) + ',' + (H - M),
      'Q ' + (W / 2) + ',' + H + ' ' + (M + R) + ',' + (H - M),
      'Q ' + M + ',' + (H - M) + ' ' + M + ',' + (H - M - R),
      'Q 0,' + (H / 2) + ' ' + M + ',' + (M + R),
      'Q ' + M + ',' + M + ' ' + (M + R) + ',' + M,
      'Z'
    ].join(' ') + "')";
  }

  function buildChaos() {
    var wrap = document.getElementById('tvChaos');
    if (!wrap) return;
    var html = '';
    for (var i = 1; i <= 30; i++) html += '<div class="tv-cb tv-cb-' + i + '"></div>';
    for (var c = 1; c <= 3; c++)  html += '<div class="tv-cross tv-cross-' + c + '"></div>';
    wrap.innerHTML = html;
  }

  function initGrain() {
    var canvas = document.getElementById('tvGrainCanvas');
    if (!canvas) return;
    canvas.width = 1600; canvas.height = 900;
    var ctx = canvas.getContext('2d');
    var tick = 0;
    (function draw() {
      tick++;
      if (tick % 5 === 0) {
        var img = ctx.createImageData(1600, 900), d = img.data;
        for (var i = 0; i < d.length; i += 4) {
          var v = Math.random() * 255 | 0;
          d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      _grainRaf = requestAnimationFrame(draw);
    })();
  }

  function initGlitch() {
    var canvas = document.getElementById('tvGlitchCanvas');
    if (!canvas) return;
    var GW = 320, GH = 200;
    canvas.width = GW; canvas.height = GH;
    var ctx = canvas.getContext('2d');
    var snow = ctx.createImageData(GW, GH), sd = snow.data;

    var COLORS = [[191,191,191],[191,191,0],[0,191,191],[0,191,0],[191,0,191],[191,0,0],[0,0,191]];
    var N = COLORS.length;
    var offsets = new Float32Array(N), targets = new Float32Array(N);
    var STRIP_H = Math.ceil(GH * 0.62), STRIP_W = Math.ceil(GW / N);
    var BURST_AT = [400, 1100], BURST_DUR = 220;
    var start = Date.now(), active = false, endAt = 0, next = 0;

    function stopShake() {
      if (_shakeTimer) { clearInterval(_shakeTimer); _shakeTimer = null; }
      if (tvInner) tvInner.style.transform = '';
    }
    function startShake() {
      stopShake();
      var step = 0;
      _shakeTimer = setInterval(function () {
        step++;
        if (step >= 12 || !tvInner) { stopShake(); return; }
        tvInner.style.transform = 'translateX(' + ((Math.random() - 0.5) * 28) + 'px)';
      }, BURST_DUR / 12);
    }

    (function draw() {
      var now = Date.now(), elapsed = now - start;
      if (!active && next < BURST_AT.length && elapsed >= BURST_AT[next]) {
        active = true; endAt = now + BURST_DUR;
        for (var k = 0; k < N; k++) targets[k] = (Math.random() - 0.5) * 36;
        startShake(); next++;
      }
      if (active && now >= endAt) {
        active = false; stopShake();
        ctx.clearRect(0, 0, GW, GH); offsets.fill(0);
      }
      if (active) {
        for (var i = 0; i < sd.length; i += 4) {
          var v = Math.random() * 255 | 0;
          sd[i] = sd[i+1] = sd[i+2] = v;
          sd[i+3] = (Math.random() * 180 + 55) | 0;
        }
        ctx.putImageData(snow, 0, 0);
        for (var s = 0; s < N; s++) {
          offsets[s] += (targets[s] - offsets[s]) * 0.35;
          if (Math.random() < 0.18) targets[s] = (Math.random() - 0.5) * 36;
          var c = COLORS[s];
          ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.72)';
          ctx.fillRect(s * STRIP_W + offsets[s], 0, STRIP_W + 1, STRIP_H);
        }
      }
      _glitchRaf = requestAnimationFrame(draw);
    })();
  }

  function initLoadBar() {
    var fill = document.getElementById('tvProgressFill');
    if (!fill) return;
    var track = fill.parentElement, n = 0;

    function update(pct) {
      var barW = track.offsetWidth;
      if (!barW) return;
      var N = Math.max(1, Math.floor(barW / 14));
      var segW = barW / N, whiteW = segW * (10 / 14);
      var visN = pct >= 100 ? N : Math.floor(pct * N / 100);
      fill.style.width = pct >= 100 ? '100%' : (visN * segW) + 'px';
      fill.style.background =
        'repeating-linear-gradient(to right,' +
        ' rgba(255,255,255,0.95) 0px, rgba(255,255,255,0.95) ' + whiteW + 'px,' +
        ' transparent ' + whiteW + 'px, transparent ' + segW + 'px)';
    }

    update(0);
    _loadTimer = setInterval(function () {
      n += Math.random() > 0.4 ? 3 : 2;
      if (n >= 100) { n = 100; clearInterval(_loadTimer); _loadTimer = null; }
      update(n);
    }, 42 * BOOT);
  }

  function runBios(container, onComplete) {
    var DSEP = '═'.repeat(48), SSEP = '─'.repeat(40);

    function row(cls, txt) {
      var r = document.createElement('div');
      r.className = cls; r.textContent = txt;
      container.appendChild(r); return r;
    }

    row('bios-line bios-line--empty', '');
    row('bios-line bios-line--logo', CFG.BIOS_LOGO || '');
    row('bios-line bios-line--logo-tag', CFG.BIOS_TAG || '');
    row('bios-line bios-line--empty', '');
    row('bios-line bios-line--header', CFG.BIOS_HEADER || '');
    row('bios-line bios-line--sep', DSEP);

    var termBody = document.createElement('div');
    termBody.className = 'bios-terminal-body';
    container.appendChild(termBody);

    var lines = CFG.BIOS_LINES || [];
    var lastText = lines.length ? lines[lines.length - 1][2] : '';

    lines.forEach(function (ln) {
      setTimeout(function () {
        if (_skipped) return;
        var type = ln[1], text = ln[2], ok = ln[3];
        if (type === 'sep') text = (text === '═') ? DSEP : SSEP;

        var r = document.createElement('div');
        r.className = 'bios-line bios-line--' + (type === 'plain' ? 'status' : type);

        if (type === 'status') {
          var lbl = document.createElement('span');
          lbl.className = 'bl-label'; lbl.textContent = text;
          var okSpan = document.createElement('span');
          okSpan.className = 'bl-ok';
          r.appendChild(lbl); r.appendChild(okSpan);
          termBody.appendChild(r);
          termBody.scrollTop = termBody.scrollHeight;
          setTimeout(function () { okSpan.textContent = ok; }, 200 * BOOT);

        } else if (type === 'enter' && text === lastText) {
          termBody.appendChild(r);
          var i = 0;
          var cursor = document.createElement('span');
          cursor.className = 'bios-cursor';
          r.appendChild(cursor);
          (function typeNext() {
            if (_skipped) return;
            if (i < text.length) {
              r.insertBefore(document.createTextNode(text[i++]), cursor);
              setTimeout(typeNext, 48 * BOOT);
            } else {
              cursor.remove();
              r.classList.add('is-blinking');
              setTimeout(onComplete, 1600 * BOOT);
            }
          })();

        } else {
          r.textContent = text;
          termBody.appendChild(r);
          termBody.scrollTop = termBody.scrollHeight;
        }
      }, ln[0] * BOOT);
    });
  }

  function closePreloader(fadeMs) {
    if (!preloader) return;
    preloader.style.transition = 'opacity ' + fadeMs + 'ms ease';
    preloader.style.opacity = '0';
    setTimeout(function () {
      if (preloader) preloader.style.visibility = 'hidden';
    }, fadeMs + 30);
  }

  function skipPreloader() {
    if (_skipped) return;
    _skipped = true;
    document.removeEventListener('keydown', onSkipKey);
    if (preloader) preloader.removeEventListener('click', skipPreloader);
    if (_loadTimer)  { clearInterval(_loadTimer);  _loadTimer = null; }
    if (_biosTimer)  { clearTimeout(_biosTimer);   _biosTimer = null; }
    if (_grainRaf)   cancelAnimationFrame(_grainRaf);
    if (_glitchRaf)  cancelAnimationFrame(_glitchRaf);
    if (_shakeTimer) { clearInterval(_shakeTimer); _shakeTimer = null; }
    if (tvInner)     tvInner.style.transform = '';
    closePreloader(300);
    setTimeout(revealPage, 320);
  }

  function onSkipKey(e) {
    if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); skipPreloader(); }
  }

  /* ══════════════════════════════════════════════════════════
     AÇILIŞ KOREOGRAFİSİ
     ══════════════════════════════════════════════════════════ */

  function revealPage() {
    body.classList.remove('boot-pending');

    var pSec  = portraitSection;
    var nSec  = nameSection;
    var sL    = document.getElementById('sideLeft');
    var sR    = document.getElementById('sideRight');
    var S     = REVEAL;

    if (nSec) { nSec.style.opacity = '0'; }
    if (sL) { sL.style.opacity = '0'; sL.style.transform = 'translateY(-50%) translateX(-180%)'; }
    if (sR) { sR.style.opacity = '0'; sR.style.transform = 'translateY(-50%) translateX(180%)';  }

    // Sahne ÖNCE kurulur: topografi + akışkan hemen açılır, portre onun
    // üstünde yanıp sönerek belirir. (Orijinalde en sondaydı → 11 sn sürüyordu.)
    setTimeout(function () {
      [bgCanvas, fluidCanvas, illusCanvas].forEach(function (el) {
        if (!el) return;
        el.style.transition = 'opacity 1.2s ease';
        el.style.opacity = '1';
      });
    }, 200);

    // Portre: CRT tüpü ısınırken yanıp söner. Aralıklar üstel açılır.
    if (pSec) {
      pSec.style.opacity = '0';
      pSec.style.transform = 'translateX(-50%) translateY(0)';
      pSec.style.transition = 'none';
      [[50,'1'],[105,'0'],[160,'1'],[215,'0'],[270,'1'],[325,'0'],[380,'1'],[435,'0'],
       [555,'1'],[675,'0'],[855,'1'],[1035,'0'],[1285,'1'],[1535,'0'],
       [2135,'1'],[2600,'0'],[3300,'1']].forEach(function (b) {
        setTimeout(function () { pSec.style.opacity = b[1]; }, b[0] * S);
      });
      setTimeout(function () {
        pSec.style.transition = 'opacity 0.6s ease';
        pSec.style.opacity = '1';
      }, 3400 * S);
    }

    setTimeout(function () {
      if (nSec) { nSec.style.transition = 'opacity 1.3s ease'; nSec.style.opacity = '1'; }
    }, 4000 * S);

    setTimeout(function () {
      [sL, sR].forEach(function (el) {
        if (!el) return;
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          el.style.transition = 'opacity 0.9s var(--ease-out-quint), transform 0.9s var(--ease-out-quint)';
          el.style.opacity = '1';
          el.style.transform = 'translateY(-50%) translateX(0)';
        }); });
      });
    }, 4900 * S);

  }

  /* ══════════════════════════════════════════════════════════
     TOPOGRAFİK ARKA PLAN — marching squares
     ══════════════════════════════════════════════════════════ */

  /* [x, y, σx, σy, genlik] — normalize koordinatlar */
  var PEAKS = [
    [0.20, 0.40, 0.22, 0.28, 1.00],
    [0.72, 0.28, 0.26, 0.30, 1.00],
    [0.48, 0.72, 0.24, 0.20, 0.90],
    [0.05, 0.60, 0.18, 0.24, 0.80],
    [0.92, 0.55, 0.20, 0.26, 0.80],
    [0.38, 0.05, 0.22, 0.18, 0.70],
    [0.75, 0.90, 0.20, 0.22, 0.70],
    [0.15, 0.92, 0.18, 0.20, 0.60],
    [0.46, 0.34, 0.14, 0.18, 0.50]
  ];

  function resizeBgCanvas() {
    if (!bgCanvas) return;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }

  function drawBackground(dt) {
    if (!bgCtx || !bgCanvas) return;
    if (_isMobile) {
      if (_mobileBgDrawn) return;   // mobilde bir kez çiz, CPU harcama
      _mobileBgDrawn = true;
    }

    bgTime += dt;
    var W = bgCanvas.width, H = bgCanvas.height;
    bgCtx.clearRect(0, 0, W, H);

    var GW = _isMobile ? 60 : 140, GH = _isMobile ? 40 : 100;
    var GW1 = GW + 1, TOTAL = GW1 * (GH + 1);
    if (!_hGrid || _hGrid.length !== TOTAL) _hGrid = new Float32Array(TOTAL);

    var cellW = W / GW, cellH = H / GH;
    var bs = bgTime * 0.5;

    // Yükseklik alanı — tepeler hem kayar hem "nefes alır"
    for (var row = 0; row <= GH; row++) {
      var ny = row / GH, base = row * GW1;
      for (var col = 0; col <= GW; col++) {
        var nx = col / GW, h = 0;
        for (var p = 0; p < PEAKS.length; p++) {
          var pk = PEAKS[p];
          var driftX = 0.014 * Math.sin(bs * 0.08 + p * 2.1);
          var driftY = 0.010 * Math.cos(bs * 0.10 + p * 1.7);
          var amp = pk[4] * (1.0 + 0.18 * Math.sin(bs * 0.28 + p * 0.9));
          var dx = (nx - pk[0] - driftX) / pk[2];
          var dy = (ny - pk[1] - driftY) / pk[3];
          h += amp * Math.exp(-0.5 * (dx * dx + dy * dy));
        }
        _hGrid[base + col] = h;
      }
    }

    // Sabit seviyeler → çizgiler aniden belirip kaybolmaz
    var lvMin = 0.22, lvMax = 2.58, nL = 14;
    var spacing = (lvMax - lvMin) / (nL - 1);

    bgCtx.lineCap = 'round';
    bgCtx.lineJoin = 'round';

    for (var li = 0; li < nL; li++) {
      var lv = lvMin + li * spacing;
      var isIdx = (li % 4 === 0);           // her 4. çizgi kalın "index" çizgisi

      bgCtx.beginPath();
      bgCtx.lineWidth = isIdx ? 1.4 : 0.65;
      bgCtx.strokeStyle = isIdx ? 'rgba(160,115,20,0.420)' : 'rgba(180,140,50,0.170)';

      for (var r = 0; r < GH; r++) {
        var r0 = r * GW1, r1 = (r + 1) * GW1;
        var y0 = r * cellH, y1 = y0 + cellH;

        for (var c = 0; c < GW; c++) {
          var h00 = _hGrid[r0 + c],     h10 = _hGrid[r0 + c + 1];
          var h11 = _hGrid[r1 + c + 1], h01 = _hGrid[r1 + c];

          var mc = (h00 > lv ? 1 : 0) | (h10 > lv ? 2 : 0) |
                   (h11 > lv ? 4 : 0) | (h01 > lv ? 8 : 0);
          if (mc === 0 || mc === 15) continue;

          var x0 = c * cellW, x1 = x0 + cellW;
          var tT, tB, tL, tR;

          switch (mc) {
            case 1: case 14:
              tT = (lv - h00) / (h10 - h00); tL = (lv - h00) / (h01 - h00);
              bgCtx.moveTo(x0 + tT * cellW, y0); bgCtx.lineTo(x0, y0 + tL * cellH); break;
            case 2: case 13:
              tT = (lv - h00) / (h10 - h00); tR = (lv - h10) / (h11 - h10);
              bgCtx.moveTo(x0 + tT * cellW, y0); bgCtx.lineTo(x1, y0 + tR * cellH); break;
            case 3: case 12:
              tL = (lv - h00) / (h01 - h00); tR = (lv - h10) / (h11 - h10);
              bgCtx.moveTo(x0, y0 + tL * cellH); bgCtx.lineTo(x1, y0 + tR * cellH); break;
            case 4: case 11:
              tR = (lv - h10) / (h11 - h10); tB = (lv - h01) / (h11 - h01);
              bgCtx.moveTo(x1, y0 + tR * cellH); bgCtx.lineTo(x0 + tB * cellW, y1); break;
            case 5:
              tT = (lv - h00) / (h10 - h00); tL = (lv - h00) / (h01 - h00);
              tR = (lv - h10) / (h11 - h10); tB = (lv - h01) / (h11 - h01);
              bgCtx.moveTo(x0 + tT * cellW, y0); bgCtx.lineTo(x0, y0 + tL * cellH);
              bgCtx.moveTo(x1, y0 + tR * cellH); bgCtx.lineTo(x0 + tB * cellW, y1); break;
            case 6: case 9:
              tT = (lv - h00) / (h10 - h00); tB = (lv - h01) / (h11 - h01);
              bgCtx.moveTo(x0 + tT * cellW, y0); bgCtx.lineTo(x0 + tB * cellW, y1); break;
            case 7: case 8:
              tL = (lv - h00) / (h01 - h00); tB = (lv - h01) / (h11 - h01);
              bgCtx.moveTo(x0, y0 + tL * cellH); bgCtx.lineTo(x0 + tB * cellW, y1); break;
            case 10:
              tT = (lv - h00) / (h10 - h00); tR = (lv - h10) / (h11 - h10);
              tL = (lv - h00) / (h01 - h00); tB = (lv - h01) / (h11 - h01);
              bgCtx.moveTo(x0 + tT * cellW, y0); bgCtx.lineTo(x1, y0 + tR * cellH);
              bgCtx.moveTo(x0, y0 + tL * cellH); bgCtx.lineTo(x0 + tB * cellW, y1); break;
          }
        }
      }
      bgCtx.stroke();
    }
  }

  /* ══════════════════════════════════════════════════════════
     İSİM SLOT MAKİNESİ
     ══════════════════════════════════════════════════════════ */

  function makeSlot() {
    var d = document.createElement('div');
    d.className = 'name-slot';
    return d;
  }
  function makeChar(ch) {
    var s = document.createElement('span');
    s.className = 'name-char';
    s.textContent = ch;
    return s;
  }
  function makeReel(slot) {
    var old = slot.querySelector('.name-reel');
    if (old) old.remove();
    var r = document.createElement('div');
    r.className = 'name-reel';
    slot.appendChild(r);
    return r;
  }
  function measure(el) {
    Object.assign(el.style, { visibility: 'hidden', position: 'absolute' });
    nameDisplay.appendChild(el);
    var box = el.getBoundingClientRect();
    el.remove();
    return box;
  }
  function getCharHeight() { return measure(makeChar('A')).height; }
  function getCharWidth(ch) { return measure(makeChar(ch)).width; }

  function buildSlots(name, animate) {
    var existing = nameDisplay.querySelectorAll('.name-slot');
    var oldLen = existing.length;

    // Fazla slotları kapat
    if (oldLen > name.length) {
      for (var i = name.length; i < oldLen; i++) {
        (function (s) {
          s.classList.add('exiting');
          setTimeout(function () { s.remove(); }, 380);
        })(existing[i]);
      }
    }

    Array.prototype.forEach.call(name, function (targetChar, i) {
      if (!animate) {
        var slot0 = existing[i] || makeSlot();
        if (!existing[i]) nameDisplay.appendChild(slot0);
        var reel0 = makeReel(slot0);
        reel0.style.cssText = 'transform:translateY(0);transition:none';
        reel0.appendChild(makeChar(targetChar));
        return;
      }

      var spinCount = 2 + Math.floor(Math.random() * 3);   // 2–4 rastgele harf
      var delay = i * 70 + Math.random() * 35;
      var slot = existing[i];

      if (!slot) {
        slot = makeSlot();
        slot.style.cssText = 'width:0;opacity:0';
        nameDisplay.appendChild(slot);
        setTimeout(function () {
          slot.style.width = getCharWidth(targetChar) + 'px';
          slot.style.opacity = '1';
        }, delay);
      }

      var reel = makeReel(slot);
      reel.style.cssText = 'transform:translateY(0);transition:none';
      for (var s = 0; s < spinCount; s++) {
        reel.appendChild(makeChar(CHARS[Math.floor(Math.random() * CHARS.length)]));
      }
      reel.appendChild(makeChar(targetChar));

      var dur = 380 + spinCount * 130;
      setTimeout(function () {
        var h = getCharHeight();
        reel.style.transition = 'transform ' + dur + 'ms var(--ease-in-out)';
        reel.style.transform = 'translateY(-' + (spinCount * h) + 'px)';
        setTimeout(function () {
          reel.style.cssText = 'transform:translateY(0);transition:none';
          reel.innerHTML = '';
          reel.appendChild(makeChar(targetChar));
          if (i === name.length - 1) isAnimatingName = false;
        }, dur + 15);
      }, delay);
    });
  }

  function animateNameChange(newName) {
    if (isAnimatingName || currentName === newName) return;
    isAnimatingName = true;
    currentName = newName;
    buildSlots(newName, true);
  }

  /* ══════════════════════════════════════════════════════════
     ANA DÖNGÜ
     ══════════════════════════════════════════════════════════ */

  function loop(ts) {
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    /* Boşta: akışkan portrenin etrafında yörüngeye girer */
    if (isIdle && window.FluidSim && window.FluidSim.isRunning()) {
      idleT += dt;
      idleFluidTimer += dt;
      if (idleFluidTimer >= 0.038) {              // ~26 Hz
        idleFluidTimer = 0;
        var cx = window.innerWidth * 0.50;
        var cy = window.innerHeight * 0.44;
        var baseR = Math.min(window.innerWidth, window.innerHeight) * 0.15;
        [{ spd: 0.52, r: baseR * 1.00, ph: 0 },
         { spd: 0.33, r: baseR * 1.55, ph: Math.PI * 0.667 },
         { spd: 0.74, r: baseR * 0.72, ph: Math.PI * 1.333 }].forEach(function (s) {
          var ang = idleT * s.spd + s.ph;
          // Hız TEĞETSEL verilir → merkeze akmak yerine dönerek dolanır
          window.FluidSim.splat(
            cx + Math.cos(ang) * s.r,
            cy + Math.sin(ang) * s.r,
            -Math.sin(ang) * s.spd * 0.0018,
             Math.cos(ang) * s.spd * 0.0018
          );
        });
      }
    } else {
      idleFluidTimer = 0;
    }

    drawBackground(dt);

    if (slideReady && slideGroup) {
      slideOffset = lerp(slideOffset, targetSlide, SLIDE_EASE);
      slideGroup.style.transform = 'translateX(' + slideOffset.toFixed(2) + 'px)';
    }

    // İmleç halkası noktayı geriden takip eder
    if (cursorRing) {
      ringX += (mouseX - ringX) * RING_EASE;
      ringY += (mouseY - ringY) * RING_EASE;
      cursorRing.style.left = ringX.toFixed(2) + 'px';
      cursorRing.style.top  = ringY.toFixed(2) + 'px';
    }

    // Portrenin çizim versiyonunu akışkanla maskele
    if (illusCtx && illusImg && illusImg.complete && illusImg.naturalWidth > 0 &&
        fluidCanvas && portraitFrame) {
      var fr = portraitFrame.getBoundingClientRect();
      if (fr.width > 0) {
        var cw = Math.round(fr.width), ch = Math.round(fr.height);
        if (illusCanvas.width !== cw || illusCanvas.height !== ch) {
          illusCanvas.width = cw; illusCanvas.height = ch;
        }
        var imgAR = illusImg.naturalWidth / illusImg.naturalHeight;
        var canAR = cw / ch, dw, dh, dx, dy;
        if (imgAR > canAR) { dw = cw; dh = cw / imgAR; dx = 0; dy = ch - dh; }
        else               { dh = ch; dw = ch * imgAR; dx = (cw - dw) / 2; dy = 0; }

        illusCtx.clearRect(0, 0, cw, ch);
        illusCtx.drawImage(illusImg, dx, dy, dw, dh);
        // Akışkanın alfası maske olur: sıvı neredeyse çizim orada görünür
        illusCtx.globalCompositeOperation = 'destination-in';
        illusCtx.drawImage(fluidCanvas, fr.left, fr.top, fr.width, fr.height, 0, 0, cw, ch);
        illusCtx.globalCompositeOperation = 'source-over';
      }
    }

    // Dikey parallax — portre uzak (yavaş), isim yakın (hızlı)
    if (parallaxReady) {
      var target = rawY - 0.5;
      smoothParaY    = lerp(smoothParaY,    target, 0.022);
      smoothParaName = lerp(smoothParaName, target, 0.09);
      if (portraitSection) {
        portraitSection.style.transform =
          'translateX(-50%) translateY(' + (smoothParaY * -45).toFixed(1) + 'px)';
      }
      if (nameSection) {
        nameSection.style.transform =
          'translateY(' + (smoothParaName * -15).toFixed(1) + 'px)';
      }
    }

    requestAnimationFrame(loop);
  }

  /* ══════════════════════════════════════════════════════════
     ETKİLEŞİM
     ══════════════════════════════════════════════════════════ */

  function setupEvents() {
    document.addEventListener('mousemove', function (e) {
      if (window.FluidSim && window.FluidSim.isRunning()) {
        window.FluidSim.splat(
          e.clientX, e.clientY,
          (e.clientX - prevMouseX) / window.innerWidth,
          (e.clientY - prevMouseY) / window.innerHeight
        );
      }
      prevMouseX = e.clientX; prevMouseY = e.clientY;

      rawX = e.clientX / window.innerWidth;
      rawY = e.clientY / window.innerHeight;

      // Zon geçişi: <0.40 sol, >0.60 sağ, arası merkez
      var side = rawX < 0.40 ? 'left' : (rawX > 0.60 ? 'right' : 'center');
      if (side !== currentSide) {
        currentSide = side;
        body.classList.remove('cursor-left', 'cursor-right');
        if (side === 'left') {
          body.classList.add('cursor-left');
          targetSlide = SLIDE_PX;
          animateNameChange(NAMES.left);
        } else if (side === 'right') {
          body.classList.add('cursor-right');
          targetSlide = -SLIDE_PX;
          animateNameChange(NAMES.right);
        } else {
          targetSlide = 0;
        }
      }

      isIdle = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { isIdle = true; }, 2200);

      mouseX = e.clientX; mouseY = e.clientY;
      if (cursorDot) {
        cursorDot.style.left = mouseX + 'px';
        cursorDot.style.top  = mouseY + 'px';
      }
    }, { passive: true });

    document.addEventListener('mouseleave', function () { isIdle = true; });

    // Dokunmatik → akışkan
    var ptx = 0, pty = 0;
    document.addEventListener('touchstart', function (e) {
      var t = e.changedTouches[0];
      ptx = t.clientX; pty = t.clientY;
      if (window.FluidSim && window.FluidSim.isRunning())
        window.FluidSim.splat(t.clientX, t.clientY, 0.08, 0.08);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      var t = e.changedTouches[0];
      if (window.FluidSim && window.FluidSim.isRunning())
        window.FluidSim.splat(t.clientX, t.clientY,
          (t.clientX - ptx) / window.innerWidth,
          (t.clientY - pty) / window.innerHeight);
      ptx = t.clientX; pty = t.clientY;
    }, { passive: true });

    window.addEventListener('resize', function () {
      resizeBgCanvas();
      _isMobile = window.innerWidth < 768;
      _mobileBgDrawn = false;
    });
  }

  /* Yan etiket metinlerini config'ten doldur */
  function fillSideLabels() {
    [['sideLeft', CFG.SIDE_LEFT], ['sideRight', CFG.SIDE_RIGHT]].forEach(function (pair) {
      var el = document.getElementById(pair[0]), c = pair[1];
      if (!el || !c) return;
      var t = el.querySelector('[data-side-text]');
      var n = el.querySelector('[data-side-nr]');
      if (t) t.textContent = c.text;
      if (n) n.textContent = c.nr;
      if (c.href) el.setAttribute('href', c.href);
      el.setAttribute('aria-label', c.text);
    });
  }

  /* ══════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════ */

  function init() {
    body            = document.body;
    preloader       = document.getElementById('preloader');
    tvInner         = document.getElementById('tvInner');
    bgCanvas        = document.getElementById('bgCanvas');
    fluidCanvas     = document.getElementById('fluidCanvas');
    nameDisplay     = document.getElementById('nameDisplay');
    nameSection     = document.getElementById('nameSection');
    portraitSection = document.getElementById('portraitSection');
    portraitFrame   = document.getElementById('portraitFrame');
    illusCanvas     = document.getElementById('illustrationCanvas');
    slideGroup      = document.getElementById('slideGroup');
    cursorDot       = document.getElementById('cursorDot');
    cursorRing      = document.getElementById('cursorRing');

    if (bgCanvas)    bgCtx    = bgCanvas.getContext('2d');
    if (illusCanvas) illusCtx = illusCanvas.getContext('2d');

    illusImg = new Image();
    illusImg.src = CFG.ILLUSTRATION || 'assets/images/portre-cizim.webp';

    var portraitEl = document.getElementById('portraitBase');
    if (portraitEl && CFG.PORTRAIT) portraitEl.src = CFG.PORTRAIT;

    var msgEl = document.getElementById('tvMsg');
    if (msgEl && CFG.TV_MSG) msgEl.innerHTML = CFG.TV_MSG;

    fillSideLabels();
    buildChaos();
    resizeBgCanvas();
    setupEvents();

    // İsim başlangıç durumu (animasyonsuz)
    buildSlots(NAMES.left, false);
    currentName = NAMES.left;

    body.classList.add('boot-pending');
    body.classList.add('js-ready');

    // Arka plan katmanları açılış koreografisinde belirir
    [bgCanvas, fluidCanvas, illusCanvas].forEach(function (el) {
      if (el) { el.style.opacity = '0'; el.style.transition = 'none'; }
    });

    idleTimer = setTimeout(function () { isIdle = true; }, 1800);
    setTimeout(function () { slideReady = true; }, 1800);
    setTimeout(function () { parallaxReady = true; }, 2600);

    requestAnimationFrame(function (ts) { lastTs = ts; requestAnimationFrame(loop); });
    requestAnimationFrame(function () { requestAnimationFrame(setCRTShape); });
    if (window.ResizeObserver) new ResizeObserver(setCRTShape).observe(document.documentElement);

    /* Azaltılmış hareket → giriş ekranını tamamen atla */
    if (PRM) {
      if (preloader) preloader.style.display = 'none';
      body.classList.remove('boot-pending');
      [bgCanvas, fluidCanvas, illusCanvas].forEach(function (el) {
        if (el) el.style.opacity = '1';
      });
      [portraitSection, nameSection,
       document.getElementById('sideLeft'), document.getElementById('sideRight')]
        .forEach(function (el) { if (el) el.style.opacity = '1'; });
      return;
    }

    initGrain();
    initGlitch();
    initLoadBar();

    // Atlama — orijinalden farklı olarak İLK ziyaretten itibaren aktif
    document.addEventListener('keydown', onSkipKey);
    if (preloader) preloader.addEventListener('click', skipPreloader);
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var hintEl = document.getElementById('tvSkipHint');
    setTimeout(function () {
      if (_skipped || !hintEl) return;
      hintEl.classList.add('is-visible');
      if (coarse) setTimeout(function () {
        if (!_skipped) hintEl.classList.add('is-pulsing');
      }, 700);
    }, (coarse ? 800 : 1100) * BOOT);

    _biosTimer = setTimeout(function () {
      if (_skipped) return;
      if (_glitchRaf)  cancelAnimationFrame(_glitchRaf);
      if (_shakeTimer) { clearInterval(_shakeTimer); _shakeTimer = null; }
      if (tvInner) {
        tvInner.style.transform = '';
        tvInner.style.transition = 'opacity 0.28s ease';
        tvInner.style.opacity = '0';
      }
      var bios = document.getElementById('tvBios');
      if (!bios) return;
      bios.classList.add('is-visible');
      runBios(bios, function () {
        if (_skipped) return;
        closePreloader(500);
        setTimeout(revealPage, 700 * BOOT);
      });
    }, 3300 * BOOT);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
