/**
 * Emlakçı Günlükleri — veri kaynağı.
 *
 * Bu dosya `public/` altında düz bir script olarak duruyor (Next.js build'ini
 * beklemeden GitHub Pages üzerinde doğrudan düzenlenebilsin diye). Sayfa bunu
 * bir <script> etiketiyle yükleyip `window.GUNLUKLER` dizisini okuyor.
 *
 * Yeni bir gün eklemek için: admin/gunluk-editor.html aracını aç, formu
 * doldur, üretilen { ... } bloğunu aşağıdaki dizinin İÇİNE (ilk eleman olarak,
 * en yeni gün en üstte durur) yapıştır ve sondaki virgülü unutma.
 *
 * Alanlar:
 *   id         — benzersiz sayı (basitlik için dayNumber ile aynı tutuluyor)
 *   dayNumber  — kaçıncı gün olduğu ("Gün:3" gibi başlıkta kullanılır)
 *   title      — günün başlığı ("Olmak" gibi)
 *   date       — YYYY-AA-GG formatında tarih
 *   content    — HTML içerik (admin panelindeki zengin metin editöründen gelir)
 */
window.GUNLUKLER = [
  {
    id: 3,
    dayNumber: 3,
    title: 'Olmak',
    date: '2026-08-01',
    content:
      '<p>[PLACEHOLDER] Bu günün kısa hikayesi buraya gelecek — sahada yaşanan gerçek bir an, bir gözlem ya da bir ders.</p>',
  },
  {
    id: 2,
    dayNumber: 2,
    title: 'Bir Gösterim',
    date: '2026-07-28',
    content:
      '<p>[PLACEHOLDER] Bu günün kısa hikayesi buraya gelecek — sahada yaşanan gerçek bir an, bir gözlem ya da bir ders.</p>',
  },
  {
    id: 1,
    dayNumber: 1,
    title: 'Bir Sahada',
    date: '2026-07-20',
    content:
      '<p>[PLACEHOLDER] Bu günün kısa hikayesi buraya gelecek — sahada yaşanan gerçek bir an, bir gözlem ya da bir ders.</p>',
  },
];
