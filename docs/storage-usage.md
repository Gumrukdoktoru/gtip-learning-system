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

- **Contents:** PDF and HTML resource files uploaded by the admin (Gümrük
  mevzuatı kaynakları). Filename pattern: `{timestamp}-{originalFileName}`.
- **Written by:** admin panel resource upload form
  (`POST /api/v1/resources`, `visibility=public`).
- **Read by:** public resources page and the resource download API
  (`GET /api/v1/resources`, `GET /api/v1/resources/:id/download`).
- **Lifecycle:** permanent; removed only when an admin deletes the resource
  from the panel (`DELETE /api/v1/resources/:id`).

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
