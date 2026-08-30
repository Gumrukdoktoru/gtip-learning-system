# Öğrenci Çalışma Sayfası (Gümrük Mevzuatı)

Bir eğitim koçunun **YouTube videolarını**, **Instagram gönderilerini**,
paylaştığı **PDF/HTML belgeleri** ve **çoktan seçmeli deneme sınavlarını** tek
bir açık sayfada toplayan tam yığın uygulama. Öğrenciler bu sayfaya gelir,
arar, çalışır ve kendini dener; giriş yapmaları gerekmez.

Depolama düzeni [`docs/storage-usage.md`](docs/storage-usage.md) belgesindeki
sözleşmeyi uygular:

```
{AWS_FOLDER_PREFIX}public/uploads/{unixTimestamp}-{dosyaAdi}   # herkese açık
{AWS_FOLDER_PREFIX}uploads/{unixTimestamp}-{dosyaAdi}          # özel
```

## Ne yapar

**Öğrenci (açık sayfa)**
- Tek arama kutusuyla videolarda, gönderilerde ve belgelerde birlikte arar.
  Arama Türkçe karakter duyarsızdır: `GOZETIM` yazan `Gözetim`i bulur.
- Sekmelerle daraltır: Tümü · Videolar · Instagram · Belgeler · Test.
  Ana sayfa her raftan yalnız **son 3**'ünü gösterir; tamamı sekmelerdedir.
- Videoyu sayfadan çıkmadan izler (çerezsiz `youtube-nocookie` gömme).
- Instagram gönderisine tıklayıp resmî gömme çerçevesinde okur veya
  Instagram'a gider.
- PDF/HTML belgeleri indirir; indirme sayacı artar.
- Deneme sınavı çözer: konu ve zorluk seçer, soruları sırayla yanıtlar, sonunda
  puanını ve her sorunun doğru cevabıyla açıklamasını görür.
- Özel kaynakları göremez — API bu kayıtları anonim çağırana 404 döner.

**Eğitmen (yönetim paneli)**
- Giriş yapar (JWT), belge yükler (başlık, açıklama, kategori, görünürlük).
- YouTube videoları kanal akışından kendiliğinden gelir; istediğinde elle
  senkronize eder.
- Instagram gönderilerini otomatik çeker (anahtar bağlıysa) veya adresini
  yapıştırıp başlık, açıklama ve kapak görseli vererek elle ekler; kapağı
  sonradan da değiştirebilir.
- İçerikleri öne çıkarır (sabitler), kaldırır; kaynakları yayına/özele alır
  (nesne iki önek arasında taşınır) veya siler.
- Test sorularını panelden tek tek girer veya Markdown/Word dosyasından toplu
  aktarır (önizleme ile). Taslak sorular sınavlara girmez.

## Deneme sınavı nasıl çalışır

Sorular **Yönetim → Sorular** ekranından girilir. Bir sınav başlatıldığında API,
yayımlanmış sorulardan istenen konu/zorluk için rastgele bir set çeker ve
tarayıcıya **cevapsız** gönderir — doğru şık ve açıklama, öğrenci sınavı
gönderene kadar sayfaya hiç ulaşmaz. Değerlendirme sunucuda yapılır.

Öğrenci hakkında hiçbir şey saklanmaz. Bir sınav, yalnızca hangi soruların
çekildiğini tutan kısa ömürlü (2 saat) bir sunucu oturumudur; oturum bir kez
gönderilebilir, sonra silinir. Giriş, kayıt ve ilerleme takibi yoktur.

Sınav sırasında bir soru panelden silinirse sonuçtan düşülür; kalan sorular
üzerinden puanlanır.

### Soruları dosyadan içe aktarmak

