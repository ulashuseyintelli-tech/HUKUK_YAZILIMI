# High-Risk Action Matrix

> **Phase 0 Deliverable** - CPE Rollout Constitution
> 
> Bu doküman, her ActionCode için risk seviyesi, fail mode, lock gereksinimleri ve CPE zorunluluğunu tanımlar.
> Bu matris, CPE implementasyonunun "anayasası"dır - istisnası yoktur.

## Matrix Legend

| Alan | Açıklama |
|------|----------|
| **Risk Level** | `HIGH`: Geri alınamaz/mali etki, `MEDIUM`: Hukuki sonuç, `LOW`: Sadece sorgu |
| **Fail Mode** | `CLOSED`: Hata durumunda blokla, `OPEN`: Hata durumunda izin ver + uyar |
| **Resolver Failure Mode** | `FAIL_CLOSED`: Context çözümlenemezse blokla, `FAIL_OPEN`: Devam et + uyar, `SOFT_BLOCK`: Uyarı göster ama devam ettir |
| **Lock Required** | `YES`: Distributed lock gerekli, `NO`: Lock gerekmez |
| **Lock Scope** | `CASE`, `DEBTOR`, `ASSET`, `NONE` |
| **Gate Severity** | `HARD`: Koşul sağlanmazsa blokla, `SOFT`: Uyar ama izin ver |
| **@CpeRequired** | `MANDATORY`: Decorator zorunlu, `OPTIONAL`: Opsiyonel |

---

## HIGH Risk Actions

### UYAP_SEND

| Alan | Değer |
|------|-------|
| **ActionCode** | `UYAP_SEND` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | CASE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | UYAP'a gönderim geri alınamaz. Masraf ödenmeden, vekalet olmadan yapılamaz. |

**Gates:**
- `EXPENSE_BLOCKING`: Ödenmemiş masraf varsa blokla
- `POA_VALID`: Geçerli vekalet yoksa blokla
- `CASE_ACTIVE`: Dosya kapalıysa blokla

---

### TRIGGER_HACIZ

| Alan | Değer |
|------|-------|
| **ActionCode** | `TRIGGER_HACIZ` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | ASSET |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | ASSET |
| **Notes** | Haciz işlemi kritik, geri alınamaz. Kesinleşme olmadan yapılamaz. |

**Gates:**
- `CASE_FINALIZED`: Kesinleşme olmadan haciz yapılamaz
- `ASSET_VALID`: Varlık bilgisi doğrulanmalı
- `DEBTOR_NOTIFIED`: Borçluya tebligat yapılmış olmalı

---

### REQUEST_ENFORCEMENT

| Alan | Değer |
|------|-------|
| **ActionCode** | `REQUEST_ENFORCEMENT` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | CASE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | İcra takibi başlatma, hukuki süreç başlatır. |

**Gates:**
- `NOTIFICATION_EXPIRED`: Tebligat süresi dolmuş olmalı
- `NO_OBJECTION`: İtiraz yoksa devam
- `NO_PAYMENT`: Ödeme yapılmamışsa devam

---

### CLOSE_CASE

| Alan | Değer |
|------|-------|
| **ActionCode** | `CLOSE_CASE` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | CASE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | Dosya kapanışı geri alınabilir ama dikkatli olunmalı. |

**Gates:**
- `FULL_PAYMENT`: Tam ödeme alınmış olmalı VEYA
- `MANUAL_CLOSE_REASON`: Manuel kapanış nedeni belirtilmeli

---

### REQUEST_SALE

| Alan | Değer |
|------|-------|
| **ActionCode** | `REQUEST_SALE` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | ASSET |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | ASSET |
| **Notes** | Satış talebi kritik, varlık üzerinde işlem başlatır. |

**Gates:**
- `ASSET_SEIZED`: Varlık hacizli olmalı
- `SEIZURE_PERIOD_PASSED`: Haciz süresi geçmiş olmalı

