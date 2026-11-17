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

### Sınav kitapçığı PDF'leri (`scripts/ek-sinavlar.json`)

İki sütunlu, doğru şıkkı kırmızı yazılmış kitapçık PDF'leri `extract-exam-pdf.py` ile okunur (PyMuPDF; yüklenen dosya güvenilmeyen
veri olduğundan `-I` ile) ve `ek-sinavlar.json` listesine eklenir:

```bash
python3 -I apps/web/scripts/extract-exam-pdf.py <kitapcik.pdf> "Gümrük Müşavirliği Sınavı · 2026" -o apps/web/scripts/ek-sinavlar.json --ekle
```

Cevap yalnızca kırmızı şıktan alınır (yoksa boş bırakılır). "N ve M nci soruları … cevaplayınız" ortak öncülü ilgili her sorunun
köküne yazılır; kök "altı çizili" sözcük soruyorsa altı çizili sözcükler "(altı çizili: …)" notuyla, şıkları tablo olan soruda hücreler
sütun başlığıyla verilir. Listedeki kitapçıklar: 2023 GM, 2023–2025 GMY, 2026 GM (15 Kasım 2026, B kitapçığı) ve 2026 GMY (15 Kasım 2026,
A kitapçığı).

`build-sorular-data.py` bu kitapçıkları esas alır (`merge_supplement`): aynı adlı sınavın derlemedeki soruları kök metniyle eşlenir,
madde bağlantıları taşınır. Derlemede olup kitapçıkta bulunmayan soru "tekil sorular" başlığına gider; ancak aynı soru başka bir
kitapçıkta aynen varsa (derlemede sınavı/numarası yanlış etiketlenmiş) çıkarılır ve madde bağlantısı asıl soruya taşınır.

Yalnızca PDF'te bulunan soruların derlemede madde bağlantısı yoktur; bunlar için (`link_pdf_only`):

- Kök maddeyi açıkça anıyorsa ("Gümrük Kanununun 235 inci maddesi", "Gümrük Yönetmeliğinin 561 inci maddesi") soru o maddeye bağlanır.
- Kök yalnızca Kanunu/Yönetmeliği adıyla anıyorsa `ArticleMatcher.best_law` o mevzuatın maddeleri içinde arar ve yalnızca güvenli
  eşleşmeyi "İlgili olabilecek madde (otomatik eşleşme)" olarak yazar. Ölçüm: maddesi derlemede belli olan, kökü mevzuatı anan 618
  sorunun 292'si ölçütü geçer; 265'i (%91) derlemenin gösterdiği maddeyle aynıdır. Eşik sabitleri `LAW_*` adlarıyla betiğin başındadır.
- Bağlanan sorular o maddenin "çıkmış sınav soruları" listesine de eklenir (`sorular-madde.json`). Diğer sorulara dokunulmaz.

### Konu notlarından dayanak ve "bu konunun çıkmış soruları"

Aynı betik, Kanun/Yönetmelik maddesine bağlı olmayan sorular için dayanağı diğer not dosyalarında (`ek-*.json`: Tarife, Sair Mevzuat,
Genelge, Hesaplama) **pasaj düzeyinde** arar (`PassageMatcher`):

- Birim: paragraf / tablo satırı / madde fıkrası (satır sonlarından bölünmüş paragraflar cümle sonuna kadar birleştirilir; metin değiştirilmez).
  Soru kartı içeren klasörler (çıkmış soru ve alıştırma bankaları) birim üretmez.
- Simge -> birim ters dizini; puan, soru kökü + doğru şıkkın IDF ağırlığının pasajda bulunan oranıdır. Tarife kodları (`96.03`, `8471.30`),
  fasıl (`13. fasıl`), madde (`md. 4`) ve yorum kuralı (`GYK 3`) ayrı simgelerdir.
- Tarife soruları fasıllara metin benzerliğiyle değil kuralla bağlanır (aşağıdaki "Tarife fasıllarının çıkmış soruları" bölümü).
- Diğer sorular yalnızca eşik aşılırsa bağlanır (puan, ortak sözcük çifti sayısı, şıkların pasajda geçmesi). Soru kökü bir mevzuatı
  adıyla anıyorsa dayanak yalnızca o mevzuatın notundan seçilir (`scripts/soru-konulari.json` → `kaynak_capalari`).
  Eşiğin altında kalan soru dayanaksız bırakılır; metin üretilmez.

