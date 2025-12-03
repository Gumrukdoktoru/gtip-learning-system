# GTIP Eğitim Yönetim Sistemi

3 farklı eğitim merkezinin yönetimi için tasarlanmış modern web uygulaması.

## Eğitim Merkezleri

1. **Can'lı 7/24 Eğitim Merkezi** 🎓
2. **Eğümrük Eğitim** 📚
3. **Gümrük Koçu** 🎯

## Özellikler

### ✅ Yapılacaklar Yönetimi
- Her eğitim merkezi için ayrı yapılacaklar listesi
- Öncelik seviyeleri (Düşük, Orta, Yüksek)
- Tamamlanan görevleri takip etme
- Kolay ekleme ve silme

### 📚 Eğitim Takibi
- Öğrenci ve kurs bilgileri
- Eğitim durumu takibi (Planlandı, Devam Ediyor, Tamamlandı, İptal Edildi)
- İlerleme yüzdesi ile görsel takip
- Notlar ve detaylı bilgi ekleme

### 💾 Veri Saklama
- Tüm veriler tarayıcınızda güvenle saklanır (Local Storage)
- Sayfa yenilendiğinde verileriniz kaybolmaz
- Hiçbir veri dışarı gönderilmez

### 🎨 Modern Tasarım
- Responsive (Mobil ve masaüstü uyumlu)
- Dark mode desteği
- Kolay kullanım ve hızlı geçişler

## Kurulum

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev
```

Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresini açın.

## Kullanım

1. **Eğitim Merkezi Seçimi**: Üst kısımda bulunan renkli butonlardan çalışmak istediğiniz eğitim merkezini seçin
2. **Yapılacaklar**: "Yapılacaklar" sekmesinden görevlerinizi yönetin
3. **Eğitim Takibi**: "Eğitim Takibi" sekmesinden eğitimleri takip edin

## Teknolojiler

- **Next.js 15** - React framework
- **TypeScript** - Tip güvenliği
- **Tailwind CSS** - Modern tasarım
- **Lucide React** - İkonlar
- **Local Storage** - Veri saklama

## Geliştirme

```bash
# Projeyi build edin
npm run build

# Production'da çalıştırın
npm start
```
