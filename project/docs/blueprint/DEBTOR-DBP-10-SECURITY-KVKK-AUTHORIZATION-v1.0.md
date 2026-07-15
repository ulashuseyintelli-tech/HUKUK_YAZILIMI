# DEBTOR DBP-10 — TENANT, AUTHORIZATION, KVKK, RETENTION & AI CONTEXT ARCHITECTURE v1.0

> **Canonical Phase 1 L8-yatay artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER
> v1.0` §9 kapsamındaki DBP-10 work package'ının owner-onaylı çıktısıdır (Charter artefaktları
> #23 Authorization Matrix · #24 KVKK Data Inventory · #25 Retention & Anonymization Policy · #26
> AI Context & Explanation Contract; Charter BR-18 müvekkil görünürlük sınırı · BR-19 KVKK
> retention/anonymization). İçerik GO-ANALYZE (DBP-10 R0.1 → R0.2 → v1.1 matrix completion)
> çıktısıdır; bu GO-DOCS turunda yeni analiz veya owner kararı üretilmemiştir. **DEFAULT-DENY;
> tenant izolasyonu ≠ iş-yetkilendirme.** İki AYRI güvenlik gate: CURRENT PRODUCTION SECURITY GATE
> ≠ DIGITAL TWIN SECURITY GATE (Twin HOLD mevcut üretim risklerini ERTELEMEZ).
>
> **GÜVENLİK SINIRI (owner-directed public-safe boundary kararı, 2026-07-16; SYS-AUTH-012 hizası):**
> yaşayan üretim güvenlik bulgularının teknik mekanizması, etkilenen yüzey/route/servis kombinasyonu,
> enumeration/bypass yöntemi ve ayrıntılı remediation adımları bu genel-erişimli repoya YAZILMAZ.
> Public repo yalnız şunu taşır: restricted-security-register'ın VARLIĞI · Implementation Entry =
> HOLD etkisi · ilgili remediation'ın AYRI owner GO-IMPLEMENT gerektirdiği. Ayrıntılı bulgu register'ı
> owner-local/restricted konumdadır (git-tracked DEĞİL; repository/PR/CI-artifact DEĞİL; cloud/
> external/3rd-party-AI DEĞİL).

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-10 — TENANT, AUTHORIZATION, KVKK, RETENTION & AI CONTEXT (L8-yatay)
VERSION            : v1.0 (R0.2 + v1.1 authorization-matrix completion + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 SECURITY MODEL CORRECTION → v1.1 MATRIX COMPLETION);
                     canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[N] — bkz. §20)
REVIEW DISPOSITION : OWNER-APPROVED / KVKK+LEGAL SIGN-OFF PENDING · TWO SECURITY GATES OPEN — yeni
                     bir repository lifecycle state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : 30-resource × 14-operation matrisindeki UNKNOWN'lar (= OWNER_DECISION_REQUIRED) ·
                     CURRENT PRODUCTION SECURITY GATE (11 bulgu → DBP-11'de 5 sınıf) · DIGITAL TWIN
                     SECURITY GATE (HOLD) · KVKK owner+legal sign-off (md6 sınıflandırma) ·
                     retention/anonymization policy içeriği · masking karakter-politikası (impl-
                     security-policy) · template/download scope doğrulaması (NOT VERIFIED/HIGH)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları Phase 1 GO-ANALYZE (2026-07-15); GO-DOCS drift kontrolü ve bu
                     belgenin AS-IS kanıt re-verification base'i origin/main @ 2e2108aa (fetch
                     2026-07-16): role-decorator/guard tabanlı iş-yetki katmanı gözlenmedi (tek
                     yapısal enforce tenantId) · capacityFromUser capacity primitive mevcut ·
                     ai.service tenant-boundary testli — SIFIR davranış değişikliği
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir authz/masking/retention/AI-context için
                     implementasyon, remediation, schema veya aktivasyon yetkisi üretmez
                     (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : CAP/AZL/DV/DR/SEC kimlikleri DBP-10-local PROPOSED'dur (DBP-12'ye kadar).
                     BR/BC/OBD/OD/N/INV kimlikleri Charter/DBP-03/DEBTOR-GOVERNANCE'ındır.
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md` (SYS §13 yetki;
SYS-AUTH-012 identifier log-taşımaz) → `DEBTOR-GOVERNANCE.md` (INV-01/02 tenant izolasyonu) → D6
KVKK / ADR-011. Execution/safety — `AGENTS.md` + task authorization. `INV-01/02`: tenant izolasyonu
zorunlu; ancak tenant izolasyonu iş-yetkilendirme DEĞİLDİR (§3).