Çıktılar: sorulara eklenen `dayanak` (`id`: `konu-<konu>` ya da konu içindeki maddenin kimliği), `sorular-konu.json`
(`{konu kimliği: [soru, ...]}`; değer metinse soruların tutulduğu eş konunun kimliği) ve sekme başına, hiçbir konuya bağlanamayan
soruları toplayan tek konuluk "ÇIKMIŞ SORULAR — Konusu eşleştirilemeyenler" klasörleri (`ek-90x-1.json`; Tarife sekmesinde "Genel tarife bilgisi"). Okuyucu, kimliği 1000 ve
üzeri olan konu sayfalarının sonunda "Bu konunun çıkmış soruları (n)" bölümünü gösterir. Mevzuat verisi her yenilendiğinde bu betik de
yeniden çalıştırılmalıdır; aksi halde bu klasörler dizinde bulunmaz.

### Tarife fasıllarının çıkmış soruları

Tarife sekmesindeki her fasıl sayfası (Fasıl 01–97 ve Genel Yorum Kuralları) o faslın çıkmış sorularını iki başlıkta gösterir:
"Doğru cevabı bu fasılda olan / bu fasılı soran sorular" (`rol: dogru`) ve "Bu fasılın şıklarda (çeldirici olarak) geçtiği sorular"
(`rol: secenek`). Hiç sorusu olmayan fasılda "Bu fasıl için kaynaklarda çıkmış soru bulunamadı." satırı çıkar (`sorular-konu.json`
içinde boş liste). Sorular **Tarife Kitabı** konusunda tutulur; aynı faslın "Tarife Cetveli — Fasıllar" ve "Sunum" sayfaları aynı listeyi gösterir.

Üç kaynak birleştirilir ve tekrarlar ayıklanır (`scripts/tarife-fasil-kurali.py`): sınav kitapçıklarındaki tarife soruları,
kullanıcının yüklediği "Tarife ile ilgili geçmiş yıl sınav soruları" PDF'i (`scripts/tarife-cikmis-sorular.json`) ve Tarife Kitabının
fasıl fasıl "çıkmış soru örneği" kartları. Aynı sorunun birden fazla sürümü varsa harf cevabı olan, sonra kitapçık sürümü (dayanak ve
madde bağlantısı için) tutulur; kitaptaki çözüm soruya `cozum` olarak eklenir. Kaynaklar farklı cevap veriyorsa derleyici bunu yazar.

Fasıl kuralı: `NN.NN`, `NNNN.NN`, 12 haneli GTİP, "NNNN pozisyonu", "Fasıl N", "N. fasıl", "N–M fasıl" → NN faslı. Kökte ya da doğru
şıkta geçen fasıl `dogru`, yalnızca diğer şıklarda geçen fasıl `secenek` olur; kitabın soruyu örnek verdiği fasıl da `dogru` sayılır.
Genel yorum kuralı anan sorular Genel Yorum Kuralları sayfasına gider. Kodun biçimini soran sorularda şıklardaki kodlar, vergi hesaplama
sorularında pozisyonlar fasıl sayılmaz; romen rakamlı "Bölüm" tek başına fasıl işareti değildir. Hiçbir fasla bağlanmayan sorular
"ÇIKMIŞ SORULAR — Genel tarife bilgisi" klasöründeki tek konuda toplanır.

PDF'i yeniden okumak için (PyMuPDF; yüklenen dosya güvenilmeyen veri olduğundan `-I` ile):

```bash
python3 -I apps/web/scripts/extract-tarife-pdf.py <tarife-sorulari.pdf> -o apps/web/scripts/tarife-cikmis-sorular.json
```

Sütunlar koordinatla ayrılır, sorular ardışık numarayla tanınır, cevaplar yalnızca belgenin sonundaki cevap anahtarından alınır
(anahtarda yoksa boş bırakılır). Sınav etiketi kalın ara başlıklardan gelir; son başlıktan (2019) sonraki başlıksız sorular etiketsizdir.
Derlemenin tamamı "ÇIKMIŞ SORULAR — Tarife (fasıl fasıl)" klasöründe "Tarife çıkmış sorular — tümü (n soru)" konusudur; aynı belgenin
sütunları karışık ham sayfa dökümü konuları, içerik PDF ile aynı çıktığında derleyici tarafından kaldırılır.
