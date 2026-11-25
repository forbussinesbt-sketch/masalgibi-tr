const API = window.MASAL_API;
const $ = s => document.querySelector(s);
const el = (ad, sinif, yazi) => { const e = document.createElement(ad); if (sinif) e.className = sinif; if (yazi != null) e.textContent = yazi; return e; };
const depo = {
  al(k) { try { return localStorage.getItem(k); } catch { return null; } },
  yaz(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const ADLAR = { bekir: 'Bekir', seda: 'Seda' };
let anahtar = depo.al('anahtar'), ben = depo.al('ben');

/* Sunucu */
async function iste(yol, { m = 'GET', g, ham } = {}) {
  let r;
  try {
    r = await fetch(API + yol, {
      method: m, body: ham || (g ? JSON.stringify(g) : undefined),
      headers: { ...(anahtar ? { authorization: 'Bearer ' + anahtar } : {}), ...(g ? { 'content-type': 'application/json' } : {}) },
    });
  } catch { throw new Error('Bağlantı yok. İnternetini kontrol edip tekrar dene.'); }
  if (r.ok) return (r.headers.get('content-type') || '').startsWith('text/') ? r.text() : r.json();
  const h = await r.json().catch(() => ({}));
  if (r.status === 401) oturumKapat();
  throw Object.assign(new Error(h.hata || 'Bir şey ters gitti'), { kod: r.status });
}
function oturumKapat() {
  $('#serit').hidden = true;
  if (yerSure) yerGonder();
  yer = null;
  anahtar = ben = null; depo.yaz('anahtar', null); depo.yaz('ben', null);
  masal = null; mektuplar = []; fotoBellek.forEach(p => p.then(u => URL.revokeObjectURL(u), () => {})); fotoBellek.clear();
}
let bilSure;
function bildir(yazi, dugme, is) {
  const b = $('#bildirim'); b.textContent = yazi + ' ';
  if (dugme) { const d = el('button', 'yalin', dugme); d.type = 'button'; d.onclick = () => { b.hidden = true; is(); }; b.append(d); }
  b.hidden = false; clearTimeout(bilSure); bilSure = setTimeout(() => { b.hidden = true; }, dugme ? 9000 : 4000);
}

/* Sayaç */
let sayiEski = '';
function sayiGoster(n) {
  const yeni = Number(n).toLocaleString('tr-TR');
  if (yeni === sayiEski) return;
  const a = yeni.padStart(Math.max(yeni.length, sayiEski.length)), b = sayiEski.padStart(a.length);
  document.querySelectorAll('.sayi').forEach(k => k.replaceChildren(...[...a].map((h, i) => el('i', sayiEski && h !== b[i] ? 'don' : '', h))));
  sayiEski = yeni;
}
async function sayacCek() {
  if (document.hidden || $('#kitap').hidden) return;
  try { const r = await iste('/sayac'); sayiGoster(r.n); depo.yaz('n', r.n); } catch { if (!sayiEski && depo.al('n')) sayiGoster(depo.al('n')); }
}
setInterval(sayacCek, 20000);
document.addEventListener('visibilitychange', () => { sayacCek(); yeniCek(); });

/* Kapaktaki ayraç: okunmamış mektup sayısı */
async function yeniCek() {
  if (document.hidden || $('#on-kapak').hidden) return;
  ipucu(); let n = 0;
  if (anahtar) try { n = (await iste('/yeni')).n; } catch { return; }
  $('#serit').hidden = !n; $('#serit').textContent = n || '';
  $('#on-kapak').setAttribute('aria-label', 'Kitabı aç' + (n ? `, ${n} yeni mektup` : ''));
}
const ipucu = y => { $('#ipucu').textContent = y || (anahtar ? 'Dokun, kaldığın yerden devam et' : 'Kapağa dokun, masal başlasın'); };

/* Giriş */
let kurulum = false;
async function turet(ad, parola) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: new TextEncoder().encode('masalgibi|' + ad) }, k, 256);
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function kurulumGoster(v) {
  const f = $('#giris form'); kurulum = v;
  f.querySelectorAll('.davet').forEach(x => { x.hidden = !v; });
  f.parola.autocomplete = v ? 'new-password' : 'current-password';
  $('#parola-ad').textContent = v ? 'Yeni parola (en az 8 harf)' : 'Parola';
  $('#kur-ac').textContent = v ? 'Parolam var' : 'İlk kez geliyorum, davet kodum var';
  f.querySelector('.hata').textContent = '';
}
$('#kur-ac').onclick = () => kurulumGoster(!kurulum);
let girisBekleyen = null;
function girisIste() {
  if (anahtar) return Promise.resolve(true);
  kurulumGoster(false); $('#giris form').reset(); if (!$('#giris').open) $('#giris').showModal();
  return new Promise(c => { girisBekleyen = c; });
}
$('#giris').addEventListener('close', () => { girisBekleyen?.(!!anahtar); girisBekleyen = null; });
$('#giris form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, hata = f.querySelector('.hata'), d = f.querySelector('[type=submit]'), ad = f.ad.value, p = f.parola.value;
  hata.textContent = !ad ? 'Önce adını seç' : !p ? 'Parolanı yaz' : kurulum && p.length < 8 ? 'Parola en az 8 harf olmalı' : kurulum && p !== f.parola2.value ? 'Parolalar aynı değil' : '';
  if (hata.textContent || d.disabled) return;
  d.disabled = true; d.textContent = 'Açılıyor...';
  try {
    const r = await iste(kurulum ? '/kur' : '/giris', { m: 'POST', g: { ad, k: await turet(ad, p), davet: kurulum ? f.davet.value : undefined } });
    anahtar = r.anahtar; ben = r.ad; depo.yaz('anahtar', anahtar); depo.yaz('ben', ben);
    $('#giris').close();
  } catch (x) { hata.textContent = x.message; }
  d.disabled = false; d.textContent = 'Kitabı aç'; f.parola.value = f.parola2.value = '';
});
document.querySelectorAll('[data-kapat]').forEach(d => { d.onclick = () => d.closest('dialog').close(); });
$('#cikis').onclick = async () => { if (yerSure) yerGonder(); try { await iste('/cikis', { m: 'POST' }); } catch {} oturumKapat(); git(''); };

