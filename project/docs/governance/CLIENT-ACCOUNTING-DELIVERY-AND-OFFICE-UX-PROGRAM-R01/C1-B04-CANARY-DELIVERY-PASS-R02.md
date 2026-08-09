# C1-B04 — CANARY DELIVERY (transport PASS) + CONTENT ACCEPTANCE CORRECTION (R02)

```text
PROGRAM:       CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:     C1-B04-CANARY-DELIVERY-PASS-R02          LANE OWNER: CLAUDE
SUPERSEDES:    C1-B04-CANARY-PROVIDER-CONFIG-REQUIRED-R01 (PAUSED verdict)
AUTHORIZATION: OWNER GO-COMPLETE (C1-B04) + PROVIDER DECISION (TURHOST) +
               CONTROLLED RECOVERY + CONTENT ACCEPTANCE CORRECTION owner directives (2026-08-09)
VERDICT:       C1-B04 = DELIVERY_SUCCEEDED / CONTENT_ACCEPTANCE_FAILED → (bu PR merge +
               local content acceptance sonrası) ENGINEERING_COMPLETE
NEW API CANARY RC: c559d7ae572d59dc36432d207ffe7c871afc66e5 (fresh canonical main)
```

## 0. DURUM (ÖNEMLİ — yanlış PASS/ELIGIBLE kaydı düzeltildi)
İlk gerçek teslim **SMTP transport + PDF ek** olarak BAŞARILI oldu (owner inbox teyidi).
Ancak e-posta gövdesinde çözülmemiş `{{executionFileNumber}}` placeholder'ı + demo marka +
UTC gün kayması + ham para + typo tespit edildi → **içerik kabulü BAŞARISIZ**.
`C1-B04 ENGINEERING_COMPLETE İLAN EDİLMEDİ; C1-B05 ELIGIBLE DEĞİL.` İkinci gerçek e-posta
GÖNDERİLMEDİ. Düzeltme yalnız local render/capture ile doğrulandı.

## 1. TRANSPORT/PDF (VERIFIED — korunur)
Tek gerçek `MONTHLY_STATEMENT_PDF` teslimi izole canary (`hukuk_canary_c1b04`) üzerinden Turhost
SMTP ile yapıldı ve owner inbox'ta doğruladı:
- deliveryMode=PORT, dönem 2026-08 (REUSED), delivered=1/failed=0.
- Turhost `srvc182.trwww.com:465` SSL, `bilgi@tellihukuk.com` → `ulastelli@limagroup.com.tr`.
- Ek: `ekstre-genel-20260731-20260831.pdf` (29 KB). SENT `ClientNotification` `cmsln3ix7…`,
  dedupeKey `STATEMENT_MONTHLY:ClientStatement:cmsl41vko…:2026-08`. İkinci SMTP çağrısı YOK.
Bu transport/PDF kanıtı KORUNUR (yeniden gönderim yok).

## 2. PROVIDER RECONCILIATION / CONTROLLED RECOVERY (özet)
- Gerçek sağlayıcı **TURHOST** (SoT `srvc182.trwww.com:465` SSL `bilgi@tellihukuk.com`);
  **Yandex STALE/MISCONFIGURED** (tarihsel).
