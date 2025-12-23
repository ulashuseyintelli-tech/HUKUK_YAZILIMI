# Requirements Document

## Introduction

Bu doküman, hukuk yazılımının en kritik modülü olan **Borçlu Yönetim Sistemi**'nin gereksinimlerini tanımlar. Modül, icra takiplerinde borçlu kayıtlarının oluşturulması, yönetilmesi, tebligat süreçleri, üçüncü şahıs (89 ihbarname) işlemleri ve tahsilat iletişimini kapsar.

Sistem, İcra ve İflas Kanunu (İİK) hükümlerine uygun olarak tasarlanmıştır ve UYAP entegrasyonuna hazır altyapı sunar.

## Glossary

- **Debtor (Borçlu)**: İcra takibinde borçlu olarak yer alan gerçek veya tüzel kişi
- **CaseDebtor (Dosya Borçlusu)**: Bir borçlunun belirli bir icra dosyasındaki kaydı ve rolü
- **Master Borçlu**: Sistemde tek seferlik oluşturulan, tüm dosyalarda kullanılabilen borçlu kaydı
- **DETSİS**: Devlet Teşkilatı Merkezi Kayıt Sistemi - Kamu kurumlarının benzersiz kimlik numarası
- **TCKN**: TC Kimlik Numarası (11 haneli)
- **VKN**: Vergi Kimlik Numarası (10 haneli)
- **MERSİS**: Merkezi Sicil Kayıt Sistemi - Şirketlerin benzersiz numarası
- **KEP**: Kayıtlı Elektronik Posta
- **UETS**: Ulusal Elektronik Tebligat Sistemi
- **89 İhbarname**: İİK md. 89'a göre üçüncü şahıslara gönderilen haciz ihbarnamesi
- **Aval**: Kambiyo senedinde kefalet veren kişi
- **Ciranta**: Kambiyo senedini ciro eden kişi
- **Müteselsil Borçlu**: Borcun tamamından sorumlu olan borçlu
- **Tebligat**: Resmi bildirimin borçluya ulaştırılması işlemi

## Requirements

### Requirement 1: Borçlu Türleri ve Kimlik Yönetimi

**User Story:** As a icra takip uzmanı, I want to farklı türdeki borçluları (şahıs, şirket, kamu kurumu) doğru kimlik bilgileriyle kaydetmek, so that I can yasal süreçlerde doğru tarafları takip edebilirim.

#### Acceptance Criteria

1. WHEN a user creates a new debtor THEN the System SHALL require selection of debtor type from: PERSON (Gerçek Kişi), COMPANY (Tüzel Kişi/Şirket), PUBLIC_INSTITUTION (Kamu Kurumu)
2. WHEN debtor type is PERSON THEN the System SHALL require firstName, lastName, and TCKN (11 digits) as mandatory fields
3. WHEN debtor type is COMPANY THEN the System SHALL require companyName, VKN (10 digits), taxOffice, and optionally MERSİS number
4. WHEN debtor type is PUBLIC_INSTITUTION THEN the System SHALL require institutionName, DETSİS number, and institution type (Bakanlık, Belediye, Üniversite, KİT, vb.)
5. WHEN a TCKN, VKN, or DETSİS number already exists in the system THEN the System SHALL warn the user about duplicate and offer to use existing record
6. WHEN user enters identity number THEN the System SHALL validate format (TCKN: 11 digits, VKN: 10 digits, DETSİS: valid format)

### Requirement 2: Çoklu Adres Yönetimi

**User Story:** As a icra takip uzmanı, I want to borçlu için birden fazla adres kaydedip tebligat için öncelik belirlemek, so that I can tebligatların doğru adrese ulaşmasını sağlayabilirim.

#### Acceptance Criteria

1. WHEN a user adds an address to a debtor THEN the System SHALL store: street address, city, district, postal code, address type (Ev, İş, Tebligat, MERNİS, KEP), and priority order
2. WHEN multiple addresses exist THEN the System SHALL allow user to mark one address as primary notification address
3. WHEN debtor type is COMPANY or PUBLIC_INSTITUTION THEN the System SHALL also store KEP address field
4. WHEN user creates a CaseDebtor record THEN the System SHALL allow selection of which address to use for notifications in that specific case
5. WHEN address is marked as MERNİS address THEN the System SHALL display a visual indicator showing it's the official registered address

### Requirement 3: Dosya Borçlusu ve Rol Yönetimi

**User Story:** As a avukat, I want to aynı borçluyu farklı dosyalarda farklı rollerle ekleyebilmek, so that I can her dosyada borçlunun hukuki sorumluluğunu doğru tanımlayabilirim.

