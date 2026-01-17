# Requirements Document

## Introduction

Explainable Full Policy Preview - Kullanıcıya "neden PASS/WARN/BLOCK" sorusunun cevabını veren, şeffaf ve kanıtlanabilir policy açıklama katmanı.

Phase 6A'nın ilk ve tek giriş noktası. Küçük ama asil bir adım.

## Scope

**In Scope:**
- Sadece `/calc/preview/light` endpoint'i (preview)
- Sadece softCheck sonuçlarının açıklanması
- Sadece backend explanation generation
- Sadece Türkçe açıklamalar (MVP)

**Out of Scope (Non-Goals):**
- Production hesaplama kararlarını ETKİLEMEZ
- Hard policy enforcement DEĞİL (sadece açıklama)
- Multi-language support (Phase 6A sonrası)
- Explanation caching (Phase 6A sonrası)
- Custom explanation templates (Phase 6A sonrası)
- Frontend UI components (ayrı task)

## Glossary

- **Policy_Engine**: Hukuki kuralları değerlendiren ve PASS/WARN/BLOCK kararı veren motor
- **Explanation**: Bir policy kararının arkasındaki gerekçelerin insan-okunabilir açıklaması
- **Reason_Code**: Policy kararının teknik kodu (örn: STATUTE_OF_LIMITATIONS, INVALID_CLAIM_TYPE)
- **Evidence**: Kararı destekleyen kanıt objesi (trace'e yazılır)
- **Explanation_Service**: Reason code'ları insan-okunabilir açıklamalara çeviren servis
- **Fallback_Explanation**: Bilinmeyen reason code için kullanılan varsayılan açıklama

## Requirements

### Requirement 1: Policy Explanation Generation

**User Story:** As a user, I want to understand why my calculation received a specific policy outcome, so that I can take appropriate action.

#### Acceptance Criteria

1. WHEN a policy check returns BLOCK, THE Explanation_Service SHALL generate a human-readable explanation for each reason code
2. WHEN a policy check returns WARN, THE Explanation_Service SHALL generate a human-readable explanation with suggested actions
3. WHEN a policy check returns PASS, THE Explanation_Service SHALL return an empty explanations array (no detailed breakdown needed)
4. THE Explanation_Service SHALL generate Turkish language explanations

### Requirement 2: Reason Code Registry

**User Story:** As a developer, I want reason codes mapped to explanations, so that the system provides consistent messaging.

#### Acceptance Criteria

1. THE Reason_Code_Registry SHALL be a static mapping with the following structure:
   ```typescript
   interface ReasonCodeEntry {
     code: string;                    // e.g., 'STATUTE_OF_LIMITATIONS'
     messageKey: string;              // i18n key for future
     messageTr: string;               // Turkish message
     severity: 'INFO' | 'WARNING' | 'ERROR';
     suggestedAction: string;         // Turkish action text
     sourceRule?: string;             // Optional: which policy rule
   }
   ```
2. WHEN an unknown reason code is encountered, THE Explanation_Service SHALL return a fallback explanation:
   - code: original unknown code
   - messageTr: "Bu kural hakkında detaylı bilgi mevcut değil."
   - severity: 'WARNING'
   - suggestedAction: "Lütfen destek ekibiyle iletişime geçin."
3. THE Reason_Code_Registry SHALL include at minimum these codes for MVP:
   - STATUTE_OF_LIMITATIONS
   - INVALID_CLAIM_TYPE
   - AMOUNT_EXCEEDS_LIMIT
   - MISSING_REQUIRED_FIELD
   - DATE_RANGE_INVALID

### Requirement 3: Explanation Format (UX Contract)

**User Story:** As a frontend developer, I want a stable explanation format, so that I can reliably display policy feedback.

#### Acceptance Criteria

1. EACH explanation in the response SHALL have this exact structure:
   ```typescript
   interface PolicyExplanation {
     reasonCode: string;              // Original reason code
     message: string;                 // Human-readable message (Turkish)
     severity: 'INFO' | 'WARNING' | 'ERROR';
     suggestedAction: string;         // What user should do
     sourceRule?: string;             // Which policy rule triggered this
   }
   ```
2. THE explanations array SHALL be ordered by severity: ERROR first, then WARNING, then INFO
3. IF policy outcome is PASS, THE explanations array SHALL be empty `[]` (not null, not undefined)
4. IF policy outcome is BLOCK or WARN, THE explanations array SHALL contain at least one item

### Requirement 4: Trace Evidence Integration

**User Story:** As an operator, I want policy explanations recorded in traces, so that I can audit decisions.

#### Acceptance Criteria

1. WHEN explanations are generated, THE Trace_Collector SHALL emit a `POLICY_EXPLANATION_GENERATED` event
2. THE trace event payload SHALL include:
   ```typescript
   interface PolicyExplanationTraceEvent {
     eventType: 'POLICY_EXPLANATION_GENERATED';
     timestamp: string;               // ISO 8601
     policyOutcome: 'PASS' | 'WARN' | 'BLOCK';
     explanationCount: number;
     reasonCodes: string[];           // List of codes (no messages - too verbose)
     severityCounts: {
       error: number;
       warning: number;
       info: number;
     };
     fallbackUsed: boolean;           // True if any unknown code was encountered
   }
   ```
3. THE trace event SHALL NOT include full explanation messages (too verbose for trace storage)
4. THE trace event SHALL NOT include any PII (debtor names, TCKN, addresses, phone, email)
5. WHEN explanation generation fails, THE Trace_Collector SHALL emit a `POLICY_EXPLANATION_FAILED` event with error details

### Requirement 5: Response Enhancement

**User Story:** As a frontend developer, I want policy explanations in the preview response, so that I can display them to users.

#### Acceptance Criteria

1. THE CalcPreviewResponse.policy object SHALL be enhanced with:
   ```typescript
   interface PolicyPreviewData {
     outcome: 'PASS' | 'WARN' | 'BLOCK';
     reasons: PolicyReason[];         // Existing
     explanations: PolicyExplanation[]; // NEW
   }
   ```
2. THE explanations field SHALL always be present (never null/undefined)
3. THE explanations field SHALL be an array (empty if PASS, populated if WARN/BLOCK)

### Requirement 6: Invariant - Explanation Completeness

**User Story:** As a system architect, I want every BLOCK decision to have at least one explanation, so that users are never left without guidance.

#### Acceptance Criteria

1. IF policy outcome is BLOCK AND explanations array would be empty, THEN THE Explanation_Service SHALL add a fallback explanation:
   - reasonCode: 'UNKNOWN_BLOCK_REASON'
   - message: "İşlem engellenmiştir. Detaylı bilgi için destek ekibiyle iletişime geçin."
   - severity: 'ERROR'
   - suggestedAction: "Destek talebi oluşturun veya 0850 XXX XX XX numaralı hattı arayın."
2. WHEN fallback explanation is used, THE System SHALL emit a `calc_preview_explanation_fallback_used` metric
3. THE invariant "BLOCK → explanations.length > 0" SHALL be enforced at runtime
4. IF the invariant is violated (should never happen), THE System SHALL log CRITICAL and still return the fallback

### Requirement 7: Degraded Mode Behavior

**User Story:** As a system operator, I want the system to gracefully handle explanation failures, so that preview still works.

#### Acceptance Criteria

1. IF Explanation_Service fails, THE CalcPreviewService SHALL still return the policy outcome (PASS/WARN/BLOCK)
2. IF Explanation_Service fails, THE explanations array SHALL contain a single degraded explanation:
   - reasonCode: 'EXPLANATION_SERVICE_UNAVAILABLE'
   - message: "Açıklama servisi geçici olarak kullanılamıyor."
   - severity: 'WARNING'
   - suggestedAction: "Lütfen daha sonra tekrar deneyin."
3. THE preview response SHALL include `explanationsDegraded: true` flag when this occurs
4. THE System SHALL emit a `calc_preview_explanation_degraded` metric

## Non-Goals (Explicit)

Bu fazda YAPILMAYACAKLAR:

1. **Production kararlarını değiştirmek** - Bu sadece açıklama katmanı, karar mekanizması DEĞİL
2. **Explanation caching** - Her request'te fresh generation (MVP basitliği)
3. **Multi-language** - Sadece Türkçe (i18n altyapısı hazır ama aktif değil)
4. **Custom templates** - Tenant-specific açıklamalar yok
5. **Explanation history** - Geçmiş açıklamaları saklamak yok (trace'de var zaten)
6. **Frontend components** - Bu spec sadece backend; UI ayrı task
7. **Explanation analytics** - Hangi açıklama ne kadar gösterildi (Phase 6A sonrası)
