# UYAP Bilişim Sistemi Kitabı - Özet

**Kaynak:** UYAP Bilişim Sistemi Kitabı (Ocak 2021)  
**Yayıncı:** T.C. Adalet Bakanlığı Bilgi İşlem Genel Müdürlüğü

Bu doküman, UYAP Bilişim Sistemi Kitabı'ndan icrabot sistemi için yararlı bilgilerin özetidir.

---

## 1. UYAP Genel Bilgiler

### 1.1 Amaç
- Daha hızlı, güvenilir, ekonomik ve şeffaf adalet hizmeti
- Türkiye genelinde tüm yargı birimlerini kapsayan bütünleşik sistem

### 1.2 Kapsam
- Anayasa Mahkemesi, Yargıtay, Danıştay
- Hakimler ve Savcılar Kurulu
- Bölge Adliye Mahkemeleri, Bölge İdare Mahkemeleri
- Cumhuriyet başsavcılıkları, mahkemeler
- **İcra ve iflas daireleri**
- Adalet Bakanlığı'na bağlı kurumlar

---

## 2. UYAP Entegrasyonları (48 Kurum, 143 Entegrasyon)

### 2.1 İcrabot İçin Kritik Entegrasyonlar

| Entegrasyon | Kurum | Kullanım Alanı |
|-------------|-------|----------------|
| **TAKBIS** | Tapu ve Kadastro GM | Taşınmaz sorgulaması, e-Haciz |
| **Tapu e-Haciz** | Tapu ve Kadastro GM | Taşınmaz üzerine haciz konulması |
| **EGM** | Emniyet GM | Araç sorgulaması, araç haczi |
| **SGK** | Sosyal Güvenlik Kurumu | İşyeri bilgisi, maaş haczi |
| **GİB (VEDOP)** | Gelir İdaresi Başkanlığı | Araç kayıt, mükellefiyet bilgisi |
| **MERNİS** | Nüfus ve Vatandaşlık GM | Kimlik doğrulama, adres |
| **AKS** | Nüfus ve Vatandaşlık GM | Adres kayıt sistemi |
| **PTT** | PTT GM | Tebligat, posta çeki hesabı |
| **KEP** | PTT GM | E-tebligat |
| **MKK** | Merkezi Kayıt Kuruluşu | Menkul kıymet sorgulaması |
| **MERSİS** | Gümrük ve Ticaret Bakanlığı | Şirket sicil, iflas bilgisi |
| **Basın İlan Kurumu** | BİK | Satış ilanı yayınlama |
| **TCMB** | Merkez Bankası | Faiz oranları, döviz kurları |
| **Vakıfbank** | Vakıfbank | Reddiyat, harç ödemeleri |
| **SBM** | Sigorta Bilgi Merkezi | Sigorta poliçe sorgulaması |

### 2.2 Toplu Entegrasyon Sorgusu
Tek ekrandan birden fazla entegrasyonu sorgulama:
- SGK kayıtları (çalıştığı iş yeri)
- TAKBIS (taşınmaz bilgileri)
- EGM (araç bilgileri)
- GİB (adres, mükellefiyet)
- AKS (adres kayıt sistemi)
- PTT (posta çeki hesabı)

---

## 3. UYAP Portalları

### 3.1 Avukat Portalı (https://avukat.uyap.gov.tr)
**İcrabot için en önemli portal**

#### Ana Menüler:
1. **UYAP Bilgilerim**
   - Kişisel Bilgilerim
   - İletişim Bilgilerim
   - IBAN Bilgilerim
   - SMS Bilgilerim
   - Sorgu Bakiye Hareketleri

2. **MTS İşlemleri** (Merkezi Takip Sistemi)
   - Abonelik alacakları için haciz yoluyla ilamsız icra takibi
   - 7155 sayılı Kanun kapsamında

3. **İcra Takibi**
   - Takip Açılış
   - Tamamlanmayan Dosyalar

4. **Dosya Sorgula**
   - Hukuk, Ceza, İcra, İdari Yargı, Adli Tıp, Satış Memurluğu, Arabuluculuk

5. **İcra Dosya İşlemleri**

6. **İhale Günü Sorgula**

7. **Harç Hesapla**

#### İcra Takibi Açılış Sekmeleri:
1. Dosya/Takip Bilgileri
2. Taraf Bilgileri
3. İlam/İlamsız Bilgileri
4. Harç/Masraf Bilgileri
5. Tevzi Numarası Al
6. Evrak Gönder
7. Ödeme Yap

### 3.2 Vatandaş Portalı (https://vatandas.uyap.gov.tr)
- Hukuk/İdari Dava Açılış
- Dosya Sorgulama
- Duruşma Sorgulama
- Harç Hesaplama
- UYAP SMS (4060)

