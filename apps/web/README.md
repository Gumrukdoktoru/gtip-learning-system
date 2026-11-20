# Gümrük Mevzuatı Okuyucu

Konu esaslı mevzuat derlemesini madde madde okutan statik web uygulaması (React + TypeScript + Vite + Tailwind).

- Konular / Kanun / Yönetmelik / YYS Yönetmeliği dizinleri, daralan içindekiler
- Tek madde ve "konunun bütün maddeleri" görünümü, önceki/sonraki madde
- Derleme içinde arama (eşleşme vurgulu; YYS sekmesinde yalnızca YYS maddeleri), yazı boyutu ayarı
- Metin içi madde atıflarında önizleme; `#gk-5`, `#gy-561`, `#yys-16`, `#yys-4-a`, `#konu-2`, `#m5` çapaları

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

### YYS Yönetmeliği (`scripts/kaynaklar/3-YYS.md`)

Gümrük İşlemlerinin Kolaylaştırılması Yönetmeliği ayrı bir mevzuat olarak okunur (kaynak kodu `YYS`, kimlikler `yys-16`,
harfli maddelerde `yys-4-a`; `index.json` → `yys`). Kaynak, kullanıcının yüklediği YYS notunun kopyasıdır (`2027gmynot/3-YYS.md` ile
aynı; ana derlemenin 3. konusu da bu notun aynısıdır). Derleyici bu dosyayı varsayılan olarak okur; başka bir dosya `--yys <dosya>`
ile verilir. Notta her madde tek başına "**MADDE N**" satırıyla açılır; önceki satır madde başlığı, onun önündeki "BİRİNCİ KİTAP /
KISIM / BÖLÜM" + ad çiftleri ara başlıktır. Maddenin ortasında aynı numarayla tekrarlanan "MADDE 4 – <başlık>" satırı atlanır.

Ana derlemenin YYS notunu taşıyan konusu (madde başlıklarının en az %80'i ortak; bugün 3. konu, metin birebir aynı) genel ayrıştırıcıyla
değil bu dosyadan kurulur: önceden notta yalnızca "MADDE 4 –" satırı madde sanıldığından bütün Yönetmelik tek bir "GK Madde 4"
(`gk-4-v2`) bloğunda Kanun dizinine giriyordu. Konular sekmesinde konu, Yönetmeliğin kitap/kısım/bölüm başlıkları ve 168 maddesiyle
okunur; Kanun dizininde yalnızca Gümrük Kanunu maddeleri kalır. Notlar farklılaşırsa derleyici uyarı yazar ve YYS dosyasını esas alır.

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

YYS Yönetmeliği soruları (`link_yys`): kökü Yönetmeliği adıyla ("…Kolaylaştırılması Yönetmeliği") anan ya da başka bir mevzuat
anmadan "yetkilendirilmiş yükümlü"yü soran sorular. Onaylanmış Kişi Statüsü Tebliği ayrı bir mevzuattır, bu adımda aranmaz.

- Kök maddeyi açıkça anıyorsa ("…Kolaylaştırılması Yönetmeliğinin 16 ncı maddesi") soru `yys-16`'ya "madde" olarak bağlanır.
- Kök Yönetmeliği adıyla anıyorsa başka mevzuattaki otomatik eşleşme (ör. Onaylanmış Kişi Tebliği maddesi) ve ondan türeyen dayanak
  kaldırılır; okunarak seçilmiş dayanağı olan soruda başka mevzuattan gelen otomatik dayanak da seçime yer bırakır.
- Diğerleri `best_law(soru, "yys-")` ile yalnızca YYS maddelerinde aranır. Notta başka maddelere yapılan atıfların köşeli parantez içindeki
  adları ("6 ncı madde [Ticari kayıtların güvenilirliği…]") eşleştirmede sayılmaz ve "kök + bütün şıklar" ölçütü daha sıkıdır
  (`YYS_ALL_SCORE` = 0,4). Ölçüm: 56 YYS sorusunda 8 güvenli eşleşme; okunduğunda 8'i de doğru madde (biri yürürlükten kaldırılmış
  65. madde, dayanak metni yok). Ölçütler gevşekken çıkan 3 yanlışın ikisi köşeli parantezli adlardan, biri kısa 160/A maddesinden geliyordu.
- Dayanak, maddede soruyla (doğru şık iki kat ağırlıkla) en çok örtüşen satırın bulunduğu fıkradır ("(1) …" başından bir sonraki fıkraya,
  en fazla 700 karakter): notta her bent ayrı satır olduğundan tek satır hükmü göstermez.
