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

Diğer not dosyaları `--ek` ile verilir ve sekmelere (Tarife, Genelge ve Tebliğler, Sair Mevzuat, Vergi Hesaplama) klasör olarak eklenir.
Klasör numaraları `--ek` listesinin sırasından gelir; listeyi hep aynı (alfabetik) sırayla verin:

```bash
mapfile -t EK < <(ls ../2027gmnot/*.md | grep -v GUMRUK_MEVZUATI_TUMU)
python3 apps/web/scripts/build-mevzuat-data.py ../2027gmnot/GUMRUK_MEVZUATI_TUMU.md --ek "${EK[@]}"
```

Dosyaya özgü kurallar `scripts/ek-kaynak-yapilari.py` içindedir (metin üretilmez, yalnızca yeniden düzenlenir):

- **Fasıllar:** her fasıl "Fasıl 13 — <ad>" başlıklı tek konudur (adlar kaynağın içindekiler listesinden okunur).
- **Tarife ana derlemesi:** kitap ders notları, çıkmış sorular (BLOK 8–9 ve geçmiş yıl soruları) ve çözümlü alıştırma/deneme soruları ayrı klasörlerdir; fasıl derlemesinin kopyası olan bölüm atlanır.
- **STA notları:** "SORU: 2025 GM" sayfaları ve cevapları "Çıkmış sorular" klasörüne alınır.
- **Hesaplama soruları:** iki sütunlu sayfalar `scripts/hesaplama-sutunlari.json` içindeki elle doğrulanmış sütun işaretleriyle ayrıştırılır; her soru cevap anahtarı ve çözümüyle eşlenir. Kaynak dosya değişirse (satır sayısı tutmazsa) derleyici uyarı verir ve sayfaları olduğu gibi bırakır.
- **Tanıtım satırları:** eğitmen/kurum adı içeren sayfa altlıkları ve kapak imzası hiçbir çıktıya alınmaz (`BRAND_RE`).

Çözümlü sorular `q` bloğu olarak yazılır (`{t:'q', no, kok, siklar, cevap, cozum}`) ve okuyucuda cevabı/çözümü düğmeyle açılan kart olarak gösterilir.

## Sınav sorularını yenileme

`sorular-madde.json` ve `sorular-diger.json`, madde esaslı bir derleme sayfasının HTML'inden üretilir
(soru kökü, şıklar, doğru cevap ve bağlı madde; kaynağın gerekçe metinleri alınmaz):

```bash
python3 apps/web/scripts/build-sorular-data.py kanun.html yonetmelik.json diger.json --dogrula ../gmcikmislar/GM_SINAVLARI_DERLEMESI.md
```

Maddesi derlemede ayrılamayan sorular "Sorular" bölümünde ayrı başlıklar altında tutulur.

Aynı betik, sınav kitapçıklarındaki soruları `scripts/soru-konulari.json` içindeki anahtar ifadelere göre konulara ayırıp
Tarife ve Sair Mevzuat sekmelerine "ÇIKMIŞ SORULAR" klasörleri olarak ekler (`ek-90x-1.json`). Mevzuat verisi her yenilendiğinde
bu betik de yeniden çalıştırılmalıdır; aksi halde bu klasörler dizinde bulunmaz.
