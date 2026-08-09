# C1-B04 — CANARY DELIVERY: PASS (R02)

```text
PROGRAM:       CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:     C1-B04-CANARY-DELIVERY-PASS-R02          LANE OWNER: CLAUDE
SUPERSEDES:    C1-B04-CANARY-PROVIDER-CONFIG-REQUIRED-R01 (PAUSED verdict)
AUTHORIZATION: OWNER GO-COMPLETE (C1-B04) + PROVIDER DECISION (TURHOST) +
               CONTROLLED RECOVERY + COMPLETION owner directives (2026-08-09)
VERDICT:       C1-B04 = PASS / REAL INBOX DELIVERY CONFIRMED (delivered=1)
NEW API CANARY RC: c559d7ae572d59dc36432d207ffe7c871afc66e5 (fresh canonical main)
```

## 1. SONUÇ (VERIFIED)
Tek gerçek `MONTHLY_STATEMENT_PDF` teslimi izole canary (`hukuk_canary_c1b04`) üzerinden
gerçek Turhost SMTP ile yapıldı ve **owner tarafından inbox'ta doğrulandı**:
- deliveryMode = **PORT**, statement dönemi **2026-08** (mevcut statement REUSED), delivered=1, failed=0.
- Ek: `ekstre-genel-20260731-20260831.pdf` (29 KB), Dönem Sonu Bakiye −2250.50 TRY.
- Gönderen: `bilgi@tellihukuk.com` (smtpFromName "Av. Ulaş Hüseyin TELLİ") →
  Alıcı: `ulastelli@limagroup.com.tr` (owner-doğrulanmış mevcut recipient).
- Kalıcı defter: yeni **SENT** `ClientNotification` (id `cmsln3ix70004eslyyzgq4jmm`),
  dedupeKey `STATEMENT_MONTHLY:ClientStatement:cmsl41vko000es1skbvlqc798:2026-08`.
- **İnbox teyidi:** owner ekran görüntüsü — Gelen Kutusu (spam değil), PDF ekli.

## 2. PROVIDER RECONCILIATION (SoT)
- **Gerçek sağlayıcı: TURHOST.** Non-secret SoT (production reconciliation, salt-okuma):
  `srvc182.trwww.com` · port `465` · secure `true` (SSL) · user=from `bilgi@tellihukuk.com` ·
  fromName "Av. Ulaş Hüseyin TELLİ". Kaynak: production `hukuk_db` telli-hukuk Office (tek exact eşleşme).
- **Yandex = STALE / MISCONFIGURED** (tarihsel). `smtp.yandex.com` kaydı production'da YOKtu;
  izole canary'de farklı bir mailbox (`ulastelli@limagroup.com.tr`) ile duruyordu — önceki
  `535 auth failed` denemelerinin konfigürasyonu. Faz B'de non-secret Turhost ile üzerine yazıldı.
- Secretless preflight fresh PASS: DNS + TCP:465 + TLS1.3 + cert `*.trwww.com` (hostname doğrulandı) +
  `AUTH PLAIN LOGIN`.

## 3. CONTROLLED RECOVERY (key-loss → temiz yeniden provisioning)
- İlk credential-write kanonik `encryptCredential` util + **doğrudan** canary DB persistence ile yapıldı
  (officeServiceWritePath=false). Ardından bir mesaj-yarışı sonucu ephemeral key koşullu cleanup ile
  silindi → enc:v1 credential **çözülemez** hale geldi.
- Kurtarma (owner-yetkili): orphan credential yalnız canary'de `smtpPass=NULL` (row-count=1,
  production değişikliği=0); eski `cred-evidence` **INVALIDATED_KEY_LOST** olarak işaretlendi (secret-free).
- Yeni ephemeral key + **tek** hidden-stdin parola girişi; credential bu kez **gerçek
  `OfficeService.updateSmtpSettings`** ile enc:v1 yazıldı (kanıt: encryptedPrefix + decryptRoundTrip + passPresent).