---

### SEND_NOTIFICATION

| Alan | Değer |
|------|-------|
| **ActionCode** | `SEND_NOTIFICATION` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | DEBTOR |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | DEBTOR |
| **Notes** | Tebligat hukuki süreç başlatır, geri alınamaz. |

**Gates:**
- `DEBTOR_ADDRESS_VALID`: Geçerli adres olmalı
- `EXPENSE_PAID`: Tebligat masrafı ödenmeli

---

### SEND_PAYMENT_ORDER

| Alan | Değer |
|------|-------|
| **ActionCode** | `SEND_PAYMENT_ORDER` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | CASE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | Ödeme emri gönderimi hukuki süreç başlatır. |

**Gates:**
- `ARTICLE_4_REQUEST`: 4. madde talebi yapılmış olmalı
- `CASE_SUBMITTED`: Dosya UYAP'a gönderilmiş olmalı

---

### EVICTION_REQUEST

| Alan | Değer |
|------|-------|
| **ActionCode** | `EVICTION_REQUEST` |
| **Risk Level** | 🔴 HIGH |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | YES |
| **Lock Scope** | CASE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | Tahliye talebi kritik hukuki işlem. |

**Gates:**
- `RENTAL_CASE`: Kira takibi olmalı
- `PAYMENT_PERIOD_EXPIRED`: 30 günlük ödeme süresi dolmuş olmalı

---

## MEDIUM Risk Actions

### REQUEST_EXPENSE

| Alan | Değer |
|------|-------|
| **ActionCode** | `REQUEST_EXPENSE` |
| **Risk Level** | 🟡 MEDIUM |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | Masraf talebi müvekkile maliyet oluşturur. |

**Gates:**
- `CASE_ACTIVE`: Dosya aktif olmalı
- `CLIENT_VALID`: Müvekkil bilgisi geçerli olmalı

---

### SEND_DEBTOR_MSG

| Alan | Değer |
|------|-------|
| **ActionCode** | `SEND_DEBTOR_MSG` |
| **Risk Level** | 🟡 MEDIUM |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | DEBTOR |
| **Notes** | Borçluya mesaj hukuki sonuç doğurabilir. |

**Gates:**
- `DEBTOR_CONTACT_VALID`: Geçerli iletişim bilgisi olmalı
- `ADDRESS_SOURCE_NOT_CLIENT`: Adres kaynağı müvekkil değilse gönderilmez

---

### NOTIFICATION_DELIVERED

| Alan | Değer |
|------|-------|
| **ActionCode** | `NOTIFICATION_DELIVERED` |
| **Risk Level** | 🟡 MEDIUM |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | SOFT_BLOCK |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | DEBTOR |
| **Notes** | Tebligat teslim kaydı, süre hesabını başlatır. |

**Gates:**
- `NOTIFICATION_SENT`: Tebligat gönderilmiş olmalı

---

### ARCHIVE_CASE

| Alan | Değer |
|------|-------|
| **ActionCode** | `ARCHIVE_CASE` |
| **Risk Level** | 🟡 MEDIUM |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | Arşivleme geri alınabilir ama dikkatli olunmalı. |

**Gates:**
- `CASE_CLOSED`: Dosya kapalı olmalı

---

### CONVERT_FROM_MTS

| Alan | Değer |
|------|-------|
| **ActionCode** | `CONVERT_FROM_MTS` |
| **Risk Level** | 🟡 MEDIUM |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | SOFT_BLOCK |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | HARD |
| **@CpeRequired** | OPTIONAL |
| **Scope** | CASE |
| **Notes** | MTS'den normal takibe dönüşüm. |

**Gates:**
- `IS_MTS_CASE`: MTS dosyası olmalı

---

### PROCEED_TO_ENFORCEMENT

