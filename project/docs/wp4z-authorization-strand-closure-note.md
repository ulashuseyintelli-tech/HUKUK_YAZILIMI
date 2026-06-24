# WP-4z — Authorization Strand Closure Note

> **Durum:** Bilinçli kapanış notu (docs-only). **Kod YOK · enforcement YOK · migration YOK · UI YOK.**
> Bu "durmak" değildir; WP-4 yetkilendirme hattını **bilinçli olarak "iyi seviyede kapandı"** checkpoint'ine
> almaktır — sonsuz RBAC treadmill'ine girmemek için.
> **Ön sürüm:** origin/main `bc845af`.
> **Anchor doc'lar:** [`wp4b-permission-enforcement-decision.md`](./wp4b-permission-enforcement-decision.md) ·
> [`wp4c-permission-enforcement-inventory.md`](./wp4c-permission-enforcement-inventory.md) ·
> [`wp4d-warn-only-enforcement-contract.md`](./wp4d-warn-only-enforcement-contract.md) ·
> [`wp4e-hard-enforcement-contract.md`](./wp4e-hard-enforcement-contract.md)

## 1. Kısa hüküm

- WP-4 authz strand şimdi **"good enough" checkpoint'inde.**
- **Full permission store / full RBAC / role-template UI şu an AÇILMAYACAK.**
- Değişmez ilke korunur: **operasyonel yetki devredilebilir; hukuki sıfat devredilemez** (legal hard guard RBAC
  ile override edilemez).

## 2. Tamamlananlar (main'de)

| Gate | İçerik | PR |
|---|---|---|
| WP-4a | Permission Tree / Office Role Model design | #440 |
| WP-4b | Permission enforcement decision (flat RED → fazlı RBAC) | #441 |
| WP-4c-0 | Permission enforcement inventory (170 endpoint) | #442 |
| hotfix-1 | **SMTP/SMS credential update → ADMIN-only** (gerçek açık kapandı) | #443 |
| hotfix-2a | Authless endpoint **false-positive** doğrulaması (kod yok) | #444 |
| WP-4c-1 | Phase 1 read-only diagnostics (map + service + admin endpoint) | #446 |
| WP-4d-0 | Warn-only enforcement contract | #447 |
| WP-4d-1 | Warn-only audit: `cases.responsibilityAt` | #448 |
| WP-4d-2 | Warn-only audit: `reports.dashboard` + `exportCases` | #449 |
| WP-4e-0 | Hard enforcement contract | #450 |
| WP-4e-1 | **İlk Phase 3 hard guard: `cases.delete` ADMIN-only (gerçek 403)** | #452 |

## 3. Bilinçli durdurulanlar

- Her tenant-only endpoint'e warn-only **eklenmeyecek**.
- Her destructive endpoint hemen bridge guard **yapılmayacak**.
- Permission store / role template / permission UI **açılmayacak**.
- Decorative role/permission alanı cleanup'ı **ertelenecek**.
- Full RBAC yalnız **gerçek çok-kullanıcılı yetki ihtiyacı doğarsa** açılacak.

## 4. Neden duruyoruz?

- Warn-only pattern **kanıtlandı** (WarnOnlyAuditService, yeniden kullanılabilir, testli).
- İlk hard enforcement pattern **kanıtlandı** (PermissionHardGuardService bridge guard).
- En kritik credential açığı **kapandı** (SMTP/SMS ADMIN-only).
- Daha fazla warn-only = **audit gürültüsü** (güvenlik duruşunu değiştirmez).
- Daha fazla bridge guard = **admin-only kaba kilitleme** riski (store gelince elden geçecek).
- Full permission store = **büyük ürün/UX/migration** işi; ihtiyaç kanıtı olmadan başlatmak = treadmill.

## 5. Kalan riskler (açıkça kabul edilen)

- Tenant içi **çoğu endpoint hâlâ tenant-only** (rol ayrımı yok).
- Decorative role/permission alanları (UserRole, CaseStaff/CaseLawyer izinleri, StaffMember izinleri) **hâlâ tam
  enforce edilmiyor** (stored-but-not-enforced).
- **Full per-user permission ayrımı yok** (bridge guard yalnız ADMIN/non-ADMIN).
- **Non-admin dosya silme artık engelli**; diğer destructive op'lar (batch-update, dues/collection delete, close)
  hâlâ tenant-only → ileride değerlendirilebilir.

## 6. Yeniden açma kriterleri

WP-4 hattı şu durumlardan biri doğarsa yeniden açılır:
- Büroda **çok-kullanıcılı gerçek yetki ayrımı** ihtiyacı doğarsa.
- Non-admin kullanıcıların yetki sınırları **sözleşmeyle** istenirse.
- **Regülasyon / denetim / audit** gerekçesi çıkarsa.
- **Destructive operation incident** yaşanırsa (yanlış silme/kapatma vb.).
- **Finance/CPE enforcement** ihtiyacı netleşirse.

## 7. Gelecekte açılırsa ilk gate (aday)

- **WP-4f-0 — Permission store design**, veya
- **Destructive-op hardening inventory** (kalan yıkıcı uçlar: batch-update / dues-collection delete / close), veya
- **Role-template UI design**.
- (Reorder önerisi: hukuki doğruluk değeri yüksek olduğu için **legal hard guards finalization** rol-template UI'dan
  önce gelmeli.)

## 8. Non-goals

- Kod değişikliği YOK · yeni enforcement YOK · permission UI YOK · migration YOK · full RBAC YOK.

---

> **Kayıt:** Bu not, WP-4 authz strand'ini bilinçli olarak kapatır. Mevcut durum: credential açığı kapalı +
> diagnostics + warn-only + ilk destructive hard guard + contract/inventory main'de. Devamı (full RBAC) **ihtiyaç-gated**.
