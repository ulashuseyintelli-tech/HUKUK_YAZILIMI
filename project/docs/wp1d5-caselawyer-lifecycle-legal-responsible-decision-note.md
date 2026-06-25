# WP-1d-5-8 — CaseLawyer Lifecycle Legal Responsible Decision Note

> **Tür:** DOCS-ONLY forensic / karar notu. Kod / endpoint / UI / migration / schema / audit-impl YOK.
> **Bağlam:** Legal Responsibility architecture write-path hattı. Codex domain DEĞİL.
> **Baseline:** main `ea554b5` (WP-1d-5-7 / #480 merge sonrası), 2026-06-25.
> **Önceki kararlar:** `wp1d5-legal-responsibility-write-path-decision-matrix.md` (D1–D4) ·
> `wp1d5-legal-responsibility-write-path-product-legal-decisions.md` (§7 D4 ERRATA) ·
> `wp1d5-legal-responsible-lawyer-change-endpoint-audit-contract.md` (kanonik uç).

---

## 1. Amaç (Purpose)

WP-1d-5-7 (#480) **generic update bypass**'ını kapattı: `updateCaseLawyer` artık Hukuki Sorumlu
Avukat (`CaseLawyer.isResponsible` / `role==='RESPONSIBLE'`) eksenini değiştiremez. Ancak
`addCaseLawyer` ve `removeCaseLawyer` **lifecycle** operasyonları bu eksene hâlâ dokunabiliyor.

Bu not, o lifecycle davranışlarını **koddan kanıtlar**, **sınıflandırır** ve **karar altına alır**.
Net ayrım:

```
Generic update bypass (KAPANDI, #480)
  ≠
Lifecycle add/remove tam-1 invariant bakımı (BU NOTUN KONUSU — karar bekliyor)
```

Bu not merge edilmeden lifecycle tarafına **kodla girilmez**.

---

## 2. WP-1d-5-7 Sonrası Baseline

Hukuki Sorumlu Avukat eksenine yazabilen / dokunabilen kod yüzeyleri (main `ea554b5`):

| # | Yüzey | Durum |
|---|---|---|
| A | `PATCH /cases/:id/legal-responsible-lawyer` → `LegalResponsibleLawyerService.changeLegalResponsibleLawyer` | **Kanonik tek-ceremony write-path** (ADMIN + reason + 409 + `changeType` audit). |
| B | `PATCH /cases/:id/lawyers/:caseLawyerId` → `updateCaseLawyer` | **#480'de KAPATILDI** — responsible eksenini değiştiren istek `400 [LEGAL_RESPONSIBLE_CHANGE_VIA_CANONICAL_ENDPOINT_ONLY]` (`case.service.ts:2720-2726`). |
| C | `POST /cases/:id/lawyers` → `addCaseLawyer` | **AÇIK** — yeni avukatı RESPONSIBLE yapabilir (+ mevcudu demote). Bu notun konusu. |
| D | `DELETE /cases/:id/lawyers/:caseLawyerId` → `removeCaseLawyer` | **AÇIK** — sorumlu silinince otomatik promote. Bu notun konusu. |
| E | `POST /cases` → `create()` dedupe | **AÇIK** — açılışta çoklu-responsible'ı tam-1'e indirger (initial). İkincil; bu notta sınıflandırılır. |

Yapısal sabit: `CaseLawyer.isResponsible ⇔ role==='RESPONSIBLE'` coupling; DB partial unique index
`case_lawyer_one_responsible_per_case (caseId) WHERE isResponsible=true` = **at-most-one** (#229).
App-katmanı (`planResponsible`) = **exactly-one** hedefi. **Zero-responsible** hâlâ ayrı veri/invariant
sorusu (D4 ERRATA'da deferred).

---

## 3. Mevcut `addCaseLawyer` Davranışı (koddan kanıt)

`case.service.ts:2856` `addCaseLawyer(tenantId, caseId, {lawyerId, role?, canSign?}, userId)` →
controller `POST /cases/:id/lawyers` (sınıf düzeyi `JwtAuthGuard`; method `@Roles` YOK).

1. **RESPONSIBLE yapabilir mi?** EVET. İki yol:
   - **Explicit:** `data.role === 'RESPONSIBLE'`.
   - **Implicit (rank-default):** rol verilmezse ve `lawyer.lawyerRank ∈ {PARTNER, MANAGER}` → `role='RESPONSIBLE'` (`case.service.ts:2880-2896`). Yani bir partner/müdür eklemek **örtük olarak** sorumlu atar.
2. **Mevcut sorumluyu demote eder mi?** EVET — `willBeResponsible` (`:2898`) ise tx içinde tüm mevcut sorumlular `{isResponsible:false, role:'ASSIGNED'}` yapılır (clear-before-set: demote ÖNCE, create SONRA — partial-index uyumlu) (`:2908-2928`).
3. **reason zorunlu mu?** HAYIR (payload'da reason alanı yok).
4. **ADMIN-only mi?** HAYIR.
5. **Audit?** EVET — her zaman bir `CREATE` (CASE_LAWYER, `metadata:{caseId}`, `newValues:{lawyerId,role,isResponsible}`); ayrıca demote olduysa ayrı bir `UPDATE` (`newValues:{isResponsible:true, role:'RESPONSIBLE', demotedCaseLawyerIds}`) (`:2969`).
6. **Audit tipi?** **Generic CASE_LAWYER** — `changeType='LEGAL_RESPONSIBLE_LAWYER_CHANGED'` **YOK**, kullanıcı reason'ı **YOK**.

**Ayrım (kritik):**
- **Initial atama** (case'te henüz responsible yok): demote yok → "değişiklik" değil, ilk atama. Düşük risk.
- **Mevcut sorumlu varken** add-as-RESPONSIBLE: eski sorumluyu **sessizce demote eder** → bu fiilen bir **hukuki-sorumlu DEĞİŞİKLİĞİ**, "ekleme" kılığında, reason/ADMIN/changeType olmadan. Bu, #480'de kapatılan bypass'la **aynı sınıfta** bir endişe (ama altta yatan işlem meşru bir "ekleme").

---

## 4. Mevcut `removeCaseLawyer` Davranışı (koddan kanıt)

`case.service.ts:2987` `removeCaseLawyer(tenantId, caseId, caseLawyerId, userId)` →
controller `DELETE /cases/:id/lawyers/:caseLawyerId` (sınıf `JwtAuthGuard`; `@Roles` YOK).

1. **Silinen sorumluysa kimi promote eder?** `resolveResponsiblePromotion` (`:3010`) → `pickResponsibleFallbackIndex`. Yalnız silinen responsible idi ise ve kalan varsa.
2. **Deterministik mi?** EVET — öncelik **PARTNER > MANAGER > AUTHORIZED > LAWYER > INTERN > rank'siz**; eşitlikte **ilk kayıt** (strict `<`) (`case-responsible.helpers.ts:27-48, 63-70`). Kalan yoksa → promote yok (dosya avukatsız/sorumlusuz kalabilir).
3. **reason/audit?** Her zaman `DELETE` audit; promote olduysa ayrı `UPDATE` audit, `newValues:{isResponsible:true, role:'RESPONSIBLE', reason:'RESPONSIBLE_REMOVED_AUTO_PROMOTE'}` (`:3049`). Buradaki `reason` **sabit sistem etiketi**, kullanıcı gerekçesi DEĞİL. ADMIN yok, `changeType` yok.
4. **Lifecycle invariant bakımı mı, bypass mı?** **Invariant bakımı** — sorumlu silinince tam-1 (≥1 sorumlu) korunur. Alternatif (zero-responsible bırakmak) daha kötü olurdu. **Ancak**: yeni sorumlunun **kim olacağı** yetkili bir karar değil, rank-önceliğiyle otomatik belirlenir.

---

## 5. Audit ve Temporal Etkiler

`responsibility-history.service.ts` legal-responsible event'lerini **`entityType='CASE_LAWYER'` +
`metadata.caseId` + `newValues.isResponsible===true`** ile tanır — `changeType`'a **bakmaz**
(`:142-143, :160-161, :178, :189`).

Sonuç: add/remove (ve create-dedupe) yollarının generic audit'leri **timeline'da "HUKUKİ SORUMLU
AVUKAT" event'i** olarak görünür; `metadata.caseId` + `newValues.lawyerId` varsa **EVENT_CONFIRMED**
okunur — **kullanıcı reason'ı OLMADAN**. Yani:

- Kanonik uç: reason + `source` + `changeType` taşıyan, denetlenebilir provenance.
- Lifecycle yolları: reason'sız, `changeType`'sız → **asimetrik provenance** (aynı timeline'da iki farklı kaynak kalitesi). Bu, #480'de generic-update için tespit edilen kirliliğin lifecycle muadilidir.

---

## 6. Risk Sınıflandırması

| Yüzey | Davranış | Legal-resp. state'e dokunur? | reason zorunlu? | ADMIN-only? | Audit event tipi | Temporal görünürlük | Risk | Önerilen karar |
|---|---|:--:|:--:|:--:|---|---|:--:|---|
| `addCaseLawyer` (initial, mevcut sorumlu YOK) | İlk sorumluyu atar (demote yok) | Evet (set) | Hayır | Hayır | CREATE (generic) | EVENT_CONFIRMED, reason'sız | **DÜŞÜK** | `LIFECYCLE_EXCEPTION_ACCEPTED_WITH_AUDIT_REQUIREMENT` |
| `addCaseLawyer` (mevcut sorumlu VARKEN as-RESPONSIBLE) | Eskiyi sessiz demote + yeniyi sorumlu | Evet (change!) | Hayır | Hayır | CREATE + UPDATE(demote) generic | EVENT_CONFIRMED, reason'sız | **ORTA-YÜKSEK** | `ADD_RESPONSIBLE_REQUIRES_CANONICAL_ENDPOINT` (ekle→non-resp.; değişikliği kanonikten yap) |
| `addCaseLawyer` (rol verilmedi, rank PARTNER/MANAGER) | Örtük RESPONSIBLE-default | Evet (set, örtük) | Hayır | Hayır | CREATE (generic) | EVENT_CONFIRMED, reason'sız | **ORTA** | Öneri: default'u `ASSIGNED` yap; sorumluluk asla rank ile örtük atanmasın |
| `removeCaseLawyer` (sorumlu silinir, kalan var) | Rank-önceliğiyle otomatik promote | Evet (promote) | Hayır (sabit etiket) | Hayır | DELETE + UPDATE(promote) generic | EVENT_CONFIRMED, reason'sız | **ORTA** | `LIFECYCLE_EXCEPTION_ACCEPTED_WITH_AUDIT_REQUIREMENT` (varsayılan) **veya** `REMOVE_RESPONSIBLE_REQUIRES_EXPLICIT_REPLACEMENT` (sıkı) |
| `removeCaseLawyer` (son avukat) | Promote yok; sorumlusuz kalabilir | Hayır (no-op) | — | — | DELETE | — | **DÜŞÜK** (zero-resp. = D4 ayrı sorun) | Mevcut davranış kabul; zero-responsible D4'e bağlı |
| `create()` dedupe | Açılışta çoklu-resp. → tam-1 | Evet (demote) | Hayır | Hayır | UPDATE `reason:'CREATE_DEDUPE'` | EVENT_CONFIRMED | **DÜŞÜK** | `LIFECYCLE_EXCEPTION_ACCEPTED_AS_IS` (açılış anı; kullanıcı henüz "değişiklik" yapmıyor) |
| `updateCaseLawyer` (#480 sonrası) | Responsible eksenini reddeder | Hayır | — | — | — (reddedilir) | — | **KAPALI** | — (çözüldü) |
| Kanonik uç | Kontrollü kayıt değişikliği | Evet | **Evet** | **Evet** | `changeType=LEGAL_RESPONSIBLE_LAWYER_CHANGED` | EVENT_CONFIRMED + provenance | **REFERANS** | — (doğru yol) |

---

## 7. Karar Matrisi

Seçenek kümesi (biri veya kombinasyonu seçilecek — **ürün/legal kararı, Ulaş verir**):

| Kod | Anlam | Bu notun değerlendirmesi |
|---|---|---|
| `LIFECYCLE_EXCEPTION_ACCEPTED_AS_IS` | add/remove olduğu gibi kalsın | `create()` dedupe için uygun; add(mevcut-demote) için **yetersiz**. |
| `LIFECYCLE_EXCEPTION_ACCEPTED_WITH_AUDIT_REQUIREMENT` | Kalsın ama lifecycle yolu kendi `changeType`'ını (örn. `LEGAL_RESPONSIBLE_LIFECYCLE_*`) yazsın → timeline provenance ayrışsın | removeCaseLawyer auto-promote + addCaseLawyer(initial) için **en dengeli**. |
| `LIFECYCLE_EXCEPTION_REQUIRES_REASON` | Lifecycle responsible-değişikliği reason istesin | Operasyonel sürtünme; yalnız demote-eden add için düşünülebilir. |
| `LIFECYCLE_EXCEPTION_REQUIRES_ADMIN_ONLY` | Lifecycle responsible-değişikliği ADMIN-gate'li olsun | Kanonik uçla simetri; demote-eden add için makul. |
| `REMOVE_RESPONSIBLE_REQUIRES_EXPLICIT_REPLACEMENT` | Sorumlu silinmeden önce yerine açık biri seçilsin (otomatik promote yok) | En sıkı; "kim sorumlu olur" yetkili karar olur ama silme akışını zorlaştırır. |
| `ADD_RESPONSIBLE_REQUIRES_CANONICAL_ENDPOINT` | Add yolu RESPONSIBLE set/demote yapmasın; avukat non-resp. eklensin, sorumluluk kanonikten değişsin | add(mevcut-demote) için **en temiz**; #480 mantığının lifecycle'a taşınması. |
| `NEEDS_PRODUCT_LEGAL_DECISION` | Karar Ulaş'a bırakılır | Aşağıdaki başlangıç hipotezi dışındaki tüm seçimler için geçerli. |

### Başlangıç hipotezi (koddan kanıtlı, bağlayıcı DEĞİL)

```
1. removeCaseLawyer (sorumlu silinir):
   varsayılan = ACCEPTED_WITH_AUDIT_REQUIREMENT (auto-promote invariant güvenliği için kalsın,
   ama lifecycle changeType ile damgalansın). Sıkı alternatif = EXPLICIT_REPLACEMENT (ürün kararı).

2. addCaseLawyer:
   - initial (sorumlu yok)            → ACCEPTED_WITH_AUDIT_REQUIREMENT (lifecycle changeType).
   - mevcut sorumlu varken demote eden → ADD_RESPONSIBLE_REQUIRES_CANONICAL_ENDPOINT
     (ekleme demote etmesin; değişiklik kanonikten).
   - rank-default RESPONSIBLE          → default'u ASSIGNED'a çek (örtük sorumluluk atama YOK).

3. create() dedupe → ACCEPTED_AS_IS (açılış anı; tam-1 normalizasyonu).
```

Bu hipotez **karar değildir**; kanıt + seçeneklerle birlikte Ulaş'ın önüne konur.

---

## 8. Açık Non-Goals

Bu gate'te **YOK**: kod · endpoint değişikliği · UI · audit-write implementation · migration ·
schema · full RBAC · permission store · role template UI · owner clear-to-none · D4 DB hardening ·
Codex domain (NAFAKA / scheduler / balance / tahsil) · `package.json` değişikliği.

Bu not yalnız **kanıtlar ve karar altına alır**; uygulama ayrı, açık-onaylı bir gate'tir.

---

## 9. Önerilen Sonraki Gate

```
Durum: ADD_REMOVE_REQUIRES_SEPARATE_DECISION → NEEDS_PRODUCT_LEGAL_DECISION

Ulaş §7 seçimini yaptıktan SONRA (yalnız açık onayla):
  WP-1d-5-9 — CaseLawyer Lifecycle Legal Responsible Backend Hardening (code)
    kapsam = §7'de seçilen koda dönüşür (örn. add-demote'u kanonike yönlendir +
    lifecycle changeType audit + opsiyonel rank-default ASSIGNED).

Bağlı/ilişkili açık soru: D4 zero-responsible data audit + exactly-one design
  (wp1d5-...-product-legal-decisions.md §7) — removeCaseLawyer(son avukat) ve
  zero-responsible bu kararla kesişir.
```

**Doğru ifade (bugün):** Generic update path KAPANDI (#480). Kanonik legal-responsible change path
KURULDU (#474). **Lifecycle add/remove istisnaları ayrıca karar bekliyor (bu not).** "Tek write-path
tamamen kanonik oldu" demek henüz erken; doğrusu: *generic update kapandı, lifecycle istisnaları
sınıflandırıldı ve karara hazır.*

---

## 10. WP-1d-5-9 — Seçilen Kararlar (uygulandı)

Ulaş §7 kararını verdi (2026-06-25); WP-1d-5-9 backend gate ile **koda döküldü** (test-first; UI/migration/schema YOK):

| Karar | Kod | Davranış (uygulandı) |
|---|:--:|---|
| **L1** create() dedupe | YOK | `ACCEPT_AS_INVARIANT_MAINTENANCE` — açılış tam-1 normalizasyonu korunur. |
| **L2** addCaseLawyer initial (mevcut sorumlu YOK) | YOK | `LIFECYCLE_EXCEPTION_ACCEPTED_FOR_INITIALIZATION` — ilk responsible (rank-default/explicit) korunur. |
| **L3** addCaseLawyer, mevcut sorumlu VARKEN explicit RESPONSIBLE | EVET | `BLOCK_AND_REQUIRE_CANONICAL_ENDPOINT` — `400 [LEGAL_RESPONSIBLE_CHANGE_REQUIRES_CANONICAL_ENDPOINT]`. |
| **L4** addCaseLawyer, rank-default ile örtük replacement | EVET | `BLOCK_IMPLICIT_RESPONSIBLE_REPLACEMENT` — mevcut sorumlu varken rank-default RESPONSIBLE `ASSIGNED`'a indirilir; eski sorumlu KORUNUR (demote YOK). |
| **L5** removeCaseLawyer, mevcut responsible silme | EVET | `BLOCK_REMOVE_CURRENT_RESPONSIBLE_UNTIL_CANONICAL_REPLACEMENT` — `400 [LEGAL_RESPONSIBLE_REMOVAL_REQUIRES_CANONICAL_REPLACEMENT]`; auto-promote KALDIRILDI. |
| **L6** removeCaseLawyer, non-responsible silme | YOK | `ALLOW` — mevcut akış (delete + DELETE audit) korunur. |

**Kanonik operasyon sırası (bundan sonra):** Bir hukuki sorumlu avukatı dosyadan çıkarmak için → (1) `PATCH /cases/:id/legal-responsible-lawyer` ile reason/audit'li yeni sorumlu ata → (2) eski avukatı `removeCaseLawyer` ile çıkar.

**Uygulama:** `case.service.ts` `addCaseLawyer` (L3/L4) + `removeCaseLawyer` (L5); ölü demote/promote/$transaction makinesi kaldırıldı. Test: `case-responsible-invariant.spec.ts` (add/remove describe'leri yeniden yazıldı) + 3 audit/assignment spec mock'u doğrudan `count`/`create`/`delete`'e güncellendi. **Bu, WP-1d-5 lifecycle hattını kapatır; geriye D4 zero-responsible data audit + exactly-one design açık kalır.**