- Genel eşleştirici (`ArticleMatcher(skip="yys-")`) YYS maddelerini almaz; böylece YYS dışı sorular YYS maddelerine bağlanmaz.

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

### Okunarak seçilmiş dayanaklar (`scripts/dayanak-secimleri.json`)

Otomatik eşleştiriciler bilerek sıkıdır; eşiği geçemeyen sorular için eşik gevşetilmez. Bunun yerine dayanaksız kalan soruların
adayları (bütün notlardan, düşük eşikle getirilen pasajlar) tek tek okunmuş, yalnızca doğru şıkkı doğrulayan (olumsuz soruda sınanan)
hüküm seçilmiştir. Dosya biçimi: `{soru anahtarı: {id, ad, metin}}`; anahtar `question_key` ile hesaplanır
(`sha1(kök|şıklar|cevap)` ilk 16 hane, yazım farklarından arındırılmış), `metin` notlardaki pasajın aynısıdır (madde bentleri
listeyse ardışık bentler, konu notunda ardışık paragraflar boşlukla birleştirilir; karar veren bent alıntının içinde olmalıdır). `ad` okuyucuda görünen kaynak
adıdır: notlardaki blok başlığı yanlışsa (ör. Posta ve hızlı kargo konusunda Tebliğ adı altında duran GK 173–175 ve GY 455–475) doğru
mevzuat adı yazılır. YYS Yönetmeliği metnine dayanan seçimler `yys-*` maddelerini gösterir.

`build-sorular-data.py` bu seçimleri otomatik eşleştiricilerden **sonra**, yalnızca hâlâ dayanağı olmayan sorulara uygular
(`ReviewedBasis`) ve her çalıştığında metni güncel veride aynen arar; bulunamayan (eskimiş) seçim uygulanmaz, sayısı yazdırılır.
Bu sorularda `dayanak.kaynak = 'okuma'` olur ve okuyucu "Dayanak, notlarınız okunarak seçilmiştir." notunu gösterir.
Puanı eşiğe çok yakın (`WEAK_AUTO` = 0,4 altı) bir otomatik madde eşleşmesi ("ilgili") okunarak seçilmiş dayanağın önüne geçmez.

Hüküm notlarda hiç yoksa seçim resmî metinden yapılabilir: `{id, ad, metin, kaynak: 'resmi', url}`. Metin, mevzuat.gov.tr'den
getirilen **güncel** metnin aynısıdır; `url` o mevzuatın mevzuat.gov.tr sayfasıdır. Kullanılan maddeler `scripts/resmi-metinler/`
altında, mevzuat başına bir dosyada tutulur (ilk satır: kaynak adresi, mevzuat adı ve erişim tarihi; maddeler boş satırla ayrılır,
madde numaraları sayfadaki "Madde N" başlığından gelir). Derleyici metni, ilk satırında aynı `url` bulunan dosyanın tek bir
maddesinde aynen arar. `id` uygulamadaki bir madde ise (ör. `gk-235`) soru o maddenin listesine de girer; boşsa okuyucu `ad`'ı
dış bağlantı olarak açar. Okuyucu bu sorularda "Dayanak, resmî mevzuat metninden (mevzuat.gov.tr) alınmıştır; notlarınızda bu
hüküm yer almıyor." notunu gösterir. Güncel resmî metin cevap anahtarıyla çelişirse seçim yapılmaz; soru
`scripts/not-cevap-celiskileri.md` dosyasına yazılır. Dayanağı bir
maddeyse soru o maddenin çıkmış soruları listesine, bir konu notundaysa (kimlik >= 1000) o konunun listesine girer ve
"eşleştirilemeyenler"den çıkar; tarife fasıl dağıtımı kuralla yapılmaya devam eder (yalnızca kuralın hiçbir fasla bağlayamadığı
soru, dayanağı fasıl notundaysa o faslın `dogru` listesine alınır).

Dayanağı bulunmayan, kökü Türkçe/matematik/tarih/anayasa sorusu olduğunu gösteren ve gümrük terimi içermeyen sorular
`dayanakYok: 'genel'` ile işaretlenir (`GENERAL_RE`, `CUSTOMS_RE`); okuyucu bunlarda "genel kültür / genel yetenek sorusudur"
mesajını verir. Notlarda doğru şıkkı doğrulayan hüküm bulunamayan sorular dayanaksız kalır; metin üretilmez. Okuma sırasında
notlardaki güncel hükmün eski cevap anahtarıyla çeliştiği görülen sorular `scripts/not-cevap-celiskileri.md` dosyasında listelenir;
bu sorulara dayanak bağlanmaz ve cevapları değiştirilmez.