/* Yönlendirme */
function git(y) { if (location.hash === '#' + y || (!y && !location.hash)) yonlendir(); else location.hash = y; }
async function yonlendir() {
  const y = location.hash.slice(1);
  $('#bildirim').hidden = true;
  if ((y === 'kitap' || y === 'mektuplar' || y === 'yaz') && !anahtar) {
    kapakGoster();
    if (!await girisIste()) { history.replaceState(null, '', location.pathname); return; }
  }
  if (y === 'kitap') return kitapAc();
  if (y === 'mektuplar' || y === 'yaz') return mektupAc(y === 'yaz');
  kapakGoster();
}
function goster(id) {
  for (const x of ['kitap', 'mektuplar']) $('#' + x).hidden = x !== id;
  if (id !== 'kitap') kitapSok();
  window.scrollTo(0, 0);
}
function kapakGoster() {
  goster('kitap'); kitapSok(); boyutla();
  $('#on-kapak').hidden = $('#kapak-alt').hidden = false;
  $('#on-kapak').classList.remove('aciliyor');
  $('#kayan').hidden = $('#cubuk').hidden = true;
  sayacCek(); yeniCek();
}
addEventListener('hashchange', yonlendir);
document.querySelectorAll('[data-git]').forEach(d => { d.onclick = () => git(d.dataset.git); });
$('#masal-yaz').onclick = () => git('yaz');
$('#on-kapak').onclick = () => git('kitap');

