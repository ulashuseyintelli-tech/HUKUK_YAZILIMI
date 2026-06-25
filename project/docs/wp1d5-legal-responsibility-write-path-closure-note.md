# WP-1d-5 — Legal Responsibility Write-Path Closure Note

> **Tür:** DOCS-ONLY closure note. Kod · endpoint · UI · migration · schema · DB-write · audit-impl · full RBAC · permission-store · Codex domain YOK.
> **Baseline:** main `f8e7a82` (WP-1d-5-10 / #485 sonrası), 2026-06-25.
> **Anchor doc'lar:** `wp1d5-legal-responsibility-write-path-contract.md` (#470) · `...-decision-matrix.md` (#471) · `...-product-legal-decisions.md` (#472) · `wp1d5-legal-responsible-lawyer-change-endpoint-audit-contract.md` (#473) · `wp1d5-caselawyer-lifecycle-legal-responsible-decision-note.md` (#482/#483) · `wp1d5-d4-zero-responsible-data-audit-exactly-one-design.md` (#485).
> **İlgili strand'ler:** `wp1d4-temporal-responsibility-ui-strand-closure-note.md` · `wp1d4c-responsibility-history-endpoint-contract.md` · `wp4z-authorization-strand-closure-note.md`.

---

## 1. Closure Decision

WP-1d-5 is closed at the **controlled minimum implementation** checkpoint.

- Canonical Legal Responsible Lawyer write path is implemented.
- Known generic-update and lifecycle silent replacement/removal bypasses are closed.
- Accepted lifecycle initialization and create-dedupe exceptions remain documented.
- D4 current/dev data audit is clean; migration/schema work is not opened.

**Do not claim:**
> "All legal responsible state changes only go through the canonical endpoint."

**Correct claim:**
> "Controlled legal responsible lawyer record changes use the canonical endpoint. Accepted lifecycle initialization and create-dedupe exceptions remain documented."

---

## 2. Completed PR Chain

```
#470 write-path contract
#471 decision matrix
#472 product/legal decisions
#473 endpoint + audit contract
#474 backend canonical implementation
#476 frontend UI
#477 button placement
#479 UI consolidation + refresh + UI-level bypass closure        → 2d91212
#480 backend generic-update bypass closure                       → ea554b5
#482 lifecycle forensic / decision note                          → 3749e97
#483 lifecycle hardening                                         → 89dd6f6
#485 D4 zero-responsible audit + exactly-one design              → f8e7a82
#486 (bu not) write-path closure note
```

---

## 3. Canonical Responsibility Model

**Dosya Operasyon Sorumlusu**
- `Case.responsibleLawyerId` XOR `Case.responsibleStaffId`
- operasyonel · **devredilebilir**
- create sırasında ownerless meşru olabilir (`allowNone`)
- assign/transfer sonrası clear-to-none **açılmadı** (D1 `DECIDED_NO_FOR_NOW`)

**Hukuki Sorumlu Avukat**
- `CaseLawyer.isResponsible` · yapısal olarak **yalnız Lawyer** · Staff'e **devredilemez**
- "Hukuki sorumlu avukat devredilmez; hukuki sorumlu avukat kaydı kurallı şekilde değiştirilir."

**Eski/Legacy Sorumlu Personel**
- `Case.sorumluPersonelId` · legacy eksen · yeni write-path ile **karıştırılmayacak**

---

## 4. Implemented Controlled Write Path

**Endpoint:** `PATCH /cases/:id/legal-responsible-lawyer` (`LegalResponsibleLawyerService.changeLegalResponsibleLawyer`)

**Contract:**
- ADMIN-only hard guard
- `lawyerId` zorunlu · `reason` zorunlu · `note` opsiyonel
- `effectiveAt` / `asOf` / `backdate` **yok**
- target lawyer aynı tenant içinde ve case'e bağlı `CaseLawyer` olmalı
- same-current (already-current) **reddedilir** (409)
- invariant violation **reddedilir** (409)
- old responsible **demote** edilir; new responsible **promote** edilir (clear-before-set, atomik `$transaction`)
- `CaseLawyer.isResponsible` ⇔ `CaseLawyer.role==='RESPONSIBLE'` coupling korunur
- **AuditLog tek otorite** · `changeType=LEGAL_RESPONSIBLE_LAWYER_CHANGED`
- `responsibility-history` bunu **EVENT_CONFIRMED** okur (bkz `wp1d4c-responsibility-history-endpoint-contract.md`)

**UI girişi:** avukat drawer'ı içinde `LegalResponsibleDrawerAction` (ADMIN-only) → reason'lı kanonik modal (`initialLawyerId` ön-seçili).

---

## 5. Closed Bypass Surfaces

**UI-level bypass (#479):**
- drawer role dropdown'dan RESPONSIBLE / Hukuki Sorumlu Avukat seçeneği çıkarıldı
- drawer action canonical reason'lı endpoint'e bağlandı
- standalone buton kaldırıldı / aksiyon drawer akışına konsolide edildi
- responsibility-at / responsibility-history refresh düzeltildi
- operation owner change sonrası paneller yenilenir
- mutation sonrası point-in-time panel "şimdi"ye çekilir

**Backend generic-update bypass (#480):**
- `updateCaseLawyer` `role='RESPONSIBLE'` payload'ını reddeder
- `updateCaseLawyer` `isResponsible` payload'ını reddeder
- current responsible generic endpoint ile demote edilemez
- legal responsible state generic CaseLawyer update path'inden değiştirilemez
- hata: `[LEGAL_RESPONSIBLE_CHANGE_VIA_CANONICAL_ENDPOINT_ONLY]`

**Lifecycle silent replacement/removal bypass (#483):**
- `addCaseLawyer` existing responsible varken explicit RESPONSIBLE reddeder (`[LEGAL_RESPONSIBLE_CHANGE_REQUIRES_CANONICAL_ENDPOINT]`)
- `addCaseLawyer` existing responsible varken rank-default ile silent replacement yapmaz (→ ASSIGNED)
- new lawyer non-responsible eklenir
- `removeCaseLawyer` current responsible silmeyi reddeder (`[LEGAL_RESPONSIBLE_REMOVAL_REQUIRES_CANONICAL_REPLACEMENT]`)
- auto-promote kaldırıldı
- non-responsible lawyer remove korunur

---

## 6. Accepted Lifecycle Exceptions

Kabul edilmiş istisnalar (**"bypass" değil**, "accepted lifecycle exception"):
- initial responsible initialization (hiç sorumlu yokken ilk atama)
- `create()` dedupe / invariant maintenance

**Caveat:** Bu istisnalar nedeniyle "tüm legal-responsible state değişiklikleri sadece canonical endpoint'ten geçer" **denmeyecek.**

---

## 7. D4 Exactly-One Status

- **DB at-most-one:** `case_lawyer_one_responsible_per_case` partial unique index mevcut (#229).
- **At-least-one:** DB constraint **değil**; app guards + warn/report yüzeyiyle (`LEGAL_RESPONSIBLE_MISSING`) yönetilir (lawyer-siz/ownerless dosya meşru → DB-constraint'le ifade edilemez).
- **Dev/local audit (#485):** clean — active zero-responsible yok · multiple responsible yok · `LEGAL_RESPONSIBLE_MISSING` yok.
- **Decision:** `D4_AUDIT_CLEAN_NO_ACTION` · `D4_REQUIRES_APP_GUARD_ONLY`.
- **Caveat:** Gerçek üretim verisi oluşursa owner-run zero-responsible SQL audit tekrar çalıştırılmalı (bkz `wp1d5-d4-...-design.md` §7; tek DB, ayrı prod yok).

---

## 8. Authorization Stance

- İlk implementation **ADMIN-only hard guard** ile geldi (`PermissionHardGuardService` bridge guard; ADMIN/non-ADMIN).
- **Tenant scoping = güvenlik sınırıdır.**
- **ADMIN-only hard guard = yetki sınırıdır.**
- **Bunlar aynı şey değildir.**
- Full RBAC **açılmadı** · permission store **açılmadı** · role template UI **açılmadı**.
- WP-4 good-enough checkpoint **kapalı kalır** (bkz `wp4z-authorization-strand-closure-note.md`).
- Değişmez ilke: **operasyonel yetki devredilebilir; hukuki sıfat devredilemez** (legal hard guard RBAC ile override edilemez).

---

## 9. Non-Goals and Deferred Items

Açılmayanlar:
- owner clear-to-none
- full RBAC · permission store · role template UI
- DB migration/schema hardening
- D4 data cleanup
- approval workflow
- bulk legal responsible reassignment
- Codex domain · NAFAKA / scheduler / balance / tahsil

---

## 10. Known Caveats

- Manual browser automation Chrome bağlantısı nedeniyle tam otomatik koşulamadı.
- Kullanıcı canlı gözlemleri #477 (buton yerleşimi) / #479 (UI konsolidasyon + refresh) ile düzeltildi.
- CI ve automated frontend/backend testleri yeşil (her gate CI 3/3 + CLEAN; #483 ayrıca 2-lens adversarial review CLEAN).
- Dev/local D4 audit temiz; gerçek üretim verisi oluşursa owner-run SQL tekrar edilmeli.
- Accepted lifecycle initialization ve create-dedupe istisnaları kalır.

---

## 11. Reopen Conditions

WP-1d-5 yalnız şu durumlarda yeniden açılır:

1. Legal responsible change flow'da canlı bug bulunursa.
2. Production / owner-run D4 audit active zero-responsible cases bulursa.
3. Full RBAC ihtiyacı gerçek çok-kullanıcılı yetki ihtiyacıyla doğarsa.
4. Hukuki sorumlu avukat değişimi için approval workflow istenirse.
5. Initial lifecycle initialization veya create-dedupe istisnaları ürün/hukuk tarafından reddedilirse.
6. Canonical endpoint / audit / history semantics canlı kullanımda yetersiz kalırsa.

---

## 12. Final Status

WP-1d-5 is closed at the "controlled minimum implementation" checkpoint.

The canonical Legal Responsible Lawyer write path is implemented and protected against known generic update and lifecycle silent replacement/removal bypasses.

Accepted lifecycle initialization and create-dedupe exceptions remain documented.

D4 is clean for the current/dev data set, with future production audit delegated to owner-run SQL if real production data emerges.

No further WP-1d-5 implementation gate should be opened without a concrete bug, production data audit finding, or explicit product/legal decision.
