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

## Kesin sıra (P2 ve sonrası)

```
1. (TAMAM) #500 final + #502 pointer merged → doküman tek-kaynak.
2. Bu P2 mini-scope docs PR  ← şu an
3. P2 scope ONAYI (Ulaş)     ← bekleniyor
4. P2 observe-mode KOD PR (ayrı onay)
5. P2 gözlem raporu
6. P3 protected-action (route/confirm/approval) enforcement TASARIMI
```

**P3'e kadar route/confirm/approval enforcement CANLIYA ALINMAZ.** P2 yalnız gözlem.

> **HÜKÜM:** P2 = "karar hesapla + truthful logla, akışı değiştirme." Bu doküman P2'nin sınırlarını kilitler;
> kod ancak onaylanınca başlar. Aksi halde ilk kod PR'ında tekrar RBAC/enforcement/guard karmaşası riski var.
