# Doğrulama — 30 Ekim 2026

- 34 davranış testi geçti: kimlik doğrulama, OAuth hata gizleme, şifreli saklama, onay geçerliliği, iki süre + iki makam seçimi, eşzamanlı seçim, geçmiş kullanım, tasarım dönüşümü ve özel aktarım doğrulaması.
- Docker dağıtım paketi derlendi. Sertifika doğrulaması kapatılmadı.
- Geçici, gerçek PostgreSQL 16 üzerinde `verify-full` TLS ile kaynak seçimi, görsel saklama ve şifreli hesap belirteci doğrulandı. Uygulama konteyneri tamamen silinip yenisi oluşturulduğunda görseller, onay, hesap kaydı ve tekrar engelleme geçmişi korundu. Bu entegrasyon kontrolünde tüm hesaplar ve onaylanan içerikler sentetik test verisiydi; sosyal paylaşım yapılmadı.
- Kullanıcının özel kaynak paketinin içe aktarımı ayrı geçici veritabanında doğrulandı: 1.526 kaynak kaydı, mevcut iki paketin sekiz görseli ve sekiz kullanım kaydı. Görsellerin özeti değişmedi; yeniden çizilmedi. Aktarımı tekrarlamak kayıtları çoğaltmadı. Özel içerik bu depoya eklenmedi.
- GitHub varsayılan dalı hâlâ ilk dokümantasyon dalıdır. Bu özellik dalındaki zamanlama dosyası canlı günlük iş anlamına gelmez.
- Canlı veritabanı, barındırma ve sosyal hesap yetkileri mevcut çalışma ortamında yoktur. Bunlara bağlı dış sistem işlemleri ve gerçek platform paylaşımları doğrulanmış değildir.
