# Harita İşletme Toplayıcı — Chrome Manifest V3

Kullanıcının yerel Chrome tarayıcısında çalışır. Python, bulut sunucusu, Playwright,
Chromium indirmesi, API anahtarı veya ücretli servis gerekmez.

## Kurulum

1. Bu depoyu bilgisayarınıza indirin veya klonlayın.
2. Chrome'da `chrome://extensions` sayfasını açıp **Geliştirici modu**nu etkinleştirin.
3. **Paketlenmemiş öğe yükle** ile `manifest.json` bulunan klasörü seçin.
4. Eklenti simgesini açın, sektör ve bölge yazıp toplamayı başlatın.
5. Açılan Maps sekmesini açık tutun. Toplama sırasında farklı bir arama yapmayın.
6. Popup'ı tekrar açarak ilerlemeyi görün, filtre uygulayın ve CSV indirin.

## İlk sürüm

- Sektör/bölge araması, 1–500 kayıt limiti, sonuç listesini kaydırma ve sırayla detay açma.
- İsim, telefon, adres, site, puan, yorum sayısı, Maps bağlantısı ve toplama zamanı.
- Aynı Maps URL'sini tekilleştirme; yerel kayıt, durdurma, veri silme ve önizleme.
- Telefonu veya sitesi olan/olmayanları önizleme ve dışa aktarmada filtreleme.
- Türkçe başlık, UTF-8 BOM, noktalı virgül, CSV kaçışları ve formül enjeksiyonu koruması.
- E-posta tarama, dışa veri gönderme, analitik veya işletme sitelerine erişim yok.

`background.js` yalnız mesajı gönderen Maps sekmesinin kimliğini doğrular.
`content.js` Maps sekmesinde çalışır; popup kapalıyken devam eder. Chrome/sekme
kapanınca veya yeniden yüklenince kesintisiz devam garantisi yoktur. Elde edilen
kayıtlar `chrome.storage.local` içinde kalır. Tek seferde tek arama çalışır.

## Sınırlar

Bu bir ilk sürümdür; gerçek yerel Chrome üzerinde doğrulanmalıdır. Google Maps'in
DOM seçicileri ve arama sonuçları değişebilir. Sayfadan kaldırılan/sanallaştırılan
sonuç bağlantılarında toplama açıklayıcı hatayla durur ve mevcut kayıtları korur.
Daha küçük limit deneyin. Bölgedeki tüm işletmelerin bulunması garanti edilmez.
Eksik telefon/site alanı boş kalır; adresi olmayan detaylar zaman aşımıyla durur.
Puan ve yorum sayısı Maps'in gösterdiği yerelleştirilmiş metin olarak aktarılır.

Sabit beklemeler yalnız yükleme ve işlem temposu içindir; bot engeli aşma mekanizması
değildir. CAPTCHA/izin ekranı algılanırsa durur; algılanamayan ekran zaman aşımına
gider. Manuel kontrol edip yeni arama başlatın. Harita dışında Google izin
sayfasına yönlendirme olursa popup'tan **Durdur** ile işi sonlandırın.

## Doğrulama

```sh
node --check popup.js
node --check content.js
node --check background.js
node --test tests/extension.test.cjs
```

Yerel kabul kontrolü: 3 işletme limitiyle bir arama yapın; Maps detaylarıyla CSV'yi
karşılaştırın. Popup'ı kapatıp açın, durdurmayı, telefon/site filtrelerini, Türkçe
karakterleri ve CSV'nin Excel'de ayrı sütunlara açılmasını kontrol edin. Ağ/izin
ve sonuçsuz arama durumlarını da deneyin. Bulut ortamında Chrome çalıştırılmadı.
