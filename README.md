# Öğrenci Çalışma Sayfası (Gümrük Mevzuatı)

Bir eğitim koçunun **YouTube videolarını**, **Instagram gönderilerini** ve
paylaştığı **PDF/HTML belgeleri** tek bir açık sayfada toplayan tam yığın
uygulama. Öğrenciler bu sayfaya gelir, arar ve çalışır; giriş yapmaları
gerekmez.

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
- Sekmelerle daraltır: Tümü · Videolar · Instagram · Belgeler.
- Videoyu sayfadan çıkmadan izler (çerezsiz `youtube-nocookie` gömme).
- Instagram gönderisini isterse sayfa içinde açar, istemezse Instagram'a gider.
- PDF/HTML belgeleri indirir; indirme sayacı artar.
- Özel kaynakları göremez — API bu kayıtları anonim çağırana 404 döner.

**Eğitmen (yönetim paneli)**
- Giriş yapar (JWT), belge yükler (başlık, açıklama, kategori, görünürlük).
- YouTube videoları kanal akışından kendiliğinden gelir; istediğinde elle
  senkronize eder.
- Instagram gönderisini adresini yapıştırıp başlık/açıklama yazarak ekler.
- İçerikleri öne çıkarır (sabitler), kaldırır; kaynakları yayına/özele alır
  (nesne iki önek arasında taşınır) veya siler.

## Sosyal içerik nasıl bağlanır

**YouTube — API anahtarı gerekmez.** `.env` içinde `YOUTUBE_CHANNEL` değerine
kanal kimliğinizi (`UC…`), `@kullanıcıadınızı` veya kanal adresinizi yazın.
Uygulama kanalın herkese açık Atom akışını (`feeds/videos.xml`) okur; bir
`@kullanıcıadı` verildiyse kanal kimliği bir kez çözülüp önbelleğe alınır.
Akış son ~15 videoyu taşır ve `YOUTUBE_SYNC_INTERVAL_MINUTES` dolduğunda ilk
ziyaretçi isteğinde tazelenir — ayrı bir zamanlayıcı kurmanız gerekmez.
YouTube'a ulaşılamazsa sayfa en son senkronize edilen videolarla açılmaya
devam eder.

**Instagram — elle eklenir.** Instagram'ın anahtarsız bir listeleme yolu yok;
otomatik çekim için İşletme/Yaratıcı hesabı ve uzun ömürlü Graph API token'ı
gerekir. Kazıma hem kullanım şartlarına aykırı hem de kırılgan olduğu için
yapılmadı. Bunun yerine panelden gönderi adresini yapıştırıp başlık ve açıklama
yazarsınız; sayfa gönderiyi Instagram'ın resmî gömme çerçevesiyle gösterir.
Graph API'ye geçmek istenirse `MediaService.addInstagramItem` yanına bir
`syncInstagram` eklemek yeterlidir; depo, tipler ve arayüz hazır.

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
YOUTUBE_CHANNEL=@kanaliniz   # veya UC… kimliği / kanal adresi
INSTAGRAM_PROFILE_URL=https://www.instagram.com/kullaniciadiniz/
SITE_TITLE=Akademi adınız
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
| `npm test` | Tüm workspace testleri (133 test) |
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
| `GET` | `/api/v1/media` | herkes (bayatsa YouTube'u tazeler) |
| `POST` | `/api/v1/media/youtube/sync` | admin |
| `POST` | `/api/v1/media/instagram` | admin |
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
- Yükleme yalnız PDF/HTML kabul eder; hem MIME türü hem uzantı doğrulanır.
- Dosya adı yol ayırıcılarından temizlenir, yerel sürücü ayrıca kökten çıkan
  anahtarları reddeder.
- Özel kaynaklar anonim çağırana 403 değil 404 döner; varlıkları sızmaz.
- Anonim listeleme yanıtlarından `storageKey`, `uploadedById` gibi alanlar
  çıkarılır.
- `helmet`, CORS beyaz listesi ve iki kademeli rate limit açıktır.
- Videolar `youtube-nocookie.com` üzerinden gömülür; Instagram çerçevesi ancak
  ziyaretçi isterse yüklenir, yani hiçbir üçüncü taraf isteği kendiliğinden
  gitmez.
- Aynı saniyede aynı ada sahip iki dosya yüklenirse depolama anahtarına kısa
  rastgele bir ek gelir; yükleme reddedilmez, dosyalar birbirini ezmez.

## Testler

```bash
npm test
```

- `packages/shared` — depolama anahtarı üretimi, dosya adı temizleme, arama
  katlama, YouTube/Instagram adres ayrıştırma (41 test)
- `apps/api` — supertest ile yükleme, listeleme, indirme, güncelleme, silme,
  yetkilendirme, yerel sürücü ve sahte bir akışla YouTube senkronizasyonu
  (65 test)
- `apps/web` — API istemcisi zarfı, biçimlendirme, öğrenci sayfasının üç rafı,
  video penceresi ve arama (27 test)

Ağ çağrısı yapan hiçbir test yok: YouTube istemcisine `fetch` enjekte edilir.
