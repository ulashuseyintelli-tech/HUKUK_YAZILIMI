# Decision Point Inventory

> **Phase 0 Deliverable** - CPE Migration Roadmap
> 
> Bu doküman, sistemdeki tüm karar noktalarını listeler ve CPE'ye taşınma planını içerir.
> Her karar noktası için: kaynak dosya, mevcut koşul, önerilen ActionCode, scope ve sınıflandırma belirtilmiştir.

## Özet

| Kategori | Sayı | Kritiklik |
|----------|------|-----------|
| Gate Kontrolleri | 5 | HIGH |
| State Transitions | 8 | HIGH |
| Rule Engine Kararları | 12 | MEDIUM |
| Controller-Level If'ler | 4 | MEDIUM |
| Frontend Kararları | 3 | LOW |
| **TOPLAM** | **32** | - |

---

## 1. ExpenseGateService Karar Noktaları

### 1.1 BLOCKING Expense Gate Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/expense-request/expense-gate.service.ts:27-47` |
| **Metod** | `checkGate(caseId)` |
| **Mevcut Koşul** | `gateType: 'BLOCKING' AND status IN ['PENDING', 'SENT', 'REMINDED', 'PARTIAL']` |
| **Önerilen ActionCode** | `UYAP_SEND`, `SEND_NOTIFICATION`, `TRIGGER_HACIZ` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |
| **Kullanım Yerleri** | `expense-request.controller.ts:202`, Frontend `ExpenseGateWarning.tsx` |

```typescript
// Mevcut karar mantığı
const blockingExpenses = await this.prisma.expenseRequest.findMany({
  where: {
    caseId,
    gateType: 'BLOCKING',
    status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] },
  },
});
return { isBlocked: blockingExpenses.length > 0 };
```

**CPE Dönüşümü:**
```typescript
// Gate tanımı (YAML → compiled)
EXPENSE_BLOCKING_GATE:
  gateCode: 'EXPENSE_BLOCKING'
  actionCodes: [UYAP_SEND, SEND_NOTIFICATION, TRIGGER_HACIZ]
  condition: facts['case.has_unpaid_blocking_expense'] === true
  severity: HARD
  reason: "Ödenmemiş masraf talebi var. UYAP işlemi yapılamaz."
```

---

### 1.2 UYAP Action Permission Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/expense-request/expense-gate.service.ts:56-66` |
| **Metod** | `canPerformUyapAction(caseId, actionType)` |
| **Mevcut Koşul** | `exemptActions.includes(actionType) OR !isBlocked` |
| **Önerilen ActionCode** | `UYAP_SEND`, `UYAP_QUERY`, `QUERY_ASSETS`, `QUERY_BANK_ACCOUNTS` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD/SOFT) |

```typescript
// Mevcut karar mantığı
const exemptActions = ['VIEW', 'QUERY', 'DOWNLOAD'];
if (exemptActions.includes(actionType.toUpperCase())) return true;
return !await this.isUyapBlocked(caseId);
```

**CPE Dönüşümü:**
- `UYAP_QUERY`, `VIEW`, `DOWNLOAD` → SOFT gate (izin ver, uyar)
- `UYAP_SEND`, `TRIGGER_HACIZ` → HARD gate (blokla)

---

### 1.3 Gate Status Summary

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/expense-request/expense-gate.service.ts:82-97` |
| **Metod** | `getGateSummary(caseId)` |
| **Mevcut Koşul** | Composite: `canSubmitToUyap`, `canSendNotification` |
| **Önerilen ActionCode** | N/A (read-only) |
| **Scope** | `CASE` |
| **Sınıflandırma** | **COMPUTED FACT** |

**CPE Dönüşümü:**
```typescript
// ComputedFactProvider
class GateSummaryProvider implements ComputedFactProvider {
  factKey = 'case.gate_summary';
  dependsOn = ['case.has_unpaid_blocking_expense'];
}
```

---

## 2. StageTriggerService Karar Noktaları

### 2.1 UYAP Prepare Trigger

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/stage-trigger/stage-trigger.service.ts:68-100` |
| **Metod** | `handleUyapPrepare(...)` |
| **Mevcut Koşul** | `balance >= computed.totalSuggested` |
| **Önerilen ActionCode** | `UYAP_SEND` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |

