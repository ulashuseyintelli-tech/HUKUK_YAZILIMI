# DEBTOR DBP-07 — LEGAL ROLE, REPRESENTATION & LIABILITY ARCHITECTURE v1.0

> **Canonical Phase 1 L5-sorumluluk artifact.** Bu belge, `DEBTOR CANONICAL DOMAIN BLUEPRINT
> CHARTER v1.0` §9 kapsamındaki DBP-07 work package'ının owner-onaylı çıktısıdır (Charter
> artefaktı #17 LegalRole & Liability Spec'in aday/karar-zemini katmanı; Charter BR-04 mirasçı ·
> BR-06 LegalRole–Representation–Responsibility · BR-07 LiabilityGroup–ClaimItem–Collection
> routing'lerini taşır). İçerik GO-ANALYZE (DBP-07 R0.1 → R0.2) çıktısıdır; bu GO-DOCS turunda
> yeni analiz, owner kararı, LDO/Finance sign-off'u veya mimari üretilmemiştir. **OD-07
> IMPLEMENTATION HOLD'dur; hiçbir rol/sorumluluk/exposure modeli implementasyon, schema veya
> cutover yetkisi ÜRETMEZ. Liability'nin parasal semantiği Alacak/Muhasebe domain'inindir ve bu
> belgeyle yeniden tasarlanmaz (N-16/N-17).**

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-07 — LEGAL ROLE, REPRESENTATION & LIABILITY ARCHITECTURE (L5-sorumluluk)
VERSION            : v1.0 (R0.2 onaylı analizin konsolidasyonu + GO-DOCS pre-normalizasyonu)
PRODUCED UNDER     : GO-ANALYZE (R0.1 → R0.2 ROLE/RESPONSIBILITY SEPARATION CORRECTION);
                     canonicalization: GO-DOCS
ARTIFACT STATUS    : OWNER-APPROVED (2026-07-15; onay kapsamı [A]–[N] — bkz. §22)
REVIEW DISPOSITION : OWNER-APPROVED WITH OPEN OD-07 / LDO+FINANCE SIGN-OFF PENDING — yeni bir
                     repository lifecycle state'i DEĞİLDİR; yalnız review disposition'dır.
AÇIK KALANLAR      : OD-07 alt kararları (rol/sorumluluk/exposure realization) · OBD-02 Liability
                     yerleşimi (CaseDebtor mı ayrı LiabilityGroup mu) · bankruptcy/iflas masası
                     sınıflandırması (LSR/OPEN) · legal succession × Liability aktarım kuralları
                     (LDO) · exposure↔Alacak/Accounting koordinasyon sözleşmesi (Finance+LDO
                     gate; BR-07) · müteselsil/kefalet sorumluluk hukuki içerikleri (LSR) ·
                     rol/sorumluluk insan-onay rolleri (ODR)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
ANALYSIS BASE (PIN): analiz turları Phase 1 GO-ANALYZE (2026-07-15); GO-DOCS drift kontrolü ve bu
                     belgenin AS-IS kanıt base'i origin/main @ 351c7820 (fetch 2026-07-15;
                     schema.prisma DebtorRole/CaseDebtor/LiabilityType/EstateHeir + uyap-xml/
                     workflow-engine servis kanıtları bu pin'de doğrulandı)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir model/servis/migration için implementasyon,
                     schema, cutover, backfill, workstream açılışı veya register genişletmesi
                     yetkisi üretmez (SYS-GOV-003, SYS-DEC-003, SYS-GOV-008).
KİMLİK UZAYI       : LR/RP/RS/EX/LRV kimlikleri DBP-07-local PROPOSED'dur (DBP-12'ye kadar).
                     BR/BC/OBD/OD/AGG/N/LG kimlikleri Charter/DBP-03/DBP-04/DEBTOR-GOVERNANCE'ın
                     mevcut kimlikleridir — bu belge YENİ BR/BC/OBD/OD/N kuralı üretmez.
