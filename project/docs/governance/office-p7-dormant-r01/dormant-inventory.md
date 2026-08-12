# P7-B02 — DORMANT FOUNDATION / CONSUMER ENVANTERİ

- **Taban**: `76cd85f38324a9b4a79c192c5da10be2e4f54402` · **Ölçüm**: 2026-08-13
- Kural: yalnız kod-seviyesi default'lar okundu; **`.env` dosyaları OKUNMADI** (no-secrets).
  Runtime'da flag'lerin fiilî değeri bu kayıttan TÜRETİLEMEZ (RUNTIME HEAD ≠ RUNTIME CONTENT TRUTH).

## (a) BankSettlementEvidence yazıcıları — sınır belgesi + drift bulgusu

**Görev talimatındaki iddia**: "bank.module'de provider olarak kayıtlı ama hiçbir
controller/cron/servis çağırmıyor". **Fresh ölçüm bu iddiayı DOĞRULAMADI — iddia bayat:**

| Kanıt | Konum |
|---|---|
| Provider + export kaydı | `modules/bank/bank.module.ts:18-29` (`BankSettlementEvidenceWriterService`, `BankCandidateSettlementTransitionService`, `SettlementVerifierAuthorizationService`) |
| Controller kaydı | `bank.module.ts:17` → `BankLifecycleController` |
| Canlı route 1 | `bank-lifecycle.controller.ts:30-46` — `POST /bank/settlement-evidence` → `evidenceWriter.appendHumanEvidence()` (:36), `JwtAuthGuard` (:19) |
| Canlı route 2 | `bank-lifecycle.controller.ts:53-67` — `POST /bank/transactions/:id/finality` → `transitionService.transition()` (:60) |
| Bağlanma tarihçesi | PR **#1910** `feat(collection): expose bank candidate lifecycle commands` (W2.2C-6 "production command boundary") |

