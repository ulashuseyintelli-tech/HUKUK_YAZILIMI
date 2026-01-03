# Requirements: Address Discovery Module (Adres İstihbarat Modülü)

## Overview

İcra takip dosyalarında borçlunun güncel adresini sistematik, hukuka uygun ve verimli biçimde bulmak için adres araştırma modülü. Mevcut adres yönetim sistemi (legal-address-system) sadece mevcut adresleri yönetir; bu modül **yeni adres bulma** işlevselliğini sağlar.

## Temel Prensipler

1. **Adres bulma tek seferlik değil, süreçtir** - Her iade sonrası yeniden değerlendirilmeli
2. **Hiyerarşik yaklaşım** - Rastgele değil, sıralı ve sistematik
3. **Veri + Otomasyon + Hukuk bilinci** - Kör tebligat çıkmak en büyük hata
4. **Kaynak güvenilirliği** - Her adresin nereden geldiği ve ne kadar güvenilir olduğu bilinmeli

## Goals

1. Müvekkilden otomatik bilgi talebi (takip açılışında)
2. UYAP sorgu entegrasyonu (AA, AB, AF, AJ, AR, AL, AH, AN, AP)
3. Aynı borçlunun farklı dosyalardaki adreslerini eşleştirme
4. Kurum yazı şablonları (SGK, Vergi Dairesi, Ticaret Sicili, Belediye)
5. Araştırma workflow'u (2 iade → otomatik sorgu tetikleme)
6. Adres güven skoru hesaplama
7. Sorgu hiyerarşisi (adres bulunamazsa → otomatik üst sorguya geç)

---

## Functional Requirements

### 1. Müvekkil Bilgi Talebi (Client Info Request)

#### 1.1 Otomatik Email Gönderimi
- Yeni takip dosyası açıldığında müvekkile otomatik email gönderilmeli
- Email içeriği borçlu bilgilerini içermeli (ad, soyad, TCKN/VKN)
- Şablon:
  ```
  Sayın Müvekkilimiz,
  
  Tarafınız adına başlatılan icra dosyasında yer alan borçlulara ilişkin 
  elinizde bulunan adres, telefon, e-posta ve diğer iletişim bilgilerini 
  tarafımıza iletmenizi rica ederiz.
  
  Borçlu: [Borçlu Adı]
  TCKN/VKN: [Kimlik No]
  Dosya No: [Dosya Numarası]
  
  Bu bilgiler, tebligat işlemlerinin sağlıklı yürütülmesi için gereklidir.
  Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.
  
  Saygılarımızla,
  [Av. Ad Soyad]
  [Hukuk Bürosu]
  ```

#### 1.2 Müvekkil Kaynaklı Adres Tipleri
- Sözleşme adresi
- Fatura / sevk adresi
- E-posta, telefon, WhatsApp

⚠️ **Uyarı:** Müvekkil bilgileri "beyan"dır, tek başına güvenilmez. Ama ilk tetikleyici olarak değerli.

#### 1.3 Email Takibi
- Gönderilen email'ler `ClientInfoRequest` tablosunda kaydedilmeli
- Durum: SENT, RESPONDED, NO_RESPONSE
- Yanıt geldiğinde manuel işaretleme
- Hatırlatma email'i (7 gün sonra otomatik)

#### 1.4 Müvekkil Portalı Entegrasyonu (Opsiyonel)
- Müvekkil portalında "Adres Bilgisi Gir" formu
- Girilen adresler otomatik olarak borçlu kartına eklenmeli

### 2. UYAP Sorgu Entegrasyonu