### 3.3 Kurum Portalı (https://kurum.uyap.gov.tr)
- Dosya Sorgulama (Genel/Detaylı)
- Evrak Gönderme
- Safahat Sorgulama
- MTS İşlemleri

### 3.4 E-Satış Portalı (https://esatis.uyap.gov.tr)
- İhale ilanları
- Elektronik teminat verme
- Elektronik teklif verme
- İhale sonuçları

---

## 4. İcra Daireleri Modülü (Ünite 11)

### 4.1 Dosya Açılış İşlemleri

#### Menüler:
1. Takip Talebi Tevzi Önbilgi Kontrolü (Kota Kontrollü)
2. Takip Talebi Tevzi Önbilgi Kontrolü (Kota Kontrolsüz)
3. Tevzi Yapılan Dosyaların Sorgulanması
4. Takip Talebi Detay Bilgilerinin Girilmesi
5. Vekil İşlemleri
6. Tebliğ Edilecek Evrakların Hazırlanması
7. Tebligat Zarf Davetiye Hazırlanması
8. E-Ortamda Gelen Takip Taleplerinin Sisteme Kaydedilmesi

#### Dosya Açılış Alanları:
- Takip Türü (İlamlı/İlamsız)
- Takip Yolu
- Takip Şekli
- Takibin Mahiyeti
- Taraf Bilgileri
- Harç/Masraf Bilgileri

### 4.2 Harç ve Kasa İşlemleri

#### Menüler:
1. **Dosya Hesabı** (Esnek, Nafaka)
2. **Harç İşlemleri**
   - Harç ve Masraf Tahsilatının Yapılması ve Makbuzunun Kesilmesi
   - Dış Kuruma Harç Masraf Yatırma Bilgi Yazısı
   - Harç Tahsil Müzekkeresi Hazırlanması
3. **Tahsilat Yapılması ve Tahsilat Makbuzunun Hazırlanması**
4. **Reddiyat Yapılması ve Reddiyat Makbuzunun Hazırlanması**
5. **Toplu Makbuz İşlemleri**
6. **Banka Hesap İşlemleri**
   - Reddiyat Banka Ödemeleri
   - Vakıfbank Hesap Hareketleri

#### Tahsilat Nedenleri:
- Bilirkişi Tahsilatı
- Borç Tahsilatı
- Diğer Teminat Bedeli Tahsilatı
- İhale Teminat Bedeli Tahsilatı
- Masraf Avansı Tahsilatı
- Satış Bedeli Tahsilatı

#### Tahsil Harcı Oranları:
- Harçtan muaf
- Maaş ve ücretlerden
- Satıştan sonra
- vs.

### 4.3 Haciz & Mal & Satış İşlemleri

#### İhale İşlemleri:
1. **İhale Bilgileri Girişi**
   - 1. ve 2. İhale Tarih ve Saati
   - Satış Yeri Türü/Yeri
   - Düzenleyen Personel
   - Basın İlan Kurumunda Yayınlansın
   - Yayınlanacak Gazete (Yurt Düzeyinde/Mahalli/Bölgesel)

2. **Genel Satış Yazıları**
   - Satış Kararı
   - Taşınır/Taşınmaz Satış İlanı
   - Düzeltme İlanı
   - İhale Bedelinin Bankaya Nemalandırılması
   - Tapuya İhale Alıcısının Bildirilmesi
   - Basın İlan Kurumu
   - Belediye İlan Gönderme
   - Açık Artırma Tutanakları

3. **Teminat/Teklif İşlemleri**
   - Elektronik ortamda teminat verenler
   - Teminat iade işlemleri

4. **İhale Katılımcı/Alıcı İşlemleri**
   - İhale alıcısı seçimi
   - Teklif/Satış Tutarı
   - Ödeme şekli (Peşin/Alacağa Mahsuben)

5. **İhale Sonuçlandırma İşlemleri**
   - Satışın Kesinleşmesi
   - Kesinleşme Tarihi

6. **Satış Sonrası Yazıları**
   - İhalenin Feshi Davası
   - Tescil
   - KDV Beyannamesi

### 4.4 Sorgular

#### Menüler:
1. Döviz Bilgilerinin Sorgulanması
2. Tensip Sorgulama
3. Yenilenen Dosyaların Sorgulanması
4. Alacak Kalemi Sorgulama
5. İlam Bilgileri Sorgulama
6. **Mal Varlığı Sorgulama**
7. **Nüfus Kayıt Örneği**
8. **SGK Kayıt Sorgulama**
9. **PTT Posta Çeki Hesabı Sorgulama**
10. **Gelir İdaresi Başkanlığı Sorguları**
11. **Entegrasyon Sorguları**
12. Adres Araştırması
13. Yargıtay Karar Arama
14. Cep Telefonu Bilgilerinin Sorgulanması
15. **Toplu Entegrasyon Sorgu**
16. Patent Sorgulamaları
17. Sigorta Bilgi Gözetim Merkezi Sorguları

