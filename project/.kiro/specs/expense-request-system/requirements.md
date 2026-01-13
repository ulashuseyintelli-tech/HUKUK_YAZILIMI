# Requirements Document

## Introduction

Bu sistem, icra takiplerinde masraf taleplerinin otomatik oluşturulması, takibi ve ödeme kontrolünü sağlar. Masraf talebi tek bir obje olarak 3 farklı görünümde (Yapılacaklar, Finans, Müvekkil Talepleri) yönetilir. Masraf ödenmeden UYAP işlemleri ve iş akışı ilerlemez.

## Glossary

- **Expense_Request**: Müvekkilden talep edilen masraf kalemi veya kalem seti
- **Expense_Item**: Tek bir masraf kalemi (başvurma harcı, tebligat gideri vb.)
- **Expense_Set**: Belirli bir aşama için gerekli masraf kalemlerinin toplamı (açılış masrafları, haciz masrafları vb.)
- **Payment**: Müvekkilden gelen ödeme kaydı
- **Case_Gate**: Masraf ödenmeden geçilemeyen kontrol noktası
- **Expense_Status**: Masraf talebinin durumu (PENDING, PARTIAL, PAID, CANCELLED)

## Requirements

### Requirement 1: Takip Açılışında Otomatik Masraf Seti Oluşturma

**User Story:** As a hukuk bürosu çalışanı, I want takip oluşturulduğunda açılış masraflarının otomatik hesaplanmasını, so that manuel hesaplama hatası olmaz ve müvekkile hızlıca talep gönderilebilir.

#### Acceptance Criteria

1. WHEN a Case status changes from DRAFT to CREATED, THE Expense_System SHALL automatically create an Expense_Set with default opening expenses
2. THE Expense_Set SHALL include: Başvurma Harcı, Peşin Harç, Vekalet Harcı, Tebligat Gideri (1 adet varsayılan), Dosya Gideri, Vekalet Pulu
3. WHEN the Expense_Set is created, THE System SHALL calculate amounts based on current tariff rates and case principal amount
4. THE System SHALL allow operators to edit expense items before sending the request to client
5. WHEN the Expense_Set is finalized, THE System SHALL create an Expense_Request record linking all items

### Requirement 2: Masraf Talebinin Üç Görünümde Gösterimi

**User Story:** As a sistem kullanıcısı, I want masraf talebini Yapılacaklar, Finans ve Müvekkil Talepleri panellerinde görmek, so that her rol kendi perspektifinden durumu takip edebilir.

#### Acceptance Criteria

1. WHEN an Expense_Request is created, THE System SHALL display it in the Tasks panel as "Müvekkilden [set_name] talep edildi – ödeme bekleniyor"
2. WHEN an Expense_Request is created, THE System SHALL display it in the Finance panel as a receivable item with itemized breakdown
3. WHEN an Expense_Request is created, THE System SHALL display it in the Client Requests panel with payment instructions (IBAN, description)
4. WHEN the Expense_Status changes, THE System SHALL update all three views simultaneously
5. THE Finance view SHALL show: total amount, paid amount, remaining amount, and payment history

### Requirement 3: Ödeme Kaydı ve Masraf Durumu Güncelleme

**User Story:** As a muhasebe personeli, I want müvekkilden gelen ödemeleri masraf talebine eşleştirmek, so that masraf durumu otomatik güncellenir.

#### Acceptance Criteria

1. WHEN a Payment is recorded for a Case, THE System SHALL attempt to match it with open Expense_Requests
2. WHEN a Payment partially covers an Expense_Request, THE System SHALL update status to PARTIAL and record the paid amount
3. WHEN a Payment fully covers an Expense_Request, THE System SHALL update status to PAID and close the request
4. WHEN an Expense_Request status changes to PAID, THE System SHALL automatically complete the related task in Tasks panel
5. THE System SHALL maintain a payment history showing all payments applied to each Expense_Request