```

**Authority basis.** İki eksen (SYS-AUTH-006): Semantic — `SYSTEM-CONSTITUTION.md` →
`DEBTOR-GOVERNANCE.md` (§3/§4/§5 rol-sorumluluk-müteselsillik satırları) → ADR. Execution/safety
— `AGENTS.md` + task authorization. `SYS-GOV-004`: yürürlükteki mevzuat bu belgeden üstündür;
hukuki yorum belirsizse sistem fail-closed davranır ve LDO sign-off'suz production authority
oluşmaz. Legal-responsibility parasal tutar HESAPLAMAZ (bkz. §6).

## RELATED DOCUMENTS

- Charter: `project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` (§7 BR-04/06/07)
- DBP-03 (L2): `project/docs/blueprint/DEBTOR-DBP-03-BOUNDED-CONTEXT-MAP-v1.0.md` (BC-03 CaseDebtor &
  Liability · AGG-04 CaseDebtor+LegalRole · AGG-05 Liability aday · OBD-02)
- DBP-04 (L3): `project/docs/blueprint/DEBTOR-DBP-04-LEGAL-STATE-LEGALGUARD-v1.0.md` (DECEASED/legal
  condition × Liability kesişimi §17; LG-03 ölümde takip BLOK)
- DBP-06 (L5-kimlik): `project/docs/blueprint/DEBTOR-DBP-06-PARTY-IDENTITY-MATCHING-v1.0.md`
  (Identity≠Role≠Liability; §14 succession — Liability aktarımı OTOMATİK DEĞİL; EstateHeir/estate
  Party; GUARANTOR_OF/REPRESENTS relationship'i tek başına sorumluluk/yetki üretmez)
- Domain Law: `project/docs/governance/DEBTOR-GOVERNANCE.md`
- Alacak sınırı: Charter N-16 (Liability/Alacak Kalemi/Accounting ile koordineli tasarlanır) +
  N-17 (Collection ledger yeniden yazılmaz/bypass edilmez)

---

## 2. Statü Sözlüğü

```text
AUTH / MAT / EVD / DEC / S-OWN / HOST / EXEC — DBP-02/03/04 sözlüğüyle aynı.
DEC ∈ { CANONICALLY DEFINED (CD) · PROPOSED · OWNER DECISION REQUIRED (ODR) ·
        VERIFICATION REQUIRED (VR) }
LSR  = LEGAL-SIGN-OFF REQUIRED (LDO) — rol/sorumluluk/müteselsillik hukuki içerik/etki onayı;
       owner onayından AYRIDIR.
FGO  = FINANCE + LDO GATE — exposure↔Alacak/Accounting koordinasyon sözleşmesi (BR-07).
NI   = NOT_IMPLEMENTED.
Aksi yazılmadıkça: S-OWN=DEBTOR (BC-03) · HOST=DEBTOR api · EXEC=NOT AUTHORIZED (OD-07 HOLD).
TENANT SCOPE: aksi yazılmadıkça tenant-local.
```

---

## 3. Kavram Ayrımı — OWNER-APPROVED [A] (rol ≠ temsil ≠ sorumluluk ≠ borç kalemi ≠ exposure)

**BR-06 çözümü: OPTION D (owner-approved).** Bugün tek `CaseDebtor.role` alanında karışan
kavramlar hedefte AYRIK kavramlara ayrılır; transitional `CaseDebtor` korunur.

```text
LEGAL RESPONSIBILITY IS MULTI-DIMENSIONAL — tek enum/tek alan ile ifade edilemez:
  A. CASE-PARTY RELATIONSHIP  : bir Party'nin dosyayla ilişkisi (dosyada yer alış biçimi).
  B. CASE-DEBTOR / PARTY ROLE : hukuki-usul rolü (asıl borçlu, kefil, mirasçı, ciranta ...).
                                INSTRUMENT PARTY ROLE (lehdar/keşideci/muhatap/ciranta/aval) bir
                                KIYMETLİ EVRAK taraf sıfatıdır ve TEK BAŞINA "borçlu rolü" DEĞİLDİR
                                (RC: instrument-party-role ≠ debtor-role). PAYEE/lehdar takip
                                borçlusu OLARAK VARSAYILMAZ (RC: payee is not presumed debtor).
  C. REPRESENTATION           : bir tarafı temsil ilişkisi (vekil/temsilci) — sorumluluğu ve
                                borçlu sıfatını DEĞİŞTİRMEZ (RC: representation does not alter
                                debtor liability; DBP-06 REPRESENTS yetki vermez).
  D. LEGAL RESPONSIBILITY     : role + kapsam + limit + pay (share) + müteselsillik boyutlarından
                                oluşan değerlendirme; parasal TUTAR HESAPLAMAZ (bkz. §6).
  E. FINANCIAL EXPOSURE       : sorumluluğun parasal karşılığı — Alacak/Muhasebe domain'inin
                                türettiği DERIVED büyüklük (N-16). LegalResponsibility exposure'ı
                                ÜRETMEZ; yalnız hukuki çerçevesini verir.
