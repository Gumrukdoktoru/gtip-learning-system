# Gümrük Mevzuatı Okuyucu

Konu esaslı mevzuat derlemesini madde madde okutan statik web uygulaması (React + TypeScript + Vite + Tailwind).

- Konular / Kanun / Yönetmelik dizinleri, daralan içindekiler
- Tek madde ve "konunun bütün maddeleri" görünümü, önceki/sonraki madde
- Derleme içinde arama (eşleşme vurgulu), yazı boyutu ayarı
- Metin içi madde atıflarında önizleme; `#gk-5`, `#gy-561`, `#konu-2`, `#m5` çapaları

## Komutlar (depo kökünden)

```bash
npm install
npm run dev
npm run test
npm run build
```

## Veriyi yenileme

`public/data/` klasörü, `2027gmnot` deposundaki `GUMRUK_MEVZUATI_TUMU.md` dosyasından üretilir:

```bash
npm run data:mevzuat -- ../2027gmnot/GUMRUK_MEVZUATI_TUMU.md
```

Kaynağı belirlenemeyen maddeler "Madde N" olarak, bulunduğu konunun altında gösterilir.