## RELATED DOCUMENTS

- Charter: `.../DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` (BR-18/19; artefakt #23-26)
- DBP-03 (L2): `.../DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md` (BC-18 Audit & Evidence OBD-08;
  BC-16/17 projection görünürlüğü)
- DBP-06/07/08/09: identity masking sınıfları (DBP-06 §15) · Representation/responsibility
  görünürlük (DBP-07) · behavior/score user-facing OFF (DBP-08) · tile-permission + office
  tenant-only gap + Digital Twin Security Gate (DBP-09)
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md` · D6 KVKK · ADR-011

---

## 2. Statü Sözlüğü

```text
AUTH / MAT / EVD / DEC / S-OWN / HOST / EXEC — DBP-02..09 sözlüğüyle aynı.
DEC ∈ { CANONICALLY DEFINED (CD) · PROPOSED · OWNER DECISION REQUIRED (ODR) · VERIFICATION
        REQUIRED (VR) }
CPSG = CURRENT PRODUCTION SECURITY GATE (mevcut açık üretim yüzeyleri).
DTSG = DIGITAL TWIN SECURITY GATE (yeni Twin/tile aktivasyonu).
RSF  = RESTRICTED SECURITY FINDING (public repo'da ENUMERE EDİLMEZ; yalnız varlığı + program-etkisi
       görünür — bkz. §14; ayrıntı owner-local restricted register'dadır).
Aksi yazılmadıkça: default = DENY · TENANT SCOPE = tenant-local · EXEC = NOT AUTHORIZED.
```

---

## 3. Default-Deny + Tenant ≠ İş-Yetkilendirme — OWNER-APPROVED [A]

```text
- DEFAULT-DENY: yetki açıkça tanımlanmadıkça sistem DENY yorumlar; ODR = DENY-until-decided
  (sistem bir açık kalemi ALLOW olarak YORUMLAYAMAZ) (RC-DBP10-01).
- TENANT İZOLASYONU ≠ İŞ-YETKİLENDİRME: aynı tenant içindeki bir aktörün bir kayda erişebilmesi
  yalnız tenant eşitliğinden TÜRETİLMEZ (actor-capacity + resource-scope + relationship + need-to-
  know + field-data-classification ayrıca gerekir).
- TARGET MATRIX ≠ RUNTIME TRUTH (RC-DBP10-02): bu belgedeki hedef matris G-8 enforcement KANITI
  DEĞİLDİR; mevcut açıklar DBP-11 Implementation Entry Gate'e taşınır.
```

---

## 4. Actor / Capacity Model — OWNER-APPROVED [B] (10 aktör; capacityFromUser AS-IS)

| Actor / capacity | Not |
|---|---|
| TENANT_SUPER_ADMIN | **tenant-local** (RC-DBP10-03); cross-tenant erişemez; platform-admin ≠ dosya-erişimi |
| PARTNER · MANAGER | büro yönetim capacity'si |
| AUTHORIZED_LAWYER | yetkilendirilmiş avukat |
| LAWYER · STAFF · FINANCE | operasyonel capacity'ler (final-approver DEĞİL — §8) |
| PORTAL_CLIENT | müvekkil portalı (default-deny; client-scope) |
| SYSTEM_JOB · EXTERNAL_PROVIDER | sistem/dış aktör (final-approver DEĞİL) |

**AS-IS (VERIFIED @2e2108aa):** capacity primitive `capacityFromUser` mevcut (lawyerRank XOR
staffType ?? UNKNOWN türevi; capacity-gate tüketicileri var). Role-decorator/guard tabanlı iş-yetki
katmanı gözlenmedi → tek yapısal enforce **tenantId** (CPSG bulgusu; §14).

---

## 5. Authorization Layers — OWNER-APPROVED [C] (ayrık katmanlar; masking ≠ export)

```text
AUTH → TENANT → RESOURCE → RELATIONSHIP → ACTION → FIELD → APPROVAL → EXPORT
Her katman AYRI değerlendirilir; biri diğerini kapsamaz.
- FIELD-LEVEL: field-data-classification'a göre ALLOW/ALLOW_MASKED/DENY (§10 sınıfları).
- MASKING ≠ EXPORT (RC-DBP10-08): ekranda maskeli/maskesiz GÖRME, veriyi EXPORT etme yetkisi
  VERMEZ; export ayrı katman + ayrı deny-reason.
- BREAK-GLASS (RC-DBP10-07): bulk-export / enumeration / cross-tenant / approval-bypass / system-
  actor / kalıcı-grant BREAK-GLASS ile dahi YASAK.
```

---

## 6. Decision Vocabulary — OWNER-APPROVED [D] (11 karar + 14-kod deny-reason kataloğu)

```text
KARAR KÜMESİ (11): ALLOW · ALLOW_MASKED · ALLOW_ASSIGNED_SCOPE · ALLOW_CLIENT_SCOPE ·
  ALLOW_PORTFOLIO_SCOPE · ALLOW_NEED_TO_KNOW · APPROVAL_REQUIRED · BREAK_GLASS_ONLY ·
  OWNER_DECISION_REQUIRED · DENY · NOT_APPLICABLE.
DENY-REASON: 14-kodlu katalog (DBP-10R matrisinde tam liste). Her DENY/kısıtlı-ALLOW bir deny-reason
  kodu taşır (ör. tenant-scope, capacity-eksik, relationship-yok, need-to-know-yok, field-class,
  approval-eksik, export-kısıt, break-glass-limit vb. — kesin kodlar matriste). Bilinmeyen hücre =
  OWNER_DECISION_REQUIRED (asla varsayılan ALLOW DEĞİL).
```

---

## 7. Cross-Case Need-to-Know — OWNER-APPROVED [E] (OPTION D + break-glass)

Cross-case (çapraz-dosya) erişim modeli = **OPTION D**: tenant + actor-capacity + açık
relationship/assignment + need-to-know + resource-scope birlikte gerekir; salt tenant eşitliği
cross-case görünürlük ÜRETMEZ. İstisnai erişim yalnız denetlenmiş BREAK-GLASS'la (§5 limitleri) ve
kalıcı-grant üretmeden. (RC-G3-03 hizası: Debtor timeline cross-case görünürlüğü "tüm personel"
değildir; kesin rol matrisi §9.)

---

## 8. Approval Authority — OWNER-APPROVED [F] (final-approver eligible set; eligible ≠ her-aksiyon)

```text
FINAL-APPROVER ELIGIBLE SET = { TENANT_SUPER_ADMIN · PARTNER · MANAGER · AUTHORIZED_LAWYER }.
  ELIGIBLE ≠ HER-AKSİYON-YETKİLİ (RC-DBP10-04): approver eligibility action-specific'tir (action +
  risk + legal/financial-class + threshold + resource-scope + client-approval koşulları).
ASLA FINAL-APPROVER DEĞİL: LAWYER · STAFF · FINANCE · SYSTEM_JOB · EXTERNAL_PROVIDER · PORTAL_CLIENT.
Staff final-approver DEĞİLDİR (owner düzeltmesi). TENANT_SUPER_ADMIN capacity tenant-local'dir;
platform-admin dosya-erişim yetkisi DEĞİLDİR.
```

---

## 9. Authorization Matrix (#23) — OWNER-APPROVED [G] (DBP-10R; 10×30×14)

```text
MATRIS = 10 actor/capacity × 30 resource (8 resource-family) × 14 operation. Aile-düzeyi belirsiz
cümle YASAK; her hücre bir karar (§6) + gerekli deny-reason taşır. Bilinmeyen = OWNER_DECISION_
REQUIRED. Bu matris HEDEF'tir (RC-DBP10-02): runtime-truth veya G-8 enforcement kanıtı DEĞİL;
matris ile mevcut runtime arasındaki açıklar DBP-11 Implementation Entry Gate'e taşınır.
```

Resource-family örnekleri: identity/identifier · legal-status/eligibility/guard · financial/exposure ·
representation/role · evidence/document · audit/timeline · read-model/twin-tile · export/download.
(Tam 30-resource × 14-operation hücre matrisi analiz ekidir; canonical özet burada.)

---

## 10. KVKK Data Inventory (#24) — OWNER-APPROVED [H] (iç-sınıf ≠ KVKK md6-özel-kategori)

```text
İÇ HASSASİYET SINIFI (internal, ayrı kolon): IDENTITY-HIGH-SENS · LEGAL-STATUS-SENS · FINANCIAL-SENS.
KVKK md6 ÖZEL NİTELİKLİ (sınırlı sayı): sağlık · cinsel hayat · ceza mahkûmiyeti/güvenlik tedbiri ·
  biyometrik · genetik · din/felsefi inanç · dernek/vakıf/sendika üyeliği vb. (mevzuatın belirlediği).
DÜZELTME (RC-DBP10-10): TCKN/VKN · ölüm · iflas · konkordato · tereke · exposure OTOMATİK olarak
  KVKK-md6-özel-nitelikli DEĞİLDİR. İç-hassasiyet sınıfı (yüksek koruma gerektirir) ile KVKK-md6
  (mevzuat sınırlı sayı) AYRI KOLONLARDIR; biri diğerini türetmez. md6 sınıflandırması owner+legal
  sign-off'a tabidir (bu belge md6 ataması YAPMAZ).
```

---

## 11. Masking / Retention / Anonymization (#25) — OWNER-APPROVED [I]

```text
MASKING-POLICY-CLASS (soyut): FULL · PARTIAL · LAST-N · TOKENIZED · HIDDEN. Kesin karakter formatı
  (ör. "ilk2****son2") RATIFIYE EDİLMEZ — implementation-security-policy'dir (bu belge format
  dondurmaz). Field-data-classification → masking-policy-class eşlemesi authz matrisinin field
  katmanıyla hizalı (§5/§10).
