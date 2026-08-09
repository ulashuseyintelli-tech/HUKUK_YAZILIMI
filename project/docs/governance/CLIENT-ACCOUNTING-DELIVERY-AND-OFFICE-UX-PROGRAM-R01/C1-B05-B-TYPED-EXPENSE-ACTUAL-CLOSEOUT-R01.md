# C1-B05-B — TYPED EXPENSE EVENT + DURABLE DELIVERY INTENT · CLOSEOUT R01

```text
PROGRAM:   CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE: C1-B05-B-TYPED-EXPENSE-ACTUAL-CLOSEOUT-R01     LANE OWNER: CLAUDE
AUTHORITY: OWNER DECISION "C1-B05-B TYPED EXPENSE EVENT + DURABLE DELIVERY INTENT"
           (GO-COMPLETE · allowed-path extension · migration authority — bu exact iş için)
BASELINE:  a02df8ee (C1-B05-A merge) ancestry — izole worktree/branch claude/c1b05b-expense-actual
```

## 1. ÜRÜN KARARININ UYGULANMASI (outcome → mekanizma)

| # | Owner outcome | Mekanizma (exact) |
|---|---|---|
| 1 | Yazım anında durable+typed EXPENSE_ACTUAL | `BalanceLedger.entryKind = EXPENSE_ACTUAL` (yeni enum `BalanceLedgerEntryKind`), yalnız `postExpenseActual` yazar |
| 2 | Yalnız yetkili posting komutu | `CaseBalanceService.postExpenseActual` + `POST /cases/:caseId/balance/expense-actual` (ADMIN-gate: repo'nun canonical yükseltilmiş rol yüzeyi `AdminGuard`; roller ADMIN/USER/VIEWER — POL-5 eşleniği) |
| 3 | ExpenseRequest RECEIVED/PAID dönüştürülmez | Dokunulmadı; koddan kanıt: RECEIVED/PAID `caseBalanceService.credit()` (CREDIT) çağırır — müvekkil ödemesi. Test: generic/credit yolları typed alan + intent ÜRETMEZ |
| 4 | Finansal kayıt + delivery-intent AYNI tx | Posting `$transaction`: ledger + decrement + journal + `enqueueEmailIntentInTransaction` (QUEUED). Rollback testi: hiçbiri kalıcılaşmaz |
| 5 | Provider commit SONRASI | QUEUED intent render EDİLMEZ; `dispatchQueuedIntent` commit sonrası render→claim→sendEmail. Provider hiçbir açık DB tx'i içinde çağrılmaz |
| 6 | Mail başarısızlığı POSTED'ı bozamaz | dispatch best-effort (asla throw yaymaz); 5xx testi: intent FAILED ama posting success=true |
| 7 | Statement+notification aynı source; bakiye yalnız ledger'dan | Statement satırı `refType='BalanceLedger', refId=ledgerId`; dedupeKey `EXPENSE_ACTUAL_POSTED:BalanceLedger:{ledgerId}:1`; retry statement satırı üretmez (test) |

## 2. DELIVERY STATE AYRIMI (minimum backward-compatible)

`ClientNotification.status` düz String — migration'sız yeni değer:

```text
QUEUED   → provider HİÇ çağrılmadı; güvenle (yeniden) işlenebilir.   [YENİ — çakışma yok, canlı küme {PENDING,SENT,FAILED} idi]
PENDING  → in-flight/sonuç belirsiz; OTOMATİK resend YOK.            [mevcut anlam korunur]
SENT     → provider kabul + kalıcı SENT damgası.                     [mevcut]
FAILED   → pre-provider deterministik VEYA kesin red; yalnız explicit reclaim. [mevcut]
```

Crash matrisi (hepsi gerçek-PG testli): commit→claim-öncesi crash = QUEUED kalır → `drainQueuedNotifications`
güvenle işler; claim-sonrası/provider-sırası = PENDING, otomatik resend YOK; accept+SENT-mark-fail = PENDING
(manuel reconciliation); SENT = tekrar yok. Atomik QUEUED→PENDING claim: `claimQueuedNotificationSlot`
(aynı advisory-lock anahtar ailesi `client-notification-dispatch|tenant|dedupeKey`).

**Mevcut altyapı değerlendirmesi (owner: "güvenli sağlıyorsa tüket"):** `IcrabotOutboxAction` outbox'ı
claimed durumu stale-cutoff sonrası OTOMATİK retry eder → owner'ın "PENDING otomatik yeniden gönderilemez"
kuralıyla çelişir → tüketilmedi. `NotificationQueue`/`AddressOutboxEvent` farklı domain/yaşam döngüsü.
Kanonik mail yolu ClientNotification'dır; minimum genişleme onun üzerinde yapıldı (ikinci paralel altyapı YOK).

## 3. MIGRATION (tek, additive, backward-compatible)

`20260809210000_expense_actual_typed_posting` — frontier `20260809090500` sonrası:
- `CREATE TYPE BalanceLedgerEntryKind ('EXPENSE_ACTUAL')`
- `BalanceLedger` + `entryKind` (NULL) + `postingKey` (NULL) — mevcut satırlar DEĞİŞMEZ, backfill YOK
- `UNIQUE (tenantId, postingKey)` — NULL'lar ayrık → tarihsel satırlar serbest; posting idempotency DB-garantili
- `ALTER TYPE MessageTemplateCategory ADD VALUE 'EXPENSE_ACTUAL'`

**Preflight (kanıt):** 0 açık PR; ~90 branch/~48 worktree'de `git log --all --not origin/main -- prisma`
BOŞ; hiçbir worktree'de uncommitted prisma değişikliği yok; canonical temiz → RAKİP MIGRATION WRITER YOK.
**Test:** izole `hukuk_b05b_test` (SAFE_NAME_RE uyumlu): (a) baseline 125-migration deploy PASS →
(b) yalnız yeni migration frontier-upgrade deploy PASS → (c) drop + fresh FULL 126-migration rebuild
deploy PASS (rollback/rebuild kanıtı). Production migrate/deploy/mutation YAPILMADI.

## 4. BİLDİRİM İÇERİĞİ + ALICI

- Ayrı template/event: `EXPENSE_ACTUAL_POSTED` (kategori `EXPENSE_ACTUAL`; seed kataloğuna eklendi).
  Token'lar: insan-okur dosya referansı (fileNumber), masraf tarihi (tr-TR), açıklama, tr-TR tutar+birim,
  Office adı/telefon. Raw iç ID YOK (POL-4 testli); fail-closed render (çözülmemiş `{{token}}` → FAILED, provider yok).
- Alıcı: dosyanın KESİN TEK creditor müvekkili — aday kümesi `CaseClient ∪ Case.clientId` tam 1 farklı
  müvekkile inerse; aksi halde `RECIPIENT_SCOPE_AMBIGUOUS` → gönderim YOK (broadcast yasak), posting POSTED kalır.
- Preference: MANDATORY_TRANSACTIONAL / PREFERENCE_NOT_APPLICABLE (C1-B05 owner G3 kararıyla tutarlı).
- Gerçek SMTP YOK — tüm testler nodemailer mock (local capture/test sink).
- Audit izi: ledger satırı (createdById/createdAt/source) + AccountingJournalEntry (sourceId=ledgerId) +
  ClientNotification (sentById/status/dedupeKey) — üçü aynı source identity'ye bağlı.

## 5. KABUL TESTLERİ (hepsi PASS)

Unit (27): `case-balance/__tests__/expense-actual-posting.spec.ts` (typed alanlar, POL-4, ambiguous,
replay, dispatch-fail sağlamlığı, generic debit/adjust/reversal negatifleri, doğrulama, fail-closed deps) +
`client-notification/__tests__/expense-actual-intent-lifecycle.spec.ts` (QUEUED→sent; PENDING/SENT/FAILED
dokunulmaz; unresolved-token→FAILED yalnız adlar; şablon-yok; claim yarışı; drain; enqueue idempotent;
claim yalnız QUEUED).

Gerçek PostgreSQL (11): `case-balance/__tests__/expense-actual-posting.db-gated.integration.spec.ts` —
E2E SENT + içerik (tr-TR, marka, raw-ID-yok, `{{`-yok); rollback atomikliği; 2×concurrent posting → 1;
replay; crash→QUEUED→drain→SENT; 2×concurrent claim → 1; FAILED yalnız explicit reclaim; ambiguous;
generic+reversal negatifi; tenant izolasyonu (postingKey tenant-başına); statement TAM-1-satır + retry
üretmez; 5xx→FAILED / timeout→PENDING.

## 6. SINIR

- `app.module`/başka modül dosyası DEĞİŞMEDİ (CaseBalanceModule kendi import'una ClientNotificationModule
  ekledi; döngü yok — ClientNotificationModule zinciri CaseBalance'ı import etmiyor, doğrulandı).
- `client-statement` ürün kodu DEĞİŞMEDİ: tarihsel generic DEBIT render'ı korunur (owner: backfill/yeniden
  sınıflandırma YASAK); typed satırlar mevcut DEBIT→EXPENSE_ACTUAL eşlemesinden akar; kimlik zaten refId ile bağlı.
- Tarihsel DEBIT'lere dokunulmadı; hiçbir cron/schedule AKTİVE edilmedi (drain = ADMIN endpoint + posting
  sonrası inline best-effort; standing job YOK).
