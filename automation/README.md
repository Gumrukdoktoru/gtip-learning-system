# Ufuk Çetintaş — günlük içerik ve onay paneli

Her gün iki süre ve iki makam bilgisinden, kullanıcı onayını bekleyen özel bir paket hazırlanır. Süreler mavi, makamlar turuncudur; kullanıcının logosu korunur. Altı süre ve altı makam yerleşimi arasından aynı gün dört farklı düzen seçilir; aynı kategoride ardışık günlerde aynı düzen kullanılmaz. Görsel kütüphanesi sonlu olduğu için düzenler ilerleyen günlerde yeniden kullanılabilir. Hazırlanan bilgi ise yayımlanmamış olsa da tekrar seçilmez.

Bu dağıtım ücretsiz hizmet katmanları için hazırlanmıştır; ücretli kaynak oluşturmaz. Canlı bağlantıların çalıştığı ayrıca doğrulanmalıdır. Sosyal hesap bağlantıları ve sosyal medyaya gönderim uygulaması henüz tamamlanmamıştır; panelde onay vermek paylaşım başlatmaz.

## Kalıcı kayıt ve günlük hazırlık

- Render ücretsiz web hizmeti, parola korumalı önizleme ve onay ekranını çalıştırır. Yerel dosyalar yalnızca geçici önbellektir.
- Kullanıcıya ait bir PostgreSQL veritabanı; kaynak havuzunu, hazırlanmış görselleri, tekrar engelleme kaydını, onayları ve şifreli hesap bağlantılarını saklar. Örneğin Neon'un ücretsiz katmanı kullanılabilir. Kota veya sağlayıcı koşulları değişirse ücretli plana kendiliğinden geçilmez.
- GitHub Actions işi `07:00 UTC`, yani Türkiye saatiyle `10:00` için tanımlıdır. İş yalnızca taslak hazırlar; sosyal hesap izni kullanmaz, paylaşım yapmaz. GitHub zamanlanmış işleri gecikebilir; tam 10.00 teslim garantisi yoktur. Herkese açık depolarda uzun süreli hareketsizlik zamanlamayı durdurabilir; çalışması izlenmelidir.
- Hazırlama işlemi tekrar çalıştırılırsa aynı günün paketi korunur. Kaynak havuzu biterse önceki bilgiler yeniden kullanılmaz; iş açıklayıcı hata ile durur.
- Varsayılan dala kod yüklendiğinde bağlantı kontrolü ve önceden hazırlanmış içeriklerin şifreli aktarımı çalışabilir; yeni bilgi seçilmez ve kart çizilmez. Kaynak aktarımı tamamlanmamışsa günlük iş açıkça aktarım beklediğini bildirir. Bağlantı hatası veya eksik sır başarılı kabul edilmez.
- Taslak görseller, bir kez üretilmiş resimli arka planlara kaynak metinlerinin yazılmasıyla ücretsiz hazırlanır. Sohbetteki görsel üretim aracı sunucudan kendiliğinden çağrılmaz; her gün yeni bir yapay zekâ illüstrasyonu üretildiği iddia edilmez.

Depo herkese açıktır. Açık içerik olarak kod, genel arka planlar, logo ve lisanslı yazı tipleri bulunur. Kodlu aktarım, AES-256-GCM ile şifrelenmiş `assets/private-bootstrap.enc` dosyasını destekler. Bu sürümdeki şifreli paketin herkese açık depoya eklenmesine 30 Ekim 2026'da açık kullanıcı izni alınmıştır. Varsayılan Git dışlama kuralı korunur; izin verilen bu dosya bilerek eklenir. Dosya sunucuda mevcut olana kadar kodlu aktarım düğmesi kapalıdır. Rastgele açma anahtarı ayrı özel çalışma alanında tutulur; depoda, Docker imajında, günlüklerde ve HTML içinde bulunmaz. Ham PDF'ler, veritabanları ve hesap sırları depoya eklenmez. Hazırlanan şifreli paket, iki günlük sekiz görseli ve kaynak havuzunu korur.

## Canlıya geçişte kalan bağlantılar

Hazır paketin otomatik aktarımı için `automatic_transfer.py`, mevcut veritabanı yetkisini kullanır. Alıcıya ait X25519 gizli anahtarı özel veritabanında sarılmış olarak saklanır; yalnızca genel anahtar iş bildiriminde açıklanır. Hazır ZIP bu genel anahtara HKDF ve AES-GCM ile şifrelenir. İş, `assets/automatic-bootstrap.enc` dosyasını açıp mevcut doğrulanmış aktarım yolunu çalıştırır; görselleri yeniden üretmez. Tamamlanınca alıcının gizli anahtar kaydı silinir, tamamlanma kaydı korunur. Kullanıcının dosya indirmesi veya açma kodu kopyalaması gerekmez. Paket içeriği, daha önce herkese açık depoda şifreli taşınmasına izin verilen hazır paketin aynısıdır; açma anahtarı yayımlanmaz.