İLKE: bu beş kavram AYNI alanda/enumda birleştirilmez; biri diğerini otomatik türetmez.
```

---

## 4. Legal Role Catalog — OWNER-APPROVED [B] (AS-IS enum + target CaseDebtorRole; PROPOSED)

**AS-IS (VERIFIED @351c7820):** `enum DebtorRole` (schema.prisma:3023-3036) 12 değer taşır —
`ASIL_BORCLU · MUSETEREK_BORCLU · ADI_KEFIL · MUTESELSIL_KEFIL · AVAL · CIRANTA · LEHDAR ·
KESIDECI · MUHATAP · MIRASCI · TASFIYE_MEMURU · IFLAS_MASASI`. `CaseDebtor.role`
(schema.prisma:1320) `@default(ASIL_BORCLU)` — **varsayılan asıl-borçlu ataması yapısal risktir**
(rol belirsizken sessiz asıl-borçlu kabulü; LRV-02 ile birlikte §16).

| LR | Rol sınıfı | Kaynak | DEC |
|---|---|---|---|
| LR-01 | Asıl borçlu (ASIL_BORCLU) | mevcut enum | CD (AS-IS) |
| LR-02 | Müşterek/müteselsil borçlu (MUSETEREK_BORCLU) | mevcut enum; müteselsillik hukuki etkisi LSR | CD·içerik LSR |
| LR-03 | Kefil (ADI_KEFIL / MUTESELSIL_KEFIL) | mevcut enum; kefalet obligation-scoped (DBP-06 RC: GUARANTOR_OF party-level yalnız informational) | CD·içerik LSR |
| LR-04 | Kıymetli evrak tarafı (AVAL/CIRANTA/LEHDAR/KESIDECI/MUHATAP) | mevcut enum; **instrument-party-role ≠ debtor-role** | CD·PROPOSED sınır |
| LR-05 | Mirasçı (MIRASCI) | mevcut enum; **estate/heir Party kind — otomatik borçlu rolü DEĞİL** (§9; DBP-06 BRD-04) | CD·PROPOSED sınır |
| LR-06 | Tasfiye/iflas organı (TASFIYE_MEMURU/IFLAS_MASASI) | mevcut enum; **bankruptcy estate sınıflandırması OPEN (LSR)** | PROPOSED·LSR |

**Target (PROPOSED):** `CaseDebtorRole` ayrık kavram (rol + rol-kaynağı + rol-kanıtı + effective
period + versiyon); rol atama otomatik borçlu-sorumluluğu ÜRETMEZ (zincir §7). `@default(ASIL_BORCLU)`
target modelde kaldırılır — rol açıkça atanır veya `NOT_DETERMINED` kalır (implementasyon OD-07).

---

## 5. Representation Model — OWNER-APPROVED [C] (temsil sorumluluğu değiştirmez)

**AS-IS (VERIFIED @351c7820):** `CaseDebtor.debtorLawyerId/debtorLawyerName/debtorLawyerBarNo`
(schema.prisma:1370-1373) — borçlu vekili düz alan; ayrı temsil kaydı/geçmişi/kapsamı YOK.

| RP | Kavram | Bağlayıcı anlam | DEC |
|---|---|---|---|
| RP-01 | CaseRepresentation (temsil ilişkisi) | temsilci ↔ temsil edilen taraf; kapsam + evidence + period; **borçlu sıfatını/sorumluluğu DEĞİŞTİRMEZ** | PROPOSED |
| RP-02 | Temsil ≠ yetki | REPRESENTS relationship yetki/authorization VERMEZ (evidence/period/case-scope/authz → DBP-10) | CD (DBP-06 RC-türevi) |
| RP-03 | Temsil geçmişi | temsil append/supersession; sessiz overwrite YOK | PROPOSED·VR→DBP-05 |

---

## 6. Legal Responsibility Model — OWNER-APPROVED [D] (çok boyutlu; parasal tutar üretmez)

**BR-07 çözümü: OPTION D (owner-approved).** Target `LegalResponsibility` = scope + limit + share
(+ müteselsillik boyutu); transitional legacy alanlar read-compatible korunur.

**AS-IS (VERIFIED @351c7820):** `CaseDebtor.liabilityAmount Decimal?(15,2)` +
`CaseDebtor.liabilityType LiabilityType?` (schema.prisma:1321-1322); `enum LiabilityType {TAM,
KISMI, SINIRLI}` (schema.prisma:3158-3162). **Bu alanlar AMBİGÜDÜR** (RC: legacy liability fields
are ambiguous) — bir parasal-tutar-alanının (`liabilityAmount`) Borçlu tablosunda tutulması
DBP-03 V-01 kaydıyla aynı sınırı ihlal etme adayıdır (Borçlu tablosunda receivable-parası).

```text
LEGAL RESPONSIBILITY (PROPOSED; hukuki içerik LSR):
  boyutlar : responsibility scope (hangi borç/kalem) · limit türü (TAM/KISMI/SINIRLI-türevi;
             hukuki içerik LSR) · pay/share (mirasçı pay oranı vb.) · müteselsillik (joint &
             several) · effective period · evidence/provenance · rule/version.
  KURAL    : LegalResponsibility PARASAL TUTAR HESAPLAMAZ. "Sorumluluk sınırı" bir hukuki
             kapsam ifadesidir; "açık borç/bakiye" DEĞİLDİR (§7 exposure ayrımı).
  transitional: `liabilityAmount`/`liabilityType` READ-COMPATIBLE bırakılır; yeni canonical
             sorumluluk-kapsamı olarak OTOMATİK KABUL EDİLMEZ (ambiguity → §16/DBP-11 UNRESOLVED).
```

---

## 7. Exposure Contract & Financial Boundary — OWNER-APPROVED [E] (BR-07 · FGO · N-16/17)

```text
RC: FINANCIAL CONTRACT MUST NOT OWN LEGAL SEMANTICS — ve tersi: legal responsibility parasal
    büyüklük üretmez. İki domain arasındaki bağ bir KOORDİNASYON SÖZLEŞMESİDİR, füzyon değil.