/* Kitap */
let masal = null, cevirici = null, boy = null;
const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function boyutla() {
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  const alan = H - 76 - (W < 700 ? 14 : 44), cift = W >= 700 && W > H * 1.05;
  let w, h;
  if (cift) {
    h = Math.min(alan, 700); w = Math.min(h * (h < 420 ? 1.1 : .73), (W - 72) / 2); h = Math.min(h, w / .7);
  } else {
    w = Math.min(W - 16, 480); h = Math.min(alan, w * 1.8); w = Math.min(w, h / 1.2);
  }
  boy = { w: Math.floor(w), h: Math.floor(h), cift, W, H };
  const s = document.documentElement.style;
  s.setProperty('--w', boy.w + 'px'); s.setProperty('--h', boy.h + 'px'); s.setProperty('--kw', boy.w * (cift ? 2 : 1) + 'px');
}
const isaretle = (s, k, o) => { s.dataset.k = k; s.dataset.o = o; return s; };
function sayfaYap(icerik, sinif) {
  const s = el('div', 's ' + (sinif || '')), i = el('div', 'ic');
  i.append(...icerik); s.append(i); return s;
}
// Metni (ilk sayfada üst bölümle birlikte) kitap sayfalarına böler.
function bol(metin, ust, sinif, k, harf) {
  const cikan = [], par = metin.split(/(\s+)/);
  let i = 0;
  do {
    const p = el('p', 'metin' + (harf && !i ? ' harf' : '')), s = sayfaYap([...(ust ? [ust] : []), p], sinif), ic = s.firstChild;
    $('#olcum').append(s);
    const sigar = n => { p.textContent = par.slice(i, n).join('').trim(); return ic.scrollHeight <= ic.clientHeight + 1; };
    let a = i, b = par.length;
    if (sigar(b)) a = b;
    else while (b - a > 1) { const o = (a + b) >> 1; if (sigar(o)) a = o; else b = o; }
    if (a === i && i < par.length) { // sayfaya sığmayan tek kelime
      let k = par[i].length;
      while (k > 1 && !(p.textContent = par[i].slice(0, k), ic.scrollHeight <= ic.clientHeight + 1)) k >>= 1;
      if (k < par[i].length) par.splice(i, 1, par[i].slice(0, k), par[i].slice(k));
      a = i + 1;
    }
    sigar(a); s.remove(); cikan.push(isaretle(s, k, par.slice(0, i).join('').length));
    i = a; ust = null;
    while (i < par.length && !par[i].trim()) i++;
  } while (i < par.length);
  return cikan;
}
const gunFark = t => Math.round((new Date(t + 'T12:00:00') - new Date(bugun() + 'T12:00:00')) / 864e5);
function yildiz(m) {
  if (m.kilit) return null;
  if (m.yazan === ben) return m.yildiz ? el('span', 'yildizli', '★ ' + ADLAR[m.yazan === 'bekir' ? 'seda' : 'bekir']) : null;
  const d = el('button', 'yildiz'); d.type = 'button'; d.dataset.y = m.id; yildizYaz(d, m);
  d.onclick = async () => {
    const acik = !m.yildiz, hepsi = v => { m.yildiz = v; document.querySelectorAll(`[data-y="${m.id}"]`).forEach(x => yildizYaz(x, m)); };
    hepsi(acik);
    try { await iste(`/mektup/${m.id}/yildiz`, { m: 'PUT', g: { acik } }); } catch (x) { hepsi(!acik); bildir(x.message); }
  };
  return d;
}
function yildizYaz(d, m) {
  d.textContent = m.yildiz ? '★' : '☆';
  d.setAttribute('aria-pressed', m.yildiz); d.setAttribute('aria-label', 'Yıldız bırak'); d.title = m.yildiz ? 'Yıldızı geri al' : 'Yıldız bırak';
}
function kunye(m, yeni) {
  const u = el('div', 'kunye ' + m.yazan), z = el('time', '', tarihYaz(m.tarih)), y = yildiz(m);
  z.dateTime = m.tarih; u.append(el('span', 'kim', ADLAR[m.yazan]), z);
  if (yeni && m.yeni) u.append(el('span', 'yeni', 'Yeni'));
  if (y) u.append(y);
  if (m.baslik) u.append(el('h2', '', m.baslik));
  if (m.kilit && m.yazan === ben) u.append(el('span', 'muhurlu', 'Mühürlü, ' + tarihYaz(m.muhur) + ' günü açılır'));
  return u;
}
const muhur = m => el('span', 'muhur', ADLAR[m.yazan][0]);
function muhurSayfa(m) {
  const g = gunFark(m.muhur);
  return sayfaYap([muhur(m), el('p', 'ufak', ADLAR[m.yazan] + ', ' + tarihYaz(m.tarih)), el('h2', '', 'Mühürlü mektup'), el('p', 'metin', tarihYaz(m.muhur) + ' günü açılacak.'), el('p', 'ufak', g > 1 ? g + ' gün kaldı' : 'Yarın açılıyor')], 'ortali');
}
// Açılma günü gelmiş ama henüz okunmamış mektubun üstünde kırılacak mühür durur.
function muhurOrt(s, m) {
  const d = el('button', 'kir'); d.type = 'button';
  d.append(muhur(m), el('span', '', 'Mührü kır'));
  d.onclick = () => { d.classList.add('kirildi'); okunduYaz(m.id); setTimeout(() => d.remove(), azHareket() ? 0 : 700); };
  s.append(d);
}
async function okunduYaz(id) {
  const m = mektuplar.find(x => x.id === id);
  if (!m?.yeni) return;
  m.yeni = false;
  try { await iste(`/mektup/${id}/okundu`, { m: 'PUT', g: {} }); } catch { m.yeni = true; }
}
// Dokununca büyür; parmakla kaydırınca fotoğrafın üstünde de sayfa çevrilir.
function fotoDugme(id) {
  const d = el('button', 'foto'), i = el('img');
  let x0 = null, kaydi = false;
  d.type = 'button'; i.alt = 'Fotoğraf'; i.dataset.id = id; d.append(i);
  d.addEventListener('touchstart', e => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; kaydi = false; }, { passive: true });
  d.addEventListener('touchend', e => {
    const f = x0 === null ? 0 : e.changedTouches[0].clientX - x0;
    if (Math.abs(f) > 35) { kaydi = true; cevir(f < 0 ? 1 : -1); }
  }, { passive: true });
  d.onclick = () => { if (kaydi) kaydi = false; else fotoBuyut(id); };
  return d;
}
function album(m, l) {
  if (!m.fotolar.length) return;
  const son = l[l.length - 1], ic = son.firstChild, p = ic.lastChild;
  $('#olcum').append(son);
  const bos = 1 - (p.offsetTop + (m.metin ? p.offsetHeight : 0)) / ic.clientHeight;
  son.remove();
  const gruplar = m.fotolar.length < 5 ? [m.fotolar] : [m.fotolar.slice(0, 3), m.fotolar.slice(3)];
  gruplar.forEach((g, i) => {
    const a = el('div', 'album a' + g.length);
    a.append(...g.map(fotoDugme));
    if (!i && bos >= (g.length > 1 ? .5 : .4)) { if (!m.metin) p.remove(); ic.append(a); son.classList.add('albumlu'); }
    else l.push(isaretle(sayfaYap([a], 'albumlu'), 'l' + m.id, 1e6 + l.length));
  });
}
function mektupSayfalari(m) {
  const k = 'l' + m.id;
  if (m.kilit && m.yazan !== ben) return [isaretle(muhurSayfa(m), k, 0)];
  const l = bol(m.metin, kunye(m), 'mek', k, m.metin.length > 90 && /^\p{L}/u.test(m.metin));
  album(m, l);
  if (m.muhur && m.yeni) muhurOrt(l[0], m);
  return l;
}
const SIRA = ['Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci', 'Altıncı', 'Yedinci', 'Sekizinci', 'Dokuzuncu', 'Onuncu', 'On birinci', 'On ikinci'];
function ayCiz(oran) { // 0 yeni ay, 1 dolunay
  const N = 'http://www.w3.org/2000/svg', s = document.createElementNS(N, 'svg');
  const yol = (d, sinif) => { const p = document.createElementNS(N, 'path'); p.setAttribute('d', d); p.setAttribute('class', sinif); s.append(p); };
  s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('class', 'evre'); s.setAttribute('aria-hidden', 'true');
  yol('M24 7A17 17 0 1 1 24 41A17 17 0 1 1 24 7z', 'halka');
  yol(`M24 7A17 17 0 0 1 24 41A${(17 * Math.abs(1 - 2 * oran)).toFixed(1)} 17 0 0 ${oran > .5 ? 1 : 0} 24 7z`, 'isik');
  return s;
}
function bolumSayfa(ay, n) {
  const d = new Date(ay + '-01T12:00:00'), say = mektuplar.filter(m => m.tarih.startsWith(ay)).length;
  return isaretle(sayfaYap([ayCiz(Math.min(.92, .12 + .2 * n)), el('p', 'ufak', (SIRA[n] || n + 1 + '.') + ' bölüm'), el('h2', 'bolum', d.toLocaleDateString('tr-TR', { month: 'long' })), el('p', 'ufak', d.getFullYear() + ', ' + say + ' mektup')], 'ortali'), 'b' + ay.replace('-', ''), 0);
}
function sonSayfa() {
  const d = el('button', 'dugme', 'PDF olarak kaydet');
  d.type = 'button'; d.onclick = pdfHazirla;
  return sayfaYap([ayCiz(1), el('h2', 'bolum kucuk', 'Gökten üç elma düşmüş'), el('p', 'metin', 'Biri yazana, biri okuyana, biri de hatırlayana.'), el('p', 'ufak', sayiEski ? sayiEski + ' kez hatırlandı' : ''), d], 'ortali');
}
function kitapSok() {
  if (!cevirici) return;
  cevirici.getRender().render = () => {}; // kitaplık kendi çizim döngüsünü durdurmuyor
  cevirici.destroy(); cevirici = null; $('#kayan').replaceChildren();
}
async function kitapAc() {
  kapakGoster(); $('#on-kapak').classList.add('aciliyor'); ipucu('Kitap açılıyor...');
  try {
    const [m, l] = await Promise.all([masal || iste('/masal'), iste('/mektup')]);
    masal = m; mektupAl(l); yerAl(l.yer);
  } catch (x) {
    if (x.kod === 401) return yonlendir();
    history.replaceState(null, '', location.pathname); kapakGoster();
    return bildir(x.message);
  }
  // sayfalar ölçülmeden önce yazı tipleri hazır olmalı
  await Promise.all(['400 18px Literata', '600 26px "Cormorant Garamond"'].map(f => document.fonts.load(f, 'Aığş')).concat(document.fonts.ready)).catch(() => {});
  if (location.hash !== '#kitap') return;
  kitapKur(0);
  const dogrudan = acilacak && yerBul(acilacak), hedef = dogrudan || yerBul(yer), devam = hedef > (boy.cift ? 2 : 1);
  const yeni = mektuplar.find(m => m.yeni);
  acilacak = null;
  setTimeout(() => {
    if (!devam) return cevir(1);
    atla(hedef);
    if (dogrudan) return;
    if (yeni) bildir(ADLAR[yeni.yazan] + ' yeni bir mektup yazdı.', 'Oku', () => atla(yerBul({ k: 'l' + yeni.id, o: 0 })));
    else bildir('Kaldığın yerdesin.', 'Baştan başla', () => atla(1));
  }, azHareket() ? 0 : 150);
}