| Alan | Değer |
|------|-------|
| **ActionCode** | `PROCEED_TO_ENFORCEMENT` |
| **Risk Level** | 🟡 MEDIUM |
| **Fail Mode** | CLOSED |
| **Resolver Failure Mode** | FAIL_CLOSED |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | HARD |
| **@CpeRequired** | MANDATORY |
| **Scope** | CASE |
| **Notes** | Kesinleşme aşamasına geçiş. |

**Gates:**
- `NOTIFICATION_EXPIRED`: Tebligat süresi dolmuş olmalı
- `NO_OBJECTION`: İtiraz olmamalı

---

## LOW Risk Actions

### UYAP_QUERY

| Alan | Değer |
|------|-------|
| **ActionCode** | `UYAP_QUERY` |
| **Risk Level** | 🟢 LOW |
| **Fail Mode** | OPEN |
| **Resolver Failure Mode** | FAIL_OPEN |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | SOFT |
| **@CpeRequired** | OPTIONAL |
| **Scope** | CASE |
| **Notes** | Sadece sorgu, yan etkisi yok. |

**Gates:** Yok (sadece loglama)

---

### QUERY_ASSETS

| Alan | Değer |
|------|-------|
| **ActionCode** | `QUERY_ASSETS` |
| **Risk Level** | 🟢 LOW |
| **Fail Mode** | OPEN |
| **Resolver Failure Mode** | FAIL_OPEN |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | SOFT |
| **@CpeRequired** | OPTIONAL |
| **Scope** | DEBTOR |
| **Notes** | Varlık sorgulama, yan etkisi yok. |

**Gates:** Yok (sadece loglama)

---

### QUERY_BANK_ACCOUNTS

| Alan | Değer |
|------|-------|
| **ActionCode** | `QUERY_BANK_ACCOUNTS` |
| **Risk Level** | 🟢 LOW |
| **Fail Mode** | OPEN |
| **Resolver Failure Mode** | FAIL_OPEN |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | SOFT |
| **@CpeRequired** | OPTIONAL |
| **Scope** | DEBTOR |
| **Notes** | Banka hesabı sorgulama, yan etkisi yok. |

**Gates:** Yok (sadece loglama)

---

### ADD_NAFAKA_PERIOD

| Alan | Değer |
|------|-------|
| **ActionCode** | `ADD_NAFAKA_PERIOD` |
| **Risk Level** | 🟢 LOW |
| **Fail Mode** | OPEN |
| **Resolver Failure Mode** | FAIL_OPEN |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | SOFT |
| **@CpeRequired** | OPTIONAL |
| **Scope** | CASE |
| **Notes** | Nafaka dönemi ekleme, düzeltilebilir. |

**Gates:**
- `IS_NAFAKA_CASE`: Nafaka dosyası olmalı (SOFT)

---

### UPDATE_EXCHANGE_RATE

| Alan | Değer |
|------|-------|
| **ActionCode** | `UPDATE_EXCHANGE_RATE` |
| **Risk Level** | 🟢 LOW |
| **Fail Mode** | OPEN |
| **Resolver Failure Mode** | FAIL_OPEN |
| **Lock Required** | NO |
| **Lock Scope** | NONE |
| **Gate Severity** | SOFT |
| **@CpeRequired** | OPTIONAL |
| **Scope** | CASE |
| **Notes** | Kur güncelleme, düzeltilebilir. |

**Gates:**
- `IS_DOVIZ_CASE`: Döviz dosyası olmalı (SOFT)

---

## Summary Matrix