EX-01  OUTSTANDING EXPOSURE      : Alacak/Muhasebe domain'inin türettiği DERIVED büyüklük (N-16);
                                   collection-total ≠ outstanding-balance; missing-exposure ≠ 0.
EX-02  RESPONSIBILITY→EXPOSURE   : LegalResponsibility (scope/limit/share) exposure'ın HUKUKİ
                                   ÇERÇEVESİDİR; parasal değeri Alacak domain hesaplar.
EX-03  EXPOSURE CONTRACT VARIANTS: müteselsil (aynı borçtan birden çok sorumlu) · kısmi/pay-oranlı
                                   (mirasçı) · sınırlı (rehin/aval limitli) · kefalet (obligation-
                                   scoped) — variant hukuki içerikleri LSR; parasal projeksiyon FGO.
KURAL: Collection ledger / receivable accounting BU BELGEYLE YENİDEN YAZILMAZ (N-17).
       Exposure↔Alacak koordinasyon sözleşmesi FINANCE + LDO GATE'e (BR-07) tabidir.
```

`isPledgorDebtor Boolean @default(true)` (schema.prisma:5712) ve senet/enstrüman kaydındaki
`endorsers Json?`/`avals Json?` (schema.prisma:5511-5512) AS-IS tipsiz/yarı-yapılı verilerdir;
canonical rol/sorumluluk kaynağı olarak OTOMATİK KABUL EDİLMEZ (§16; DBP-11 UNRESOLVED adayı).

---

## 8. Estate / Heir / Succession × Liability — OWNER-APPROVED [F] (aktarım OTOMATİK DEĞİL; LSR)

DBP-06 BRD-04 (OPTION D) mirasçı=NATURAL_PERSON Party · tereke=ESTATE Party · HEIR_OF/ESTATE_OF
ilişki modeli KANONİKTİR; bu belge o kimlik modelini DEĞİŞTİRMEZ, sorumluluk kesişimini işler.

**AS-IS (VERIFIED @351c7820):** `enum DebtorRole` içinde `MIRASCI`; `Debtor.deceasedName/
deceasedTckn` (schema.prisma:791-792); `model EstateHeir {debtorId cascade · name · tckn? ·
address · shareRatio String? "1/4"/"25%"}` (schema.prisma:854-876) — **`EstateHeir.tenantId YOK**
(yalnız debtorId cascade; tenant güvenliği debtor üzerinden dolaylı — DBP-10 gap adayı).

```text
RC: ESTATE IS PARTY KIND NOT AUTOMATIC ROLE — ölüm/tereke bir Party-kind'dır; borçlu ROLÜNÜ ve
    sorumluluğu OTOMATİK üretmez.
- Legal succession (birleşme/bölünme/tereke/halefiyet) YENİ Party oluşturabilir, eski Party
  KORUNUR (DBP-06 §14); **Liability/Receivable aktarımı OTOMATİK DEĞİLDİR** (LSR + FGO).
- Mirasçı sorumluluğu (terekeyle sınırlı / şahsi) ve pay (`shareRatio`) hukuki içerikleri LSR;
  sistem `shareRatio` string'inden parasal pay HESAPLAMAZ.
- LG-03 (ölümde takip BLOK; DBP-04) korunur — DECEASED fact'i olmadan mirasçıya otomatik
  enforcement üretilmez.
BANKRUPTCY / İFLAS MASASI (TASFIYE_MEMURU/IFLAS_MASASI): sınıflandırma OPEN — LEGAL-SIGN-OFF
REQUIRED (LSR). Bu belge iflas masası taraf/rol/sorumluluk semantiğini KAPATMAZ.
```

---

## 9. Multiple Role Model — OWNER-APPROVED [G] (OPTION C)

Bir Party bir dosyada AYNI ANDA birden çok rol/sorumluluk taşıyabilir (ör. hem müteselsil borçlu
hem rehin veren); bu roller AYRI kayıtlardır, birbirini bastırmaz. Tekil `CaseDebtor.role` alanı
bu çoklu-rol gerçeğini taşıyamaz (AS-IS sınır). Target: rol/sorumluluk çoklu-kayıt (küme
semantiği); "baskın rol" türetimi bir SUNUM kararıdır, canonical sorumluluğu değiştirmez.

---

## 10. Rol/Sorumluluk Geçmişi & Backfill Yasağı — OWNER-APPROVED [H]

```text
RC: ROLE AND RESPONSIBILITY HISTORY — rol ve sorumluluk değişimleri APPEND/SUPERSESSION ile
    tutulur; sessiz overwrite YOK (effectiveFrom/To + evidence + version).
RC: NO AUTOMATIC ROLE OR RESPONSIBILITY BACKFILL — mevcut `role`/`liabilityAmount`/`liabilityType`
    değerleri, `endorsers`/`avals` JSON'ı veya `isPledgorDebtor` bayrağı YENİ canonical rol/
    sorumluluk kayıtlarına OTOMATİK backfill EDİLMEZ. Geçiş EXPAND→BACKFILL(doğrulanabilir tekil)→
    ... deseniyle ve ayrı GO ile yapılır (DBP-11; N-19/N-20).
```