MASKING ≠ EXPORT (RC-DBP10-08). Retention/anonymization POLICY İÇERİĞİ (süreler, anonymization
  yöntemi, legal-hold etkileşimi) owner+legal SIGN-OFF PENDING; bu belge yapı verir, içerik vermez.
```

---

## 12. AI Data Access & Explanation (#26) — OWNER-APPROVED [J] (allowlist + local-only)

```text
AI CONTEXT = ALLOWLIST + LOCAL-ONLY (RC-DBP10-09): raw-evidence · TCKN/passport · audit kayıtları ·
  full-address · unminimized-object VARSAYILAN YASAK (allowlist'te açıkça yoksa AI'ya gitmez).
AI kanonik state YAZMAZ (N-10); finansal/hukuki işlem yapmaz (N-09); açıklama/taslak advisory-only.
AS-IS (VERIFIED @2e2108aa): `ai.service` tenant-boundary testli (`ai.service.tenant-boundary.spec.ts`);
  allowlist enforcement'ı ve minimizasyon DBP-11 test-gate + CPSG kapsamında doğrulanır.
```

---

## 13. İki Ayrı Güvenlik Gate — OWNER-APPROVED [K] (RC-DBP10-06/11)

```text
CPSG — CURRENT PRODUCTION SECURITY GATE : mevcut açık üretim yüzeyleri. AYRI KUYRUK; Twin HOLD bunu
       ERTELEMEZ. 11 bulgu DBP-11'de 5 sınıfa ayrılır: immediate-remediation · implementation-entry-
       blocker · DT-activation-blocker · cutover-blocker · non-blocking-tech-debt.