let acilacak = null, sonGun = '', bitti = false;
function mektupAl(l) { mektuplar = l.mektuplar; ben = l.ad; sonGun = l.sonGun; bitti = l.bitti; }
function kitaptaAc(id) { acilacak = { k: 'l' + id, o: 0 }; git('kitap'); }

/* Kaldığın yer: bölüm (k) ve metindeki konum (o); sayfa numarası cihaza göre değişir */
let yer = null, yerSure, sayfalar = [];
function yerAl(sunucu) {
  let cihaz = null;
  try { cihaz = JSON.parse(depo.al('yer-' + ben)); } catch {}
  yer = cihaz && (!sunucu || cihaz.t > sunucu.t) ? cihaz : sunucu;
}
function yerBul(y) {
  if (!y) return 0;
  let b = 0;
  sayfalar.forEach((s, i) => { if (s.dataset.k === y.k && (!b || +s.dataset.o <= y.o)) b = i; });
  return b;
}
function yerYaz(i) {
  if (i < 1) return;
  // son sayfalar (boş, "devamını yazın") için en son okunan bölüm saklanır ki yeni mektuplar atlanmasın
  while (i > 0 && !sayfalar[i].dataset.k) i--;
  if (i < 1) return;
  const { k, o } = sayfalar[i].dataset;
  if (yer && yer.k === k && yer.o === +o) return;
  yer = { k, o: +o, t: Date.now() };
  depo.yaz('yer-' + ben, JSON.stringify(yer));
  clearTimeout(yerSure); yerSure = setTimeout(yerGonder, 1500);
}
function yerGonder() {
  clearTimeout(yerSure); yerSure = null;
  if (yer && anahtar) fetch(API + '/yer', { method: 'PUT', keepalive: true, body: JSON.stringify(yer), headers: { authorization: 'Bearer ' + anahtar, 'content-type': 'application/json' } }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden && yerSure) yerGonder(); });
let atlanan = 0;
function atla(i) {
  if (!cevirici || cevirici.getState() !== 'read') return;
  const simdi = cevirici.getCurrentPageIndex();
  if (i === simdi || (boy.cift && simdi > 0 && i === simdi + 1)) return yerYaz(i);
  if (azHareket()) { cevirici.turnToPage(i); return cubukYaz(cevirici.getCurrentPageIndex()); }
  $('#kayan').classList.toggle('kapali', boy.cift && i === 0);
  atlanan = i; cevirici.flip(i);
}