---

## 5. MTS (Merkezi Takip Sistemi)

### 5.1 Yasal Dayanak
7155 sayılı Abonelik Sözleşmelerinden Kaynaklanan Para Alacaklarına İlişkin Takibin Başlatılması Usulü Hakkında Kanun

### 5.2 Kapsam
- Abonelik sözleşmelerinden kaynaklanan para alacakları
- Haciz yoluyla ilamsız icra takipleri
- Haciz aşamasına kadar MTS üzerinden yürütülür

### 5.3 İşlem Akışı
1. Alacaklı vekili MTS takibi başlatır
2. Kurum Portalı üzerinden MTS Başvuru Dilekçesi
3. MTS Takibi Başlatabilecek Avukat tanımlaması
4. Sistem MTS Ödeme Emri oluşturur
5. PTT baskı merkezlerine ödeme emri iletilir
6. PTT tebligat sonuç bilgilerini sisteme girer
7. Borçlu ödeme yaparsa MTS dosyası kapanır
8. Borçlu itiraz edebilir (Vatandaş Portal veya icra dairesi)
9. 7 günlük sürede ödeme yapılmazsa icra takibine çevrilebilir

---

## 6. Tebligat Sistemi

### 6.1 E-Tebligat
- KEP (Kayıtlı Elektronik Posta) üzerinden
- PTT entegrasyonu ile
- Tebligat durumu takibi

### 6.2 Fiziki Tebligat
- Tebligat Zarf/Davetiye Hazırlanması
- PTT Gönderi Sorgulama
- Posta Tevdi Liste İşlemleri

### 6.3 Tebligat Türleri
- TK 21/1 (Normal tebligat)
- TK 21/2 (Tebliğ imkansızlığı)
- Yurtdışı tebligat

---

## 7. SEGBİS (Sesli ve Görüntülü Bilişim Sistemi)

### 7.1 Amaç
- Uzak mesafedeki kişilerin mahkeme tarafından sorgulanması
- Yüz yüzelik ilkesi temel alınarak
- Duruşmaların kayıt altına alınması

### 7.2 Faydalar
- Cezaevlerinden nakil sorunları ortadan kalkar
- Yol tutuklamalarından kaynaklanan mağduriyetler önlenir
- Yargılama sürecinin en az giderle yapılması
- Günde ortalama 5000-6000 sanığın nakil işlemi yapılmaz
- Yıllık 25-30 milyon TL tasarruf

---

## 8. Bilgi Güvenliği

### 8.1 Temel İlkeler
- **Gizlilik:** Bilginin yetkisiz kişilerin eline geçmemesi
- **Bütünlük:** Bilginin bozulmadan korunması
- **Erişilebilirlik:** Bilginin ihtiyaç duyulduğunda kullanılabilir olması

### 8.2 UYAP Güvenlik Önlemleri
- ISO/IEC 27001 standartları
- 7/24 canlı sistem izleme
- Siber saldırı tespiti ve engelleme
- Güvenlik duvarı
- SSL protokolü
- Sertifikasyon ve kimlik doğrulama

---

## 9. İcrabot Entegrasyonu İçin Öneriler

### 9.1 Öncelikli Ekranlar
1. Toplu Entegrasyon Sorgu (varlık sorgulaması)
2. Hazırlanmış Elektronik Tebligatlar (e-tebligat durumu)
3. Safahat Sorgula (dosya timeline)
4. İhale İşlemleri (satış yönetimi)
5. Dosya Hesabı (borç hesaplama)
6. Tahsilat/Reddiyat İşlemleri

### 9.2 Kritik Entegrasyonlar
1. TAKBIS (taşınmaz haczi)
2. EGM (araç haczi)
3. SGK (maaş haczi)
4. PTT/KEP (tebligat)
5. Vakıfbank (ödeme)

### 9.3 Dikkat Edilmesi Gerekenler
- Kota kontrolü (avukat bazlı dosya limiti)
- Tevzi sistemi (dosya dağıtımı)
- Harç hesaplama kuralları
- Tebligat süreleri
- İhale süreçleri ve kesinleşme

---

## 10. Referanslar

- UYAP Bilişim Sistemi Kitabı (Ocak 2021)
- T.C. Adalet Bakanlığı Bilgi İşlem Genel Müdürlüğü
- https://bigm.adalet.gov.tr