#### 2.1 Desteklenen Sorgu Tipleri (Hiyerarşik Sıra)
| Öncelik | Kod | Sorgu Adı | Açıklama | Kullanım |
|---------|-----|-----------|----------|----------|
| 1 | AA | Nüfus + Aile + Adres | MERNİS yerleşim yeri | **Hukuken en güçlü adres** |
| 2 | AB | SGK | İşyeri adresi | Çalışan borçlular |
| 3 | AF | Ticaret Odası | Şirket merkezi | Tüzel kişiler |
| 4 | AJ | Vergi Dairesi | Vergi adresi | Ticari faaliyet |
| 5 | AR | GSM Operatörleri | Telefon numarası | İletişim |
| 6 | AL | Gümrük | Gümrük kaydı | İthalat/ihracat yapanlar |
| 7 | AH | Ortaklar | Şirket ortakları | Tüzel kişi yayılımı |
| 8 | AN | Aile Üyeleri | Aile üzerinden yayılım | Son çare |
| 9 | AP | Ortaklar Detay | Ortak detayları | Tüzel kişi yayılımı |

📌 **Kritik:** Sistem her adres için şunu sormalı: "Bu adres MERNİS mi, beyan mı, eski dosya adresi mi?"

#### 2.2 Sorgu Hiyerarşisi (Otomatik Geçiş)
```
AA (MERNİS) → Sonuç yok → AB (SGK) → Sonuç yok → AF (Ticaret) → ...
```
- Adres bulunamazsa otomatik olarak bir üst sorguya geç
- Her adım için kullanıcı onayı opsiyonel (ayarlanabilir)

#### 2.3 Sorgu Kayıt Modeli
- Her sorgu `UyapQuery` tablosunda kaydedilmeli
- Alanlar: queryType, caseDebtorId, requestedAt, respondedAt, status, response, triggeredBy (MANUAL/AUTO)

#### 2.4 Sorgu Sonuç İşleme
- Sorgu sonucunda bulunan adresler otomatik olarak `DebtorAddress` tablosuna eklenmeli
- Kaynak: UYAP_AA, UYAP_AB, UYAP_AF, UYAP_AJ, UYAP_AR
- Güven seviyesi: UYAP kaynaklı = HIGH

#### 2.5 Sorgu Durumu
- PENDING: Sorgu gönderildi, yanıt bekleniyor
- COMPLETED: Yanıt alındı
- FAILED: Sorgu başarısız
- NO_RESULT: Sonuç bulunamadı

### 3. Cross-File Address Matching (Dosyalar Arası Adres Eşleştirme)

#### 3.1 Aynı Borçlu Tespiti
- TCKN veya VKN bazlı eşleştirme
- Aynı borçlu farklı dosyalarda farklı adreslerle olabilir

#### 3.2 Adres Havuzu
- Aynı borçlunun tüm dosyalarındaki adresler tek havuzda görüntülenmeli
- Her adresin hangi dosyadan geldiği belirtilmeli

#### 3.3 Akıllı Uyarılar
- "Bu borçlunun başka dosyasında farklı adres var"
- "Aynı TCKN ile X dosyada Y farklı adres mevcut"
- Uyarı badge'i borçlu kartında gösterilmeli

### 4. Kurum Yazı Şablonları

#### 4.1 Desteklenen Kurumlar
| Kurum | Yazı Türü | Ne Zaman |
|-------|-----------|----------|
| SGK | İşyeri adresi talebi | Çalışan borçlu |
| Vergi Dairesi | Yoklama/iş adresi | Ticari faaliyet |
| Ticaret Sicili | Şirket merkezi | Tüzel kişi |
| Belediye | Nüfus/imar bilgisi | Dolaylı veri |
| Tapu Müdürlüğü | Gayrimenkul adresi | Dolaylı teyit |

#### 4.2 Yazı Tetikleme Kuralları
⚠️ Her dosyada otomatik yazı **saçmalık**. Şu eşikler olmalı:
- En az **2 başarısız tebligat**
- MERNİS + işyeri uyumsuzluğu
- Dosya tutarı > 50.000 TL

#### 4.3 Şablon Yapısı
- Her kurum için standart yazı şablonu
- Değişkenler: borçlu adı, TCKN/VKN, dosya no, icra dairesi
- Word (.docx) formatında çıktı

