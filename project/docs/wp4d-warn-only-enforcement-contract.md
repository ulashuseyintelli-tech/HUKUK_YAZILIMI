# WP-4d-0 — Warn-only Enforcement Contract

> **Durum:** Sözleşme / tasarım (docs-only). **Kod YOK · permission deny YOK · PERMISSION_WOULD_DENY audit'i HENÜZ
> YOK · migration YOK · schema YOK · UI YOK · davranış değişikliği YOK.**
> **Bağlam:** WP-4b kararının ([`wp4b-permission-enforcement-decision.md`](./wp4b-permission-enforcement-decision.md))
> Phase 2 adımı; WP-4c-1 diagnostics'inin ([`wp4c-permission-enforcement-inventory.md`](./wp4c-permission-enforcement-inventory.md))
> read-only çıktısını gerçek endpoint akışına bağlamadan önce sözleşmeyi sabitler.
> **Ön sürüm:** origin/main `d61833b`.

## 1. Decision summary

- **Warn-only = gerçek block DEĞİL.** İşlem her durumda mevcut production davranışıyla devam eder. Tek çıktı: bir
  **diagnostik audit event'i** (`PERMISSION_WOULD_DENY`).
- **ADMIN_HARD_GUARD endpoint'ler warn-only kapsamına ALINMAZ** (zaten hard guard; ör. office SMTP/SMS — WP-4c-hotfix-1).
- **İlk kapsam:** `currentGuard = TENANT_ONLY` olan, gelecekte permission gerektirecek seçili **read** operasyonları.
- **Permission store yok** → gerçek "bu kullanıcı yetkisiz" hesabı YAPILMAZ; event "bu operasyon RBAC altında izin
  gerektirecek; bugün tenant-only olarak izinli" der (per-user red iddiası yok).
- Event mevcut **AuditLog**'a yazılır (yeni tablo/şema yok). Emisyon **WP-4d-1** (kod) ile gelir; bu doc yalnız sözleşme.

## 2. WP-4c-1 diagnostics ile ilişki

- WP-4c-1 `PermissionDiagnosticsService` **read-only** `wouldAllow/wouldDeny` üretir (çağrı yok, salt sorgu).
- WP-4d, aynı map'i (`permission-diagnostics-map.ts`) **gerçek endpoint akışına** bağlar: seçili operasyon çalışınca
  diagnostics değerlendirilir ve **engellemeden** bir audit event'i yazılır.
- Tek-kaynak: WP-4d, WP-4c-1'in map'ini ve değerlendirme mantığını yeniden kullanır (çift-otorite yok).

## 3. Warn-only nedir / ne değildir

| Warn-only NEDİR | Warn-only NE DEĞİLDİR |
|---|---|
| Operasyon çalışırken diagnostik bulgu üretir | İşlemi engellemez (403 YOK) |
| `PERMISSION_WOULD_DENY` audit event'i yazar | Gerçek permission check değil |
| "Bu op RBAC'ta izin gerektirecek" sinyali | "Bu kullanıcı yetkisiz" kesin iddiası DEĞİL (store yok) |
| Mevcut davranışı AYNEN korur | Mevcut guard'ları (tenant/admin/legal) değiştirmez |

## 4. Permission store yokken evaluation rule

Gerçek per-user permission store HENÜZ YOK. Bu yüzden:

- **"Missing permission" hesabı YAPILMAZ.** Sistem, kullanıcının bir izne sahip olup olmadığını bilemez (store yok).
- Seçili `TENANT_ONLY` operasyonlar için kural: operasyon çalıştığında **"future permission would be required"**
  event'i üret. Anlam: "bu op RBAC altında `{requiredPermission}@{scope}` gerektirecek; bugün tenant-only olarak
  herkese açık."
- Event alanları bu dürüstlüğü taşır:
  - `allowedByCurrentBehavior: true` — bugün izinli (engellenmedi).
  - `wouldBeRestrictedUnderRbac: true` — gelecekte RBAC kapısına girecek.
- **Önemli dürüstlük notu:** `PERMISSION_WOULD_DENY` adı güçlü; store olmadan bu **belirli kullanıcının reddedileceği**
  anlamına GELMEZ. Gerçek anlam: "henüz enforce edilmeyen bir izin GEREKECEK." Per-user red, ancak permission store
  geldiğinde (WP-4f öncesi) hesaplanır; o zamana kadar event op-düzeyinde instrumentation'dır.

## 5. İlk implementasyon için operasyon kapsamı (WP-4d-1 adayları)

`currentGuard = TENANT_ONLY` + gelecekte permission gerektirecek **read** operasyonları:

| Operation | requiredPermission | requiredScope | currentGuard |
|---|---|---|---|
| `cases.responsibilityAt` (`GET /cases/:id/responsibility-at`) | `cases.viewResponsibilityHistory` | OWN | TENANT_ONLY |
| `reports.dashboard` (`GET /reports/dashboard`) | `reports.view` | OFFICE | TENANT_ONLY |
| `reports.exportCases` (`GET /reports/export/cases`) | `reports.export` | OFFICE | TENANT_ONLY |

