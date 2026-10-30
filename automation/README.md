# Ufuk Çetintaş — günlük içerik ve hesap bağlantı paneli

Bu dal, kullanıcı adına hazırlanmış **ücretsiz deneme** dağıtımıdır. `CLAUDE.md` ve mevcut GTIP proje dosyaları korunur. Servis kökü `automation/`, Render Blueprint dosyası depo kökündeki `render.yaml` dosyasıdır. Kullanıcı onayı olmadan ücretli bir hizmet başlatılmaz.

## Hazır olanlar

- Özel çalışma alanında kullanıcının logosuyla iki günlük toplam sekiz farklı görsel hazırlanmıştır; süreler mavi, makamlar turuncudur. Bu herkese açık depoya gerçek görseller, metinler veya PDF alıntıları eklenmemiştir.
- Özel çalışma alanındaki içerik kaydı, hazırlanan bilgileri sonraki günler için seçim dışı tutar. Bu kayıt herkese açık depoda bulunmaz.
- Parola korumalı önizleme ve onay paneli. Metin, görsel veya hedef değişirse eski onay geçersiz olur.
- Instagram `gumrukkocunuz` için hedef hesap kontrolü ve Instagram/LinkedIn OAuth bağlantı akışı.
- LinkedIn kişisel profil adresi yalnızca hedef referansıdır; kullanıcı izni ve gerçek hesap kimliği yerine geçmez.
- Şifreli hesap izni saklama, tek kullanımlık ve süreli OAuth state, hassas callback URL'leri için kapalı erişim günlüğü.
- Kalıcı disk desteği ve özel başlangıç verileri için mevcut dosyaları değiştirmeyen aktarım mekanizması. Bu herkese açık dağıtımda başlangıçta içerik paneli boştur.

Gerçek hesaplar henüz bağlanmadı. Otomatik sosyal medya paylaşımı ve her gün 10.00 zamanlayıcısı henüz etkin değildir. WhatsApp hedefi gruptur; mevcut gruba resmî API uygunluğu henüz doğrulanmamıştır.

## Dağıtım

Render'da `Gumrukdoktoru/gtip-learning-system` deposunu ve **codex/gumruk-paylasim-ucretsiz** dalını Blueprint kaynağı olarak seçin. `render.yaml`, ücretsiz web hizmetini seçer; ücretli disk tanımlamaz. Bir hizmet otomatik olarak oluşturulmuş değildir.

Bu bir bağlantı/panel denemesidir. Ücretsiz hizmet boşta uyuyabilir ve yerel dosyaları yeniden başlatmada kaybedebilir. Bu nedenle bu sürüm günlük 10.00 çalışmasını, hesap bağlantılarının kalıcılığını veya onay geçmişinin kalıcılığını henüz sağlamaz. Tam günlük otomasyon için ücretsiz sınırlar içinde kalıcı veri ve zamanlayıcı çözümü ayrıca tamamlanmalıdır. Kullanıcının iki hazır paketi ve tekrar engelleme kaydı özel çalışma alanında korunur; bu denemeye taşınarak riske atılmaz.

Render'ın verdiği HTTPS adresi kullanılır; ayrıca alan adı almak gerekmez. Panel kullanıcı adı `reviewer`'dır. `REVIEW_PANEL_PASSWORD` ve `TOKEN_ENCRYPTION_KEY`, Render tarafından güvenli ortam ayarlarında rastgele oluşturulur; kaynak kodda gerçek değer bulunmaz.

Servis açıldıktan sonra hesap sahibi, platform uygulama ayarlarını güvenli sunucu ortamına ekler:

| Ayar | Açıklama |
|---|---|
| `INSTAGRAM_APP_ID` | Instagram Login için platform uygulaması kimliği |
| `INSTAGRAM_APP_SECRET` | Platform uygulaması sırrı |
| `LINKEDIN_CLIENT_ID` | LinkedIn uygulaması kimliği |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn uygulaması sırrı |

OAuth dönüş adresleri `/auth/instagram/callback` ve `/auth/linkedin/callback` yollarıdır. Panelin `/connections` ekranı gerçek tam adresleri gösterir. Hesap sahibi platformun kendi giriş ekranında izin verir. Hesap bağlantısı paylaşım başlatmaz.

## Geliştirme ve doğrulama

```sh
cd automation
python3 -m pip install -r requirements-runtime.txt
python3 -m unittest -v test_connections.py test_panel.py
```

Docker, depo kökünden `docker build -t gumruk-onay ./automation` ile hazırlanır. Yönetilen bulut ortamında paket kurulumu için gerekli vekil CA sertifikası `proxy_ca` BuildKit secret olarak verilmelidir; TLS doğrulaması kapatılmaz. Canlı sağlayıcı OAuth girişleri uygulama ve kullanıcı izni olmadan test edilmiş sayılmaz.

Bu içerikler sağlanan kitapçıklarla kontrol edilmiştir; resmî güncel mevzuatla bağımsız teyit yapılmamıştır. Kaynak sayfaları ve kesim tarihi özel manifestolarda tutulur; yayın görsellerinde kitapçık adı veya kesim tarihi yer almaz.
