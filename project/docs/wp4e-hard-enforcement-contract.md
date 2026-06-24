# WP-4e-0 — Phase 3 Hard Enforcement Contract

> **Durum:** Sözleşme / tasarım (docs-only). **Kod YOK · permission deny YOK · hard enforcement implementasyonu YOK ·
> migration YOK · schema YOK · UI YOK · davranış değişikliği YOK.**
> **Bağlam:** WP-4b kararının ([`wp4b-permission-enforcement-decision.md`](./wp4b-permission-enforcement-decision.md))
> Phase 3 adımı. WP-4c-1 diagnostics + WP-4d-0/1/2 warn-only tamamlandı; bu doc **ilk gerçek 403** öncesi sözleşmeyi sabitler.
> **Ön sürüm:** origin/main `0929379`.

## 1. Decision summary

- Phase 3 **gerçek 403** üretir — bu **davranış değiştiren ilk faz**tır. Bu yüzden **tek operasyon ailesiyle** başlanır.
- **İlk hard-enforcement adayı: `cases.delete`** (`DELETE /cases/:id`). Geri dönüşü zor, permission leaf/scope net,
  finans/CPE karmaşıklığı yok, testi kolay.
- **Permission store HENÜZ YOK** → ilk hard guard, mevcut güvenilir rol üzerinden **geçici "bridge guard"**:
  **ADMIN izinli, non-ADMIN reddedilir** (PERMISSION_DENIED). "Bridge" = permission-store gelene (WP-4f) kadar köprü.
- **Legal hard guard ayrı kalır** (RBAC ile override edilemez); `cases.changeLegalResponsibleLawyer` ilk aday DEĞİL.
- Red anında `PERMISSION_DENIED` audit'i yazılır. Reddedilmeyen istek mevcut davranışla devam eder.

## 2. WP-4c diagnostics & WP-4d warn-only ile ilişki

- WP-4c-1 (Phase 1) "would-allow/would-deny"yi read-only üretti.
- WP-4d-1/2 (Phase 2) seçili tenant-only op'larda `PERMISSION_WOULD_DENY` audit'i yazdı (block YOK).
- WP-4e (Phase 3) aynı map + guard mantığını **gerçek 403**'e bağlar. `cases.delete` warn-only geçmişi olmasa da
  geri-dönüş-zor olduğu için öne alınır (WP-4b karar ilkesi: güvenlik/geri-dönüş-zor öne alınabilir).

## 3. Phase 3 hard enforcement ne demek

- Seçili operasyonda, yetki kuralı sağlanmazsa **403 ForbiddenException** + `PERMISSION_DENIED` audit.
- Yetki kuralı sağlanırsa işlem **mevcut davranışıyla aynen** devam eder (response değişmez).
- Warn-only'den farkı: warn-only hiçbir şeyi engellemezdi; hard **engeller**.

## 4. Candidate operation groups

| Grup | Operasyonlar | Durum / not |
|---|---|---|
| **1. Güvenlik / credential / tenant admin** | `office.updateSmtpSettings`, `office.updateSmsSettings` | **ZATEN ADMIN-hard-guard** (WP-4c-hotfix-1). Referans örnek; **yeniden kodlanmaz.** |
| **2. Geri dönüşü zor dosya işlemleri** | `cases.delete`, `cases.close`, `cases.batchUpdate`, `cases.changeLegalResponsibleLawyer`, `cases.assignOperationOwner` | Phase 3 ana hedef. `changeLegalResponsibleLawyer` legal-gated (ayrı). |
| **3. Finans / tahsilat / ödeme** | `finance.manage` delete/finalize/payment | CPE-guarded olanlar AYRI işaretli; CPE↔RBAC birleşimi **ayrı karar** (WP-4e sonrası). |
| **4. Rapor export** | `reports.export` | **Önce warn-only metrik (WP-4d-2 yapıldı), sonra hard** — hemen hard DEĞİL. |
| **5. Audit görüntüleme** | `audit.view` | Canlı endpoint yok → hard kapsamına ALINMAZ; yalnız future leaf. |

## 5. First hard-enforcement candidate decision

**`cases.delete` (`DELETE /cases/:id`).** Gerekçe:
- Geri dönüşü zor (yıkıcı işlem) → en yüksek koruma değeri.
- Permission leaf net (`cases.delete`), scope net (OFFICE).
- Enforcement davranışı anlaşılır: yetkisiz → 403, yetkili → başarılı.
- Finans/CPE karmaşıklığına girmez; legal hard guard'a dokunmaz.

> `cases.changeLegalResponsibleLawyer` alternatifti; ancak legal-gated + tam-1-sorumlu invariant'ı taşıdığı için
> daha karmaşık. İlk hard PR'ı **basit ve net** tutmak için `cases.delete` seçildi.

## 6. Permission leaf & scope mapping

| Operation | requiredPermission | requiredScope | currentGuard (bugün) |
|---|---|---|---|
| `cases.delete` (`DELETE /cases/:id`) | `cases.delete` | **OFFICE** | TENANT_ONLY |

(OFFICE: ofis genelinde dosya silme yetkisi. ALL yalnız sistem-istisnası; gerekmez.)

## 7. Who is allowed initially (bridge guard)

- **Permission store yok** → ilk hard guard rol-temelli **bridge**: **`role === 'ADMIN'` izinli; diğerleri 403.**
- Bu, mevcut tek güvenilir yetki sinyali (UserRole=ADMIN, JWT claim) + yerleşik precedent (office credential guard,
  report task-performance) ile tutarlı.