#### Acceptance Criteria

1. WHEN a user adds a debtor to a case THEN the System SHALL require selection of debtor role from: ASIL_BORCLU, MUSETEREK_BORCLU, ADI_KEFIL, MUTESELSIL_KEFIL, AVAL, CIRANTA, LEHDAR, KESIDECI, MUHATAP, MIRASCI, TASFIYE_MEMURU, IFLAS_MASASI
2. WHEN a debtor is added to a case THEN the System SHALL allow specification of liability amount and liability type (TAM, KISMI, SINIRLI)
3. WHEN a debtor has a legal representative (vekil) THEN the System SHALL allow linking to a lawyer record from the system
4. WHEN same debtor is added to same case with different role THEN the System SHALL create separate CaseDebtor records for each role
5. WHEN user views case debtors THEN the System SHALL display role-specific icons and color coding for quick identification

### Requirement 4: Tebligat Modu ve Otomatik Tebligat Oluşturma

**User Story:** As a icra takip uzmanı, I want to borçlu eklendiğinde otomatik tebligat kaydı oluşturulmasını, so that I can tebligat sürecini hızlandırabilirim.

#### Acceptance Criteria

1. WHEN a user adds a debtor to a case THEN the System SHALL allow selection of notification mode: NORMAL (PTT), KEP, UETS, ILANEN (İlanen Tebligat)
2. WHEN "auto-create notification" option is enabled THEN the System SHALL automatically create a notification record with status PENDING when debtor is added
3. WHEN notification mode is KEP or UETS THEN the System SHALL validate that debtor has a valid KEP address
4. WHEN notification mode is ILANEN THEN the System SHALL require justification text explaining why normal notification failed
5. WHEN debtor is added THEN the System SHALL display a checkbox "Tebligat Hazırla" defaulting to checked

### Requirement 5: AI/OCR Evrak Tarama ve Borçlu Tespiti

**User Story:** As a avukat, I want to borç evraklarını (fatura, çek, senet, kira sözleşmesi) tarayarak borçlu bilgilerini otomatik çıkarmak, so that I can manuel veri girişi süresini azaltabilirim.

#### Acceptance Criteria

1. WHEN a user uploads a debt document THEN the System SHALL accept PDF, JPG, PNG, TIFF formats up to 10MB
2. WHEN document is uploaded THEN the System SHALL classify document type: FATURA, CEK, BONO_SENET, KIRA_SOZLESMESI, CARI_HESAP, TAAHHUTNAME, ILAM
3. WHEN document is processed THEN the System SHALL extract: debtor name/company, identity number (if visible), address, due date, amount, currency, document number
4. WHEN extraction is complete THEN the System SHALL display results with confidence score (HIGH >80%, MEDIUM 50-80%, LOW <50%)
5. WHEN extracted debtor matches existing record by TCKN/VKN THEN the System SHALL suggest using existing record instead of creating new
6. WHEN multiple parties are detected (e.g., ciranta in check) THEN the System SHALL list all parties with suggested roles

### Requirement 6: Üçüncü Şahıs (89 İhbarname) Yönetimi

**User Story:** As a icra takip uzmanı, I want to borçlunun üçüncü şahıslarını (işveren, banka, kiracı) kaydetmek ve 89 ihbarname sürecini takip etmek, so that I can haciz işlemlerini etkin yönetebilirim.

#### Acceptance Criteria

1. WHEN a user adds a third party THEN the System SHALL require: party type (ISVEREN, BANKA, KIRACI, BORC_ALACAKLI, DIGER), name, address, and relation to debtor
2. WHEN third party is added THEN the System SHALL allow recording of 89/1, 89/2, 89/3 notification dates separately
3. WHEN 89 notification is sent THEN the System SHALL track response deadline (7 days for 89/1, 7 days for 89/2)
4. WHEN third party responds THEN the System SHALL allow recording of response date and content
5. WHEN response deadline passes without response THEN the System SHALL create an alert for follow-up action

### Requirement 7: Borçlu İletişim ve Tahsilat Bildirimleri

**User Story:** As a tahsilat uzmanı, I want to borçlulara SMS ve e-posta ile ödeme hatırlatmaları göndermek, so that I can tahsilat oranını artırabilirim.

#### Acceptance Criteria

