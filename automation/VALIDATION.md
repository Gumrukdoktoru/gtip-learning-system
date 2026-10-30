# Doğrulama — 30 Ekim 2026

- 47 davranış testi geçti: kimlik doğrulama, OAuth hata gizleme, şifreli saklama, onay geçerliliği, iki süre + iki makam seçimi, eşzamanlı seçim, geçmiş kullanım, tasarım dönüşümü, özel aktarım doğrulaması, içerik seçmeyen bağlantı kontrolü, Neon bağlantı biçimlerinin güvenli ayrıştırılması ve tam TLS doğrulamasını koruyan CA dosyası seçimi.
- Docker dağıtım paketi derlendi. Sertifika doğrulaması kapatılmadı.
- Geçici, gerçek PostgreSQL 16 üzerinde `verify-full` TLS ile kaynak seçimi, görsel saklama ve şifreli hesap belirteci doğrulandı. Uygulama konteyneri tamamen silinip yenisi oluşturulduğunda görseller, onay, hesap kaydı ve tekrar engelleme geçmişi korundu. Bu entegrasyon kontrolünde tüm hesaplar ve onaylanan içerikler sentetik test verisiydi; sosyal paylaşım yapılmadı.
- Kullanıcının özel kaynak paketinin içe aktarımı ayrı geçici veritabanında doğrulandı: 1.526 kaynak kaydı, mevcut iki paketin sekiz görseli ve sekiz kullanım kaydı. Görsellerin özeti değişmedi; yeniden çizilmedi. Aktarımı tekrarlamak kayıtları çoğaltmadı. Özel içerik bu depoya eklenmedi.
- Zamanlama ancak varsayılan dalda ve GitHub Actions etkin olduğunda çalışabilir. Kod yüklemesinin bağlantı kontrolü, kart hazırlığı veya sosyal paylaşım değildir.
- Kullanıcı Neon'da ücretsiz bir proje oluşturduğunu ve GitHub'a bağlantı sırrını kaydettiğini bildirdi. GitHub'daki sır mevcut çalışma ortamında okunmaz. Canlı bağlantı, dış iş sonucu görülene kadar doğrulanmış sayılmaz. Barındırma ve sosyal hesap yetkileri mevcut çalışma ortamında yoktur; gerçek platform paylaşımları doğrulanmış değildir.

Son canlı bağlantı kontrol isteği: 2026-10-30T13:49:31.871368+00:00. Hesap sahibi GitHub bağlantı kaydını güncellediğini bildirdi; yeni kontrol sonucu ayrıca doğrulanacak.