### Requirement 4: Masraf Gate - UYAP ve İş Akışı Kilidi

**User Story:** As a sistem yöneticisi, I want masraf ödenmeden UYAP işlemlerinin yapılamamasını, so that büro alacağı güvence altına alınır.

#### Acceptance Criteria

1. WHILE an Expense_Request with gate_type=BLOCKING has status PENDING or PARTIAL, THE System SHALL prevent UYAP submission for the Case
2. WHEN a user attempts UYAP action on a blocked Case, THE System SHALL display "Masraf ödenmeden bu işlem yapılamaz" message
3. WHEN all BLOCKING Expense_Requests are PAID, THE System SHALL automatically unlock UYAP actions
4. THE System SHALL update Case status to "UYAP'a Gönderilebilir" when gate is cleared
5. IF an Expense_Request is marked as NON_BLOCKING, THEN THE System SHALL allow workflow to continue regardless of payment status

### Requirement 5: Sonradan Doğan Masraflar (İkinci Dalga)

**User Story:** As a icra takip uzmanı, I want süreç içinde doğan yeni masrafları (yeniden tebligat, haciz, satış) ayrı talep olarak oluşturmak, so that her masraf grubu bağımsız takip edilir.

#### Acceptance Criteria

1. WHEN a workflow stage requires additional expenses (e.g., RE_NOTIFICATION, SEIZURE, SALE), THE System SHALL create a new Expense_Set
2. THE new Expense_Set SHALL be independent from previous sets but linked to the same Case
3. WHEN a new Expense_Request is created, THE System SHALL send notification to client with itemized list
4. THE System SHALL support predefined expense templates for common stages: Yeniden Tebligat, İlan Gideri, Haciz Masrafları, Satış Giderleri
5. WHEN creating a new Expense_Request, THE operator SHALL be able to select from templates or create custom items

### Requirement 6: Müvekkile Masraf Talebi Bildirimi

**User Story:** As a müvekkil, I want masraf taleplerini e-posta ile almak ve detayları görmek, so that ne için ödeme yapacağımı bilirim.

#### Acceptance Criteria

1. WHEN an Expense_Request is finalized, THE System SHALL send an email to the client with itemized expense list
2. THE email SHALL include: Case file number, expense item names and amounts, total amount, payment IBAN, payment description/reference
3. THE email SHALL include a deadline for payment (configurable, default 5 business days)
4. WHEN payment deadline approaches (2 days before), THE System SHALL send a reminder email
5. IF payment is not received after deadline, THE System SHALL create a manual follow-up task for the operator

### Requirement 7: Masraf Kalemi Şablonları ve Tarife Entegrasyonu

**User Story:** As a sistem yöneticisi, I want masraf kalemlerinin güncel tarifelerden otomatik hesaplanmasını, so that manuel hesaplama hatası olmaz.

#### Acceptance Criteria

1. THE System SHALL maintain a tariff table with current rates for: court fees, notification costs, stamp duties
2. WHEN calculating Başvurma Harcı, THE System SHALL use the formula based on principal amount and current tariff
3. WHEN calculating Peşin Harç, THE System SHALL use the formula based on principal amount and current tariff
4. THE System SHALL allow manual override of calculated amounts with audit logging
5. WHEN tariff rates change, THE System SHALL use the rate valid at the time of expense creation

### Requirement 8: Masraf Raporu ve Özet Görünümü

**User Story:** As a büro yöneticisi, I want dosya bazında masraf özetini görmek, so that müvekkil bakiyesini ve alacağımı takip edebilirim.

#### Acceptance Criteria

1. THE System SHALL display a summary showing: Total expenses requested, Total paid, Total outstanding
2. THE Finance panel SHALL show expense history with status indicators (paid/pending/partial)
3. WHEN viewing Case detail, THE System SHALL show client balance (payments received - expenses incurred)
4. THE System SHALL support filtering expenses by: status, date range, expense type
5. THE System SHALL generate expense reports exportable to Excel/PDF

