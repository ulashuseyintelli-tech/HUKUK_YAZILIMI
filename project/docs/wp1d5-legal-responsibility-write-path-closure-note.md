# WP-1d-5-11 — Legal Responsibility Write-Path Closure Note

> **Tür:** DOCS-ONLY kapanış notu. Kod / endpoint / UI / migration / schema / DB-write YOK.
> **Bağlam:** Legal Responsibility architecture write-path stratejisinin kapanış kaydı. Codex domain DEĞİL.
> **Baseline:** main `f8e7a82` (WP-1d-5-10 / #485 merge sonrası), 2026-06-25.
> **Kapsam:** WP-1d-5-1 … WP-1d-5-10 (PR #470 … #485). Bu not yeni karar üretmez; mevcut durumu kilitler.

---

## 1. Amaç ve Durum

Bu not, "Hukuki Sorumlu Avukat" (`CaseLawyer.isResponsible`) yazma yolu (write-path) çalışmasının **kapanış** kaydıdır: kanonik yolun kuruluşu, kapatılan bypass'lar, kabul edilmiş istisnalar, D4 invariant durumu ve açık kalan düşük-öncelikli öğeler.

**Durum:** Write-path hattı **kapandı.** Kalan tüm öğeler düşük-öncelik / opsiyonel / açık-onay-gerektiren.

---

## 2. İki Eksen (recap — karıştırılmamalı)

| Eksen | Alan | Devredilir mi | Yazma yolu |
|---|---|---|---|
| **Dosya Operasyon Sorumlusu** | `Case.responsibleLawyerId` XOR `responsibleStaffId` (lawyer veya staff) | Evet (devredilebilir) | `PATCH /cases/:id/responsible-person` (assign/transfer); create `allowNone` (sahipsiz meşru) |
| **Hukuki Sorumlu Avukat** | `CaseLawyer.isResponsible` (yapısal olarak yalnız Lawyer) | **Hayır** — devredilmez; **kurallı kayıt değişikliği** | **Kanonik:** `PATCH /cases/:id/legal-responsible-lawyer` |
| (legacy) Eski Sorumlu Personel | `Case.sorumluPersonelId` | — | legacy alan |
| Dosya Ekibi Rolü | `CaseStaff.roleOnCase` | — | ayrı eksen |

Bu not **yalnız Hukuki Sorumlu Avukat** eksenini kapatır. Operasyon-sorumlusu ekseni (clear-to-none vb.) ayrı ürün konusudur (D1 `DECIDED_NO_FOR_NOW`).

---

## 3. Kanonik Write-Path

**`PATCH /cases/:id/legal-responsible-lawyer`** → `LegalResponsibleLawyerService.changeLegalResponsibleLawyer` (#474):
- **ADMIN-only** hard guard (403),
- **reason ZORUNLU** (400 `[LEGAL_RESPONSIBLE_REASON_REQUIRED]`),
- tam-1 invariant (409 `[LEGAL_RESPONSIBLE_INVARIANT_VIOLATION]`), already-current (409 `[LEGAL_RESPONSIBLE_LAWYER_ALREADY_CURRENT]`),
- atomik clear-before-set (demote eski → promote yeni) + **`changeType=LEGAL_RESPONSIBLE_LAWYER_CHANGED` audit** aynı `$transaction`'da,
- `responsibility-history` bunu `EVENT_CONFIRMED` okur (reason+source provenance ile).

UI girişi: avukat drawer'ı içindeki **`LegalResponsibleDrawerAction`** (ADMIN-only; #479), `initialLawyerId` ile ön-seçili modal. Eski standalone full-width buton **kaldırıldı** (#479).

---

## 4. Write-Surface Envanteri (kapanış durumu)

| Yüzey | Hukuki sorumlu eksenine etki | Durum |
|---|---|---|
| `PATCH /cases/:id/legal-responsible-lawyer` (kanonik) | promote/demote (kurallı) | ✅ Tek-ceremony yazma yolu (ADMIN+reason+audit) |
| `PATCH /cases/:id/lawyers/:caseLawyerId` (`updateCaseLawyer`, generic) | — | 🔒 #480: `isResponsible`/`role:'RESPONSIBLE'`/mevcut-sorumlu-demote = **400 reddedilir** |
| `POST /cases/:id/lawyers` (`addCaseLawyer`) | yalnız initial set | 🔒 #483: mevcut sorumlu varken explicit RESPONSIBLE=400; rank-default RESPONSIBLE→ASSIGNED; demote yok |
| `DELETE /cases/:id/lawyers/:caseLawyerId` (`removeCaseLawyer`) | — | 🔒 #483: mevcut sorumluyu silme=400; auto-promote KALDIRILDI |
| `POST /cases` (`create()` dedupe) | initial normalize | ✅ Kabul edilmiş istisna (tam-1 normalizasyon) |
| Drawer "Bu Dosyadaki Rol" dropdown | — | 🔒 #479: RESPONSIBLE seçeneği kaldırıldı / mevcut sorumlu salt-okunur |

---

## 5. Kapatılan Bypass'lar

1. **UI-level bypass (#479):** drawer rol-dropdown'undan RESPONSIBLE seçip "Bu dosya için kaydet" ile reason'sız hukuki-sorumlu değiştirme → kapatıldı; aksiyon kanonik modala taşındı.
2. **Backend generic-update bypass (#480):** `updateCaseLawyer` üzerinden `role:'RESPONSIBLE'`/`isResponsible` ile reason/ADMIN/changeType-audit'siz yazma → 400 ile reddedilir. (API-level delik; frontend-only #479 yetmezdi.)
3. **Lifecycle silent replacement/removal bypass (#483):** `addCaseLawyer` ile mevcut sorumluyu sessiz demote etme + `removeCaseLawyer` ile sorumluyu silip otomatik promote → kapatıldı; değişiklik kanonik uca zorlanır.

---

## 6. Kabul Edilmiş İstisnalar (bilinçli)

- **Initial responsible initialization:** hiç sorumlu yokken `addCaseLawyer`/create ilk responsible'ı atayabilir (rank-default veya explicit) — "değişiklik" değil, ilk kayıt.
- **`create()` dedupe:** dosya açılışında çoklu-responsible'ı tam-1'e indirger (invariant bakımı).
- **Ownerless / lawyer-siz dosya:** sıfır-responsible meşrudur (operasyon-sorumlusu `allowNone` ile uyumlu); exactly-one zorlanamaz.

---

## 7. D4 Exactly-One Durumu

`exactly-one = at-most-one + at-least-one`:
- **at-most-one:** DB partial unique index `case_lawyer_one_responsible_per_case` (#229). Read-only audit ile doğrulandı (>1 responsible dosya YOK).
- **at-least-one:** DB-constraint ile ifade edilemez (lawyer-siz/ownerless dosya meşru) → app-guard (#483 remove-block + create fallback) + `LEGAL_RESPONSIBLE_MISSING` read-side warn ile yönetilir.
- **Veri:** dev/local read-only audit (#485) TEMİZ (0 zero-responsible aktif dosya). Karar: `D4_AUDIT_CLEAN_NO_ACTION` + `D4_REQUIRES_APP_GUARD_ONLY` — migration/cleanup açılmadı.
- **CAVEAT:** dev küçük örneklem (test verisi); tek DB (ayrı prod yok). Gerçek üretim verisi oluşursa owner-run SQL (`wp1d5-d4-...-design.md` §7) tekrar koşulmalı.

---

## 8. Kilitli Kararlar (index)

**Product/legal (D1–D4):** D1 operation-owner re-clear `DECIDED_NO_FOR_NOW` · D2 hukuki sorumlu değişimi `DECIDED_ALLOWED_AS_CONTROLLED_RECORD_CHANGE` · D3 birinci-sınıf endpoint `DECIDED_YES` · D4 `PARTIALLY_ALREADY_HARDENED_AT_DB_LEVEL` + audit `D4_AUDIT_CLEAN_NO_ACTION`.

**Lifecycle (L1–L6, #483):** L1 create-dedupe accept · L2 initial-init accept · L3 add-explicit-RESPONSIBLE→block · L4 add-rank-default-RESPONSIBLE→ASSIGNED · L5 remove-current-responsible→block · L6 non-responsible-remove→allow.

**Terminoloji (kilitli):** "Hukuki sorumlu avukat **devredilmez**; kayıt **kurallı şekilde değiştirilir**." "devir/atama/personel" copy'si UI'da KULLANILMAZ.

---

## 9. PR / Commit Defteri

| WP | PR | Konu | Tür |
|---|---|---|---|
| 5-1 | #470 | write-path contract | docs |
| 5-2 | #471 | decision matrix (D1–D4) | docs |
| 5-2 | #472 | product/legal decisions + D4 ERRATA | docs |
| 5-3 | #473 | endpoint + audit contract | docs |
| 5-4 | #474 | backend canonical implementation | code |
| 5-5 | #476 | frontend UI (change modal) | code |
| 5-5 | #477 | button placement fix | code |
| 5-6 | #479 → `2d91212` | UI consolidation + panel refresh + UI-level bypass closure | code |
| 5-7 | #480 → `ea554b5` | backend generic-update bypass closure | code |
| 5-8 | #482 → `3749e97` | lifecycle forensic / decision note | docs |
| 5-9 | #483 → `89dd6f6` | lifecycle hardening (L3/L4/L5) | code |
| 5-10 | #485 → `f8e7a82` | D4 zero-responsible audit + exactly-one design | docs |
| 5-11 | (bu not) | write-path closure note | docs |

---

## 10. Kanonik İfade (abartmadan)

```
Canonical legal-responsible write path KURULDU (#474).
Generic update bypass KAPANDI (#480).
UI-level bypass KAPANDI (#479).
Lifecycle silent replacement/removal bypass KAPANDI (#483).
Initial init + create() dedupe + ownerless = KABUL EDİLMİŞ istisnalar.
D4: at-most-one DB-enforced + at-least-one app/warn; mevcut/dev veri TEMİZ (migration açılmadı).
```

**Söylenmeyecek (abartı):** "Tüm legal-responsible state değişimleri sonsuza dek yalnız canonical'dan olur / tüm veri sonsuza dek temizdir." — **Doğrusu:** kabul edilmiş lifecycle istisnaları var; gerçek üretim verisi oluşursa owner-run audit tekrar edilir.

---

## 11. Açık Kalan Öğeler (hepsi düşük-öncelik / opsiyonel / açık-onay)

- **Gerçek-veri owner-run audit:** üretim verisi birikince `wp1d5-d4-...-design.md` §7 zero-responsible SQL'i tekrar koş (owner).
- **addCaseLawyer at-least-one soft-guard (DÜŞÜK):** aktif dosyada hiç responsible yokken ilk non-responsible lawyer eklenirse 0-responsible kalabilir; şu an warn-surface'li. İstenirse ayrı küçük app-guard gate.
- **Operasyon-sorumlusu clear-to-none (D1):** `DECIDED_NO_FOR_NOW`; ileride ayrı ürün kararı + reason + audit ile açılabilir.
- **E-G3 / sabit-tutar faiz allocation** vb. **ayrı strand'ler** — bu write-path notunun kapsamı dışı.

Bu öğelerin hiçbiri write-path'i bloklamaz; hat fonksiyonel olarak kapalıdır.

---

## 12. Doküman İndeksi (Legal Responsibility write-path)

1. `wp1d5-legal-responsibility-write-path-contract.md` (#470)
2. `wp1d5-legal-responsibility-write-path-decision-matrix.md` (#471)
3. `wp1d5-legal-responsibility-write-path-product-legal-decisions.md` (#472, D4 ERRATA)
4. `wp1d5-legal-responsible-lawyer-change-endpoint-audit-contract.md` (#473)
5. `wp1d5-caselawyer-lifecycle-legal-responsible-decision-note.md` (#482 + §10 #483 kararları)
6. `wp1d5-d4-zero-responsible-data-audit-exactly-one-design.md` (#485)
7. `wp1d5-legal-responsibility-write-path-closure-note.md` (bu not, #485+ kapanış)

---

## 13. Non-Goals / Sınırlar

Bu not yalnız **kayıt altına alır**. Kod · endpoint · UI · migration · schema · DB-write · data-cleanup · audit-write · full RBAC · permission-store · role-template-UI · owner-clear-to-none · Codex domain (NAFAKA/scheduler/balance/tahsil) = **YOK.** Yeni implementasyon yalnız ayrı, açık-onaylı gate ile başlar.
