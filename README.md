# Gümrük Mevzuatı Kaynak Yönetimi

Yönetici panelinden yüklenen gümrük mevzuatı kaynaklarının (tebliğ, genelge,
kılavuz; PDF/HTML) herkese açık bir sayfadan aranıp indirilmesini sağlayan
tam yığın uygulama.

Depolama düzeni [`docs/storage-usage.md`](docs/storage-usage.md) belgesindeki
sözleşmeyi uygular:

```
{AWS_FOLDER_PREFIX}public/uploads/{unixTimestamp}-{dosyaAdi}   # herkese açık
{AWS_FOLDER_PREFIX}uploads/{unixTimestamp}-{dosyaAdi}          # özel
```

## Ne yapar

**Ziyaretçi**
- Kaynakları arar (Türkçe karakter duyarsız), kategoriye göre filtreler,
  sayfalar.
- PDF/HTML dosyalarını indirir; indirme sayacı artar.
- Özel kaynakları göremez — API bu kayıtları anonim çağırana 404 döner.

**Yönetici**
- Giriş yapar (JWT), kaynak yükler (başlık, açıklama, kategori, görünürlük).
- Tüm kaynakları depolama anahtarlarıyla birlikte listeler.
- Bir kaynağı yayına/özele alır (nesne iki önek arasında taşınır) veya siler
  (kayıt ve nesne birlikte gider).

## Kurulum

```bash
npm install
cp .env.example .env      # en azından JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev               # api :3000, web :5173
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
| `npm test` | Tüm workspace testleri (85 test) |
| `npm run typecheck` | Tüm paketlerde `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm run build` | shared → api → web sırasıyla derler |

Üretim derlemesinden sonra API `npm start --workspace @gtip/api` ile,
web ise `apps/web/dist/` statik olarak sunulur.

## Yapı

```
packages/shared/     Depolama sözleşmesi, ortak tipler, metin katlama
apps/api/            Express + TypeScript API
apps/web/            React + Vite + Tailwind arayüz
docs/storage-usage.md
```

### API

Tüm yanıtlar ortak zarfı kullanır: `{ success, data? , error? }`.

| Yöntem | Yol | Yetki |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | herkes (15 dk'da 10 deneme) |
| `POST` | `/api/v1/auth/refresh` | herkes |
| `GET` | `/api/v1/auth/me` | oturum |
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

## Testler

```bash
npm test
```

- `packages/shared` — depolama anahtarı üretimi, dosya adı temizleme, arama
  katlama (24 test)
- `apps/api` — supertest ile yükleme, listeleme, indirme, güncelleme, silme,
  yetkilendirme ve yerel sürücü (41 test)
- `apps/web` — API istemcisi zarfı, biçimlendirme, kaynaklar sayfası (20 test)