```typescript
// Mevcut karar mantığı
if (Number(balance.balance) >= computed.totalSuggested) {
  return { action: 'READY', caseStatus: 'READY_FOR_UYAP' };
}
return { action: 'OPEN_EXPENSE_MODAL', blockReason: '...' };
```

**CPE Dönüşümü:**
```yaml
BALANCE_SUFFICIENT_FOR_UYAP:
  gateCode: 'BALANCE_CHECK'
  actionCodes: [UYAP_SEND]
  condition: facts['case.balance'] >= facts['case.required_expense_for_uyap']
  severity: HARD
  reason: "Yetersiz bakiye. UYAP gönderimi için masraf ödenmeli."
```

---

### 2.2 Event Code Router

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/stage-trigger/stage-trigger.service.ts:42-62` |
| **Metod** | `triggerStage(...)` |
| **Mevcut Koşul** | `eventCode === 'EVT_UYAP_SEND_CLICKED'` |
| **Önerilen ActionCode** | Event-based routing → CPE `getNextActions` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **RULE** |

**CPE Dönüşümü:**
- Event routing → `CPE.getNextActions(caseId, scope)` ile değiştirilecek
- Her event için ayrı ActionCode tanımlanacak

---

## 3. RuleEngineService (rule-engine module) Karar Noktaları

### 3.1 Nafaka Period Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/rule-engine/rule-engine.service.ts:380-400` |
| **Metod** | `determineNafakaNextAction(caseData)` |
| **Mevcut Koşul** | `!thisMonthNafaka` (bu ay için nafaka eklenmemiş) |
| **Önerilen ActionCode** | `ADD_NAFAKA_PERIOD` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **RULE** |

```typescript
// Mevcut karar mantığı
const thisMonthNafaka = caseData.dues?.find((d) => 
  d.type === 'PRINCIPAL' && d.description?.includes('Nafaka') && dueDate >= firstOfMonth
);
if (!thisMonthNafaka) {
  return { action: 'ADD_NAFAKA_PERIOD', reason: '...' };
}
```

**CPE Dönüşümü:**
```yaml
# decision_rules.yaml
NAFAKA_PERIOD_DUE:
  when:
    - facts['case.sub_category'] == 'NAFAKA'
    - facts['case.current_month_nafaka_added'] == false
  then:
    actionCode: ADD_NAFAKA_PERIOD
    priority: 10
    reason: "Bu ay için nafaka dönemi henüz eklenmedi"
```

---

### 3.2 Döviz Exchange Rate Update

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/rule-engine/rule-engine.service.ts:410-430` |
| **Metod** | `determineDovizNextAction(caseData)` |
| **Mevcut Koşul** | `!lastUpdate OR daysSinceUpdate > 1` |
| **Önerilen ActionCode** | `UPDATE_EXCHANGE_RATE` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **RULE** |

---

### 3.3 General Next Action (Waiting Response)

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/rule-engine/rule-engine.service.ts:440-470` |
| **Metod** | `determineGeneralNextAction(caseData)` |
| **Mevcut Koşul** | `workflowStage === 'WAITING_RESPONSE' && deadline <= now` |
| **Önerilen ActionCode** | `PROCEED_TO_ENFORCEMENT` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

---

### 3.4 Case Status Check (Closed/Archive)

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/rule-engine/rule-engine.service.ts:365-370` |
| **Metod** | `determineNextAction(caseId)` |
| **Mevcut Koşul** | `caseStatus === 'KAPALI' OR caseStatus === 'ARSIV'` |
| **Önerilen ActionCode** | N/A (tüm aksiyonları blokla) |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |

**CPE Dönüşümü:**
```yaml
CASE_CLOSED_GATE:
  gateCode: 'CASE_CLOSED'
  actionCodes: ['*']  # Tüm aksiyonlar
  condition: facts['case.status'] IN ['KAPALI', 'ARSIV']
  severity: HARD
  reason: "Dosya kapalı veya arşivde. İşlem yapılamaz."
```

---

## 4. RuleEngine (automation module) Karar Noktaları

### 4.1 Payment Order Expiry → Enforcement

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:30-45` |
| **Metod** | `evaluateRules(context)` |
| **Mevcut Koşul** | `currentStage === WAITING_RESPONSE && daysSinceLastAction >= 10 && !hasObjection && !hasPayment` |
| **Önerilen ActionCode** | `REQUEST_ENFORCEMENT` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