/* İçindekiler */
$('#icindekiler-ac').onclick = () => {
  if (!cevirici) return;
  $('#bildirim').hidden = true; icindekilerYaz();
  $('#icindekiler').showModal();
  $('#icindekiler [aria-current]')?.scrollIntoView({ block: 'center' });
};
function icindekilerYaz() {
  const simdi = cevirici.getCurrentPageIndex(), k = simdi === 0 ? '' : yer && boy.cift && sayfalar[simdi + 1]?.dataset.k === yer.k ? yer.k : sayfalar[simdi].dataset.k || '';
  const git = i => () => { $('#icindekiler').close(); atla(i); };
  const satir = (yazi, alt, i, secili, yeni) => {
    const d = el('button', 'satir'), m = el('span', 'sm'), b = el('span', 'sb', yazi);
    d.type = 'button'; m.append(b); if (alt) m.append(el('span', 'sa', alt));
    d.append(m); if (yeni) d.append(el('span', 'yeni', 'Yeni')); d.append(el('span', 'sn', i || ''));
    if (secili) d.setAttribute('aria-current', 'true');
    d.onclick = git(i);
    return d;
  };
  const l = [satir('Kapak', '', 0, simdi === 0), satir('Masal', '', 1, k[0] === 'm')];
  let ay = '';
  for (const m of mektuplar) {
    if (m.tarih.slice(0, 7) !== ay) {
      ay = m.tarih.slice(0, 7);
      const kb = 'b' + ay.replace('-', ''), i = sayfalar.findIndex(s => s.dataset.k === kb);
      l.push(satir(new Date(ay + '-01T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }), '', i, k === kb));
      l[l.length - 1].classList.add('ay-satir');
    }
    const i = sayfalar.findIndex(s => s.dataset.k === 'l' + m.id), gizli = m.kilit && m.yazan !== ben;
    const kisa = m.metin.replace(/\s+/g, ' ').slice(0, 60) || (gizli ? 'Mühürlü mektup' : 'Fotoğraf');
    if (i > 0) l.push(satir(m.baslik || kisa, ADLAR[m.yazan] + ', ' + (gizli ? tarihYaz(m.muhur) + ' günü açılır' : tarihYaz(m.tarih)), i, k === 'l' + m.id, m.yeni));
  }
  $('#icindekiler-liste').replaceChildren(...l);
}
const BOYLAR = [.88, 1, 1.14, 1.3, 1.5];
let yb = BOYLAR.includes(+depo.al('yazi')) ? +depo.al('yazi') : 1;
function boyYaz() {
  document.documentElement.style.setProperty('--yb', yb);
  $('#yazi-az').disabled = yb === BOYLAR[0]; $('#yazi-cok').disabled = yb === BOYLAR[BOYLAR.length - 1];
}
function boyDegis(y) {
  yb = BOYLAR[BOYLAR.indexOf(yb) + y]; depo.yaz('yazi', yb); boyYaz();
  if (cevirici) { yenidenKur(); icindekilerYaz(); }
}
$('#yazi-az').onclick = () => boyDegis(-1);
$('#yazi-cok').onclick = () => boyDegis(1);
boyYaz();
function yenidenKur() { // okunan yer korunarak
  const c = cevirici.getCurrentPageIndex(), s = sayfalar[c].dataset, y = yerBul(yer);
  const eski = c > 0 && (y === c || (boy.cift && y === c + 1)) ? { ...yer } : s.k ? { k: s.k, o: +s.o } : null;
  kitapKur(0);
  const i = eski ? yerBul(eski) : c > 0 ? sayfalar.length - 1 : 0;
  if (i) { atlanan = i; cevirici.turnToPage(i); atlanan = 0; cubukYaz(cevirici.getCurrentPageIndex()); }
}
function kitapKur(bas) {
  kitapSok(); boyutla();
  const kayan = $('#kayan'), kapak = el('div', 's kapakS');
  kapak.append($('#on-kapak .kapak-ic').cloneNode(true));
  const ic = masal.sayfalar.flatMap((x, i) => bol(x.metin, null, 'mas', 'm' + i));
  let ay = '', bolum = 0;
  for (const m of mektuplar) {
    if (m.tarih.slice(0, 7) !== ay) ic.push(bolumSayfa(ay = m.tarih.slice(0, 7), bolum++));
    ic.push(...mektupSayfalari(m));
  }
  const d = el('button', 'dugme dolu', 'Mektup yaz');
  d.type = 'button'; d.onclick = () => git('yaz');
  if (boy.cift && ic.length % 2 === 0) ic.push(sayfaYap([], 'bos-s')); // çift sayfada iç sayfa sayısı çift olmalı
  ic.push(bitti ? sonSayfa() : sayfaYap([el('p', 'metin', 'Devamını siz yazın...'), d], 'son'));
  ic.forEach((s, i) => { s.append(el("span", "no", s.classList.contains("bos-s") ? "" : i + 1)); s.classList.add(i % 2 ? 'sag' : 'sol'); });
  const ev = el('div', 'ev');
  sayfalar = [kapak, ...ic];
  ev.append(...sayfalar); kayan.replaceChildren(ev);
  kayan.style.width = (boy.cift ? boy.w * 2 : boy.w) + 'px';
  kayan.hidden = false;
  cevirici = new St.PageFlip(ev, {
    width: boy.w, height: boy.h, size: 'fixed', showCover: true, usePortrait: !boy.cift,
    startPage: Math.min(bas, sayfalar.length - 1), flippingTime: 650, maxShadowOpacity: .22,
    mobileScrollSupport: true, swipeDistance: 25, showPageCorners: false,
  });
  cevirici.loadFromHTML(sayfalar);
  cevirici.on('flip', e => { cubukYaz(e.data); yerYaz(boy.cift && atlanan === e.data + 1 && e.data > 0 ? atlanan : e.data); atlanan = 0; });
  $('#on-kapak').hidden = $('#kapak-alt').hidden = true;
  $('#cubuk').hidden = false;
  cubukYaz(cevirici.getCurrentPageIndex());
}
function cubukYaz(i) {
  const n = cevirici.getPageCount();
  $('#kayan').classList.toggle('kapali', boy.cift && i === 0);
  $('#geri').disabled = i === 0;
  $('#ileri').disabled = i >= n - (boy.cift ? 2 : 1);
  $('#sayfa-no').textContent = i === 0 ? 'Kapak' : boy.cift ? `${i}-${i + 1} / ${n - 1}` : `${i} / ${n - 1}`;
  $('#ilerle').style.width = 100 * i / Math.max(1, n - 1 - (boy.cift ? 1 : 0)) + '%';
  for (const s of boy.cift && i ? [sayfalar[i], sayfalar[i + 1]] : [sayfalar[i]]) {
    if (s?.dataset.k?.[0] === 'l' && !s.querySelector('.kir')) okunduYaz(+s.dataset.k.slice(1));
  }
  document.querySelectorAll('#kayan .s').forEach(s => {
    const no = +(s.querySelector('.no')?.textContent || 0);
    if (Math.abs(no - i) < 6) s.querySelectorAll('img[data-id]:not([src])').forEach(g => fotoUrl(g.dataset.id).then(u => { g.src = u; }, () => {}));
  });
}
function cevir(yon) {
  if (!cevirici) return;
  if (azHareket()) {
    if (yon > 0) cevirici.turnToNextPage(); else cevirici.turnToPrevPage();
    return cubukYaz(cevirici.getCurrentPageIndex());
  }
  if (yon > 0) cevirici.flipNext(); else cevirici.flipPrev();
  const i = cevirici.getCurrentPageIndex();
  $('#kayan').classList.toggle('kapali', boy.cift && yon < 0 && i === 1);
}
$('#ileri').onclick = () => cevir(1);
$('#geri').onclick = () => cevir(-1);
addEventListener('keydown', e => {
  if (!cevirici || $('dialog[open]')) return;
  if (e.key === 'ArrowRight') cevir(1);
  if (e.key === 'ArrowLeft') cevir(-1);
});
let boySure;
addEventListener('resize', () => {
  clearTimeout(boySure);
  boySure = setTimeout(() => {
    if ($('#kitap').hidden) return;
    if (!cevirici) return boyutla();
    // telefonda adres çubuğunun oynaması kitabı yeniden kurmasın
    if (document.documentElement.clientWidth !== boy.W || Math.abs(innerHeight - boy.H) > 130) {
      yenidenKur();
    }
  }, 200);
});
async function fotoBuyut(id) {
  try { $('#buyut img').src = await fotoUrl(id); $('#buyut').showModal(); } catch (x) { bildir(x.message); }
}

/* Mektuplar */
let mektuplar = [], suz = '', yeniOnce = depo.al('sira') !== 'eski';
async function mektupAc(yazAc) {
  goster('mektuplar');
  if (!mektuplar.length) $('#liste').replaceChildren(el('p', 'bos', 'Sayfalar açılıyor...'));
  try { mektupAl(await iste('/mektup')); depo.yaz('ben', ben); } catch (x) {
    if (x.kod === 401) return yonlendir();
    if (!mektuplar.length) $('#liste').replaceChildren(el('p', 'bos', x.message));
    bildir(x.message, 'Tekrar dene', () => mektupAc(false));
  }
  listele();
  if (yazAc) { history.replaceState(null, '', '#mektuplar'); yazmaAc(); }
}
const tarihYaz = t => new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
function listele() {
  document.querySelectorAll('[data-suz]').forEach(d => d.setAttribute('aria-pressed', d.dataset.suz === suz));
  $('#sira').textContent = yeniOnce ? 'En yeni önce' : 'En eski önce';
  let l = mektuplar.filter(m => !suz || m.yazan === suz);
  if (yeniOnce) l = [...l].reverse();
  $('#liste').replaceChildren(...(l.length ? l.map(kart) : [el('p', 'bos', 'Bu sayfa henüz boş. İlk mektubu sen yaz.')]));
  kisalt();
}
function kart(m) {
  const a = el('article', 'mektup'), f = el('footer'), gizli = m.kilit && m.yazan !== ben;
  a.append(kunye(m, true));
  const dug = (ad, is) => { const d = el('button', 'yalin', ad); d.type = 'button'; d.onclick = is; f.append(d); return d; };
  if (gizli) a.append(el('p', 'metin muhurlu', 'Mühürlü mektup, ' + tarihYaz(m.muhur) + ' günü açılacak.'));
  if (m.metin) a.append(el('p', 'metin kisa', m.metin));
  if (m.fotolar.length) {
    const g = el('div', 'fotolar');
    for (const id of m.fotolar) {
      const d = el('button'), i = el('img'); d.type = 'button'; i.alt = 'Fotoğraf'; d.append(i); g.append(d);
      izle(i, id); d.onclick = () => fotoBuyut(id);
    }
    a.append(g);
  }
  if (!gizli) dug('Kitapta oku', () => kitaptaAc(m.id));
  if (m.yazan === ben) { dug('Düzenle', () => yazmaAc(m)); dug('Sil', () => sil(m)); }
  a.append(f); a.dataset.id = m.id;
  return a;
}
// Uzun metin üç satıra iner; kısa olan görününce okunmuş sayılır.
function kisalt() {
  for (const a of $('#liste').querySelectorAll('.mektup')) {
    const p = a.querySelector('.kisa'), id = +a.dataset.id, m = mektuplar.find(x => x.id === id);
    if (p && p.scrollHeight > p.clientHeight + 2) {
      const d = el('button', 'yalin', 'Devamını oku'); d.type = 'button';
      d.onclick = () => { d.textContent = p.classList.toggle('kisa') ? 'Devamını oku' : 'Kısalt'; okunduYaz(id); };
      a.querySelector('footer').prepend(d);
    } else if (m.yeni && !m.muhur) okunduGozcu.observe(a);
  }
}
const okunduGozcu = new IntersectionObserver(l => l.forEach(x => { if (x.isIntersecting) { okunduGozcu.unobserve(x.target); okunduYaz(+x.target.dataset.id); } }), { threshold: .9 });
async function sil(m) {
  if (!confirm('Bu mektup silinsin mi?')) return;
  try {
    await iste('/mektup/' + m.id, { m: 'DELETE' }); await mektupAc(false);
    bildir('Mektup silindi.', 'Geri al', async () => { try { await iste(`/mektup/${m.id}/geri`, { m: 'POST' }); mektupAc(false); } catch (x) { bildir(x.message); } });
  } catch (x) { bildir(x.message); }
}
document.querySelectorAll('[data-suz]').forEach(d => { d.onclick = () => { suz = d.dataset.suz; listele(); }; });
$('#sira').onclick = () => { yeniOnce = !yeniOnce; depo.yaz('sira', yeniOnce ? 'yeni' : 'eski'); listele(); };
$('#yaz').onclick = () => yazmaAc();

/* Fotoğraf */
const fotoBellek = new Map();
function fotoUrl(id) {
  if (!fotoBellek.has(id)) {
    const p = iste('/foto/' + id).then(b => URL.createObjectURL(new Blob([Uint8Array.from(atob(b), x => x.charCodeAt(0))], { type: 'image/jpeg' })));
    p.catch(() => fotoBellek.delete(id)); fotoBellek.set(id, p);
  }
  return fotoBellek.get(id);
}
const gozcu = new IntersectionObserver(l => l.forEach(x => { if (x.isIntersecting) { gozcu.unobserve(x.target); fotoUrl(x.target.dataset.id).then(u => { x.target.src = u; }, () => {}); } }), { rootMargin: '400px' });
function izle(i, id) { i.dataset.id = id; gozcu.observe(i); }
async function kucult(dosya) { // yeniden kodlama konum bilgisini (EXIF) de siler
  let b;
  try { b = await createImageBitmap(dosya, { imageOrientation: 'from-image' }); } catch { throw new Error(dosya.name + ' açılamadı. JPEG veya PNG dene.'); }
  for (const [boy, q] of [[1600, .82], [1600, .7], [1280, .65], [960, .6]]) {
    const o = Math.min(1, boy / Math.max(b.width, b.height)), c = el('canvas');
    c.width = Math.round(b.width * o); c.height = Math.round(b.height * o);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0, c.width, c.height);
    const j = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (j && j.size < 8e5) return j;
  }
  throw new Error(dosya.name + ' çok büyük');
}

const base64 = b => new Promise((c, h) => { const o = new FileReader(); o.onload = () => c(o.result.split(',')[1]); o.onerror = () => h(new Error('Fotoğraf okunamadı')); o.readAsDataURL(b); });

/* Yazma */
let duzen = null, secili = [], istekNo = '', yukleniyor = 0, kayitta = false;
const yf = $('#yazma form'), taslakAd = () => 'taslak-' + ben;
const bugun = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function yazmaAc(m) {
  duzen = m || null; yf.reset(); yf.querySelector('.hata').textContent = ''; $('#taslak').textContent = '';
  let t = null; if (!m) try { t = JSON.parse(depo.al(taslakAd())); } catch {}
  const k = m || t || {};
  yf.tarih.value = k.tarih || bugun(); yf.baslik.value = k.baslik || ''; yf.metin.value = k.metin || ''; secili = [...(k.fotolar || [])];
  yf.muhur.min = gunEkle(1); yf.muhur.max = sonGun; yf.muhur.value = k.muhur && (m || k.muhur > bugun()) ? k.muhur : '';
  $('#muhur-cip').hidden = bitti || !sonGun || sonGun <= bugun() || (!!m?.muhur && !m.kilit);
  $('#fikir').hidden = true; cipYaz();
  istekNo = t?.istek || crypto.randomUUID();
  if (t) $('#taslak').textContent = 'Kaldığın taslak açıldı.';
  $('#yazma-b').textContent = m ? 'Mektubu düzenle' : 'Yeni mektup'; seciliGoster();
  if (!$('#yazma').open) $('#yazma').showModal();
  yf.metin.focus(); klavye();
}
const gunEkle = n => { const d = new Date(bugun() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const gunAy = t => new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
function cipYaz() {
  const t = yf.tarih.value, m = yf.muhur.value, o = ADLAR[ben === 'bekir' ? 'seda' : 'bekir'];
  $('#tarih-ad').textContent = !t ? 'Tarih' : t === bugun() ? 'Bugün' : gunAy(t) + (t.slice(0, 4) === bugun().slice(0, 4) ? '' : ' ' + t.slice(0, 4));
  $('#muhur-ad').textContent = m ? 'Mühür: ' + gunAy(m) : 'Mühürle';
  $('#muhur-not').replaceChildren();
  if (m && !$('#muhur-cip').hidden) {
    const d = el('button', 'yalin', 'Mührü kaldır'); d.type = 'button'; d.onclick = () => { yf.muhur.value = ''; cipYaz(); taslakYaz(); };
    $('#muhur-not').append(o + ', bu mektubu ' + tarihYaz(m) + ' gününe kadar okuyamaz. ', d);
  }
}
yf.tarih.addEventListener('input', cipYaz); yf.muhur.addEventListener('input', cipYaz);
// Masaüstünde tarih kutusunun her yerine tıklanınca takvim açılsın
for (const x of [yf.tarih, yf.muhur]) x.addEventListener('click', () => { try { x.showPicker(); } catch {} });
yf.baslik.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); yf.metin.focus(); } });
// Telefon klavyesi açılınca araçlar klavyenin üstünde kalsın
function klavye() {
  const v = window.visualViewport, y = $('#yazma'); if (!v || !y.open) return;
  const dar = innerWidth < 760;
  y.style.height = dar ? v.height + 'px' : ''; y.style.top = dar ? v.offsetTop + 'px' : '';
}
window.visualViewport?.addEventListener('resize', klavye);
window.visualViewport?.addEventListener('scroll', klavye);
const FIKIRLER = ['Bugün seni en çok ne güldürdü?', 'İlk tanıştığımız günden aklında ne kaldı?', 'Birlikte en çok güldüğümüz an hangisiydi?', 'Bana hiç anlatmadığın küçük bir şey ne?', 'Hangi şarkı bana beni hatırlatıyor?', 'Birlikte yediğimiz en güzel şey neydi?', 'Bu hafta neye şükrettin?', 'Çocukken en sevdiğin masal hangisiydi?', 'Bir gün birlikte nereye gidelim?', 'Yağmurlu bir günden ne hatırlıyorsun?', 'Bende değişmesini istemediğin şey ne?', 'En son neye çok şaşırdın?', 'Hangi fotoğrafımızın hikâyesini yazarsın?', 'Yolda gördüğün küçük bir güzelliği anlat.', 'Kaybolduğumuz bir yer var mı?', 'Bugünün rengi neydi, neden?', 'On yıl sonra bugünden ne hatırlamak istersin?', 'Bana teşekkür etmediğin bir şey var mı?', 'En cesur olduğun an hangisiydi?', 'Birlikte yarım kalan ne var?', 'Hangi kokuyla hangi anı geliyor?', 'Bugün olsa neyi aynı yapardın?', 'Bir masal kahramanı olsak kim olurduk?', 'Gökyüzüne en son ne zaman uzun uzun baktın?'];
let fikirNo = Math.floor(Math.random() * FIKIRLER.length);
$('#fikir-ver').onclick = () => { fikirNo = (fikirNo + 1) % FIKIRLER.length; $('#fikir').textContent = FIKIRLER[fikirNo]; $('#fikir').hidden = false; $('#fikir').title = 'Başlık yap'; };
$('#fikir').onclick = () => { if (!yf.baslik.value.trim()) yf.baslik.value = $('#fikir').textContent; $('#fikir').hidden = true; taslakYaz(); yf.metin.focus(); };
function taslakYaz() {
  if (duzen) return;
  const bos = !yf.metin.value.trim() && !yf.baslik.value.trim() && !secili.length;
  depo.yaz(taslakAd(), bos ? null : JSON.stringify({ tarih: yf.tarih.value, baslik: yf.baslik.value, metin: yf.metin.value, fotolar: secili, muhur: yf.muhur.value, istek: istekNo }));
  $('#taslak').textContent = bos ? '' : 'Taslak bu cihazda saklandı.';
}
yf.addEventListener('input', taslakYaz);
$('#yazma').addEventListener('cancel', e => { if (kayitta) e.preventDefault(); });
function seciliGoster() {
  $('#secilen').replaceChildren(...secili.map(id => {
    const k = el('div'), i = el('img'), d = el('button', '', '×'); d.type = 'button'; d.setAttribute('aria-label', 'Fotoğrafı çıkar'); i.alt = '';
    fotoUrl(id).then(u => { i.src = u; }, () => {});
    d.onclick = () => { secili = secili.filter(x => x !== id); seciliGoster(); taslakYaz(); };
    k.append(i, d); return k;
  }));
}
$('#foto').onchange = async e => {
  const hata = yf.querySelector('.hata'), dosyalar = [...e.target.files]; e.target.value = ''; hata.textContent = '';
  for (const d of dosyalar) {
    if (secili.length >= 6) { hata.textContent = 'Bir mektupta en fazla 6 fotoğraf olur.'; break; }
    yukleniyor++; $('#taslak').textContent = 'Fotoğraf yükleniyor...';
    try {
      const j = await kucult(d), r = await iste('/foto', { m: 'POST', ham: await base64(j) });
      fotoBellek.set(r.id, Promise.resolve(URL.createObjectURL(j))); secili.push(r.id); seciliGoster(); taslakYaz();
    } catch (x) { hata.textContent = x.message; $('#taslak').textContent = ''; }
    yukleniyor--;
  }
};
const g0 = () => { const m = yf.muhur.value; return m && m !== duzen?.muhur && !$('#muhur-cip').hidden && (m <= bugun() || m > sonGun); };
yf.addEventListener('submit', async e => {
  e.preventDefault();
  const hata = yf.querySelector('.hata'), d = yf.querySelector('[type=submit]'); if (kayitta) return;
  hata.textContent = yukleniyor ? 'Fotoğraf yükleniyor, biraz bekle.' : !yf.metin.value.trim() && !secili.length ? 'Mektup boş.' : !yf.tarih.value ? 'Tarih seç.' : g0() ? 'Mühür tarihi yarın ile ' + gunAy(sonGun) + ' arasında olmalı.' : '';
  if (hata.textContent) return;
  kayitta = true; d.disabled = true; d.textContent = 'Kaydediliyor';
  const g = { tarih: yf.tarih.value, baslik: yf.baslik.value, metin: yf.metin.value, fotolar: secili, muhur: $('#muhur-cip').hidden ? duzen?.muhur || null : yf.muhur.value || null, istek: istekNo };
  try {
    const { id } = await iste(duzen ? '/mektup/' + duzen.id : '/mektup', { m: duzen ? 'PUT' : 'POST', g });
    if (!duzen) depo.yaz(taslakAd(), null);
    $('#yazma').close(); suz = ''; await mektupAc(false); bildir('Mektup kitaba eklendi.', 'Kitapta oku', () => kitaptaAc(id));
  } catch (x) {
    hata.textContent = x.message + (duzen ? '' : ' Yazdıkların taslakta duruyor.');
    if (x.kod === 401) { $('#yazma').close(); if (await girisIste()) git('yaz'); else git(''); }
  }
  kayitta = false; d.disabled = false; d.textContent = 'Kitaba ekle';
});

