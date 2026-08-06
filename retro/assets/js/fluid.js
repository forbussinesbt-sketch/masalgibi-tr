/**
 * FLUID.JS — WebGL akışkan simülasyonu (Navier-Stokes)
 * Yöntem referansı: PavelDoGreat/WebGL-Fluid-Simulation (MIT)
 *
 * FARK: burada akışkan RENK çizmez — bir ALFA MASKESİ üretir.
 * Yoğunluk smoothstep ile alfaya çevrilir; portrenin çizim versiyonu
 * bu maskeyle ortaya çıkar (main.js, destination-in).
 *
 * API: window.FluidSim.splat(x, y, dx, dy)
 */
(function () {
  'use strict';

  var CFG = {
    SIM_RESOLUTION      : 128,
    DYE_RESOLUTION      : 512,
    DENSITY_DISSIPATION : 0.988,   // mürekkep izi daha uzun kalsın
    VELOCITY_DISSIPATION: 0.995,
    PRESSURE            : 0.80,
    PRESSURE_ITERATIONS : 20,
    CURL                : 25,
    SPLAT_RADIUS        : 0.25,
    SPLAT_FORCE         : 6000
  };
  var over = window.FluidSimOverride;
  if (over) Object.keys(over).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(CFG, k)) CFG[k] = over[k];
  });

  /* Canlı ayarlanabilir görünüm parametreleri */
  window.BgConfig = window.BgConfig || {
    GRAY_R: 194, GRAY_G: 194, GRAY_B: 194,
    EDGE_LOW: 0.08, EDGE_HIGH: 0.09   // dar aralık = kenarda beyaz hale yok
  };

  var canvas, gl, ext;

  /* ── SHADER KAYNAKLARI ────────────────────────────────────── */
  var VS = [
    'precision highp float;',
    'attribute vec2 aPosition;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform vec2 texelSize;',
    'void main(){',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  vL = vUv - vec2(texelSize.x, 0.0);',
    '  vR = vUv + vec2(texelSize.x, 0.0);',
    '  vT = vUv + vec2(0.0, texelSize.y);',
    '  vB = vUv - vec2(0.0, texelSize.y);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_CLEAR = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv; uniform sampler2D uTexture; uniform float value;',
    'void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }'
  ].join('\n');

  /* Yoğunluk → alfa maskesi. Renk: doku varsa dokudan, yoksa düz gri. */
  var FS_DISPLAY = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uTexture;',
    'uniform sampler2D uBgImage;',
    'uniform float uEdgeLow, uEdgeHigh, uGrayR, uGrayG, uGrayB;',
    'uniform float uHasBgImage, uBgAspect, uCanvasAspect;',
    'void main(){',
    '  vec3 dye = texture2D(uTexture, vUv).rgb;',
    '  float density = max(dye.r, max(dye.g, dye.b));',
    '  float alpha = smoothstep(uEdgeLow, uEdgeHigh, density);',
    '  if (alpha < 0.004) { gl_FragColor = vec4(0.0); return; }',
    '  vec3 col;',
    '  if (uHasBgImage > 0.5) {',
    '    // cover-scale: doku bozulmadan tuvali kaplasın',
    '    vec2 uv = vUv;',
    '    if (uCanvasAspect > uBgAspect) {',
    '      float s = uCanvasAspect / uBgAspect;',
    '      uv.y = (uv.y - 0.5) / s + 0.5;',
    '    } else {',
    '      float s = uBgAspect / uCanvasAspect;',
    '      uv.x = (uv.x - 0.5) / s + 0.5;',
    '    }',
    '    col = texture2D(uBgImage, clamp(uv, 0.0, 1.0)).rgb;',
    '  } else {',
    '    col = vec3(uGrayR, uGrayG, uGrayB) / 255.0;',
    '  }',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  var FS_SPLAT = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uTarget;',
    'uniform float aspectRatio, radius;',
    'uniform vec3 color; uniform vec2 point;',
    'void main(){',
    '  vec2 p = vUv - point; p.x *= aspectRatio;',
    '  vec3 splat = exp(-dot(p, p) / radius) * color;',
    '  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);',
    '}'
  ].join('\n');

  var FS_ADVECTION = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uVelocity, uSource;',
    'uniform vec2 texelSize;',
    'uniform float dt, dissipation;',
    'void main(){',
    '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
    '  gl_FragColor = dissipation * texture2D(uSource, coord);',
    '  gl_FragColor.a = 1.0;',
    '}'
  ].join('\n');

  var FS_DIVERGENCE = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uVelocity, vL).x;',
    '  float R = texture2D(uVelocity, vR).x;',
    '  float T = texture2D(uVelocity, vT).y;',
    '  float B = texture2D(uVelocity, vB).y;',
    '  vec2 C = texture2D(uVelocity, vUv).xy;',
    '  if (vL.x < 0.0) L = -C.x;',
    '  if (vR.x > 1.0) R = -C.x;',
    '  if (vT.y > 1.0) T = -C.y;',
    '  if (vB.y < 0.0) B = -C.y;',
    '  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_CURL = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vL, vR, vT, vB;',
    'uniform sampler2D uVelocity;',
    'void main(){',
    '  float L = texture2D(uVelocity, vL).y;',
    '  float R = texture2D(uVelocity, vR).y;',
    '  float T = texture2D(uVelocity, vT).x;',
    '  float B = texture2D(uVelocity, vB).x;',
    '  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_VORTICITY = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uVelocity, uCurl;',
    'uniform float curl, dt;',
    'void main(){',
    '  float L = texture2D(uCurl, vL).x;',
    '  float R = texture2D(uCurl, vR).x;',
    '  float T = texture2D(uCurl, vT).x;',
    '  float B = texture2D(uCurl, vB).x;',
    '  float C = texture2D(uCurl, vUv).x;',
    '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
    '  force /= length(force) + 0.0001;',
    '  force *= curl * C;',
    '  force.y *= -1.0;',
    '  vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;',
    '  vel = min(max(vel, -1000.0), 1000.0);',
    '  gl_FragColor = vec4(vel, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_PRESSURE = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uPressure, uDivergence;',
    'void main(){',
    '  float L = texture2D(uPressure, vL).x;',
    '  float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x;',
    '  float B = texture2D(uPressure, vB).x;',
    '  float divergence = texture2D(uDivergence, vUv).x;',
    '  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_GRADIENT = [
    'precision highp float; precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uPressure, uVelocity;',
    'void main(){',
    '  float L = texture2D(uPressure, vL).x;',
    '  float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x;',
    '  float B = texture2D(uPressure, vB).x;',
    '  vec2 vel = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);',
    '  gl_FragColor = vec4(vel, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ── YARDIMCILAR ──────────────────────────────────────────── */
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error('[FluidSim] shader:', gl.getShaderInfoLog(s));
    return s;
  }

  function Program(fsSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      console.error('[FluidSim] link:', gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, uniforms: u, bind: function () { gl.useProgram(p); } };
  }

  var blit;
  function initBlit() {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, -1,1, 1,1, 1,-1]), gl.STATIC_DRAW);
    var idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2, 0,2,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    blit = function (target) {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  }

  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture: tex, fbo: fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach: function (id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        return id;
      }
    };
  }

  function createDoubleFBO(w, h, iF, f, t, p) {
    var fbo1 = createFBO(w, h, iF, f, t, p);
    var fbo2 = createFBO(w, h, iF, f, t, p);
    return {
      width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
      get read()  { return fbo1; }, set read(v)  { fbo1 = v; },
      get write() { return fbo2; }, set write(v) { fbo2 = v; },
      swap: function () { var t2 = fbo1; fbo1 = fbo2; fbo2 = t2; }
    };
  }

  function getResolution(res) {
    var ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (ar < 1) ar = 1 / ar;
    var min = Math.round(res), max = Math.round(res * ar);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  /* ── DURUM ────────────────────────────────────────────────── */
  var dye, velocity, divergenceFBO, curlFBO, pressure;
  var bgTex = null, bgAspect = 1;
  var progCopy, progDisplay, progSplat, progAdvect,
      progDivergence, progCurl, progVorticity, progPressure, progGradient;
  var lastTime = Date.now();
  var running = false;

  function setupWebGL() {
    canvas = document.getElementById('fluidCanvas');
    if (!canvas) return false;
    var opts = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: true };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) { console.warn('[FluidSim] WebGL yok — akışkan devre dışı'); return false; }

    gl.clearColor(0, 0, 0, 0);
    var hf  = gl.getExtension('OES_texture_half_float');
    var hfl = gl.getExtension('OES_texture_half_float_linear');
    ext = {
      halfFloat: hf ? hf.HALF_FLOAT_OES : gl.UNSIGNED_BYTE,
      linearFiltering: !!hfl
    };
    return true;
  }

  function initPrograms() {
    progCopy       = Program(FS_CLEAR);
    progDisplay    = Program(FS_DISPLAY);
    progSplat      = Program(FS_SPLAT);
    progAdvect     = Program(FS_ADVECTION);
    progDivergence = Program(FS_DIVERGENCE);
    progCurl       = Program(FS_CURL);
    progVorticity  = Program(FS_VORTICITY);
    progPressure   = Program(FS_PRESSURE);
    progGradient   = Program(FS_GRADIENT);
  }

  function initFramebuffers() {
    var simRes = getResolution(CFG.SIM_RESOLUTION);
    var dyeRes = getResolution(CFG.DYE_RESOLUTION);
    var t = ext.halfFloat;
    var filter = ext.linearFiltering ? gl.LINEAR : gl.NEAREST;

    dye      = createDoubleFBO(dyeRes.width, dyeRes.height, gl.RGBA, gl.RGBA, t, filter);
    velocity = createDoubleFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, t, filter);
    divergenceFBO = createFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, t, gl.NEAREST);
    curlFBO       = createFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, t, gl.NEAREST);
    pressure      = createDoubleFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, t, gl.NEAREST);
  }

  function resizeCanvas() {
    // Gizli sekmede clientWidth 0 döner → 0 boyutlu FBO WebGL hatası verir.
    var w = Math.floor(canvas.clientWidth)  || window.innerWidth  || 1;
    var h = Math.floor(canvas.clientHeight) || window.innerHeight || 1;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      return true;
    }
    return false;
  }

  /* ── SİMÜLASYON ADIMI ─────────────────────────────────────── */
  function step(dt) {
    gl.disable(gl.BLEND);

    // curl
    progCurl.bind();
    gl.uniform2f(progCurl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(progCurl.uniforms.uVelocity, velocity.read.attach(0));
    blit(curlFBO);

    // vorticity
    progVorticity.bind();
    gl.uniform2f(progVorticity.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(progVorticity.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(progVorticity.uniforms.uCurl, curlFBO.attach(1));
    gl.uniform1f(progVorticity.uniforms.curl, CFG.CURL);
    gl.uniform1f(progVorticity.uniforms.dt, dt);
    blit(velocity.write); velocity.swap();

    // divergence
    progDivergence.bind();
    gl.uniform2f(progDivergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(progDivergence.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergenceFBO);

    // pressure sönümle
    progCopy.bind();
    gl.uniform1i(progCopy.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(progCopy.uniforms.value, CFG.PRESSURE);
    blit(pressure.write); pressure.swap();

    // pressure jacobi
    progPressure.bind();
    gl.uniform2f(progPressure.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(progPressure.uniforms.uDivergence, divergenceFBO.attach(0));
    for (var i = 0; i < CFG.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(progPressure.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    // gradient subtract
    progGradient.bind();
    gl.uniform2f(progGradient.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(progGradient.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(progGradient.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();

    // advect velocity
    progAdvect.bind();
    gl.uniform2f(progAdvect.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(progAdvect.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(progAdvect.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(progAdvect.uniforms.dt, dt);
    gl.uniform1f(progAdvect.uniforms.dissipation, CFG.VELOCITY_DISSIPATION);
    blit(velocity.write); velocity.swap();

    // advect dye
    gl.uniform1i(progAdvect.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(progAdvect.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(progAdvect.uniforms.dissipation, CFG.DENSITY_DISSIPATION);
    blit(dye.write); dye.swap();
  }

  function render() {
    // ÖNCE ekran framebuffer'ına geç, SONRA temizle.
    // (step() dye FBO'sunu bağlı bırakır; burada clear çağırmak
    //  dye texture'ını siler ve yoğunluk hiç birikmez.)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    progDisplay.bind();
    gl.uniform1i(progDisplay.uniforms.uTexture, dye.read.attach(0));
    gl.uniform1f(progDisplay.uniforms.uEdgeLow,  window.BgConfig.EDGE_LOW);
    gl.uniform1f(progDisplay.uniforms.uEdgeHigh, window.BgConfig.EDGE_HIGH);
    gl.uniform1f(progDisplay.uniforms.uGrayR, window.BgConfig.GRAY_R);
    gl.uniform1f(progDisplay.uniforms.uGrayG, window.BgConfig.GRAY_G);
    gl.uniform1f(progDisplay.uniforms.uGrayB, window.BgConfig.GRAY_B);

    if (bgTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.uniform1i(progDisplay.uniforms.uBgImage, 1);
      gl.uniform1f(progDisplay.uniforms.uHasBgImage, 1.0);
      gl.uniform1f(progDisplay.uniforms.uBgAspect, bgAspect);
      gl.uniform1f(progDisplay.uniforms.uCanvasAspect, canvas.width / canvas.height);
    } else {
      gl.uniform1f(progDisplay.uniforms.uHasBgImage, 0.0);
    }

    blit(null);
  }

  function doSplat(x, y, dx, dy, color) {
    var aspect = canvas.width / canvas.height;

    progSplat.bind();
    gl.uniform1i(progSplat.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(progSplat.uniforms.aspectRatio, aspect);
    gl.uniform2f(progSplat.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3f(progSplat.uniforms.color, dx, -dy, 0.0);
    gl.uniform1f(progSplat.uniforms.radius, CFG.SPLAT_RADIUS / 100.0);
    blit(velocity.write); velocity.swap();

    gl.uniform1i(progSplat.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(progSplat.uniforms.color, color.r, color.g, color.b);
    blit(dye.write); dye.swap();
  }

  function update() {
    if (!running) return;
    var now = Date.now();
    var dt = Math.min((now - lastTime) / 1000, 0.016666);
    lastTime = now;

    if (resizeCanvas()) initFramebuffers();
    step(dt);
    render();
    requestAnimationFrame(update);
  }

  /* ── PUBLIC API ───────────────────────────────────────────── */
  var _px = new Uint8Array(4);
  window.FluidSim = {
    splat: function (x, y, dx, dy, color) {
      if (!running) return;
      var c = color || { r: 0.76, g: 0.76, b: 0.76 };
      gl.disable(gl.BLEND);
      doSplat(x, y, dx * CFG.SPLAT_FORCE, dy * CFG.SPLAT_FORCE, c);
    },
    /* Ekran koordinatındaki akışkan alfası (0–1) */
    getFluidAlpha: function (sx, sy) {
      if (!running) return 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(sx), Math.round(canvas.height - sy), 1, 1,
                    gl.RGBA, gl.UNSIGNED_BYTE, _px);
      return _px[3] / 255;
    },
    isRunning: function () { return running; },

    /* Akışkanın içini dolduran doku. null → düz gri. */
    setBgImage: function (url) {
      if (!url) { bgTex = null; return; }
      var img = new Image();
      img.onload = function () {
        if (!gl) return;
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        bgAspect = img.width / img.height;
        bgTex = tex;
      };
      img.onerror = function () {
        console.warn('[FluidSim] doku yüklenemedi, gri dolguya düşülüyor:', url);
      };
      img.src = url;
    }
  };

  /* ── BAŞLAT ───────────────────────────────────────────────── */
  function start() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!setupWebGL()) return;
    initBlit();
    initPrograms();
    resizeCanvas();
    initFramebuffers();
    running = true;
    lastTime = Date.now();

    // Dokuyu config'ten yükle
    var cfg = window.SiteConfig || {};
    if (cfg.FLUID_BG) window.FluidSim.setBgImage(cfg.FLUID_BG);

    requestAnimationFrame(update);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