Sonuç: bu yüzey artık "yazılı-ama-bağlı-değil" (written-but-not-operational) DEĞİL —
**REACHABLE** (auth'lu komut sınırı). Governance kayıtlarında hâlâ "unwired" görünen
yerler için bkz. `cross-lane-findings.md` / CLF-P7-03.

**Ownership sınırı (değişmedi)**: BankSettlementEvidence yüzeyi (writer + transition +
verifier authorization + lifecycle controller) **COLLECTION/BANK bounded context'ine**
aittir; OFFICE'e AİT DEĞİLDİR. OFFICE lane'leri bu yüzeye yazmaz; bu lane yalnız sınırı
belgeledi (kod değişikliği yok).

## (b) Flag default-state tablosu (YALNIZ OKUNDU — değiştirilmedi)

| Flag | Tanım (dosya:satır) | Kod-seviyesi default | Kim okuyor | Etki (default'ta) |
|---|---|---|---|---|
| `OFFICE_PASSWORD_RECOVERY_ENABLED` | `modules/auth/password-reset/password-reset.service.ts:39-41` | **false** (yalnız `"true"` string'i açar; yokluk→false) | `forgotPassword():63` fail-closed generic-yanıt gate'i; `resetPassword()` aynı desen; `AuthController.capabilities()` web görünürlüğü (yorum :35-37) | Credential-recovery uçları kapalı; enumeration-safe generic yanıt; ayrı OWNER GO-OPERATE ile açılır (yorum :32-33) |
| `LOGIN_INVITE_PROVISIONING_ENABLED` | `modules/auth/invite/user-invite.service.ts:35-37` | **false** (aynı `"true"` deseni) | `issue():58` → `ForbiddenException("Login invite provisioning devre dışı")` | Admin invite write akışı kapalı (yorum :34 "default kapalı → canlı risk yok") |
| `OFFICE_APPROVAL_EXECUTOR_ENABLED` | `modules/office-approval/office-approval-executor.config.ts:33-36` (`parseBool`), `:42` (okuma) | **false** (yalnız `"true"`; yokluk dahil her şey→false) | `office-approval-executor-cron.service.ts` — config **cron TICK anında** okunur (config dosyası yorum :2) | `@Cron` kayıtlı olsa da tick sessiz no-op; "prisma'ya HİÇ dokunmaz" (cron dosyası yorum :16); aktivasyon owner-gated + API restart (config yorum :3) |
| `OFFICE_APPROVAL_CHANGE_STATUS_GATE` | `modules/office-approval/office-approval-shadow.service.ts:83-89` (`flagMode`) | **'off'** (`off|observe|create|enforce`; unset/bilinmeyen/`'on'`→off, yorum :80-81) | `CaseStatusController.changeStatus()` (yorum :93; `case-status.controller.ts:73`) | off → `evaluate()` erken döner: "no-op: hesap/audit/DB YOK" (:106) |
| `GUIDED_OPEN_AUTHZ_MODE` | `modules/permission-diagnostics/guided-open-observe.service.ts:29-33` | **'off'** (yalnız `'observe'` aktif; `process.env` doğrudan) | Kendi `record()` gate'i (:49 `mode()!=="observe" → return`); BANK_TRANSFER observe hook tüketicisi (bank.module yorum :15) | observe değilse no-op; P3-1b confirm-token zinciri de route'a bağlı değil (`audit.service.ts:193` yorumu: "henüz hiçbir route'a bağlı değil") |
| `OFFICE_CAP02_REPORTINGLINE_SHADOW` | `office-approval-shadow.service.ts:275-283` (`recordReportingLineShadow` → `decideTelemetryActivation`) | **dormant** — ÜÇ sinyal birlikte gerekir: master=`'observe'` + `..._TENANT_ALLOWLIST` (ZORUNLU, boş liste "tüm tenantlar" SAYILMAZ) + `..._ACTOR_ALLOWLIST` (ops.); malformed → fail-closed (yorum :263-273) | `evaluate()` her çağrıda :104'te girer, aktivasyon yoksa :283'te döner | Aktif değilken "TEK bir DB sorgusu bile yapılmaz" (yorum :273) |
| `CREDENTIAL_ENCRYPTION_KEY` | `modules/office/office-credential-encryption.util.ts:11-16` (`deriveKey`; yokluk→null) | **yapılandırılmamış → FAIL-CLOSED THROW** | `encryptCredential():32-36` anahtar yoksa THROW ("sessiz düz-metin fallback YOK"); `decryptCredential():50-55` `enc:v1:` önekli değer + anahtarsız → THROW; legacy düz-metin passthrough (:51); `isCredentialEncryptionConfigured():19-21`; `office.service.ts:34` hata mesajı | Anahtar yokken Office SMTP/SMS secret yazımı/okunuşu açık hatayla durur — sessiz bozulma yok |

## (c) Ownership sınırı dokümantasyonu (hangi dormant yüzey hangi context'in)

| Yüzey | Sahip context | OFFICE'in konumu |
|---|---|---|
| AuditLog CAP-09A kolonları + AuditService taşıyıcı | **OFFICE** (`modules/audit`) | Şema/taşıyıcı sahibi; üretici DEĞİL (bkz. disposition kaydı) |
| CAP-09A üreticileri (6 çağrı noktası) | COLLECTION · BANK · CALC-PREVIEW · CLIENT-FINANCIAL-DISCLOSURE · CLAIM-ITEM | Tüketici/sahip değil; sınır dışı |
| BankSettlementEvidence yüzeyi | **COLLECTION/BANK** | Sınır dışı — belgelendi, dokunulmadı |
| `PermissionGrant` şeması (OFF/OD-05·08·09 foundation) | **OFFICE** (şema temeli) | Şema sahibi; authorization OKUYUCULARI dış context'lerde (aşağıda) |
| PermissionGrant okuyucuları | BANK (`settlement-verifier-authorization.service.ts:42`) · CLIENT-INTAKE-REVIEW (`client-intake-review-authorization.service.ts:52`) · UYAP (`uyap/authority/trigger-haciz-capability-authorization.service.ts:42`) | Üç gerçek `permissionGrant.findMany` tüketicisi — hepsi OFFICE dışı |
| OfficeApprovalExecutor (cron dahil) | **OFFICE** | Dormant-by-flag (default false); kod değişikliği yok |

## (d) Stale kod yorumları (DOĞRULANDI — düzeltme C4/P8'e devredildi)

1. **`apps/api/src/app.module.ts:193`** — `OfficeApprovalExecutorModule, // P4-5A: ... (internal callable; route/cron YOK)`
   - Gerçek: `office-approval-executor-cron.service.ts:56-57` → `@Cron(CronExpression.EVERY_30_MINUTES, { name: 'officeApprovalExecutor', ... })` decorator'ı **class-load'da scheduler'a kaydolur**.
   - Yorumun "route YOK" kısmı hâlâ doğru (cron service `@Controller` değil — spec :208-213 bunu sınar); **"cron YOK" kısmı BAYAT** (P4-5B'de cron eklendi; `office-approval-executor.module.ts:15-16` yorumu zaten günceli anlatıyor).
   - Davranışsal risk yok: tick, `OFFICE_APPROVAL_EXECUTOR_ENABLED` default-false ile sessiz no-op.
2. **`apps/api/prisma/schema.prisma:10008`** — `// Bu tablo HENÜZ hiçbir authorization consumer tarafından okunmuyor — yalnız şema temeli.` (PermissionGrant üstü)
   - Gerçek: yukarıdaki **3 gerçek authorization okuyucusu** var (bank settlement-verifier · client-intake-review · uyap trigger-haciz). Yorum BAYAT.
   - Ek nüans: `:10048`'deki benzer ifade (hierarchy/ReportingLine foundation) için — ReportingLine'ı `office-approval-shadow.service.ts:294` okur ama bu **telemetri** okumasıdır (karar etkisi yok); "authorization consumer yok" ifadesi orada hâlâ savunulabilir. C4 düzeltmesinde bu ayrım korunmalı.