/* PDF: tüm kitap yazdırma düzeninde hazırlanır */
async function pdfHazirla() {
  bildir('Kitap hazırlanıyor...');
  try {
    const b = $('#baski'), kapak = el('section', 'b-kapak'), m1 = el('section', 'b-masal');
    kapak.append(el('h1', '', 'Masal Gibi'), el('p', '', `Bekir, Seda'yı ${sayiEski} kez hatırladı`));
    for (const x of masal.sayfalar) m1.append(el('p', '', x.metin));
    b.replaceChildren(kapak, m1);
    let ay = '';
    for (const m of mektuplar) {
      if (m.tarih.slice(0, 7) !== ay) { ay = m.tarih.slice(0, 7); b.append(el('h2', 'b-ay', new Date(ay + '-01T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }))); }
      const a = el('article'), k = el('p', 'b-kunye', ADLAR[m.yazan] + ', ' + tarihYaz(m.tarih));
      a.append(k); if (m.baslik) a.append(el('h3', '', m.baslik)); if (m.metin) a.append(el('p', 'b-metin', m.metin));
      for (const f of m.fotolar) { const i = el('img'); i.src = await fotoUrl(f); await i.decode(); a.append(i); }
      b.append(a);
    }
    bildir('Kitap hazır.', 'Kaydet', () => window.print());
  } catch (x) { bildir(x.message); }
}

yonlendir();