**Yönetim → Sorular → Dosyadan içe aktar** ile Markdown (`.md`), düz metin
(`.txt`) veya Word (`.docx`) dosyası yükleyebilir ya da metni doğrudan
yapıştırabilirsiniz. Önce bir **önizleme** çıkar — hangi soru nasıl anlaşıldı,
hangisi neden alınamıyor — aktarma ancak siz onayladıktan sonra yapılır.
Aktarılan sorular varsayılan olarak **taslak** gelir; gözden geçirip yayına
alırsınız.

Beklenen biçim esnektir:

```markdown
## Tarife                      ← başlık, altındaki soruların konusu olur

1. GTİP kodunun ilk altı hanesi neyi ifade eder?
A) Ulusal alt açılım
B) Armonize Sistem (HS) kodu
C) Kombine Nomanklatür
Cevap: B
Açıklama: İlk 6 hane uluslararası HS kodudur.
Zorluk: kolay
```

Kabul edilen yazımlar:

| Öğe | Yazılabilecek biçimler |
| --- | --- |
| Soru başlangıcı | `1.` · `1)` · `1-` · `Soru 1:` |
| Şık | `A)` · `(A)` · `A.` · `A-` · `a)` · başında `-` veya `*` olabilir |
| Doğru cevap | `Cevap: B` · `Doğru cevap: B` · `Yanıt: B` · `Doğru şık: B` · `Answer: B` |
| Cevap işareti | Cevap satırı yoksa **kalın** yazılmış şık, `✓` veya `(doğru)` işareti |
| Konu | `Konu: Tarife` veya `## Tarife` başlığı |
| Zorluk | `Zorluk: kolay/orta/zor` (`easy/medium/hard` de olur) |
| Açıklama | `Açıklama:` · `Gerekçe:` · `Not:` — birkaç satır sürebilir |

Soru metni birden fazla satıra yayılabilir. `Konu:` ve `Zorluk:` bir sorunun
içindeyse o soruya, soruların dışında tek başına duruyorsa altındaki tüm
sorulara uygulanır. Dosyada hiç konu yoksa formdaki **varsayılan konu** kullanılır.

Word dosyalarında **kalın** yazılmış şık doğru cevap sayılır — Word'de sık
kullanılan yazım budur. Eski `.doc` biçimi desteklenmez; `.docx` olarak
kaydedin.

## Sosyal içerik nasıl bağlanır

**YouTube — API anahtarı gerekmez.** `.env` içinde `YOUTUBE_CHANNEL` değerine
kanal kimliğinizi (`UC…`), `@kullanıcıadınızı` veya kanal adresinizi yazın.
Uygulama kanalın herkese açık Atom akışını (`feeds/videos.xml`) okur; bir
`@kullanıcıadı` verildiyse kanal kimliği bir kez çözülüp önbelleğe alınır.
Türkçe harf içeren el adları (`@GumrukKoçunuz`) hem düz hem de tarayıcıdan
kopyalanan yüzde kodlu (`@GumrukKo%C3%A7unuz`) biçimde kabul edilir.
Akış son ~15 videoyu taşır ve `YOUTUBE_SYNC_INTERVAL_MINUTES` dolduğunda ilk
ziyaretçi isteğinde tazelenir — ayrı bir zamanlayıcı kurmanız gerekmez.
YouTube'a ulaşılamazsa sayfa en son senkronize edilen videolarla açılmaya
devam eder.

**Instagram — iki mod.** `INSTAGRAM_ACCESS_TOKEN` boşsa gönderiler panelden
elle eklenir; doluysa hesabınızdan otomatik çekilir. İkisi bir arada da
çalışır.

*Elle:* panelden gönderi adresini yapıştırıp başlık, açıklama ve **kapak
görseli** yüklersiniz. Kapak, kartta görünen resimdir ve belgelerle aynı
`{prefix}public/uploads/` önekine yazılır. Kapak vermezseniz kart yine de bir
kart gibi görünür — Instagram renklerinde bir blok.

*Otomatik:* uygulama Graph API'den son gönderileri okur, başlığı ve açıklamayı
gönderi metninden çıkarır, görseli **kendi depomuza indirir**. İndirmek şart:
Instagram'ın CDN adresleri imzalıdır ve süresi dolar, hotlink verilse kartlar
bir süre sonra boşalırdı.