```typescript
// Mevcut karar mantığı
if (
  context.currentStage === WorkflowStage.WAITING_RESPONSE &&
  context.daysSinceLastAction >= 10 &&
  !context.hasObjection &&
  !context.hasPayment
) {
  results.push({
    shouldTrigger: true,
    action: "REQUEST_ENFORCEMENT",
    nextStage: WorkflowStage.ENFORCEMENT,
  });
}
```

**CPE Dönüşümü:**
```yaml
# stage_flows.yaml
WAITING_RESPONSE:
  transitions:
    REQUEST_ENFORCEMENT:
      target: ENFORCEMENT
      conditions:
        - facts['case.days_since_notification'] >= 10
        - facts['case.has_objection'] == false
        - facts['case.has_payment'] == false
```

---

### 4.2 Enforcement → Bank Inquiry

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:48-58` |
| **Metod** | `evaluateRules(context)` |
| **Mevcut Koşul** | `currentStage === ENFORCEMENT && daysSinceLastAction >= 1` |
| **Önerilen ActionCode** | `QUERY_BANK_ACCOUNTS` |
| **Scope** | `DEBTOR` |
| **Sınıflandırma** | **RULE** |

---

### 4.3 Partial Payment Stage Update

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:62-72` |
| **Metod** | `evaluateRules(context)` |
| **Mevcut Koşul** | `hasPayment && collectedAmount < totalDebt && currentStage !== PARTIAL_PAYMENT` |
| **Önerilen ActionCode** | `UPDATE_STAGE_PARTIAL` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

---

### 4.4 Full Payment → Close Case

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:75-82` |
| **Metod** | `evaluateRules(context)` |
| **Mevcut Koşul** | `hasPayment && collectedAmount >= totalDebt` |
| **Önerilen ActionCode** | `CLOSE_CASE` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

---

### 4.5 Seizure → Sale Request

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:85-95` |
| **Metod** | `evaluateRules(context)` |
| **Mevcut Koşul** | `currentStage === SEIZURE && debtorAssets.length > 0 && daysSinceLastAction >= 7` |
| **Önerilen ActionCode** | `REQUEST_SALE` |
| **Scope** | `ASSET` |
| **Sınıflandırma** | **TRANSITION** |

---

### 4.6 Kambiyo Special Rules (5 gün)

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:110-125` |
| **Metod** | `evaluateKambiyoRules(context)` |
| **Mevcut Koşul** | `currentStage === WAITING_RESPONSE && daysSinceLastAction >= 5 && !hasObjection` |
| **Önerilen ActionCode** | `REQUEST_ENFORCEMENT` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

**Not:** Kambiyo takiplerinde 10 gün yerine 5 gün kuralı uygulanır.

---

### 4.7 Rental Eviction Rules (30 gün)

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/rule-engine.service.ts:128-140` |
| **Metod** | `evaluateRentalRules(context)` |
| **Mevcut Koşul** | `currentStage === WAITING_RESPONSE && daysSinceLastAction >= 30 && !hasPayment` |
| **Önerilen ActionCode** | `EVICTION_REQUEST` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **RULE** |

---

## 5. WorkflowEngine Karar Noktaları

### 5.1 Form Type Based Rule Selection

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/workflow-engine.service.ts:90-105` |
| **Metod** | `processCase(caseId)` |
| **Mevcut Koşul** | `formType.isKambiyo`, `formType.isRental` |
| **Önerilen ActionCode** | N/A (rule selection) |
| **Scope** | `CASE` |
| **Sınıflandırma** | **COMPUTED FACT** |

```typescript
// Mevcut karar mantığı
if (caseData.formType?.isKambiyo) {
  rules = await this.ruleEngine.evaluateKambiyoRules(context);
} else if (caseData.formType?.isRental) {
  rules = await this.ruleEngine.evaluateRentalRules(context);
} else {
  rules = await this.ruleEngine.evaluateRules(context);
}
```

**CPE Dönüşümü:**
- `facts['case.form_type']` computed fact olarak eklenecek
- Rule YAML'da `when` koşullarına form type kontrolü eklenecek

---

### 5.2 Stage to Expense Code Mapping

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/workflow-engine.service.ts:14-18` |
| **Metod** | `updateCaseStage(...)` |
| **Mevcut Koşul** | `STAGE_TO_EXPENSE_CODE[newStage]` |
| **Önerilen ActionCode** | `CREATE_STAGE_EXPENSE` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **RULE** (side effect) |