- Key-loss race → orphan `smtpPass=NULL` (INVALIDATED_KEY_LOST) → yeni ephemeral key + tek parola →
  gerçek `OfficeService.updateSmtpSettings` (enc:v1). Clean build: yeni API canary RC `c559d7ae`
  (fresh main; eski RC 1488063d ledger'siz), bağımsız install + `nest build` exit 0, 6-modül provenance MATCH.

## 3. İÇERİK KABUL DEFEKTLERİ (kök neden)
| # | Defekt | Kök neden |
|---|---|---|
| 1 | `{{executionFileNumber}}` ham | Template `{{executionFileNumber}}` ister; token builder `caseFileNumber` verir + `renderTemplate` kalanı strip/fail-close etmezdi. |
| 2 | UTC gün kayması (31.07 yerine 01.08) | Token/`dateTr` `toISOString()/getUTCDate()` = UTC. |
| 3 | Ham para "-2250.5 TL" | Token ham decimal; PDF ham. tr-TR format yok. |
| 4 | "bürumuzla" + "Detay için" | Seed template typo/copy. |
| 5 | "Demo Hukuk Bürosu (Canary)" | `officeName` = office.name (canary DATA); template bağlaması doğru. |

## 4. EXACT WRITE MANIFEST (owner-onaylı dar path; schema/migration/refactor YOK)
- `apps/api/src/modules/message-template/message-template.service.ts`
  - STATEMENT_READY seed: `{{fileReferenceClause}}` (client-level ""), `{{caseFileSuffix}}`,
    `{{closingBalanceLine}}`, `bürumuzla`→`büromuzla`, `Detay için`→`Ayrıntılı bilgi için`.
  - `renderTemplate`: **FAIL-CLOSED** — render sonrası kalan `{{...}}` varsa `UnresolvedTemplateTokenError`
    THROW (sessiz strip YOK; malformed içerik provider'a gitmez; yalnız token ADI, PII/secret sızmaz).
- `apps/api/src/modules/client-statement/client-statement-delivery.contract.ts`
  - `buildStatementDeliveryTokens`: yerel tarih (Europe/Istanbul), tr-TR para, `fileReferenceClause`
    (client-level "" / case-level insan-okur no), `caseFileSuffix`, `closingBalanceLine`.
- `apps/api/src/modules/client-statement/client-statement-pdf.document.ts`
  - `formatDateTrIstanbul` (UTC→yerel), `formatTrAmount` (tr-TR), `displayCurrency` (TRY→TL),
    `formatClosingBalanceLine` (nötr etiket, mutlak tutar); PDF sütun/bakiye satırları bağlandı.
- Test dosyaları: `client-statement-content-acceptance-c1b04.spec.ts` (yeni) +
  `client-statement-delivery-c3b03.spec.ts`, `client-statement-pdf-c3b02.spec.ts`,
  `client-statement-notification-delivery-adapter.spec.ts` (güncellendi).

## 5. BAKİYE SEMANTİĞİ (OWNER KARARI — nötr; hukuki borç/alacak hükmü kurmaz)
Locked sign convention (`credit=müvekkil lehine`, `running.plus(credit)`) → nötr kullanıcı metni,
**mutlak tutar** (eksi işareti ayrıca gösterilmez), e-posta=PDF birebir:
- raw < 0 → `Dönem Sonu Bakiye: 2.250,50 TL (Büro lehine)`
- raw > 0 → `Dönem Sonu Bakiye: 2.250,50 TL (Müvekkil lehine)`
- raw = 0 → `Dönem Sonu Bakiye: 0,00 TL (Bakiye bulunmamaktadır)`

## 6. LOCAL DOĞRULAMA (gerçek SMTP YOK)
Clean worktree (c559d7ae) jest: content-acceptance + delivery-c3b03 + pdf-c3b02 +
notification-delivery-adapter + notification-dispatcher = **5 suite / 58 test PASS**.
Kapsam: unresolved-token→THROW (fail-closed), client-level/case-level ayrı, tr-TR tarih+para,
üç bakiye işareti, doğru Office markası, internal-ID/PII sızıntısı yok, e-posta↔PDF eşitliği,
Türkçe karakter regresyonu (büromuzla/bürumuzla/mojibake). (`[B04-7b]` cron testi worktree'nin
strict-pnpm hoist artefaktıdır; değişen dosyalarımla ilgisiz, required CI'da doğrulanır.)

## 7. EXPENSE NOTIFICATION (B05 girdisi — karakterizasyon)
- **A (masraf öncesi):** VAR — `EXPENSE_REQUEST`/`EXPENSE_REMINDER` + `ExpenseNotificationService`.
- **B (masraf sonrası/realized):** **GAP** — ayrı gerçekleşen-masraf bildirim template'i YOK; gerçekleşen
  masraf yalnız dönemsel ekstreye yansır. Bu gap **B05'te** uygulanacak (B04'e eklenmez).

## 8. EXPOSURE (NON-BLOCKING / OUTSIDE C1 EXECUTION GATES)
REPOSITORY/LOG/PR EXPOSURE=0; chat-transcript tarihsel; **NON-BLOCKING / OUTSIDE C1 EXECUTION GATES**
("ROTATION REQUIRED" ifadesi burada düzeltildi; ayrı PR yok). Parola/anahtar hiçbir çıktıda yok.

## 9. STATUS
```text
C1-B04 = DELIVERY_SUCCEEDED / CONTENT_ACCEPTANCE_FAILED
         (bu correction PR merge + local content acceptance sonrası ENGINEERING_COMPLETE)
C1-B05 = NOT ELIGIBLE (B04 ENGINEERING_COMPLETE olana kadar)
```
