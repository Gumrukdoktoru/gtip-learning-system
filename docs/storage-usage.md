# Storage Usage

Bu belge, uygulamanın dosya depolama düzenini tanımlar ve kodun uyduğu
sözleşmedir. `packages/shared/src/utils/storage-path.ts` bu düzeni tek başına
üretir; başka hiçbir yerde anahtar elle kurulmaz.

## Conventions

- All paths use the folder prefix from `AWS_FOLDER_PREFIX` env var (currently
  `69655/`).
- Public files go under `{prefix}public/uploads/`, private files under
  `{prefix}uploads/`.
- Filenames are prefixed with a Unix timestamp for uniqueness.

## `69655/public/uploads/`

- **Contents:** two kinds of public file, both named
  `{timestamp}-{originalFileName}`:
  1. PDF and HTML resource files uploaded by the admin (Gümrük mevzuatı
     kaynakları).
  2. JPG/PNG/WEBP cover images for Instagram cards. Instagram exposes no
     keyless way to read a post's own image, so the coach uploads the picture
     that appears on the card.
- **Written by:** the admin panel resource upload form
  (`POST /api/v1/resources`, `visibility=public`) and the social content page
  (`POST /api/v1/media/instagram`, `POST /api/v1/media/:id/cover`).
- **Read by:** the public learning hub and the download/cover APIs
  (`GET /api/v1/resources`, `GET /api/v1/resources/:id/download`,
  `GET /api/v1/media/:id/cover`).
- **Lifecycle:** permanent; a resource object is removed with its record
  (`DELETE /api/v1/resources/:id`), a cover object with its media item
  (`DELETE /api/v1/media/:id`) or when a cover is replaced.

## `69655/uploads/`

- **Contents:** Private uploads — resources an admin marked as `private`.
- **Written by:** the same upload form with `visibility=private`, and by
  `PATCH /api/v1/resources/:id` when a public resource is taken private.
- **Read by:** the API via signed URLs (`GET /api/v1/resources/:id/download-url`)
  for `admin` and `instructor` accounts only.
- **Lifecycle:** permanent until explicitly deleted.

## Uygulamadaki karşılıkları

| Sözleşme | Kod |
| --- | --- |
| Prefix normalizasyonu | `normalizeFolderPrefix` |
| `{prefix}public/uploads/` · `{prefix}uploads/` | `getUploadSegment`, `buildStorageKey` |
| `{timestamp}-{originalFileName}` | `buildStoredFileName` |
| Dosya adı güvenliği (Türkçe harf, `../`) | `sanitizeFileName` |
| Anahtardan görünürlüğü okuma | `parseStorageKey` |

Görünürlük değiştiğinde nesne iki önek arasında taşınır
(`ResourceService.updateResource`): bayt kopyalanır, eski anahtar silinir ve
kayıttaki `storageKey` güncellenir.

## Sürücüler

| `STORAGE_DRIVER` | Nerede saklar | Public URL | İmzalı URL |
| --- | --- | --- | --- |
| `local` (varsayılan) | `STORAGE_LOCAL_ROOT` altında aynı dizin düzeniyle | yok, API stream eder | yok, API stream eder |
| `s3` | `AWS_S3_BUCKET` | `AWS_S3_PUBLIC_BASE_URL` verilmişse | evet (`AWS_SIGNED_URL_TTL`) |
| `memory` | süreç belleği (testler) | yok | yok |

`local` düzeni anahtarları birebir dizinlere yansıttığı için yerel ağaç
`aws s3 sync` ile kovaya olduğu gibi taşınabilir.