---

## 11. Passivation Guard Is Universal — OWNER-APPROVED [I] (LRV-03 ile bağlı)

**AS-IS (VERIFIED @351c7820):** `CaseDebtor.lifecycleStatus CaseDebtorLifecycleStatus
@default(ACTIVE)` + `passivatedAt/passivatedById/passivationReason/passivationEffectiveAt`
(schema.prisma:1325-1330) MEVCUT. Ancak `workflow-engine.service.ts` `createEnforcementAction`
(satır 253/333) bu lifecycle/passivation durumunu **guard ETMEZ** (LRV-03).

```text
RC: PASSIVATION GUARD IS UNIVERSAL — pasifleştirilmiş (passivated) CaseDebtor üzerinde rol/
    sorumluluk-türevi HİÇBİR yürütme (enforcement, tebligat, otomasyon geçişi) tetiklenemez.
    Passivation guard tek bir çağrı yolunda değil, TÜM sorumluluk-türevi komut yollarında
    uygulanır. (İçerik/aktivasyon OD-07 + DBP-10 authz + DBP-11 test-gate.)
```

---

## 12. Aggregate / Record Candidates + Lifecycle Normalization — OWNER-APPROVED [J]

**Aggregate adayları (PROPOSED):** CaseDebtorRole (rol küme+history) · LegalResponsibility
(sorumluluk küme+history) · CaseRepresentation (temsil) · **Liability yerleşimi OBD-02 OPEN**
(CaseDebtor-gömülü mü ayrı LiabilityGroup aggregate mı — AGG-05 aday sınırı; karar OD-07/owner).

| Record sınıfı | RECORD MODEL | INTENDED LIFECYCLE | IMMUTABILITY | EXISTING IMPL EVIDENCE |
|---|---|---|---|---|
| CaseDebtorRole | PROPOSED | APPEND-NEW-REVISION / SUPERSESSION | VR — DBP-05 | PARTIAL (`CaseDebtor.role` tekil) |
| LegalResponsibility | PROPOSED | APPEND-NEW-REVISION | VR — DBP-05 | PARTIAL (`liabilityAmount/Type` ambigü) |
| CaseRepresentation | PROPOSED | APPEND-NEW-REVISION | VR — DBP-05 | PARTIAL (`debtorLawyer*` düz alan) |
| Estate/Heir link | PROPOSED | APPEND (DBP-06 modeliyle) | VR — DBP-05 | PARTIAL (`EstateHeir` tenantsız) |

Statü yükseltme yalnız repository kanıtıyla; isim/niyetten immutability türetilmez.

---

## 13. OD-07 Architecture Coordination Framework — OWNER-APPROVED [K] (karar owner+LDO+Finance)

```text
OD-07 = ARCHITECTURE COORDINATION FRAMEWORK APPROVED (framework onaylı; realization HOLD).
Çerçeve: (a) rol/temsil/sorumluluk/exposure ayrımı (§3) BAĞLAYICIDIR; (b) exposure parasal
değeri Alacak/Muhasebe domain'inde kalır, DEBTOR yalnız hukuki çerçeveyi tutar (BR-07/FGO);
(c) hiçbir alt-realization (aggregate yerleşimi OBD-02, müteselsillik hesap kuralları, kefalet
obligation-scope, iflas masası sınıflandırması) BU BELGEYLE seçilmez — her biri ayrı owner +
LDO/Finance kararıdır. OD-07 IMPLEMENTATION HOLD: analiz devam eder, kod/schema/migration YOK.
```