- **"Bridge guard"** olarak adlandırılır: permission-store + per-user capability (WP-4f) gelince gerçek
  `cases.delete@OFFICE` kontrolüne **terfi edilecek**; ADMIN-only geçici köprüdür.
- **Solo avukat kilitlenmez:** tenant owner / ilk avukat = ADMIN → silme yetkisi onda kalır.

## 8. Backward compatibility / migration risk

- **Davranış değişir:** bugün TENANT_ONLY → herhangi bir authenticated tenant user dosya silebiliyor. Hard sonrası
  **yalnız ADMIN** silebilir; non-ADMIN kullanıcı 403 alır.
- **Etki:** non-admin kullanıcılar dosya silme yeteneğini kaybeder (Phase 3'ün AMACI budur — yıkıcı işlemi kısıtlamak).
- **Veri/migration:** YOK (yalnız guard; schema/migration yok). Mevcut veriler etkilenmez.
- **Solo/ADMIN:** etkilenmez (silme onda).
- Bu kayıp **kasıtlı**; rollout + rollback (§9/§12) ile güvenli yönetilir.

## 9. Rollout strategy

- **Tek endpoint** (`DELETE /cases/:id`) ile başla; başka op eklenmez.
- **Önerilen güvenli açılış:** hard guard'ı bir **env/feature-flag** arkasına al (ör. `PERMISSION_HARD_ENFORCE_CASES_DELETE`,
  default'u WP-4e-1'de kararlaştır) → production'da anında aç/kapa, redeploy beklemeden rollback. (Flag zorunlu değil;
  tek-endpoint revert de basittir — WP-4e-1 hangisini seçeceğine karar verir.)
- 403 anında `PERMISSION_DENIED` audit yazılır → gerçek etkiyi production'da ölçeriz.

## 10. Audit event contract

| AuditLog alanı | Değer |
|---|---|
| `entityType` | `"PERMISSION"` |
| `action` | `"PERMISSION_DENIED"` |
| `entityId` | caseId |
| `userId` | actorUserId |
| `metadata` | aşağıdaki payload |

```json
{
  "event": "PERMISSION_DENIED",
  "tenantId": "...",
  "actorUserId": "...",
  "operation": "cases.delete",
  "requiredPermission": "cases.delete",
  "requiredScope": "OFFICE",
  "currentGuard": "TENANT_ONLY",
  "enforcementPhase": "PHASE_3_HARD_ENFORCE",
  "requestPath": "/cases/:id",
  "reason": "Missing required permission under hard enforcement.",
  "createdAt": "..."
}
```

Mevcut AuditLog kullanılır (action/entityType serbest-string → **şema/migration yok**). Audit yazımı best-effort:
**403 her durumda döner; audit hatası 403'ü etkilemez** (ama 403'ü engellemez de — guard önce çalışır, audit sonra).

## 11. Test strategy (WP-4e-1 için)

1. Non-ADMIN tenant user `DELETE /cases/:id` → **403 ForbiddenException** (servis/silme ÇAĞRILMAZ).
2. 403 ile birlikte `PERMISSION_DENIED` audit yazılır (payload §10).
3. ADMIN user `DELETE /cases/:id` → **mevcut silme davranışı aynen** (başarılı; case.service.remove çağrılır).
4. ADMIN path'te PERMISSION_DENIED audit YAZILMAZ (yalnız reddte).
5. Tenant izolasyonu korunur (guard tenantId'yi değiştirmez).
6. (flag seçilirse) flag kapalıyken eski davranış (TENANT_ONLY) korunur — rollback testi.
7. Audit yazım hatası 403 davranışını bozmaz.

## 12. Rollback strategy

- **Birincil:** WP-4e-1 tek-endpoint/tek-guard olduğu için **PR revert** anında eski davranışı getirir.
- **İkincil (önerilen):** env/feature-flag → production'da redeploy beklemeden **anında kapatma**.
- Schema/migration olmadığı için rollback **veri riski taşımaz**.

## 13. Non-goals

- Genel RBAC framework YOK · permission UI YOK · user permission store YOK · role template migration YOK ·
  staff capability YOK · legal review/sign-off YOK · temporal UI YOK · balance/shadow-display YOK ·
  finance/CPE rewrite YOK · reports export hard enforcement YOK (önce warn-only metrik).

## 14. Next PR plan

- **WP-4e-1 — `cases.delete` hard guard (kod):** `DELETE /cases/:id` için bridge guard (ADMIN allowed, non-ADMIN 403)
  + `PERMISSION_DENIED` audit (best-effort). Test-first (§11). tsc.prod 0. (Flag-gate kararı PR'da netleşir.)
  Bu doc (WP-4e-0) merge edilmeden başlanmaz.
- Eğer "ADMIN-only fazla kaba" değerlendirmesi çıkarsa WP-4e-1 öncesi **WP-4e-1a — Case delete authority decision**
  (docs-only) açılır. Mevcut değerlendirme: cases.delete = yıkıcı → ADMIN-only köprü **kabul edilebilir** (ayrı 1a gerekmez).
- Sonra: WP-4e-2 (sıradaki geri-dönüş-zor op, ör. cases.batchUpdate/close), WP-4f (permission store + per-user terfi),
  WP-4g (decorative cleanup).