Otomatik mod elle yapılan işi asla ezmez:

- Kayıtlar gönderi adresindeki **kısa kodla** eşleşir; elle eklediğiniz bir
  gönderi tekrarlanmaz, aynı kart güncellenir.
- Başlığı veya açıklamayı elle yazdıysanız o kart "elle düzenlenmiş" sayılır
  ve senkronizasyon metnine dokunmaz (sadece öne çıkarmak bunu tetiklemez).
- Kapak yalnızca kartta hiç kapak yoksa doldurulur.

Kartın kendisi videolarla aynı şekilde davranır: tıklayınca Instagram'ın resmî
gömme çerçevesi bir pencerede açılır. Çerçeve yalnızca okuyucu gönderiyi
açtığında yüklenir, yani sayfa kendiliğinden hiçbir üçüncü taraf isteği
göndermez. (Gömme çerçevesi silinmiş veya erişilemeyen bir gönderi için boş
gelir; bu yüzden kartın görünürlüğü ona bağlı bırakılmadı.)

Kazıma yapılmadı: hem kullanım şartlarına aykırı hem de kırılgan. Eski
anahtarsız `oembed` uç noktası da artık giriş sayfasına yönlendiriyor.

### Instagram'ı otomatiğe almak

1. Instagram hesabınızı **İşletme** veya **Yaratıcı** hesabına çevirin
   (Instagram → Ayarlar → Hesap türü ve araçlar).