DTSG — DIGITAL TWIN SECURITY GATE : yeni Twin/tile aktivasyonu (DBP-09 HOLD). AYRI KUYRUK.
İKİ GATE AYRIDIR (RC-DBP10-11): CPSG kalemleri mevcut-runtime'dır ve Twin/DBP-12'yi BEKLEMEZ; her
  remediation izole-worktree + dar-kapsam + negative-test + CI + rollback ile (DBP-11 QUEUE-A).
```

---

## 14. Current Production Security Findings — PUBLIC-SAFE DISPOSITION (detay owner-local)

```text
RESTRICTED SECURITY FINDINGS          : PRESENT
DETAILED REGISTER AUTHORITY           : OWNER LOCAL / RESTRICTED (git-tracked DEĞİL; repository/PR/
                                         CI-artifact DEĞİL; cloud/external/3rd-party-AI DEĞİL)
PUBLIC DISCLOSURE                     : WITHHELD (mekanizma · etkilenen yüzey/route/servis
                                         kombinasyonu · enumeration/bypass yöntemi · ayrıntılı
                                         remediation adımları)
PROGRAM EFFECT                        : IMPLEMENTATION ENTRY HOLD (ilgili yüzeyler için)
REMEDIATION AUTHORITY                 : SEPARATE OWNER GO-IMPLEMENT REQUIRED (bu belge remediation
                                         açmaz/yetkilendirmez)
SOURCE-FINDING TRACKING               : hiçbir bulgu disposition'suz kaybolmaz — tam kayıt owner-
                                         local restricted register'da; public-safe sınıflandırması
                                         DBP-11 Master Blocker Register'da (bkz. DBP-11 §6)