---

## 6. AutomationService Karar Noktaları

### 6.1 Automation Enabled Status Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/automation.service.ts:8-12, 40-50` |
| **Metod** | `processPendingCases()` |
| **Mevcut Koşul** | `caseStatus IN ['DERDEST', 'ISLEMDE', 'DERKENAR']` |
| **Önerilen ActionCode** | N/A (pre-filter) |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |

**CPE Dönüşümü:**
```yaml
AUTOMATION_DISABLED_GATE:
  gateCode: 'AUTOMATION_DISABLED'
  actionCodes: ['*_AUTO']  # Otomatik aksiyonlar
  condition: facts['case.status'] NOT IN ['DERDEST', 'ISLEMDE', 'DERKENAR']
  severity: HARD
  reason: "Dosya statüsü otomasyon için uygun değil."
```

---

### 6.2 UYAP Actions Allowed Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/automation.service.ts:55-58` |
| **Metod** | `processPendingCases()` |
| **Mevcut Koşul** | `!caseData.allowUyapActions` |
| **Önerilen ActionCode** | `UYAP_SEND`, `UYAP_QUERY` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |

---

### 6.3 Article 4 Request Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/automation/automation.service.ts:61-72` |
| **Metod** | `processPendingCases()` |
| **Mevcut Koşul** | `!hasArticle4Request && workflowStage === 'PAYMENT_ORDER'` |
| **Önerilen ActionCode** | `SEND_PAYMENT_ORDER` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |

**CPE Dönüşümü:**
```yaml
ARTICLE_4_REQUIRED_GATE:
  gateCode: 'ARTICLE_4_REQUIRED'
  actionCodes: [SEND_PAYMENT_ORDER]
  condition: facts['case.has_article_4_request'] == false
  severity: HARD
  reason: "Ödeme emri için 4. madde talebi gerekli."
```

---

## 7. Controller-Level Karar Noktaları

### 7.1 Expense Request Stage Code Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/expense-request/expense-request.controller.ts:330-335` |
| **Mevcut Koşul** | `body.stageCode && body.stageCode !== 'OPENING'` |
| **Önerilen ActionCode** | `REQUEST_EXPENSE` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (SOFT) |

---

### 7.2 Ops Job Status Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/icrabot/ops/ops.controller.ts:194-197` |
| **Mevcut Koşul** | `job.status === 'DONE' OR job.status === 'FAILED'` |
| **Önerilen ActionCode** | `RETRY_JOB`, `CANCEL_JOB` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **GATE** (HARD) |

---

## 8. Frontend Karar Noktaları

### 8.1 ExpenseGateWarning Component

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/web/src/components/expense/ExpenseGateWarning.tsx:32-150` |
| **Mevcut Koşul** | `gateStatus.isBlocked` |
| **API Çağrısı** | `api.checkExpenseGate(caseId)` |
| **Sınıflandırma** | **UI GATE DISPLAY** |

**CPE Dönüşümü:**
- Frontend `CPE.canPerformAction(caseId, 'UYAP_SEND')` çağıracak
- Response'daki `warnings` ve `blockedBy` bilgisi gösterilecek

---

### 8.2 UyapActionButton Permission Check

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/web/src/components/expense/ExpenseGateWarning.tsx:180-230` |
| **Mevcut Koşul** | `canPerform` state |
| **API Çağrısı** | `api.canPerformUyapAction(caseId, actionType)` |
| **Sınıflandırma** | **UI PERMISSION CHECK** |

---

## 9. Notification Service Karar Noktaları

### 9.1 Notification Delivery → Stage Update

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/notification/notification.service.ts:85-95, 123-133` |
| **Mevcut Koşul** | Notification delivered |
| **Önerilen ActionCode** | `NOTIFICATION_DELIVERED` |
| **Scope** | `DEBTOR` |
| **Sınıflandırma** | **TRANSITION** |

---

## 10. Scheduler Service Karar Noktaları

### 10.1 Expired Cases → Enforcement

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/scheduler/scheduler.service.ts:37-71` |
| **Mevcut Koşul** | `workflowStage === 'WAITING_RESPONSE' && nextActionAt <= now` |
| **Önerilen ActionCode** | `PROCEED_TO_ENFORCEMENT` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

