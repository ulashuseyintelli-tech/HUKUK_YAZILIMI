# Requirements Document

## Introduction

Bu özellik, icra takip formu seçim sürecini "form numarası ezberle" yaklaşımından "olayını anlat, doğru formu ben bulayım" yaklaşımına dönüştürür. Kullanıcı dostu bir sihirbaz arayüzü ile hukuki bilgisi olmayan kullanıcılar bile doğru formu kolayca seçebilir. Sistem ayrıca yanlış form seçimlerini otomatik tespit eder ve önerilerde bulunur.

## Glossary

- **Form Sihirbazı**: Kullanıcıya sorular sorarak doğru icra takip formunu öneren akıllı sistem
- **Form Kategorisi**: Formların hukuki gruplandırması (Genel İcra, Kambiyo, İpotek/Rehin, İflas, Kira)
- **Form Metadata**: Her form için saklanan açıklama, örnek senaryo, gerekli belgeler gibi bilgiler
- **Cross-check**: Form seçimi ile girilen bilgiler arasındaki tutarlılık kontrolü
- **Önerilen Form**: Sihirbaz sorularına verilen cevaplara göre sistemin önerdiği en uygun form

## Requirements

### Requirement 1: Form Sihirbazı (Karar Ağacı)

**User Story:** Avukat olarak, birkaç basit soruya cevap vererek doğru icra takip formunu bulmak istiyorum, böylece form numaralarını ezberlemek zorunda kalmam.

#### Acceptance Criteria

1. WHEN kullanıcı "Yeni Takip Oluştur" sayfasına girdiğinde THEN sistem SHALL 4 soruluk bir sihirbaz göstermeli
2. WHEN kullanıcı "Elinde mahkeme kararı/ilam var mı?" sorusuna cevap verdiğinde THEN sistem SHALL ilamlı/ilamsız ayrımını yapmalı
3. WHEN kullanıcı "Alacak kambiyo senedine mi dayanıyor?" sorusuna cevap verdiğinde THEN sistem SHALL kambiyo formlarını filtrelemeli
4. WHEN kullanıcı "Alacak ipotek/rehne mi dayanıyor?" sorusuna cevap verdiğinde THEN sistem SHALL ipotek/rehin formlarını filtrelemeli
5. WHEN kullanıcı "Takip konusu kira mı?" sorusuna cevap verdiğinde THEN sistem SHALL kira formlarını filtrelemeli
6. WHEN tüm sorular cevaplanınca THEN sistem SHALL en uygun formu büyük bir kart ile öne çıkarmalı
7. WHEN kullanıcı sihirbazı atlamak isterse THEN sistem SHALL direkt form listesine geçiş imkanı sunmalı

### Requirement 2: Hukuki Kategorilere Göre Gruplama

**User Story:** Avukat olarak, formları hukuki kategorilere göre filtrelemek istiyorum, böylece aradığım form türüne hızlıca ulaşabilirim.

#### Acceptance Criteria

1. WHEN form listesi görüntülendiğinde THEN sistem SHALL formları 5 kategoride gruplamalı: Genel İcra, Kambiyo, İpotek/Rehin, İflas, Kira
2. WHEN kullanıcı bir kategori filtresi seçtiğinde THEN sistem SHALL sadece o kategorideki formları göstermeli
3. WHEN "Tümü" filtresi seçiliyken THEN sistem SHALL tüm formları kategorilerine göre gruplandırarak göstermeli
4. WHEN bir kategori seçildiğinde THEN sistem SHALL seçili kategoriyi görsel olarak vurgulamalı

### Requirement 3: Kullanıcı Dostu Form Kartları

**User Story:** Stajyer/sekreter olarak, her formun ne işe yaradığını anlamak istiyorum, böylece doğru formu seçtiğimden emin olabilirim.

#### Acceptance Criteria

1. WHEN form kartı görüntülendiğinde THEN sistem SHALL başlıkta hukuki açıklamayı, alt satırda form numarası ve İİK maddesini göstermeli
2. WHEN form kartı görüntülendiğinde THEN sistem SHALL 1 satırlık kullanım senaryosu açıklaması göstermeli
3. WHEN kullanıcı bilgi ikonuna tıkladığında THEN sistem SHALL detaylı açıklama modalı açmalı (İİK maddesi, örnek senaryo, çıktı bilgisi)
4. WHEN alt kategorisi olan form seçildiğinde THEN sistem SHALL alt kategorileri ana formun hemen altında göstermeli

### Requirement 4: Sık Kullanılanlar ve Son Kullanılanlar

**User Story:** Avukat olarak, en sık kullandığım formlara hızlıca erişmek istiyorum, böylece seri dosya açma işlemlerini hızlandırabilirim.

#### Acceptance Criteria

1. WHEN form seçim ekranı açıldığında THEN sistem SHALL "Sık Kullanılanlar" bölümünü en üstte göstermeli (İlamsız İcra, Kambiyo, Kira Alacağı)
2. WHEN kullanıcı bir form ile takip oluşturduğunda THEN sistem SHALL bu formu kullanıcının geçmişine kaydetmeli
3. WHEN kullanıcının form geçmişi varsa THEN sistem SHALL "Son Kullandıkların" bölümünü göstermeli (son 5 form)
4. WHEN son kullanılan form gösterilirken THEN sistem SHALL kaç dosya açıldığı bilgisini de göstermeli

### Requirement 5: Yanlış Form Seçimi Kontrolü (Cross-check)

**User Story:** Avukat olarak, yanlış form seçtiğimde uyarılmak istiyorum, böylece hatalı takip açma riskini azaltabilirim.

#### Acceptance Criteria

1. WHEN kullanıcı Form 10 (Kambiyo) seçip "kambiyo senedi yok" işaretlediğinde THEN sistem SHALL uyarı göstermeli ve Form 7 önerisinde bulunmalı
2. WHEN kullanıcı kira alacağı bilgisi girip Form 7 seçtiğinde THEN sistem SHALL Form 13 önerisinde bulunmalı
3. WHEN cross-check uyarısı gösterildiğinde THEN sistem SHALL "Formu Değiştir" ve "Devam Et" seçenekleri sunmalı
4. WHEN kullanıcı uyarıya rağmen devam etmek isterse THEN sistem SHALL işleme izin vermeli

### Requirement 6: Form Metadata Yapısı

**User Story:** Sistem yöneticisi olarak, form bilgilerini veritabanında yönetmek istiyorum, böylece yeni form eklemek için kod değişikliği gerekmez.

#### Acceptance Criteria

1. WHEN yeni form eklendiğinde THEN sistem SHALL code, procedureType, hasJudgment, needsMortgage, topic, requiredDocuments, defaultWorkflow alanlarını desteklemeli
2. WHEN form listesi yüklendiğinde THEN sistem SHALL metadata'yı veritabanından veya config dosyasından okumalı
3. WHEN form metadata güncellendiğinde THEN sistem SHALL değişiklikleri uygulama yeniden başlatılmadan yansıtmalı
