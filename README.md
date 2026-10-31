# Harita İşletme Toplayıcı • Side Panel / MV3

Yerel Chrome 116+ üzerinde çalışan lacivert yan panel. Python, sunucu, API anahtarı
veya sanal tarayıcı gerekmez. Haritaya tıklamak yan paneli kapatmaz; kullanıcı yine
paneli kapatabilir. Chrome veya Maps sekmesi kapanırsa toplama sürdürülemez.

## Kurulum

1. Depoyu indirin; `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle.
2. `manifest.json` içeren klasörü seçin. Güncellemede eklentiyi yeniden yükleyin ve
   eski Maps sekmelerini yenileyin. Yeni sidePanel/downloads izinlerini onaylayın.
3. Eklenti simgesine tıklayın. Sektör, şehir/ilçe ve hedef (1–10000) girin.
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

## 0.2.1 — Kart öncelikli tarama

Telefon, adres, web sitesi, puan ve yorum önce sol listedeki işletme kartından
okunur. Telefon/adres/web sitesi tam ise detay açılmaz. Eksik alanlar için detay
okuma en fazla 2 saniye sürer; listeye dönüş dahil toplam bütçe 2,5 saniyedir.
Eksik bilgiler boş bırakılır ve işletme mevcut alanlarıyla hemen kaydedilir.
Tek bir kartın/detayın DOM hatası diğer işletmelerin işlenmesini durdurmaz.
İşletme detayındaki eski uzun URL/başlık beklemeleri kaldırılmıştır. Her grup
sonrasında liste scrollHeight değerine kaydırılır ve kaydırma sayacı artar.
İlk arama paneli beklemesi hâlâ 90 saniyedir; detay denemesi bu beklemeyi kullanmaz.
Detay sonrası Maps listeyi geri getirmezse ayrı liste beklemesi 5 saniyede
anlaşılır hata verir; kayıtlar korunur ve CSV indirilir. CAPTCHA, manuel durdurma
ve eklenti bağlantı hataları normal durdurma kurallarına tabidir.

## 0.3.0 — Mahalle kuyruğu ve aramalar arası tekilleştirme

**Mahalle Bazlı Derin Tarama** sektör ve ilçeden bölge sorguları oluşturur. Nilüfer,
Kadıköy, Beşiktaş, Çankaya, Bornova ve Muratpaşa için başlangıç bölge listeleri
paketle gelir. Bunlar resmi ve eksiksiz idari mahalle envanteri değildir; yaygın
arama bölgeleri de içerir. Örneğin FSM çevresi Fethiye/İhsaniye aramalarıyla
kapsanabilir. Yeni listeler background.js içindeki DISTRICTS sözlüğüne eklenebilir.

İlçe sözlükte yoksa Maps'te “İlçe mahalleleri” aranır; açıkça Mahallesi/Mah. olarak
etiketlenen sonuç ve metinlerden en fazla 250 aday alınır. Keşif en fazla 12
kaydırma veya değişmeyen listede dört kontrol sürer. Mahalle bulunamazsa panelde
uyarı gösterilerek tek ilçe-geneli aramaya dönülür. Yerel DOM, coğrafi belirsizlik
ve Maps görünürlüğü nedeniyle tüm mahallelerin veya işletmelerin keşfi garanti
edilmez. Her sorgu yine Google'ın sunduğu sonuçlarla sınırlıdır; bu mod alternatif
bölge sorguları üretir, teknik bir sonuç limiti kaldırmaz.

Panel ve harita kartı güncel mahalleyi, sıra/toplam sayısını ve benzersiz işletme
sayısını gösterir. Hedef, mahalle başına değil tüm kuyruk için geçerlidir (1–10000).
Kaydırma sayacı keşif dahil tüm iş boyunca birikir. Her mahalle bitince aynı Maps
sekmesi sonraki aramaya yönlendirilir. Kuyruk, sıra ve tekilleştirme kimlikleri
chrome.storage.local içinde tutulur. Önceki mahalleden gelen mesajlar aşama
kimliğiyle reddedilir. Paneli kapatmak işi durdurmaz; sekme/Chrome kapanınca mevcut
veriler korunur, iş kaldığı yerden otomatik yeniden başlamaz.

Maps URL'si, place/feature kimliği, CID ve telefon üzerinden iş genelinde
tekilleştirilir; Türkçe numaraların +90/0090/0 biçimleri eşleştirilir. Ortak telefon
kullanan farklı şubeler birleştirilebilir. Eksik kimlikli, farklı URL ve telefonsuz
kayıtlar yine mükerrer kalabilir; isim benzerliği tek başına birleştirmez.

CSV'ye **Bulunduğu Mahalle / Arama Bölgesi** sütunu eklenir. Bu, işletmenin ilk
bulunduğu sorgu bölgesidir; doğrulanmış idari adres mahallesi değildir. Kuyruk
bittiğinde, toplam hedefe erişildiğinde veya Durdur ve İndir ile tek bir toplu
CSV başlatılır. Ara mahalle bitişlerinde dosya oluşturulmaz.
