# Harita İşletme Toplayıcı • Side Panel / MV3

Yerel Chrome 116+ üzerinde çalışan lacivert yan panel. Python, sunucu, API anahtarı
veya sanal tarayıcı gerekmez. Haritaya tıklamak yan paneli kapatmaz; kullanıcı yine
paneli kapatabilir. Chrome veya Maps sekmesi kapanırsa toplama sürdürülemez.

## Kurulum

1. Depoyu indirin; `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle.
2. `manifest.json` içeren klasörü seçin. Güncellemede eklentiyi yeniden yükleyin ve
   eski Maps sekmelerini yenileyin. Yeni sidePanel/downloads izinlerini onaylayın.
3. Eklenti simgesine tıklayın. Sektör, şehir/ilçe ve hedef (1–500) girin.
4. Arama yeni Maps sekmesinde açılır. Liste ve detaylar yüklenirken yan paneli ve
   harita sağ üst kartını izleyin. Toplama sırasında Maps içinde başka arama yapmayın.

## Akış

Görünür sonuçlar tekilleştirilip sırayla okunur; sonra liste kaydırılır. Sayfa ve
sonuç paneli 90 saniyeye kadar beklenir. İşletme adı, telefon, adres, site, puan,
yorum metni, Maps bağlantısı ve zaman cihazda saklanır. Sayaçlar: kaydırma,
toplanan, hedef; ayrıca incelenen işletme canlı gösterilir.

Hedefte, liste sonu uyarısında veya dört ardışık dipte/değişmeyen liste kontrolünde
arama tamamlanır. Liste sonu, Google'ın bu aramada sunduğu sonuçların sonudur;
bölgedeki tüm gerçek işletmelerin eksiksiz bulunduğu anlamına gelmez. Geç yüklenen
sonuçlar veya DOM değişiklikleri sonucu etkileyebilir.

Tamamlanma ve **Durdur ve İndir** tüm mevcut kayıtları otomatik CSV olarak indirir.
CSV: UTF-8 BOM, Türkçe başlık, noktalı virgül, CRLF, formül koruması. Sıfır sonuçta
başlıklı boş CSV üretilir. Manuel filtreli indirme ayrıca mevcuttur; otomatik indirme
filtrelerden etkilenmez. İndirme tarayıcı ayarlarına göre konum sorabilir. İndirme
başlatma hatası panelde gösterilir; elle tekrar indirilebilir. İndirme isteğinin
başlatılması dosyanın diske başarıyla yazıldığını garanti etmez.

Popup yoktur. Service worker işleri ve tekilleştirilmiş verileri sırayla kaydeder;
Maps content script'i toplar. Stop sonrası gelen eski sonuç mesajları yok sayılır.
Panel kapalı olsa da Maps sekmesi açıkken toplama ve otomatik indirme sürer.
CAPTCHA/izin ekranları aşılmaz; hata halinde mevcut kayıtlar indirilir. Bilinmeyen
Maps düzenlerinde açıklayıcı hata/zaman aşımı verilir; sonsuz bekleme yapılmaz.
E-posta taraması veya dış sunucuya veri gönderimi yoktur.

## Doğrulama

`node --check sidepanel.js`, `node --check content.js`, `node --check background.js`,
`node --test tests/extension.test.cjs`.

Yerel kabul: hedef 3 ile alanları Maps'le karşılaştırın; hedeften az sonuçlu arama,
sonuçsuz arama, yüklenirken durdurma, tararken durdurma, paneli kapatma/açma,
CSV Türkçe karakterler ve filtreli indirmeyi kontrol edin. Bulutta gerçek Chrome /
Google Maps uçtan uca doğrulaması yapılmadı; DOM seçicileri değişebilir.