**OD-07-DECISION-01 REALIZATION DEFERRAL RECONCILIATION (2026-07-17, bkz. `decision-log.md` aynı
tarihli kayıt):** Yukarıdaki "realization HOLD" ifadesi o tarihte (DBP-07 canonicalization'ında)
doğruydu; bu not onu SİLMEZ/DEĞİŞTİRMEZ, yalnız `OD-07-DECISION-01` GO-ANALYZE'i sonrası owner
kararını uzlaştırır. **OD-07 FRAMEWORK: APPROVED / PRESERVED** (§3 beş-kavram ayrımı bağlayıcı
kalır; exposure parasal değeri Alacak/Muhasebe domain'inde; DEBTOR yalnız hukuki çerçeve). **OD-07
REALIZATION: DEFERRED / HOLD CONTINUES** — owner `OPTION 1 SELECTED` (realization'ı ertele).
Karar repository truth'a dayanır: **mevcut `LegalResponsibility` aggregate'ı YOK; onun yokluğuyla
TAM bloklu hiçbir capability YOK; hiçbir finansal hesap / Collection / allocation coupling YOK;
`liabilityType` runtime tüketicisi 0; `liabilityAmount` yalnız görüntü-istatistiği tüketilir.**
**OPTION 2 (additive shadow LegalResponsibility record): NOT AUTHORIZED. OPTION 3 (full aggregate):
NOT AUTHORIZED.** **CURRENT MODEL: transitional `CaseDebtor` + case-seviyesi model AS-IS sürer;
`liabilityAmount`/`liabilityType` canonical authority İLAN EDİLMEZ (ambigü, DBP-11 UNRESOLVED).**
**REOPEN TRIGGERS (yetkilendirmez; yalnız yeniden-analiz tetikleyicisi):** per-debtor enforcement
eligibility · multi-role/multi-responsibility support · joint/limited/share-based exposure ·
estate/heir responsibility model · responsibility digital-twin tile · liability signal for score ·
per-debtor claim or payment designation. **KORUNAN SINIRLAR:** Party Foundation UNCHANGED /
SEPARATE HOLD (OD-04) · exposure authority = RECEIVABLE domain (N-16) · calculation authority =
canonical legal calculation (ADR-014) · collection authority = COLLECTION domain (N-17) ·
accounting authority = ACCOUNTING domain · LSO (müteselsillik/kefalet/iflas/succession hukuki
içeriği) OPEN · FGO (exposure↔Alacak koordinasyon sözleşmesi, Finance+LDO) OPEN · **OBD-02
(Liability yerleşimi: CaseDebtor-gömülü mü ayrı LiabilityGroup mu) OPEN AS CANONICAL.** Bu kayıt
kod/schema/migration/aggregate/shadow-record ÜRETMEZ ve sonraki capability'yi başlatmaz.

---

## 14. Current Repository Gap & AS-IS Violation Register (VERIFIED @351c7820)

**Gap özeti:** tek `CaseDebtor.role` çoklu-rol taşıyamaz · `@default(ASIL_BORCLU)` sessiz asıl-borçlu
riski · `liabilityAmount` parasal alan Borçlu tablosunda (V-01 sınırı) · `liabilityType` üç-değerli
ama sorumluluk-kapsamı semantiği belirsiz · `endorsers`/`avals` tipsiz JSON · `isPledgorDebtor`
bayrağı bağlamsız · `EstateHeir.tenantId` YOK · ayrı temsil/sorumluluk/rol kaydı ve geçmişi YOK ·
ayrı `LegalResponsibility` modeli YOK.

| LRV | Bulgu | Kanıt (VERIFIED) | Sev | Disposition |
|---|---|---|---|---|
| LRV-02 | UYAP rol haritası enum-uyumsuz → tüm eşleşmeyen roller sessizce BORÇLU'ya düşer | `uyap-xml.service.ts:954-966` `mapDebtorRoleToUyapKod`: anahtarlar (`MUSTEREN_BORCLU`≠enum `MUSETEREK_BORCLU`; `KEFIL`≠`ADI_KEFIL`/`MUTESELSIL_KEFIL`; `AVALCI`≠`AVAL`; `LEHDAR`/`MUHATAP`/`TASFIYE_MEMURU`/`IFLAS_MASASI` yok) → `|| BORCLU.kod` fallback | HIGH | IMPLEMENTATION ENTRY BLOCKER (§16) — owner-triage |
| LRV-03 | Enforcement aksiyonu passivation/lifecycle guard'sız | `workflow-engine.service.ts:253/333` `createEnforcementAction` — dosyada passivation/lifecycleStatus kontrolü yok | HIGH | IMPLEMENTATION ENTRY BLOCKER (§16) — owner-triage |

Bu register davranışı DEĞİŞTİRMEZ; remediation ayrı GO + izole worktree + negative-test + rollback
gerektirir (DBP-11 QUEUE sınıflandırması). LRV-02/LRV-03 gerçek üretim-riski bulgularıdır ve
Master Blocker Register'a (DBP-11) taşınır.

---

## 15. Event / Fact Delta Disposition (A11/A12/A13 deltaları — BC owner; DBP-12 reconciliation)

Rol/temsil/sorumluluk değişimlerinin event adayları (ör. rol atandı/değişti, sorumluluk
kapsamı revize, temsil başladı/bitti, mirasçı/tereke bağı kaydedildi) **CANDIDATE EVENT**'tir;
`PL/DELIVERY: OBD-07 DEPENDENT`, `SCHEMA VERSION: NOT DEFINED`, `SEMANTIC OWNER: BC-03/BC-01`.
Producer iç domain event'i VARSAYILMAZ; yalnız published integration/query contract kanoniktir
(RC-G3-01). Event adı/payload/versiyon final otoritesi PRODUCER context + DBP-12 final
reconciliation'dır. Behavior/score deltaları (A18/A19/A20) DBP-08'e, davranış≠rol/sorumluluk
sınırıyla, taşınır.

---

## 16. Implementation Entry Blockers (bu belge çözmez; DBP-11'e taşınır)

```text
RC: IMPLEMENTATION ENTRY BLOCKERS = { LRV-02 (UYAP rol-haritası enum-uyumsuz default-BORÇLU),
    LRV-03 (enforcement passivation guard'sız) } — HER İKİSİ HIGH; owner-triage + ayrı remediation
    GO gerektirir. Bu bulgular DBP-11 Master Blocker Register'da CURRENT_PRODUCTION_REMEDIATION /
    IMPLEMENTATION_ENTRY_BLOCKER sınıflarına yazılır; DBP-07 canonicalization onları KAPATMAZ.
Ek entry-koşulları: OD-07 realization kararları · OBD-02 Liability yerleşimi · müteselsillik/
kefalet/iflas-masası LSR · exposure↔Alacak FGO sözleşmesi.
```

---

## 17. DBP-08/09/10/11/12 Routing

| Hedef | Giden |
|---|---|
| **DBP-08** | rol/sorumluluk BehaviorFeature DEĞİLDİR (karışma yasağı); feature legal-fact olamaz (INV-06) |
| **DBP-09** | Twin'de Representation/LegalResponsibility tile'ları — RC-DBP09 finansal-tile semantiği (responsibility-limit ≠ açık-borç); source+as-of+freshness olmadan aktive edilmez |
| **DBP-10** | temsil/rol görünürlüğü + authorization; REPRESENTS yetki vermez; identity/sorumluluk masking sınıfları; default-deny |
| **DBP-11** | LRV-02/LRV-03 Master Blocker Register'a; legacy `liabilityAmount/Type`/`endorsers`/`avals`/`isPledgorDebtor` UNRESOLVED; rol/sorumluluk backfill migration deseni |
| **DBP-12** | OBD-02/OD-07/iflas-masası açık kalemleri final register; rol/sorumluluk event delta final disposition; müteselsillik/kefalet LSR kuyruğu |

---

## 18. ODR / LSR / FGO Açık Kayıtları (bu belge hiçbirini vermez/kapatmaz)

**ODR:** OBD-02 Liability yerleşimi · rol/sorumluluk insan-onay rolleri · OD-07 alt-realization
kararları · çoklu-rol "baskın rol" sunum kuralı.
**LSR:** müteselsillik (joint & several) hukuki içerik/etki · kefalet obligation-scope · mirasçı
sorumluluk türü ve pay hukuki içeriği · iflas masası/tasfiye organı sınıflandırması · instrument-
party-role hukuki etkileri · legal succession × Liability aktarım kuralları.
**FGO (Finance+LDO):** exposure↔Alacak/Accounting koordinasyon sözleşmesi (BR-07) · outstanding
exposure türetim sınırı (N-16).

---

## 19. Exit Blocker Matrisi (iki gate ayrı)

| Konu | (i) ANALYSIS APPROVAL WITH OPEN ITEMS? | (ii) FULLY RESOLVED L5-LIABILITY ARCHITECTURE? |
|---|---|---|
| Kavram ayrımı (§3) · rol/temsil/sorumluluk/exposure | NO | **YES** |
| BR-06/BR-07 çözümü (OPTION D) | NO | **YES** |
| OBD-02 Liability yerleşimi | NO | **YES** |
| Müteselsillik/kefalet/iflas-masası (LSR) | NO | **YES** |
| Legal succession × Liability aktarım (LSR) | NO | **YES** |
| Exposure↔Alacak koordinasyonu (FGO) | NO | **YES** |
| LRV-02/LRV-03 remediation | NO | CONDITIONAL (DBP-11 kuyruğu) |
| Record lifecycle VR | NO | CONDITIONAL (DBP-05 kanıtıyla) |
| Rol/sorumluluk insan-onay rolleri (ODR) | NO | CONDITIONAL (OPEN taşınabilir) |

DBP-07, açık kalemleri görünür taşıyarak **OWNER-APPROVED WITH OPEN OD-07 / LDO+FINANCE SIGN-OFF
PENDING** disposition'ıyla kapanmıştır (2026-07-15); **FULLY RESOLVED** statüsü yukarıdaki
kararlar/sign-off'lar tamamlanmadan VERİLEMEZ.

---

## 20. AS-IS Bulgular Özeti (VERIFIED @351c7820 — bu belge davranış değiştirmez)

`enum DebtorRole` 12 değer · `CaseDebtor.role @default(ASIL_BORCLU)` · `liabilityAmount Decimal?` +
`liabilityType {TAM/KISMI/SINIRLI}` (ambigü) · `CaseDebtor` passivation lifecycle alanları MEVCUT
ama enforcement yolu guard'sız (LRV-03) · UYAP rol haritası enum-uyumsuz default-BORÇLU (LRV-02) ·
`EstateHeir.tenantId` YOK · `debtorLawyer*` düz alan (ayrı temsil kaydı yok) · `endorsers`/`avals`
tipsiz JSON · `isPledgorDebtor` bayrağı · ayrı `LegalResponsibility`/`CaseDebtorRole`/
`CaseRepresentation` modeli YOK.

---

## 21. Analysis Approval / Fully Resolved Blocker Matrisi (özet)

DBP-07 mimari yönü (kavram ayrımı + BR-06/07 OPTION D + estate/succession sınırı + passivation
universality + exposure/Alacak koordinasyon çerçevesi) **FULLY RESOLVED L5-LIABILITY ARCHITECTURE**
adayıdır; ancak OD-07 realization, OBD-02, LSR (müteselsillik/kefalet/iflas/succession) ve FGO
(exposure↔Alacak) kararları tamamlanmadan **FULLY RESOLVED** statüsü VERİLMEZ. LRV-02/LRV-03
üretim-riski bulguları DBP-11'e devredilir.

---

## 22. Owner Approval Record

```text
APPROVE DBP-07 R0.2 WITH OPEN OD-07 / LDO+FINANCE SIGN-OFF PENDING (2026-07-15, chat-only owner
kararı; bu belge kaydın repo taşıyıcısıdır)
ONAYLANAN ([A]–[N]): kavram ayrımı (rol/temsil/sorumluluk/borç-kalemi/exposure) · Legal Role
Catalog YAPISI · Representation modeli (temsil sorumluluğu değiştirmez) · Legal Responsibility
çok-boyutlu modeli (parasal tutar üretmez) · Exposure Contract & Financial Boundary (BR-07/FGO/
N-16/17) · Estate/Heir/Succession × Liability (aktarım otomatik değil) · Multiple Role (OPTION
C) · Rol/Sorumluluk geçmişi + backfill yasağı · Passivation guard universality · Aggregate/Record
ayrımı + lifecycle normalizasyonu · OD-07 Architecture Coordination Framework · AS-IS Violation
Register (LRV-02/LRV-03) · Event/Fact delta disposition · Implementation Entry Blocker tespiti.
BR-06 çözümü = OPTION D · BR-07 çözümü = OPTION D · Multiple Role = OPTION C.
ONAYLANMAMIŞ/AÇIK: OD-07 alt-realization kararları · OBD-02 Liability yerleşimi · müteselsillik/
kefalet/iflas-masası hukuki içerikleri (LSR) · legal succession × Liability aktarım kuralları
(LSR) · exposure↔Alacak/Accounting koordinasyon sözleşmesi (Finance+LDO gate) · rol/sorumluluk
insan-onay rolleri (ODR).
```

**Revizyon geçmişi (özet):** R0.1 ilk L5-sorumluluk analizi (rol/temsil/sorumluluk karışımı
tespiti; AS-IS enum + CaseDebtor kanıtı; LRV bulguları) → R0.2 ROLE/RESPONSIBILITY SEPARATION
CORRECTION (beş-kavram ayrımı; LegalResponsibility çok-boyutlu + parasal-tutar-üretmez ilkesi;
exposure/Alacak koordinasyon sözleşmesi + FGO; estate/succession × Liability aktarım-otomatik-değil;
passivation universality; backfill yasağı; OD-07 framework) → GO-DOCS pre-normalizasyonu (repo
konvansiyonuna hizalama; BR-04/06/07 + BC-03 + AGG-04/05 + OBD-02 + OD-07 + N-16/17 + LG-03
cross-ref'leri; LRV-02/LRV-03 @351c7820 re-verification; RC clarification'ların gövdeye
absorbe edilmesi). Ara revizyon metinleri görev sohbetindedir; bağlayıcı olan bu konsolide belgedir.

## GOVERNANCE DOCUMENT SELF-CHECK

```text
- Rol/temsil/sorumluluk/exposure ayrımı korundu mu:            YES (§3; beş kavram ayrık)
- LegalResponsibility parasal tutar üretiyor mu:               NO (§6)
- Financial contract legal semantik sahibi mi:                 NO (§7; BR-07/FGO)
- Collection ledger / receivable yeniden yazıldı mı:           NO (N-17; §7)
- Estate/heir otomatik borçlu rolü/sorumluluğu üretiyor mu:    NO (§8; RC estate=party-kind)
- Legal succession Liability'yi otomatik aktarıyor mu:         NO (§8; LSR+FGO)
- Instrument-party-role otomatik debtor-role mu:               NO (§4 LR-04)
- Payee otomatik takip borçlusu mu:                            NO (§3-B)
- Representation borçlu sorumluluğunu değiştiriyor mu:         NO (§5; REPRESENTS yetki vermez)
- @default(ASIL_BORCLU) sessiz kabul canonical sayıldı mı:     NO (§4; risk kaydı + LRV-02)
- Passivation guard universal mı:                              YES (§11; LRV-03 açık bulgu)
- Rol/sorumluluk otomatik backfill önerildi mi:                NO (§10; RC no-backfill)
- Legacy liabilityAmount/Type/endorsers/avals canonical mı:    NO (§6/§14; UNRESOLVED → DBP-11)
- OBD-02 Liability yerleşimi bu belgede karara bağlandı mı:    NO (OPEN; OD-07/owner)
- İflas masası sınıflandırması kapatıldı mı:                   NO (LSR/OPEN; §8)
- LRV-02/LRV-03 üretim bulguları kapatıldı/gizlendi mi:        NO (§14/§16; DBP-11'e taşındı)
- Event adayları PROPOSED + OBD-07/RC-G3-01 bağlı mı:          YES (§15)
- Record immutability çözülmüş gösterildi mi:                  NO (VR — DBP-05; §12)
- IMPLEMENTATION AUTHORITY: NONE korundu:                      YES (OD-07 HOLD)
- Register/decision-log değişikliği:                           NO
- Orphan referans:                                             NO (path'ler main'de mevcut)
```
