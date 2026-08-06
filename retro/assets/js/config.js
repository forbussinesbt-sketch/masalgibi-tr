/* ================================================================
   SITE CONFIG — tüm kişiselleştirme tek yerde
   ================================================================ */
window.SiteConfig = {
  /* Ana sayfada fare SOLDAYKEN / SAĞDAYKEN görünen iki kelime.
     Slot makinesi bu havuzdan rastgele harf seçer (Türkçe dahil). */
  CHARS: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ',
  NAMES: { left: 'BEKİR', right: 'TAŞ' },

  /* Üst nav'ın sol etiketi — fare ekranın sol/sağ yarısına göre değişir */
  NAV_LABELS: { left: 'BEKİR', right: 'TAŞ' },

  /* Yan etiketler */
  SIDE_LEFT:  { text: 'PORTFÖY',  nr: '01', href: '#portfoy'  },
  SIDE_RIGHT: { text: 'İLETİŞİM', nr: '02', href: '#iletisim' },

  /* Giriş ekranı tempo ölçeği (1.0 = orijinal galekto.com temposu) */
  BOOT_SCALE:   0.60,   // BIOS satır gecikmeleri  → ~7 sn giriş
  REVEAL_SCALE: 0.55,   // ana sayfa açılış koreografisi (~2.7 sn)

  /* Görseller */
  PORTRAIT:     'assets/images/portre.webp',
  ILLUSTRATION: 'assets/images/portre-cizim.webp',
  /* Akışkanın içini dolduran mürekkep dokusu. null → düz gri dolgu. */
  FLUID_BG:     'assets/images/fluid-bg.webp',

  /* ── BIOS TERMİNALİ ─────────────────────────────────────── */
  BIOS_LOGO: 'B E K İ R   T A Ş',
  BIOS_TAG:  'GAYRİMENKUL DANIŞMANLIK SİSTEMİ  ■  v2026',
  BIOS_HEADER: 'BEKİR TAŞ PORTFÖY SİSTEMİ — AÇILIŞ v1.3',

  /* [gecikme_ms, tip, metin, durum?]
     tipler: empty | status | plain | section | sep | access | welcome | enter
     Gecikmeler BOOT_SCALE ile çarpılır. */
  BIOS_LINES: [
    [0,    'empty',   ''],
    [80,   'status',  'BÖLGE TARAMASI .........................', '[TAMAM]'],
    [240,  'status',  'TAPU KAYIT BAĞLANTISI ..................', '[KURULDU]'],
    [400,  'status',  'PORTFÖY VERİTABANI .....................', '[ÇEVRİMİÇİ]'],
    [560,  'status',  'PİYASA ANALİZ MOTORU ...................', '[SENKRON]'],
    [720,  'status',  'DEĞERLEME MODÜLÜ .......................', '[YÜKLENDİ]'],
    [880,  'status',  'İLAN GÖRSELLERİ ........................', '[HAZIR]'],
    [1040, 'status',  'MÜŞTERİ EŞLEŞTİRME .....................', '[AKTİF]'],
    [1200, 'status',  'HARİTA KATMANI .........................', '[BAĞLANDI]'],
    [1360, 'empty',   ''],
    [1440, 'section', 'SİSTEM TANILAMA'],
    [1520, 'sep',     '─'],
    [1640, 'status',  'BELLEK DURUMU ..........................', '[TEMİZ]'],
    [1790, 'status',  'HATA KAYDI .............................', '[YOK]'],
    [1940, 'plain',   'YANIT SÜRESİ ........................... 0.01ms'],
    [2090, 'plain',   'AKTİF PORTFÖY .......................... %99'],
    [2240, 'status',  'GÜVEN ENDEKSİ ..........................', '[YÜKSEK]'],
    [2400, 'empty',   ''],
    [2480, 'section', 'ALT SİSTEMLER'],
    [2560, 'sep',     '─'],
    [2680, 'status',  'FİYAT TAKİBİ ...........................', '[AKTİF]'],
    [2830, 'status',  'KREDİ HESAPLAYICI ......................', '[HAZIR]'],
    [2980, 'status',  'SÖZLEŞME ARŞİVİ ........................', '[İNDEKSLİ]'],
    [3130, 'status',  'RANDEVU TAKVİMİ ........................', '[SENKRON]'],
    [3280, 'status',  'PAZARLIK MODÜLÜ ........................', '[ETKİN]'],
    [3440, 'empty',   ''],
    [3520, 'section', 'KİMLİK DOĞRULAMA'],
    [3600, 'sep',     '─'],
    [3720, 'status',  'DANIŞMAN İMZASI ........................', '[DOĞRULANDI]'],
    [3870, 'status',  'YETKİ SEVİYESİ .........................', '[TAM ERİŞİM]'],
    [4020, 'status',  'BAĞLANTI DURUMU ........................', '[KARARLI]'],
    [4180, 'empty',   ''],
    [4260, 'sep',     '═'],
    [4380, 'empty',   ''],
    [4460, 'access',  'SİSTEM HAZIR'],
    [4620, 'empty',   ''],
    [4700, 'welcome', 'HOŞ GELDİNİZ'],
    [4860, 'empty',   ''],
    [4940, 'welcome', 'SİZİ GÖRMEK GÜZEL'],
    [5100, 'welcome', 'İYİ GÜNLER DİLERİM'],
    [5180, 'enter',   'PORTFÖYE GİRİLİYOR...'],
    [5380, 'enter',   'DOĞRU EV, DOĞRU ZAMAN'],   // ← son satır: daktilo + yanıp sönme
  ],

  /* TV panelindeki mesaj */
  TV_MSG: 'YAYIN<br>BAŞLAMAK<br>ÜZERE',
};