| ActionCode | Risk | Fail Mode | Resolver Fail | Lock | Gate | @CpeRequired |
|------------|------|-----------|---------------|------|------|--------------|
| `UYAP_SEND` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/CASE | HARD | MANDATORY |
| `TRIGGER_HACIZ` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/ASSET | HARD | MANDATORY |
| `REQUEST_ENFORCEMENT` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/CASE | HARD | MANDATORY |
| `CLOSE_CASE` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/CASE | HARD | MANDATORY |
| `REQUEST_SALE` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/ASSET | HARD | MANDATORY |
| `SEND_NOTIFICATION` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/DEBTOR | HARD | MANDATORY |
| `SEND_PAYMENT_ORDER` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/CASE | HARD | MANDATORY |
| `EVICTION_REQUEST` | 🔴 HIGH | CLOSED | FAIL_CLOSED | YES/CASE | HARD | MANDATORY |
| `REQUEST_EXPENSE` | 🟡 MEDIUM | CLOSED | FAIL_CLOSED | NO | HARD | MANDATORY |
| `SEND_DEBTOR_MSG` | 🟡 MEDIUM | CLOSED | FAIL_CLOSED | NO | HARD | MANDATORY |
| `NOTIFICATION_DELIVERED` | 🟡 MEDIUM | CLOSED | SOFT_BLOCK | NO | HARD | MANDATORY |
| `ARCHIVE_CASE` | 🟡 MEDIUM | CLOSED | FAIL_CLOSED | NO | HARD | MANDATORY |
| `CONVERT_FROM_MTS` | 🟡 MEDIUM | CLOSED | SOFT_BLOCK | NO | HARD | OPTIONAL |
| `PROCEED_TO_ENFORCEMENT` | 🟡 MEDIUM | CLOSED | FAIL_CLOSED | NO | HARD | MANDATORY |
| `UYAP_QUERY` | 🟢 LOW | OPEN | FAIL_OPEN | NO | SOFT | OPTIONAL |
| `QUERY_ASSETS` | 🟢 LOW | OPEN | FAIL_OPEN | NO | SOFT | OPTIONAL |
| `QUERY_BANK_ACCOUNTS` | 🟢 LOW | OPEN | FAIL_OPEN | NO | SOFT | OPTIONAL |
| `ADD_NAFAKA_PERIOD` | 🟢 LOW | OPEN | FAIL_OPEN | NO | SOFT | OPTIONAL |
| `UPDATE_EXCHANGE_RATE` | 🟢 LOW | OPEN | FAIL_OPEN | NO | SOFT | OPTIONAL |

---

## Implementation Notes

### Lock Strategy

```typescript
// HIGH risk actions için lock key formatı
const lockKey = `cpe:decision:${caseId}:${scope}:${contextId}`;

// Lock TTL: 30 saniye
// Wait timeout: 5 saniye
```

### Fail Mode Implementation

```typescript
// FAIL_CLOSED (HIGH risk)
if (error && riskLevel === 'HIGH') {
  return { allowed: false, code: 'SYSTEM_ERROR_BLOCKED', reason: 'Güvenlik nedeniyle engellendi' };
}

// FAIL_OPEN (LOW risk)
if (error && riskLevel === 'LOW') {
  return { allowed: true, code: 'OK_WITH_WARNING', warnings: ['Bazı kontroller yapılamadı'] };
}
```

### Resolver Failure Handling

```typescript
// FAIL_CLOSED
if (resolverError && resolverFailureMode === 'FAIL_CLOSED') {
  throw new ForbiddenException('Context çözümlenemedi');
}

// FAIL_OPEN
if (resolverError && resolverFailureMode === 'FAIL_OPEN') {
  logger.warn('Resolver error, continuing with undefined context');
  context = undefined;
}

// SOFT_BLOCK
if (resolverError && resolverFailureMode === 'SOFT_BLOCK') {
  return { allowed: true, warnings: ['Context çözümlenemedi, dikkatli olun'] };
}
```

---

## Sonraki Adımlar

1. [x] Decision Point Inventory tamamlandı
2. [x] High-Risk Action Matrix tamamlandı
3. [ ] ActionCode enum oluştur
4. [ ] CPE module skeleton oluştur
5. [ ] İlk 5 kritik ActionCode için gate tanımları yaz

---

*Son güncelleme: 2026-01-13*
*Oluşturan: Kiro AI*