---

### 10.2 MTS Conversion

| Alan | Değer |
|------|-------|
| **Kaynak** | `apps/api/src/modules/scheduler/scheduler.service.ts:192-220` |
| **Mevcut Koşul** | `workflowStage !== 'ENFORCEMENT'` |
| **Önerilen ActionCode** | `CONVERT_FROM_MTS` |
| **Scope** | `CASE` |
| **Sınıflandırma** | **TRANSITION** |

---

## ActionCode Kataloğu (Extracted)

| ActionCode | Risk Level | Scope | Mevcut Servis |
|------------|------------|-------|---------------|
| `UYAP_SEND` | HIGH | CASE | ExpenseGateService, StageTriggerService |
| `UYAP_QUERY` | LOW | CASE | ExpenseGateService |
| `REQUEST_EXPENSE` | MEDIUM | CASE | StageTriggerService |
| `SEND_NOTIFICATION` | HIGH | DEBTOR | ExpenseGateService |
| `SEND_DEBTOR_MSG` | MEDIUM | DEBTOR | - |
| `QUERY_ASSETS` | LOW | DEBTOR | RuleEngine (automation) |
| `QUERY_BANK_ACCOUNTS` | LOW | DEBTOR | RuleEngine (automation) |
| `TRIGGER_HACIZ` | HIGH | ASSET | RuleEngine (automation) |
| `REQUEST_SALE` | HIGH | ASSET | RuleEngine (automation) |
| `REQUEST_ENFORCEMENT` | HIGH | CASE | RuleEngine (automation) |
| `CLOSE_CASE` | HIGH | CASE | RuleEngine (automation) |
| `ARCHIVE_CASE` | MEDIUM | CASE | - |
| `ADD_NAFAKA_PERIOD` | LOW | CASE | RuleEngineService |
| `UPDATE_EXCHANGE_RATE` | LOW | CASE | RuleEngineService |
| `PROCEED_TO_ENFORCEMENT` | HIGH | CASE | RuleEngineService, Scheduler |
| `EVICTION_REQUEST` | HIGH | CASE | RuleEngine (automation) |
| `SEND_PAYMENT_ORDER` | HIGH | CASE | AutomationService |
| `NOTIFICATION_DELIVERED` | MEDIUM | DEBTOR | NotificationService |
| `CONVERT_FROM_MTS` | MEDIUM | CASE | SchedulerService |

---

## Migration Priority

### Phase 1 - Critical (İlk 5 ActionCode)
1. `UYAP_SEND` - En kritik, geri alınamaz
2. `REQUEST_EXPENSE` - Müvekkile maliyet
3. `SEND_DEBTOR_MSG` - Hukuki sonuç
4. `QUERY_ASSETS` - Sık kullanım
5. `TRIGGER_HACIZ` - Geri alınamaz

### Phase 2 - High Priority
6. `REQUEST_ENFORCEMENT`
7. `CLOSE_CASE`
8. `SEND_NOTIFICATION`
9. `REQUEST_SALE`

### Phase 3 - Medium Priority
10. `ADD_NAFAKA_PERIOD`
11. `UPDATE_EXCHANGE_RATE`
12. `PROCEED_TO_ENFORCEMENT`
13. `NOTIFICATION_DELIVERED`

### Phase 4 - Low Priority
14. `UYAP_QUERY`
15. `QUERY_BANK_ACCOUNTS`
16. `ARCHIVE_CASE`
17. `CONVERT_FROM_MTS`
18. `EVICTION_REQUEST`

---

## Sonraki Adımlar

1. [ ] High-Risk Action Matrix dokümanı oluştur (`docs/high-risk-action-matrix.md`)
2. [ ] ActionCode enum'u oluştur
3. [ ] İlk 5 kritik ActionCode için gate tanımları yaz
4. [ ] CPE skeleton implementasyonu başlat

---

*Son güncelleme: 2026-01-13*
*Audit yapan: Kiro AI*