1. WHEN a user initiates communication THEN the System SHALL offer channel selection: SMS, EMAIL, PHONE_CALL (log only)
2. WHEN SMS or EMAIL is selected THEN the System SHALL offer predefined templates: ODEME_HATIRLATMA_NAZIK, ODEME_HATIRLATMA_RESMI, SON_UYARI, HACIZ_ONCESI, TAKSIT_TEKLIFI
3. WHEN message is sent THEN the System SHALL log: channel, template used, content, sent timestamp, delivery status
4. WHEN user views debtor communication history THEN the System SHALL display all communications in chronological order
5. WHEN bulk communication is initiated THEN the System SHALL allow selection of multiple debtors from a case

### Requirement 8: Borçlu Arama ve Filtreleme

**User Story:** As a kullanıcı, I want to borçluları çeşitli kriterlere göre aramak ve filtrelemek, so that I can ihtiyacım olan borçlu kaydına hızlıca ulaşabilirim.

#### Acceptance Criteria

1. WHEN a user searches debtors THEN the System SHALL search across: name, identity number (TCKN/VKN/DETSİS), phone, email
2. WHEN filtering debtors THEN the System SHALL offer filters: debtor type, risk level, has active cases, city
3. WHEN displaying search results THEN the System SHALL show: name, type, identity number, active case count, last activity date
4. WHEN user clicks on a debtor THEN the System SHALL display full debtor profile with all cases and communication history

### Requirement 9: Risk Değerlendirmesi ve Etiketleme

**User Story:** As a avukat, I want to borçlulara risk etiketi atamak, so that I can tahsilat stratejisini buna göre belirleyebilirim.

#### Acceptance Criteria

1. WHEN a user views or edits a debtor THEN the System SHALL allow assignment of risk level: DUSUK, ORTA, YUKSEK, COK_YUKSEK
2. WHEN risk level is assigned THEN the System SHALL allow adding risk notes explaining the assessment
3. WHEN debtor has previous cases THEN the System SHALL display payment history summary (paid on time, delayed, never paid)
4. WHEN displaying debtor lists THEN the System SHALL show risk level with color coding (green, yellow, orange, red)

### Requirement 10: Varlık (Mal Varlığı) Kaydı

**User Story:** As a icra takip uzmanı, I want to borçlunun tespit edilen mal varlıklarını kaydetmek, so that I can haciz işlemlerini planlayabilirim.

#### Acceptance Criteria

1. WHEN a user adds an asset to a debtor THEN the System SHALL require: asset type (TASINMAZ, ARAC, BANKA_HESABI, MAAS, HISSE, DIGER), description, estimated value
2. WHEN asset type is TASINMAZ THEN the System SHALL allow entry of: ada, parsel, tapu bilgileri
3. WHEN asset type is ARAC THEN the System SHALL allow entry of: plaka, marka, model, yıl
4. WHEN asset type is BANKA_HESABI THEN the System SHALL allow entry of: banka adı, şube, IBAN (masked)
5. WHEN asset type is MAAS THEN the System SHALL allow entry of: işveren (link to third party), tahmini maaş

### Requirement 11: Kamu Kurumu Özel Alanları

**User Story:** As a avukat, I want to kamu kurumu borçluları için DETSİS ve özel bilgileri kaydetmek, so that I can kamu alacaklarını doğru takip edebilirim.

#### Acceptance Criteria

1. WHEN debtor type is PUBLIC_INSTITUTION THEN the System SHALL require DETSİS number as mandatory field
2. WHEN entering DETSİS number THEN the System SHALL validate format and optionally verify against DETSİS database (future integration)
3. WHEN debtor is PUBLIC_INSTITUTION THEN the System SHALL display institution type dropdown: BAKANLIK, BELEDIYE, IL_OZEL_IDARESI, UNIVERSITE, KIT, DIGER_KAMU
4. WHEN debtor is PUBLIC_INSTITUTION THEN the System SHALL store: institution full name, parent institution (if applicable), authorized representative name
5. WHEN searching public institutions THEN the System SHALL allow search by DETSİS number

### Requirement 12: Borçlu Detay Modalı ve Düzenleme

**User Story:** As a kullanıcı, I want to borçlu listesinde isme tıklayarak detayları görüntülemek ve düzenlemek, so that I can hızlıca bilgilere erişip güncelleyebilirim.

#### Acceptance Criteria

1. WHEN a user clicks on debtor name in any list THEN the System SHALL open a detail modal showing all debtor information
2. WHEN viewing debtor detail THEN the System SHALL display: basic info, all addresses, all cases, communication history, assets
3. WHEN user clicks edit button THEN the System SHALL switch to edit mode allowing field modifications
4. WHEN user saves changes THEN the System SHALL validate all required fields and update the record
5. WHEN debtor has active cases THEN the System SHALL warn before allowing deletion

