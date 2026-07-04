# P2 — Guided-Open Observe-Mode · Scope & Sözleşme

> **Tür:** docs-only scope/kontrat dokümanı. **KOD YOK.** Bu doküman onaylanmadan P2 kodu başlamaz.
> **Bağlam:** [`yetki-agaci-guided-open-final.md`](./yetki-agaci-guided-open-final.md) (FİNAL model) §17 faz planının
> **ilk kod fazı = P2**. Gerçek-durum: [`yetki-agaci-canonical-design.md`](./yetki-agaci-canonical-design.md) (P0) +
> P1 forensic. **P2 sistem davranışını DEĞİŞTİRMEZ; yalnız karar hesaplar ve loglar.**

---

> **🚦 KESİN KURAL (en üstte, tartışmasız):**
> **P2 hiçbir kullanıcı aksiyonunu engellemez. P2 sadece resolver kararını hesaplar, diagnostic/audit üretir
> ve mevcut davranışı korur.** İleride `CONFIRM_REQUIRED` / `ROUTE_REQUIRED` / `APPROVAL_REQUIRED` /
> `HARDWARE_REQUIRED` sonuçları **hesaplanacak** ama bu fazda **canlı engele dönüştürülmeyecek** (o P3+).

## 1. P2 amacı

Tek merkezi **`EffectivePermissionResolver`** kur: bir (user, case, action) için Guided-Open modeline göre
**hangi karara varılırdı** (ALLOW / CONFIRM / ROUTE / APPROVAL / HARDWARE / TENANT-DENY) ve **hangi
`decision_source` ile** — bunu **hesapla ve kaydet**, ama **akışı ENGELLEME**. Amaç güvenlik değil,
**gözlem + doğrulama**: gerçek trafikte modelin kararları doğru mu, hangi işlemler ileride confirm/route/
approval gerektirir, kim ne yapıyor (truthful) — kanıt toplamak. P3+ enforcement bu gözleme dayanır.

## 2. Non-goals (P2'de KESİNLİKLE YOK)