```

---

## 15. Digital Twin Security Gate — OWNER-APPROVED [L] (HOLD)

Yeni Twin/tile aktivasyonu (DBP-09) DTSG'ye tabidir ve **HOLD**'dur: tile-permission (default-deny)
+ field-level authz + office tenant-only gap remediation + evidence-content ayrımı + KVKK sign-off +
DBP-11 test-gate tamamlanmadan ve explicit owner GO-IMPLEMENT olmadan AÇILAMAZ. DTSG HOLD, CPSG
kalemlerini ERTELEMEZ (§13).

---

## 16. AS-IS Evidence (VERIFIED @2e2108aa — public-safe; bu belge davranış değiştirmez)

Tek yapısal enforce **tenantId** (role-decorator/guard tabanlı iş-yetki katmanı gözlenmedi) →
default-deny + capacity/relationship/field katmanları TARGET · `capacityFromUser` capacity primitive
mevcut · `ai.service` tenant-boundary testli. Belirli üretim yüzeylerinde ek güvenlik bulguları
mevcuttur (§14); yüzey/mekanizma ayrıntısı owner-local restricted register'dadır.

---

## 17. DBP-11/12 Routing

| Hedef | Giden |
|---|---|
| **DBP-11** | CPSG 11 bulgu → Master Blocker Register 5 sınıf; QUEUE-A remediation-eligible; authz-matrix runtime açıkları entry-gate; template/download scope doğrulama; AI allowlist test-gate |
| **DBP-12** | authz/KVKK/masking/AI-context final register; iki güvenlik gate final disposition; 30-resource matris UNKNOWN'ları OWNER_DECISION_REQUIRED kuyruğu |

---

## 18. ODR / Sign-off / Gate Açık Kayıtları (bu belge hiçbirini vermez/kapatmaz)

**ODR:** 30-resource × 14-operation matris UNKNOWN'ları (= OWNER_DECISION_REQUIRED) · deny-reason
kesin kodları.
**Sign-off (owner+legal):** KVKK md6 sınıflandırması · retention/anonymization policy içeriği ·
masking karakter-politikası (impl-security-policy).
**Gate:** CPSG (11 bulgu → DBP-11 5 sınıf) · DTSG (HOLD) · template/download scope (NOT VERIFIED/HIGH).

---

## 19. Exit Blocker Matrisi (iki gate ayrı)

| Konu | (i) ANALYSIS APPROVAL WITH OPEN ITEMS? | (ii) FULLY RESOLVED L8 ARCHITECTURE? |
|---|---|---|
| Default-deny + tenant≠business-authz (§3) | NO | **YES** |
| Actor/capacity + authz layers + decision vocab | NO | **YES** |
| Cross-case=OPTION D + break-glass | NO | **YES** |
| Final-approver eligible set (§8) | NO | **YES** |
| KVKK iç-sınıf ≠ md6 ayrımı | NO | **YES** |
| Masking-policy-class + AI allowlist | NO | **YES** |
| İki güvenlik gate ayrımı (§13) | NO | **YES** |
| 30-resource matris UNKNOWN'ları | NO | CONDITIONAL (OWNER_DECISION_REQUIRED) |
| CPSG 11 bulgu remediation | NO | CONDITIONAL (DBP-11 QUEUE-A) |
| KVKK/retention/masking sign-off | NO | CONDITIONAL (owner+legal) |
| DTSG (Twin activation) | NO | CONDITIONAL (HOLD) |

DBP-10, açık kalemleri görünür taşıyarak **OWNER-APPROVED / KVKK+LEGAL SIGN-OFF PENDING · TWO
SECURITY GATES OPEN** disposition'ıyla kapanmıştır (2026-07-15); aktivasyon ve production remediation
yukarıdaki gate'ler/sign-off'lar tamamlanmadan VERİLEMEZ.

---

## 20. Owner Approval Record

```text
APPROVE DBP-10 v1.1 — OWNER-APPROVED / KVKK+LEGAL SIGN-OFF PENDING · TWO SECURITY GATES OPEN
(2026-07-15, chat-only owner kararı; bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[N]): default-deny + tenant≠business-authz · actor/capacity modeli (10 aktör; TENANT_
SUPER_ADMIN tenant-local) · authorization layers (masking≠export; break-glass limitleri) · decision
vocabulary (11 karar + 14-kod deny-reason) · cross-case need-to-know (OPTION D) · approval authority
(final-approver eligible set; eligible≠her-aksiyon; staff final-approver değil) · Authorization Matrix
(10×30×14; unknown=OWNER_DECISION_REQUIRED; target≠runtime) · KVKK Data Inventory (iç-sınıf≠md6) ·
Masking/Retention/Anonymization YAPISI (masking-policy-class; format ratifiye değil) · AI Context
(allowlist+local-only) · iki güvenlik gate ayrımı · CPSG restricted bulgu register'ı (public-safe
opak disposition; detay owner-local) · DTSG HOLD.
KARARLAR: cross-case = OPTION D · final-approver eligible = {TENANT_SUPER_ADMIN,PARTNER,MANAGER,
AUTHORIZED_LAWYER} · Digital Twin Security Gate = HOLD · staff final-approver = NO.
ONAYLANMAMIŞ/AÇIK: 30-resource matris UNKNOWN'ları · CPSG 11 bulgu (DBP-11 5 sınıf) · DTSG · KVKK
md6 sınıflandırması + retention/anonymization içeriği + masking karakter-politikası (owner+legal
sign-off) · template/download scope (NOT VERIFIED/HIGH) — statüleri OWNER_DECISION_REQUIRED / SIGN-OFF
PENDING / GATE OPEN olarak korunur.
```

**Revizyon geçmişi (özet):** R0.1 ilk L8 analizi (authz/KVKK/retention/AI-context; AS-IS tek-enforce-
tenantId + capacity primitive tespiti) → R0.2 SECURITY MODEL CORRECTION (default-deny; tenant≠business-
authz; decision vocabulary + deny-reason; cross-case OPTION D; final-approver eligible set; KVKK iç-
sınıf≠md6; masking-policy-class; AI allowlist+local-only; iki güvenlik gate; TENANT_SUPER_ADMIN tenant-
local) → v1.1 MATRIX COMPLETION (10×30×14 authorization matrisi; 8 resource-family; unknown=OWNER_
DECISION_REQUIRED; CPSG 11-bulgu 5-sınıf çerçevesi; RC-DBP10-01..11) → GO-DOCS pre-normalizasyonu (repo
BR-18/19 + artefakt #23-26 + BC-18 + INV-01/02 + N-09/10 cross-ref'leri; AS-IS @2e2108aa re-verification;
GÜVENLİK REDAKSİYONU: bulgu id/severity/gate/closure korunup mekanizma/route redakte; RC clarification'
ların gövdeye absorbe edilmesi). Ara revizyon metinleri görev sohbetindedir; bağlayıcı bu belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Default-deny korundu mu (ODR=DENY-until-decided):            YES (§3; RC-DBP10-01)
- Tenant izolasyonu iş-yetki yerine mi konuldu:                NO (§3; ayrı katmanlar)
- Target matrix runtime-truth/enforcement kanıtı olarak mı:    NO (§9; RC-DBP10-02 → DBP-11)
- TENANT_SUPER_ADMIN cross-tenant/platform-admin erişimi:      NO (§4/§8; tenant-local)
- Staff final-approver olarak mı gösterildi:                   NO (§8; eligible set dışı)
- Masking bir export yetkisi olarak mı:                        NO (§5/§11; masking≠export)
- İç-hassasiyet sınıfı KVKK-md6 ile eşitlendi mi:              NO (§10; ayrı kolon)
- TCKN/exposure otomatik md6 özel-nitelikli mi:                NO (§10; RC-DBP10-10)
- Masking karakter formatı ratifiye edildi mi:                 NO (§11; impl-security-policy)
- AI'ya raw-PII/evidence varsayılan gidiyor mu:                NO (§12; allowlist+local-only)
- İki güvenlik gate ayrı tutuldu mu:                           YES (§13; CPSG≠DTSG)
- Twin HOLD mevcut prod risklerini erteledi mi:                NO (§13; CPSG ayrı kuyruk)
- Güvenlik bulgusu exploit/route/enumeration ifşa edildi mi:   NO (§14; PUBLIC-SAFE — yalnız varlık/HOLD/ayrı-GO görünür)
- Yüzey/mekanizma ipucu (kimlik-arama/indirme/cron vb.) var mı: NO (§16; genelleştirildi)
- Source-finding disposition'suz kayboldu mu:                  NO (§14; owner-local register + DBP-11 Master Blocker Register)
- Digital Twin Security Gate HOLD korundu mu:                  YES (§15)
- IMPLEMENTATION/remediation AUTHORITY üretildi mi:            NO (NONE; §1)
- Register/decision-log değişikliği:                           NO
- Orphan referans:                                             NO (path'ler main'de mevcut)
```