1. Kullanıcıya ait ücretsiz PostgreSQL hizmeti yetkilendirilir. Bağlantı adresi Render'ın güvenli ortam ayarına `DATABASE_URL`, bu GitHub deposunun Actions sırrına `AUTOMATION_DATABASE_URL` adıyla konur. Neon'un kopyaladığı tek `psql 'postgresql://…'` veya `DATABASE_URL='postgresql://…'` biçimi de veri olarak okunur; komut çalıştırılmaz. GitHub'daki sır yerel çalışma ortamına veya Render'a kendiliğinden aktarılmaz. Gerçek adres sohbete veya kaynak koda yazılmaz. TLS sertifika doğrulaması zorunludur.
2. Render Blueprint kaynağı olarak `Gumrukdoktoru/gtip-learning-system` deposunun `codex/gumruk-paylasim-ucretsiz` dalı seçilir. Depo kökündeki `render.yaml` ücretsiz web hizmetini ve rastgele panel/parola anahtarlarını tanımlar; ücretli disk içermez. İlk kurulumda `DATABASE_URL` güvenli giriş alanında istenir. Alan adı satın almak gerekmez. Bu dosyanın varlığı hizmetin oluşturulduğu anlamına gelmez.
3. Servis açıldıktan sonra yetkili `/automation` ekranındaki **Kodla aktar** alanına özel çalışma dosyasındaki aktarım kodu yapıştırılır. ZIP indirmek gerekmez. İsteğe bağlı ZIP yükleme de korunur. Açma kodu yalnızca parola korumalı HTTPS isteğinin gövdesinde kullanılır; URL'ye veya günlük çıktısına yazılmaz. Görsellerin ve kaynakların özetleri doğrulanır; mevcut iki paket yeniden üretilmez. Yanlış kod veya değiştirilmiş paketle veri aktarılmaz. Geçici SQLite denemesine özel içerik aktarımı engellenir. Şifreli hesap bağlantıları için `TOKEN_ENCRYPTION_KEY` ayrı bir anahtardır; sabit tutulur ve güvenli biçimde korunur.
4. `.github/workflows/gunluk-icerik.yml` varsayılan dala alındıktan, Actions etkinleştirildikten ve veritabanı sırrı tanımlandıktan sonra zamanlama çalışabilir. **Özellik dalına dosya yüklemek günlük işi etkinleştirmez.** İlk kod yüklemesi bağlantıyı kontrol eder. Özel aktarım tamamlandıktan sonra elle çalıştırılıp panelde dört kartın ve tekrar engelleme kaydının oluştuğu doğrulanır.
5. Instagram ve LinkedIn uygulamaları yetkilendirilir, hesap sahibi kendi platform giriş ekranlarında izin verir. Bunlar aşağıdaki ayrı hesap bağlantısı adımlarıdır.

Panel kullanıcı adı `reviewer`'dır. Render'ın oluşturduğu `REVIEW_PANEL_PASSWORD` güvenli ayarlardan alınır. `/healthz` kimlik doğrulama gerektirmeyen, hiçbir içerik veya sır döndürmeyen sağlık kontrolüdür. Diğer sayfalar ve dosyalar parolalıdır. Uygulama, ihtiyaç duyduğu tabloları oluşturur; elle SQL çalıştırmak gerekmez.

## Hesap bağlantıları

| Güvenli sunucu ayarı | Açıklama |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram Login uygulaması kimliği |
| `INSTAGRAM_APP_SECRET` | Instagram uygulaması sırrı |
| `LINKEDIN_CLIENT_ID` | LinkedIn uygulaması kimliği |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn uygulaması sırrı |
| `PUBLIC_BASE_URL` | Panelin gerçek HTTPS adresi |

`/connections` ekranı OAuth dönüş adreslerini ve eksik ayarları gösterir. Instagram hedefi `gumrukkocunuz` olarak kontrol edilir. LinkedIn kişisel profil URL'si yalnızca referanstır; kullanıcı izni ve gerçek hesap kimliği yerine geçmez. OAuth izinleri tek kullanımlık süreli state ile alınır; belirteçler veritabanında şifreli saklanır. Callback erişim günlüğü kapalıdır.

WhatsApp hedefi mevcut bir gruptur. Bu grubun resmî API ile paylaşım uygunluğu henüz doğrulanmamıştır; grup bağlantısının hazır olduğu söylenmez.

## Geliştirme ve doğrulama

```sh
cd automation
python3 -m pip install -r requirements-runtime.txt
python3 -m unittest -v test_connections.py test_panel.py test_daily.py test_private_import.py test_database.py test_sealed_bootstrap.py test_automatic_transfer.py
```

Geliştirme testleri yalnızca geçici/sentetik veriler kullanır. PostgreSQL yoksa yerel SQLite ile panel denenebilir; bu yol canlı kalıcılık sağlamaz. Worker, `DATABASE_URL` olmadan çalışmayı reddeder. Canlı PostgreSQL'de `sslmode=verify-full` kullanılır. Sürücünün derleme zamanındaki varsayılanına güvenmek yerine mevcut işletim sistemi CA dosyası açıkça verilir; özel CA gerekiyorsa `PGSSLROOTCERT` ile seçilir. Sertifika dosyası yoksa doğrulama kapatılmaz, bağlantı reddedilir.

Docker, depo kökünden `docker build -t gumruk-onay ./automation` ile hazırlanır. Yönetilen bulut ortamında paket kurulumu için gereken vekil CA sertifikası `proxy_ca` BuildKit secret olarak verilir; TLS doğrulaması kapatılmaz. Sağlayıcı OAuth girişleri uygulama ve kullanıcı izni olmadan test edilmiş sayılmaz.

Kaynak havuzu yüklenen PDF metinleriyle kontrol edilmiştir; resmî güncel mevzuatla bağımsız teyit yapılmamıştır. Eş anlamlı ifadelerin ayrıştırılması kusursuz bir hukuki mükerrerlik incelemesi değildir; günlük kullanıcı onayı sürer. Kitapçık adı ve kaynak kesim tarihi yayın görsellerine veya paylaşım metnine eklenmez. Hukuki dayanak korunur.