2. [developers.facebook.com](https://developers.facebook.com/apps) üzerinden
   bir uygulama oluşturun ve ürünlerden **Instagram**'ı ekleyin.
3. Instagram girişiyle kurulum ekranından hesabınızı bağlayıp gönderileri
   okuma iznini (`instagram_business_basic`) onaylayın.
4. Üretilen **uzun ömürlü** erişim anahtarını `.env` dosyasındaki
   `INSTAGRAM_ACCESS_TOKEN` alanına yapıştırın. `INSTAGRAM_USER_ID=me` ve
   `INSTAGRAM_GRAPH_HOST=graph.instagram.com` varsayılanları bu akış içindir.
5. Panelde **Sosyal İçerik → Şimdi senkronize et** deyin. Kaç gönderi okundu,
   kaçı yeni, kaç kapak indirildi ekranda yazar.

Facebook girişiyle (Sayfa'ya bağlı) alınan bir anahtar kullanacaksanız
`INSTAGRAM_GRAPH_HOST=graph.facebook.com` yapın ve `INSTAGRAM_USER_ID` alanına
Instagram işletme kimliğinizi yazın.

Meta bu ekranların adlarını ve API sürümünü sık değiştiriyor; bu yüzden host ve
sürüm koda gömülmedi, `.env`'den ayarlanıyor. Bir sürüm emekliye ayrılırsa
`INSTAGRAM_GRAPH_VERSION` değerini güncellemek yeterli.

**Anahtarın süresi.** Uzun ömürlü anahtarlar 60 gün geçerlidir. Uygulama
Instagram girişi anahtarlarını 53. günden sonra kendisi tazeler ve yeni
anahtarı `DATA_DIR` altındaki `tokens.json` dosyasına yazar — `.env`'i elle
güncellemeniz gerekmez. Tazeleme başarısız olursa senkronizasyon mevcut
anahtarla devam eder ve bir sonraki denemede tekrar dener. (Facebook girişi
anahtarları bu şekilde tazelenmez; onlar Meta tarafında yenilenir.)

## Kurulum

```bash
npm install
cp .env.example .env      # JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, YOUTUBE_CHANNEL
npm run dev               # api :3000, web :5173
```

`.env` içinde en az şunları doldurun:

```bash
JWT_SECRET=...              # üretimde en az 32 karakter
ADMIN_EMAIL=...             # ilk açılışta oluşturulacak yönetici
ADMIN_PASSWORD=...
YOUTUBE_CHANNEL=@GumrukKoçunuz   # veya UC… kimliği / kanal adresi
INSTAGRAM_PROFILE_URL=https://www.instagram.com/gumrukkocunuz/
SITE_TITLE=Gümrük Koçu
```

İlk açılışta kullanıcı tablosu boşsa `ADMIN_EMAIL` / `ADMIN_PASSWORD` ile bir
yönetici hesabı oluşturulur. Hesap varsa bir daha oluşturulmaz; yeniden
başlatmalar parolayı sıfırlamaz.

Varsayılan `STORAGE_DRIVER=local` hiçbir AWS kimlik bilgisi istemez; dosyalar
`storage-data/objects/` altına, kayıtlar `storage-data/db/*.json` içine yazılır.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | API ve web sunucusunu birlikte başlatır |
| `npm run dev:api` / `npm run dev:web` | Yalnızca birini başlatır |
| `npm test` | Tüm workspace testleri (228 test) |
| `npm run typecheck` | Tüm paketlerde `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm run build` | shared → api → web sırasıyla derler |

Üretim derlemesinden sonra API `npm start --workspace @gtip/api` ile,
web ise `apps/web/dist/` statik olarak sunulur.

## Yapı

```
packages/shared/     Depolama sözleşmesi, ortak tipler, metin katlama,
                     YouTube/Instagram adres yardımcıları
apps/api/            Express + TypeScript API (kaynaklar + sosyal içerik)
apps/web/            React + Vite + Tailwind arayüz
docs/storage-usage.md
```

Öğrenci sayfası tek paket olarak yüklenir; giriş ve yönetim ekranları
(form yığınıyla birlikte) ayrı parçalara bölünüp yalnız gerektiğinde indirilir.

### API

Tüm yanıtlar ortak zarfı kullanır: `{ success, data? , error? }`.

| Yöntem | Yol | Yetki |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | herkes (15 dk'da 10 deneme) |
| `POST` | `/api/v1/auth/refresh` | herkes |
| `GET` | `/api/v1/auth/me` | oturum |
| `GET` | `/api/v1/site` | herkes (başlık, kanal ve profil bağlantıları) |
| `GET` | `/api/v1/quiz/availability` | herkes (konular ve soru sayıları) |
| `POST` | `/api/v1/quiz/sessions` | herkes (sınav başlatır, cevapsız sorular) |
| `POST` | `/api/v1/quiz/sessions/:id/submit` | herkes (değerlendirir) |
| `POST` | `/api/v1/quiz/questions/import/preview` | admin (dosya veya metin; kaydetmez) |
| `POST` | `/api/v1/quiz/questions/import` | admin |
| `GET` | `/api/v1/quiz/questions` | admin |
| `POST` | `/api/v1/quiz/questions` | admin |
| `PATCH` | `/api/v1/quiz/questions/:id` | admin |
| `DELETE` | `/api/v1/quiz/questions/:id` | admin |
| `GET` | `/api/v1/media` | herkes (bayatsa YouTube'u tazeler) |
| `POST` | `/api/v1/media/youtube/sync` | admin |
| `POST` | `/api/v1/media/instagram/sync` | admin |
| `POST` | `/api/v1/media/instagram` | admin (multipart, isteğe bağlı `cover`) |
| `POST` | `/api/v1/media/:id/cover` | admin (multipart, `cover`) |
| `GET` | `/api/v1/media/:id/cover` | herkes |
| `PATCH` | `/api/v1/media/:id` | admin |
| `DELETE` | `/api/v1/media/:id` | admin |
| `GET` | `/api/v1/resources` | herkes (anonim → yalnız public) |
| `GET` | `/api/v1/resources/:id` | herkes |
| `GET` | `/api/v1/resources/:id/download-url` | herkes (özel → admin/eğitmen) |
| `GET` | `/api/v1/resources/:id/download` | herkes (özel → admin/eğitmen) |
| `POST` | `/api/v1/resources` | admin (multipart, alan adı `file`) |
| `PATCH` | `/api/v1/resources/:id` | admin |
| `DELETE` | `/api/v1/resources/:id` | admin |
| `GET` | `/api/v1/health` | herkes |

`download-url`, public nesneler için doğrudan kova/CDN adresini, özel nesneler
için imzalı adresi döner; sürücü ikisini de sunamıyorsa (yerel disk) API'nin
kendi stream uçnoktasına yönlendirir. Arayüz hangisi olduğunu bilmek zorunda
değildir.

### Kalıcılık

Kayıtlar, arkasında tek bir JSON dosyası olan `JsonStore` üzerinden tutulur;
yazmalar bir promise zincirinde sıralanır ve geçici dosya üzerinden atomik
olarak yerine konur. Repository'ler arayüz olarak tanımlıdır
(`ResourceRepository`, `UserRepository`), dolayısıyla CLAUDE.md'de hedeflenen
PostgreSQL + Prisma kurulumuna geçiş, aynı arayüzü uygulayan ikinci bir sınıf
yazıp `createContainer` içinde onu vermekten ibarettir; servisler, controller'lar
ve testler değişmez.

Bu tercih bilinçlidir: veritabanı olmadan da çalışan ve baştan sona test
edilebilen bir uygulama teslim etmek, çalıştırılamayan bir Prisma şemasına
yeğlenmiştir.

## Güvenlik notları

- Parolalar bcrypt ile (maliyet 12; yalnız test ortamında 4) saklanır.
- Bilinmeyen e-posta ile yanlış parola aynı süreyi ve aynı mesajı üretir.
- Belge yüklemesi yalnız PDF/HTML, kapak yüklemesi yalnız JPG/PNG/WEBP kabul
  eder; her ikisinde de hem MIME türü hem uzantı doğrulanır.
- Dosya adı yol ayırıcılarından temizlenir, yerel sürücü ayrıca kökten çıkan
  anahtarları reddeder.
- Özel kaynaklar anonim çağırana 403 değil 404 döner; varlıkları sızmaz.
- Sınav soruları tarayıcıya cevapsız gider ve değerlendirme sunucuda yapılır;
  doğru şık ağ trafiğinden okunamaz. Soru bankasının tamamı yalnız yöneticiye
  açıktır.
- Anonim listeleme yanıtlarından `storageKey`, `uploadedById` gibi alanlar
  çıkarılır.
- `helmet`, CORS beyaz listesi ve iki kademeli rate limit açıktır.
- Videolar `youtube-nocookie.com` üzerinden gömülür; her iki gömme çerçevesi de
  ancak ziyaretçi içeriği açtığında yüklenir, yani sayfa açılırken hiçbir
  üçüncü taraf isteği gitmez.
- Aynı saniyede aynı ada sahip iki dosya yüklenirse depolama anahtarına kısa
  rastgele bir ek gelir; yükleme reddedilmez, dosyalar birbirini ezmez.

## Testler

```bash
npm test
```

- `packages/shared` — depolama anahtarı üretimi, dosya adı temizleme, arama
  katlama, YouTube/Instagram adres ayrıştırma (41 test)
- `apps/api` — supertest ile yükleme, listeleme, indirme, güncelleme, silme,
  yetkilendirme, yerel sürücü, kapak görselleri, sahte akışlarla YouTube +
  Instagram senkronizasyonu (anahtar tazeleme dahil), soru bankası, sınav
  değerlendirmesi ve Markdown/Word içe aktarma ayrıştırıcısı (147 test)
- `apps/web` — API istemcisi zarfı, biçimlendirme, öğrenci sayfasının rafları,
  video/gönderi pencereleri, arama ve sınav akışı (36 test)

Ağ çağrısı yapan hiçbir test yok: YouTube ve Instagram istemcilerine `fetch`
enjekte edilir.