- Yeni 403 / hard-deny / endpoint davranış değişikliği.
- Guard/decorator yayma (mevcut hard-guard'lar [cases.delete, legal-responsible, credential, 2 CPE] DOKUNULMAZ).
- `PermissionCatalog` / `PermissionTemplate` / yeni EventStore tablosu.
- Migration / schema değişikliği.
- Frontend / drawer değişikliği.
- ReBAC/ABAC engine · sert dosya-üyeliği kapısı · read-scope daraltma.
- Tebligat/UYAP/bank davranışını değiştirme (yalnız sınıflandır + logla).

## 3. Resolver input/output kontratı

```
resolve(user, caseId, action, context) -> Decision

Decision = {
  decision:        ALLOW | CONFIRM_REQUIRED | ROUTE_REQUIRED | APPROVAL_REQUIRED
                 | HARDWARE_REQUIRED | DENY_TENANT_BOUNDARY
  decision_source: OPEN | CASE_GRANT | OFFICE_DEFAULT | FULL_AUTHORITY
                 | CONFIRM_REQUIRED | VALIDITY_ROUTE | APPROVAL_REQUIRED | HARDWARE | TENANT_BOUNDARY
  action_class:    L0 | L1 | L2 | L3 | L4
  would_block:     bool   (observe-mode'da gerçek-enforce'da engellenir miydi?)
  reason:          string
}
```

Precedence (FİNAL §4): **tenant > validity-route > guarded-edge(confirm/approval) > guided-open(allow)**.
**P2'de bu sonuç yalnız hesaplanır + loglanır; endpoint eskisi gibi devam eder.**

## 4. ActionCode mapping v1 (KİLİT)

```
canEditCase           -> EDIT_CASE
canGenerateDocs       -> GENERATE_DOC
canSyncUYAP           -> SYNC_UYAP
canViewFinance        -> VIEW_FINANCE
canEditFinance        -> EDIT_FINANCE
canChangeStatus       -> CHANGE_STATUS
canEditParties        -> EDIT_PARTIES
hasSignatureAuthority -> SIGN
receiveNotifications  -> permission DEĞİL (notification subscription)
```

Guarded-edge action adayları (P2'de yalnız tanı; enforce YOK):
```
UYAP_SEND · TRIGGER_HACIZ · SEND_NOTIFICATION · PREPARE_NOTIFICATION · APPROVE_NOTIFICATION
SEND_APPROVED_NOTIFICATION · SEND_DIRECT_NOTIFICATION · INITIATE_BANK_TRANSFER
MANAGE_OFFICE_CREDENTIALS · ASSIGN_LEGAL_RESPONSIBLE · ASSIGN_OPERATION_RESPONSIBLE
EXPORT_CASE · EXPORT_BULK · DELETE_DOCUMENT · DELETE_FINANCE
```
Mevcut `CasePolicyEngine`/`ActionCode` enum genişler; **yeni katalog tablosu YOK.** Enum'da mevcut-ama-
wiring'siz olanlar (UYAP_SEND/TRIGGER_HACIZ/SYNC_UYAP/GENERATE_DOC/SEND_NOTIFICATION/UYAP_QUERY) yeniden kullanılır.

## 5. Decision taxonomy + diagnostic kayıt alanları

`decision_source ∈ { OPEN, CASE_GRANT, OFFICE_DEFAULT, FULL_AUTHORITY, CONFIRM_REQUIRED, VALIDITY_ROUTE,
APPROVAL_REQUIRED, HARDWARE, TENANT_BOUNDARY }`. Kayıt alanları:
```
actor_user_id      = GERÇEK uygulayıcı (butona kim bastı — tek-asıl felsefe kaydı değiştirmez)
case_id · action_code · decision · decision_source · action_class
effective_mode     = observe
would_block        = true/false
reason · approved_by? · executed_by(=actor) · full_authority_id? · created_at
```

## 6. Observe-mode davranışı

Feature flag: **`GUIDED_OPEN_AUTHZ_MODE`**. P2'de yalnız iki değer:
```
off      = resolver hiç çağrılmaz / hiç log yok (tam mevcut davranış)
observe  = resolver karar hesaplar + diagnostic/audit yazar; AKIŞ DEĞİŞMEZ (ALLOW+LOG)
```
İleride (P3+): `confirm · route · enforce` eklenir — **ama P2'de DEĞİL.** Varsayılan prod değeri = `off`
(veya kontrollü `observe`); flag ile anında geri alınır.

## 7. Audit / diagnostic stratejisi (SPAM YOK)

"Her şey audit" doğru ama **P2'de her read'i AuditLog'a basmak gürültü.** Kural:
```
L0-L1 (low-risk read)        : KALICI AuditLog YAZMA. Gerekirse structured diagnostic log (sampling).
L2-L4 (protected/high-risk)  : PERMISSION_OBSERVED / PERMISSION_WOULD_REQUIRE_* kaydı yaz.
would_block = true           : kalıcı AuditLog veya diagnostic event yaz (asıl ilgi alanı).
```
Odak **yüksek-riskli aksiyonlar** (P1 forensic: açık = guard wiring + capacity/decision eksikliği, katalog değil).

## 8. İlk instrument edilecek alanlar (140'a dağılma YOK)

Önce **L2-L4 kenarları** (P1 forensic'in tier-1/2 + guarded-edge seti):
```
bank.transfer · UYAP trigger-haciz · UYAP e-Takip submit · UYAP_SEND · resmî evrak generate/send
legal/operation responsible change · credential management · delete finance · delete document
SEND_NOTIFICATION · PREPARE/APPROVE/SEND_APPROVED/SEND_DIRECT_NOTIFICATION · CHANGE_STATUS
EDIT_PARTIES · EXPORT_CASE · EXPORT_BULK
```
P2'de bunlar **engellenmez**; yalnız ölçülür: *"bu işlem OPEN mı / CONFIRM_REQUIRED mı / ROUTE mı /
APPROVAL mı / HARDWARE mı?"*

## 9. Test stratejisi

```
Regression : mevcut API davranışı DEĞİŞMEDİ (status code + response body aynı). En kritik kanıt.
Unit       : resolver L0-L4 kararlarını + decision_source'u doğru döndürür (capacity × case-grant × full-authority senaryoları).
Snapshot/diagnostic : örnek aksiyonlar observe-mode'da ALLOW+LOG'da kalır; would_block doğru hesaplanır.
```

## 10. Rollback / feature flag planı

```
GUIDED_OPEN_AUTHZ_MODE=off  → resolver tamamen devre dışı, tam mevcut davranış (anında rollback).
observe                      → yalnız hesap+log (P2 hedefi).
Hiçbir migration yok → geri alma = flag + revert PR. Kalıcı şema riski yok.
```

---

## P2 Kabul Kriterleri (KİLİT — kod PR'ı bunları kanıtlamalı)

```
1.  Yeni 403 YOK.
2.  Endpoint response DEĞİŞMEZ.
3.  Migration YOK.
4.  PermissionCatalog/Template/EventStore YOK.
5.  Frontend/drawer DEĞİŞMEZ.
6.  Resolver merkezi ve test edilebilir.
7.  ActionCode mapping küçük setle başlar (§4).
8.  Observe-mode feature flag ile çalışır (GUIDED_OPEN_AUTHZ_MODE=off/observe).
9.  actor_user_id = GERÇEK uygulayıcı.
10. decision_source yazılır.
11. would_block / would_require_confirm / would_require_route ölçülür.
12. Regression test: mevcut API davranışı değişmedi.
13. Unit test: resolver L0-L4 kararlarını doğru döndürür.
14. Snapshot/diagnostic test: örnek aksiyonlar ALLOW+LOG modunda kalır.
```

---

## 11. P2 Execution Mini-Plan (kod yok — P2a/P2b'yi kilitler)

> **🚦 KESİN KURAL (yinelenir):** P2 hiçbir kullanıcı aksiyonunu engellemez; yalnız resolver kararını hesaplar,
> diagnostic/audit üretir ve mevcut davranışı korur.

### 11.1 Mimari netlik — ÜÇ AYRI KATMAN (karıştırma yasağı)

1. **CasePolicyEngine** (`policy-engine/case-policy-engine.service.ts:70` → `canPerformAction(caseId, actionCode, ctx)`)
   = case-policy / fact gating (UYAP-outage, case-status). **PER-USER DEĞİL.** CpeRequiredGuard ile 2 finans op
   enforce eder. **P2'de DOKUNULMAZ.**
2. **`permission-diagnostics/`** (`warn-only-audit.service.ts` → `recordWouldDeny` = PERMISSION_WOULD_DENY observe
   deseni, best-effort; `permission-hard-guard`, `permission-diagnostics-map`). **P2'de yalnız OBSERVE ADAPTER.**
3. **EffectivePermissionResolver (P2 YENİ)** = per-user Guided-Open karar motoru (capacity × case-grant ×
   fullAuthority × action-class → Decision). CPE'yi REPLACE ETMEZ; onunla **composes**.

### 11.2 Konum (REVİZYON 1)

Resolver core **`permission-diagnostics` ALTINDA DEĞİL** — diagnostic değil, **domain karar motoru** (P3/P4'te
route/confirm/approval'ın çekirdeği olacak). Konum:
```
policy-engine/effective-permission-resolver.service.ts   (veya authorization/effective-permission-resolver.service.ts)
policy-engine/types/effective-permission.types.ts        (Decision / decision_source / action_class)
permission-diagnostics/guided-open-observe.service.ts     (yalnız observe adapter — best-effort diagnostic/audit)
```
> Resolver = domain karar motoru · Observe service = diagnostic/audit adaptörü. Bu ayrım, resolver'ı ileride
> enforcement'a taşırken import karmaşasını engeller.

### 11.3 7 sorunun cevabı (revize)

1. **Hangi dosya?** §11.2 + ActionCode additive (`policy-engine/types/action-code.enum.ts`) + capacity reader
   (lawyerRank/staffType) + case-grant reader (casePermissions / CaseStaff.can*).
2. **Nereye bağlanır?** ActionCode enum reuse; CasePolicyEngine + CpeRequiredGuard + 2 finans op **DOKUNULMAZ**;
   observe çağrısı warn-only call-site deseniyle (`case.controller.ts:115` / `report.controller.ts:23,184`).
3. **Flag?** `GUIDED_OPEN_AUTHZ_MODE` env (`off | observe`), guided-open-observe.service'te okunur. **Default off.**
4. **Diagnostic kim yazar?** guided-open-observe.service, best-effort try/catch (warn-only garantisiyle).
   **(REVİZYON 2)** Eğer `PERMISSION_OBSERVED` mevcut AuditLog şemasında **migration gerektirmeden** yazılamıyorsa
   **KULLANILMAZ**; mevcut `PERMISSION_WOULD_DENY` / generic diagnostic / structured log deseni kullanılır. **Yeni DB enum/migration YOK.**
5. **İlk pilot?** §12 (P2b-1 dar).
6. **Testler?** §11.5.
7. **Davranış değişmedi kanıtı?** observe best-effort (asla throw etmez) + resolver sonucu engellemede KULLANILMAZ
   + flag default off + regression test (status+body aynı).

### 11.4 Karar modeli + kayıt alanları (REVİZYON 3 + 5)

```
Decision ∈ { ALLOW · CONFIRM_REQUIRED · ROUTE_REQUIRED · APPROVAL_REQUIRED · HARDWARE_REQUIRED · DENY_TENANT_BOUNDARY }
decision_source ∈ { OPEN · CASE_GRANT · OFFICE_DEFAULT · FULL_AUTHORITY · CONFIRM_REQUIRED · VALIDITY_ROUTE · APPROVAL_REQUIRED · HARDWARE · TENANT_BOUNDARY }

resolve({ actorUserId, tenantId, caseId?, actionCode, context })   ← REVİZYON 5: caseId OPSİYONEL (office-wide action'lar)

Kayıt alanları (REVİZYON 3 — would_block SABİT DEĞİL; enforced sabit):
  actor_user_id (GERÇEK) · tenant_id · case_id? · action_code · decision · decision_source · action_class (L0-L4)
  mode = observe · enforced = false   ← P2'de HER ZAMAN sabit
  would_require_confirm / would_require_route / would_require_approval / would_require_hardware / would_deny_tenant_boundary
  reason · created_at
```

### 11.5 ActionCode v1 mapping (REVİZYON 4 — snapshot + duplicate yok)

```
canEditCase→EDIT_CASE · canGenerateDocs→GENERATE_DOC · canSyncUYAP→SYNC_UYAP · canViewFinance→VIEW_FINANCE
canEditFinance→EDIT_FINANCE · canChangeStatus→CHANGE_STATUS · canEditParties→EDIT_PARTIES · hasSignatureAuthority→SIGN
receiveNotifications → permission DEĞİL (notification subscription)
```
**Mevcut enum SNAPSHOT (25 leaf, `action-code.enum.ts`):** UYAP_SEND/UYAP_QUERY · REQUEST_EXPENSE/APPROVE_EXPENSE/
RECORD_EXPENSE_PAYMENT · SEND_NOTIFICATION/SEND_DEBTOR_MSG/SEND_PAYMENT_ORDER/NOTIFICATION_DELIVERED ·
QUERY_ASSETS/QUERY_BANK_ACCOUNTS/QUERY_VEHICLES · TRIGGER_HACIZ/REQUEST_SALE/REQUEST_ENFORCEMENT/
PROCEED_TO_ENFORCEMENT/EVICTION_REQUEST · CLOSE_CASE/FINALIZE_CASE/ARCHIVE_CASE/REOPEN_CASE/CONVERT_FROM_MTS/
RECORD_COLLECTION/RECORD_PAYMENT · ADD_NAFAKA_PERIOD/UPDATE_EXCHANGE_RATE.
**P2a kuralları:** (a) enum snapshot PR diff'inde AÇIKÇA gösterilir; (b) var olan yaprak tekrar eklenmez;
(c) yakın-anlamlı mevcut enum varsa duplicate YOK → alias/mapping tercih (**özellikle `GENERATE_DOC` ve `SYNC_UYAP`
iki kez kontrol** — UYAP_SEND/UYAP_QUERY zaten var); (d) eklenen her leaf `ACTION_RISK_LEVELS`'a da girer (Record exhaustive → TS zorlar).

## 12. P2a / P2b Implementation Split

### P2a — resolver CORE (endpoint'e BAĞLANMAZ; üretim davranışı HİÇ değişmez)

İçerik: ActionCode v1 additive + `ACTION_RISK_LEVELS` · `effective-permission.types` · `EffectivePermissionResolver`
(policy-engine/ veya authorization/) + capacity reader + case-grant reader + **unit testler + mapping testleri.**
**P2a'da KESİNLİKLE YOK:** controller hook · observe service · AuditService yazımı · frontend · migration · yeni 403 ·
guard/decorator · P3/P4 enforcement. *(Resolver hiç çağrılmadığı için üretim davranışı değişmez.)*

### P2b — observe HOOK (ayrı PR; iki dar alt-parça)

- **P2b-1 (ilk DAR pilot):** `guided-open-observe.service` + `GUIDED_OPEN_AUTHZ_MODE` flag (default off) + best-effort
  diagnostic + regression test; pilot = **cases.delete · legal-responsible-lawyer · credential management** (zaten
  guard'lı / düşük davranış riski).
- **P2b-2:** CHANGE_STATUS · EDIT_PARTIES · SEND_NOTIFICATION ailesi · UYAP_SEND · bank.transfer. *(Tek PR'da
  hepsini bağlama — log-noise + context-bug riski.)*
- **P2b kırmızı çizgisi:** resolver sonucu endpoint kararında KULLANILMAZ · response status/body DEĞİŞMEZ · hata
  olursa observe service YUTAR.

### 11.5 test kriterleri (özet)

unit (resolver L0-L4 + decision_source) · mapping (casePermissions→ActionCode) · observe (CONFIRM_REQUIRED dönse
bile response değişmez) · best-effort (observe throw etse bile akış kırılmaz) · regression (API davranışı aynı) ·
audit (actor_user_id GERÇEK · mode=observe · enforced=false).

---

> **P2 EXECUTION PLAN KARARI (kayıt):** `EffectivePermissionResolver` diagnostic katmanı DEĞİL, **domain karar
> motorudur** → `policy-engine/` (veya `authorization/`) altında; `permission-diagnostics` yalnız observe adapter +
> best-effort audit/diagnostic yazımı. **P2a** endpoint'e bağlanmaz, üretim davranışını değiştirmez, yalnız resolver
> core + ActionCode mapping + unit/mapping testleri. **P2b** observe-mode hook fazıdır; `GUIDED_OPEN_AUTHZ_MODE`
> varsayılan **off**; açık olsa bile kullanıcı aksiyonu engellenmez, yeni 403 üretilmez, response değişmez. Eğer
> `PERMISSION_OBSERVED` AuditLog'a migration gerektiriyorsa **kullanılmaz** (mevcut warn-only/generic diagnostic
> deseni). P2 kayıtlarında **enforced=false sabittir**; would_require_confirm/route/approval/hardware alanları
> ilerideki guarded-edge davranışını ölçmek için hesaplanır.

## Kesin sıra (P2 ve sonrası)

```
1. (TAMAM) #500 final + #502 pointer + #503 P2 scope merged → doküman tek-kaynak.
2. (BU PR) P2 execution mini-plan §11/§12 (6 revizyonla).
3. P2a kod PR (resolver core; endpoint'e BAĞLANMAZ; üretim davranışı değişmez)   ← sırada
4. P2b-1 (dar pilot) → P2b-2 observe hook PR'ları (ayrı onay)
5. P2 gözlem raporu
6. P3 protected-action (route/confirm/approval) enforcement TASARIMI
```

**P3'e kadar route/confirm/approval enforcement CANLIYA ALINMAZ.** P2 yalnız gözlem.

> **HÜKÜM:** P2 = "karar hesapla + truthful logla, akışı değiştirme." Bu doküman P2'nin sınırlarını kilitler;
> kod ancak onaylanınca başlar. Aksi halde ilk kod PR'ında tekrar RBAC/enforcement/guard karmaşası riski var.