> WP-4d-1 ilk kod PR'ı bunların **biri veya ikisiyle** başlar (bkz. §11). reports export riskli/geniş görünürse ilk PR
> yalnız `responsibility-at` olur.

## 6. Excluded operations (warn-only kapsam DIŞI)

- **ADMIN_HARD_GUARD** olanlar (zaten hard): `office.updateSmtpSettings`, `office.updateSmsSettings`,
  `reports.taskPerformance`. Bunlar **hard** kalır; warn-only event üretmez.
- **HARD_LEGAL_GUARD_EXISTS** (hukuki guard zaten sert): lawyers add/remove/update (CaseLawyer.isResponsible). Değişmez.
- **CPE_GUARDED**: expense finalize/payment. CPE'de kalır; warn-only'ye alınmaz.
- **Write/mutation** operasyonları (cases.update/delete, batch, finance.manage): ilk warn-only turunda KAPSAM DIŞI
  (önce dü��ük-riskli read'lerle deseni doğrula).

## 7. Audit event contract

**Mekanizma:** Mevcut `AuditLog` kullanılır. `action`/`entityType` serbest-string (enum değil; `schema.prisma:4165-4166`)
→ **yeni şema/enum/migration GEREKMEZ.**

| AuditLog alanı | Değer |
|---|---|
| `entityType` | `"PERMISSION"` |
| `action` | `"PERMISSION_WOULD_DENY"` |
| `entityId` | ilgili kaydın id'si (varsa; ör. caseId) — yoksa null |
| `userId` | `actorUserId` |
| `metadata` | aşağıdaki payload |

**Event payload (metadata):**
```json
{
  "event": "PERMISSION_WOULD_DENY",
  "tenantId": "...",
  "actorUserId": "...",
  "operation": "reports.exportCases",
  "requiredPermission": "reports.export",
  "requiredScope": "OFFICE",
  "currentGuard": "TENANT_ONLY",
  "enforcementPhase": "PHASE_2_WARN_ONLY",
  "allowedByCurrentBehavior": true,
  "wouldBeRestrictedUnderRbac": true,
  "requestPath": "...",
  "createdAt": "..."
}
```

`severity` kavramı: payload'da `enforcementPhase: PHASE_2_WARN_ONLY` zaten "WARN_ONLY/DIAGNOSTIC" düzeyini belirtir;
ayrı bir severity alanı eklenebilir ama gereksiz (faz bunu taşır).

## 8. Runtime behavior

- Seçili operasyon çalıştığında: handler **normal akışına devam eder** (sonuç değişmez).
- Yan-etki olarak (tercihen response yolunu YAVAŞLATMADAN / bloklamadan) bir `PERMISSION_WOULD_DENY` AuditLog kaydı yazılır.
- **Audit yazımı best-effort**: audit hatası asıl işlemi ASLA bozmaz/engellemez (try/catch; sessiz-değil-loglu).
- İdempotent gürültü kontrolü: aşırı event üretimini önlemek için (ör. aynı op+user kısa sürede tekrar) WP-4d-1'de
  basit throttle/sampling DÜŞÜNÜLEBİLİR (zorunlu değil; ilk turda doğrudan yaz, sonra ölç).

## 9. Test strategy

WP-4d-1 (kod) için test-first:
1. Seçili op çalışınca `PERMISSION_WOULD_DENY` event'i yazılır (AuditService.log doğru payload'la çağrılır).
2. Event payload alanları sözleşmeye uygun (operation/requiredPermission/scope/currentGuard/phase/allowed/wouldBeRestricted).
3. **İşlem ENGELLENMEZ**: handler normal sonucu döner (warn-only, block yok).
4. Audit yazımı başarısız olsa bile asıl işlem başarılı tamamlanır (best-effort; hata yutulur/loglanır).
5. ADMIN_HARD_GUARD / kapsam-dışı op'lar için event YAZILMAZ (kapsam doğru sınırlı).
6. tsc.prod 0 + ilgili modül suite yeşil.

## 10. Non-goals

- Hard deny YOK · user permission schema YOK · permission UI YOK · role template YOK · migration YOK · genel RBAC YOK.
- Office SMTP/SMS guard DEĞİŞMEZ · legal hard guard DEĞİŞMEZ.
- Temporal UI polish YOK · balance/shadow-display YOK.

## 11. Next PR plan

- **WP-4d-1 — Warn-only audit for selected tenant-only operations (kod):** yalnız `GET /cases/:id/responsibility-at`
  ile başla (en düşük riskli read). reports export riskli/geniş görünüyorsa ikinci op'u ayrı PR'a bırak.
  - Mevcut `PermissionDiagnosticsService` + `permission-diagnostics-map` yeniden kullanılır.
  - `AuditService.log` ile `PERMISSION_WOULD_DENY` (entityType=PERMISSION) yazılır; best-effort; block yok.
  - Test-first (§9). tsc.prod 0. Bu doc (WP-4d-0) merge edilmeden başlanmaz.
- Sonra: WP-4d-2 (kapsam genişletme: reports), WP-4e (Phase 3 hard, güvenlik-kritik uçlardan), WP-4f (permission store + per-user), WP-4g (decorative cleanup).
