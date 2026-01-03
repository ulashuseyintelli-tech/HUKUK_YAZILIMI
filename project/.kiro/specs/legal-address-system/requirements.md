# Requirements Document

## Introduction

Tebligat Kanunu'na (TK) uygun, hukuki geçerliliği olan bir adres yönetim sistemi. Borçlu adreslerinin türü, kaynağı ve hukuki önceliği sistemde doğru şekilde modellenerek tebligat süreçlerinin otomasyonu ve hukuki savunma için güçlü bir altyapı sağlanacak.

## Glossary

- **Address_System**: Borçlu adreslerini yöneten ana sistem
- **MERNİS**: Merkezi Nüfus İdaresi Sistemi - Yerleşim yeri adresi kaynağı
- **MERSİS**: Merkezi Sicil Kayıt Sistemi - Tüzel kişi merkez adresi kaynağı
- **TK_21_2**: Tebligat Kanunu madde 21/2 - Bila tebligat usulü (muhtara teslim)
- **Service_Attempt**: Tek bir tebligat denemesi kaydı
- **Legal_Priority**: Adresin tebligat hukukundaki öncelik sırası

## Requirements

### Requirement 1: Adres Türleri

**User Story:** As an avukat, I want to categorize debtor addresses by legal type, so that I can apply correct notification procedures.

#### Acceptance Criteria

1. THE Address_System SHALL support the following address types:
   - MERNIS (Yerleşim Yeri - TK m.10/m.21)
   - BUSINESS_HQ (İşyeri Merkez - TK m.12/m.13)
   - BUSINESS_BRANCH (İşyeri Şube)
   - LEGAL_CENTER (Tüzel Kişi Merkez - Ticaret Sicili)
   - DECLARED (Bildirilen/Sözleşme Adresi - TK m.10/2)
   - KEP (Kayıtlı Elektronik Posta Adresi)

2. WHEN an address is created, THE Address_System SHALL require an address type selection

3. WHEN address type is MERNIS, THE Address_System SHALL mark `canApply21_2` as true

4. WHEN address type is LEGAL_CENTER, THE Address_System SHALL mark `canApply21_2` as conditional (limited)

### Requirement 2: Adres Kaynağı Takibi

**User Story:** As an avukat, I want to track where each address came from, so that I can prove the address source in legal proceedings.

#### Acceptance Criteria

1. THE Address_System SHALL track address source with the following options:
   - MERNIS (MERNİS sorgusu)
   - MERSIS (MERSİS sorgusu)
   - TICARET_SICILI (Ticaret Sicil Gazetesi)
   - CONTRACT (Sözleşme)
   - USER_INPUT (Manuel giriş)
   - UYAP (UYAP sorgusu)

2. WHEN an address source is MERNIS or MERSIS, THE Address_System SHALL mark `verified` as true

3. WHEN an address is entered manually, THE Address_System SHALL mark `verified` as false by default

### Requirement 3: Hukuki Öncelik Sıralaması

**User Story:** As an avukat, I want the system to automatically suggest the correct address for notification, so that I follow legal priority order.

#### Acceptance Criteria

1. FOR gerçek kişi (INDIVIDUAL) debtors, THE Address_System SHALL apply this priority:
   - 1st: MERNIS adresi
   - 2nd: DECLARED adresi
   - 3rd: BUSINESS adresi
   - 4th: TK 21/2 (bila/muhtara)

2. FOR tüzel kişi (COMPANY) debtors, THE Address_System SHALL apply this priority:
   - 1st: LEGAL_CENTER (Ticaret Sicili merkez)
   - 2nd: BUSINESS_BRANCH (Şube - faaliyet varsa)
   - 3rd: DECLARED adresi
   - 4th: İlan/özel usuller

3. THE Address_System SHALL display legal priority (HIGH/MEDIUM/LOW) for each address

### Requirement 4: Adres Risk Durumu

**User Story:** As an avukat, I want to see address risk flags, so that I can identify problematic addresses before notification.

#### Acceptance Criteria

1. THE Address_System SHALL support the following risk flags:
   - ADDRESS_SUSPECT (Adres şüpheli)
   - MOVED (Taşınmış)
   - CLOSED (Kapalı)
   - NOT_FOUND (Bulunamadı)
   - REFUSED (Tebellüğden imtina)

2. WHEN a notification returns with failure, THE Address_System SHALL automatically add appropriate risk flag

3. WHEN an address has risk flags, THE Address_System SHALL display warning in UI

### Requirement 5: Tebligat-Adres Bağlantısı

**User Story:** As an avukat, I want each notification attempt linked to specific address, so that I have complete legal audit trail.

#### Acceptance Criteria

1. WHEN a notification is sent, THE Service_Attempt SHALL record:
   - addressId (hangi adrese gönderildi)
   - addressType (adres türü snapshot)
   - addressText (adres metni snapshot)

2. THE Address_System SHALL display notification history per address

3. WHEN displaying notification timeline, THE Address_System SHALL show address info:
   - "29.12.2025 – MERNİS adresine tebliğ edildi"
   - "02.01.2026 – Şube adresine tebligat iade"

### Requirement 6: Çoklu Adres Yönetimi

**User Story:** As an avukat, I want to manage multiple addresses per debtor, so that I can track all known addresses.

#### Acceptance Criteria

1. THE Address_System SHALL allow multiple addresses per debtor

2. THE Address_System SHALL allow marking one address as "Aktif Tebligat Adresi"

3. WHEN a new MERNIS address is added, THE Address_System SHALL suggest it as primary

4. THE Address_System SHALL display all addresses in debtor detail with:
   - Address type icon (🏠 MERNİS, 🏢 İşyeri, ✍️ Bildirilen)
   - Legal priority badge
   - Risk flags if any
   - Last notification result

### Requirement 7: TK 21/2 Otomasyonu

**User Story:** As an avukat, I want the system to guide me through TK 21/2 process, so that I apply bila tebligat correctly.

#### Acceptance Criteria

1. WHEN notification to MERNIS address fails, THE Address_System SHALL suggest TK 21/2 option

2. THE Address_System SHALL only allow TK 21/2 for addresses where `canApply21_2` is true

3. WHEN TK 21/2 is applied, THE Address_System SHALL record:
   - Muhtar teslim tarihi
   - Kapıya yapıştırma tarihi
   - İhbarname bırakma tarihi

### Requirement 8: Adres Doğrulama

**User Story:** As an avukat, I want to verify addresses from official sources, so that I have legally valid address data.

#### Acceptance Criteria

1. THE Address_System SHALL provide "MERNİS Sorgula" button for INDIVIDUAL debtors

2. THE Address_System SHALL provide "MERSİS Sorgula" button for COMPANY debtors

3. WHEN address is fetched from official source, THE Address_System SHALL:
   - Mark as verified
   - Record query date
   - Store source reference

4. IF address differs from existing, THE Address_System SHALL show comparison and ask for confirmation