#### 4.4 Yazı Takibi
- Gönderilen yazılar `InstitutionLetter` tablosunda kaydedilmeli
- Durum: DRAFT, SENT, RESPONDED, NO_RESPONSE
- Yanıt tarihi ve içeriği

### 5. Araştırma Workflow'u

#### 5.1 Otomatik Tetikleme Kuralları
| Tetikleyici | Aksiyon |
|-------------|---------|
| 2 başarısız tebligat | UYAP AA sorgusu öner |
| MERNİS + işyeri uyumsuzluğu | SGK sorgusu öner |
| Dosya tutarı > 50.000 TL | Tüm sorguları öner |
| Tüzel kişi | AF (Ticaret Sicili) öncelikli |
| 3+ iade | Kurum yazısı öner |

#### 5.2 Araştırma Durumu
- Her borçlu için araştırma durumu takibi
- Durum: NOT_STARTED, IN_PROGRESS, COMPLETED, EXHAUSTED

#### 5.3 Araştırma Geçmişi
- Yapılan tüm araştırma adımları kaydedilmeli
- Timeline görünümü
- Her adımın sonucu ve tarihi

### 6. Adres Güven Skoru

#### 6.1 Skor Faktörleri
| Faktör | Ağırlık |
|--------|---------|
| Kaynak güvenilirliği | 40% |
| Doğrulama durumu | 25% |
| Güncellik (tarih) | 20% |
| Tebligat başarı oranı | 15% |

#### 6.2 Kaynak Güvenilirliği Puanları
| Kaynak | Puan | Açıklama |
|--------|------|----------|
| MERNİS | 100 | Hukuken en güçlü |
| UYAP | 90 | Resmi kayıt |
| Ticaret Sicili | 85 | Tüzel kişi resmi |
| SGK | 80 | İşyeri kaydı |
| Vergi Dairesi | 75 | Vergi kaydı |
| Müvekkil | 50 | Beyan - teyit gerekir |
| Eski Dosya | 40 | Güncelliği belirsiz |
| Sosyal Medya | 10 | Sadece ipucu |

#### 6.3 Skor Gösterimi
- Her adreste güven skoru badge'i
- Renk kodlaması: Yeşil (80+), Sarı (50-79), Kırmızı (<50)

### 7. Tebligat Stratejisi Entegrasyonu

#### 7.1 Adres Tipi Belirleme
Her adres için tip net olmalı:
- 🏠 MERNİS adresi (yerleşim yeri)
- 🏢 İş yeri adresi
- 📍 Şube / geçici adres
- ❌ Bilinmeyen/doğrulanmamış adres

#### 7.2 Tebligat Önerisi
Sistem şu aklı yürütmeyi yapmalı:
- MERNİS var → **oraya çık**
- İade geldi → **TK 21/2 mi olur, yeniden mi?**
- İşyeri adresi varsa → **ayrı tebligat opsiyonu**

---

## Non-Functional Requirements

### 8. Performans
- UYAP sorguları async olmalı (background job)
- Cross-file matching max 2 saniye

### 9. Güvenlik
- UYAP sorguları audit log'a kaydedilmeli
- Kurum yazıları tenant izolasyonlu

### 10. Kullanılabilirlik
- Araştırma paneli tek tıkla erişilebilir
- Sorgu sonuçları otomatik adres ekleme önerisi

---

## Sosyal Medya Notu

**Yap ama KAYIT ALTINA ALMA.**
- Sosyal medya = keşif aracı, hukuki dayanak değil
- Dosyaya "adres budur" diye girilmez
- Ama "X ilçede ikamet ediyor olabilir" şeklinde **içsel not** olur

> Sosyal medya = dedektif  
> Tebligat = noter

---

## Out of Scope

- Sosyal medya tarama (sadece manuel not olarak)
- Otomatik UYAP API entegrasyonu (şimdilik manuel sorgu kaydı)
- Müvekkil portalı (ayrı spec)