## 4. CLEAN BUILD PROVENANCE (parola öncesi tüm gate'ler PASS)
- **exactApiRcSha=true** — yeni API canary RC `c559d7ae` (fresh canonical main). Eski API RC
  `1488063d` **zorlanmadı**: persistent delivery-ledger adapter ABSENT + X3 merge
  `ac25c6c17db1c25372d6c11dfd03df3bfcdde53c` onun atası DEĞİL. X3, `c559d7ae`'nin atası (✓), ledger mevcut (✓).
- İzole execution worktree; **bağımsız** node_modules (junction/symlink yok); `pnpm --frozen-lockfile`;
  `prisma generate`; **canonical `nest build` exit=0**.
- **customRuntimeHook=false** (nest build `@/` alias'ları relative'e çözdü; dist'te 0 `@/` require) ·
  **stubProvider=false** (composed gerçek modüller: ConfigModule+ErrorLogModule+ClientStatementModule) ·
  **tsc-error artifact=false** · **source/product diff=0** (worktree tracked-modified=0).
- 6-modül RC-provenance blob-hash **MATCH**: monthly-delivery `1354c873`, pdf `4bdd3b81`,
  notification-adapter `2bbda231`, office.service `605409e6`, encryption-util `60090f79`,
  persistent-ledger-adapter `a9f0cc78`.
- **canaryDatabaseGuard=true** (tüm runner'lar `current_database()=hukuk_canary_c1b04`).
- **cleanupDryRun=true** — emergency cleanup runner ayrı dummy canary kaydında PASS.
- **officeServiceWritePath=true** (`updateSmtpSettings`) · **officeServiceReadPath=true**
  (`getFullSmtpSettings → decryptCredential`).
- Canary şeması yeni RC frontier'a migrate edildi (guarded, izole): `client_statement_interest_projection`,
  `..._shape`, `client_statement_delivery_ledger`.

## 5. DEDUPE / IDEMPOTENCY
İkinci dedupe kontrolü **yalnız read-only ledger** ile yapıldı (SENT kayıt + dedupeKey doğrulandı);
**ikinci `runMonthlyDelivery` / ikinci SMTP çağrısı YAPILMADI**. FAILED kayıtlar teslimi bloklamaz;
yalnız SENT bloklar → tekrar koşu idempotent skip üretir.

## 6. İÇERİK GÖZLEMİ (NON-BLOCKING)
E-posta gövdesinde `{{executionFileNumber}}` template placeholder'ı çözülmeden kaldı (canary
müvekkilinde icra dosya numarası yok). Teslim/PDF/ekstre PASS'ini etkilemez; şablon-populasyonu
takip kalemi olarak not edilir (C1 execution gate'i DEĞİL).

## 7. EXPOSURE (NON-BLOCKING / OUTSIDE C1 EXECUTION GATES)
```text
REPOSITORY/LOG/PR EXPOSURE: 0
CHAT TRANSCRIPT EXPOSURE:    tarihsel (historical) — NON-BLOCKING
CLASSIFICATION:             OUTSIDE C1 EXECUTION GATES
```
Parola/anahtar hiçbir dosya, commit, PR, log veya çıktıya yazılmadı. Önceki kayıtlardaki
"ROTATION REQUIRED" ifadesi burada **NON-BLOCKING / OUTSIDE C1 EXECUTION GATES** olarak düzeltilmiştir
(ayrı PR açılmadı). Credential rotation bir C1-B04 acceptance kriteri, predecessor veya blocker DEĞİLDİR.

## 8. FINALLY CLEANUP
- Canary `smtpPass=NULL` (row-count=1) — teslimden SONRA.
- Ephemeral key + credential/delivery runner script'leri silindi.
- Production DB/runtime değişikliği=0; RC worktree'leri (rc-1488063d, rc-authfix, w5-artifact) dokunulmadı.
- Execution worktree + izole canary DB, bu PR merge + main sync sonrası kaldırılır.

## 9. STATUS
```text
C1-B04        = PASS / DELIVERED (real inbox delivery confirmed)
C1-B05        = ELIGIBLE (predecessor gate — B04 gerçek canary teslimi — aşıldı)
```
