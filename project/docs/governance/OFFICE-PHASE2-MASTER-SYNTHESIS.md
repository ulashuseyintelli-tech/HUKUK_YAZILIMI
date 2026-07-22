# OFFICE Phase 2 Master Synthesis — Capability and Dependency Baseline

```text
Belge yolu   : project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md
Durum        : CANONICAL REFERENCE / NON-NORMATIVE / AS-OF EVIDENCE BASELINE — v1.0 (owner
               text-ratification: 2026-07-17, `decision-log.md` § "OFFICE Phase 2 Constitutional
               Foundation Owner Text-Ratification"; kuruluş: OWNER GO-DOCS, PR #1359 `20423d4a`)
Rol          : PHASE 2 ARCHITECTURAL SYNTHESIS / CAPABILITY-DEPENDENCY BASELINE — NON-NORMATIVE.
               Norm kaynağı DEĞİLDİR; norm OFFICE-PHASE2-CONSTITUTION.md + OFFICE-GOVERNANCE.md'dedir.
               Bu belge Domain Law'ı veya Phase 2 Constitution'ı OVERRIDE EDEMEZ.
Kimlik uzayı : OFF-P2-CAP-* (capability) ve OFF-P2-DEP-* (dependency) — yalnız bu belgede tanımlanır.
IMPLEMENTATION AUTHORITY: NONE — hiçbir capability bu belgeyle işe dönüşmez, seçilmez, sıralanmaz.
GOVERNANCE-INDEX kaydı: COMPLETED — ratifikasyon PR'ıyla yapıldı (OFF-P2-ENTRY-02).
```

**AD AYRIMI (önemli):** Bu belge, Phase-1-dönemi `OFFICE-MASTER-SYNTHESIS.md` belgesinin devamı veya değiştiricisi DEĞİLDİR. O belge "CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE" rolüyle (150 senaryo, LF/OP/PR-RT-*) aynen yürürlükte kalır ve bu belge onun hiçbir satırını değiştirmez/zayıflatmaz. Bu belge, Phase 2 için **mimari yetenek/bağımlılık sentezidir**; kanıt tabanı olarak Phase 1 evidence baseline'ına yalnız referans verir.

## RELATED DOCUMENTS

- Normatif çerçeve: `project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md` · `project/docs/governance/OFFICE-GOVERNANCE.md` · `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Kardeşler: `project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md` · `project/docs/governance/OFFICE-PHASE2-ROADMAP.md`
- Delivery decomposition (bu sentezden türetilen blueprint): `project/docs/governance/OFFICE-PHASE2-DECOMPOSITION.md` (CANONICAL REFERENCE / NON-NORMATIVE / NON-AUTHORIZING; capability delivery map + increment/Wave mimarisi + decision queue + exit coverage + first-unit seçenekleri. Buradaki CAP-*/DEP-* tabloları ORADA çoğaltılmaz, pointer'la referanslanır; mutable delivery statü otoritesi `OFFICE-DELIVERY-MANIFEST.md`'dir)
- Kanıt/kayıt tabanı: `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md` (Phase 1 evidence baseline, LF/OP/PR-RT-*) · `project/docs/governance/OFFICE-RISK-REGISTER.md` (STF-PRD-*) · `project/docs/governance/OFFICE-OWNER-DECISIONS.md` (OFF/OD-*) · `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md` (Phase 1 teslimat kayıtları) · `project/docs/governance/decision-log.md`

## 1. Phase 1 Delivered Foundation (repository-doğrulanmış zemin)

**AS-OF SNAPSHOT (2026-07-17):** Bu bölümdeki ve §3-§4'teki tüm statüler bu tarihli snapshot'tır; bağlayıcı güncel statü YALNIZ otorite belgelerindedir (`OFFICE-OWNER-DECISIONS.md` / `OFFICE-RISK-REGISTER.md` / `master-triage-register.md` / `OFFICE-DELIVERY-MANIFEST.md` / `decision-log.md`).

Phase 1, owner ratifikasyonuyla **CLOSED / COMPLETE WITH RECORDED RESIDUALS** olarak kapanmıştır (2026-07-17, `decision-log.md` § "OFFICE Phase 1 Closure with Recorded Residuals"; milestone dizisi PHASE 1 MILESTONE 01–09 teyitli, son milestone main `423d72ea`, MILESTONE 09 kapanış kaydı `af7785d2`; delivery register'ında NEXT ELIGIBLE UNIT = NONE). Kapanış hiçbir açık bulguyu kapatmaz, hiçbir PARTIAL invariant'ı tamamlamaz; owner-gated tüm residual'lar açık devam eder. Teslim edilen zemin dört sınıftır:

```text
1. Additive-only ŞEMA TEMELLERİ (sıfır davranış, sıfır consumer):
   - İzin/rol ekseni: PermissionGrant/SystemRole şema temeli (E1 — OD-05/08/09 hedef modelinin
     yapısal temsili; mevcut alanlar TEK gerçek kaynak kaldı)
   - Hiyerarşi ekseni: ReportingLine şema temeli (I1 — OD-08 direct-report/team modelinin
     yapısal temsili; tek-amirli, append-only, team hiyerarşiden türetilecek)
2. Davranışsal BASELINE GATE'ler (ileriye-dönük write-time, tenant + aktiflik):
   - Görev atama baseline'ı (J1) · Dosya ekip-üyeliği baseline'ı (K1 — üyelik uygunluğu
     tenant+aktiflik YALNIZCA; sorumlu-bayrağı ayrı kural)
3. Maskeleme/minimizasyon BASELINE'ları: liste yüzeyi varsayılan maskeli (F1) +
   case-embedded read-model maskeli + edit-safe update kontratı (H1) — OFF-INV-10 PARTIAL
4. Wiring/konsolidasyon: fail-closed + atomic offboarding→hesap deaktivasyonu (A) ·
   canonical actor-capacity read consolidation (C, davranış-nötr)
```

**Dürüst durum tespiti:** Hiçbir STF-PRD bulgusu Phase 1'de kapanmadı (12/12 açık; 5 hat kısmen hafifletildi). 11/20 OFF/OD kararı CLOSED (tümü Option B); 9'u OPEN. 2 bulgu UNMAPPED (CFG-001, PERF-001); 2 yeni bulgu resmi register'a henüz alınmadı (register-intake bekliyor; ayrıntı private evidence'ta — kayıt yeri: `OFFICE-DELIVERY-MANIFEST.md` §2b; not: manifest §6'daki "yeni bulgu: 1" sayacı §2b tablosuyla uyumsuz/bayat görünümlüdür — reconciliation ayrı kalemdir, bu belge taraf seçmez, yalnız çelişkiyi işaretler). Phase 2'nin başlangıç gerçeği budur.

## 1a. Tarihsel Kanıt Önceliği (owner-ratified, 2026-07-17)

"Avukat / Personel Master Audit — **Tur 2** (Kimlik/Organizasyon/Yetki Ontolojisi)" raporu, **HISTORICAL / NON-NORMATIVE** kanıttır (provenance: AS-OF 2026-07-11, Phase-1-teslimatları-öncesi, farklı branch bazı). Öncelik sırası owner tarafından ratifiye edilmiştir: güncel repository gerçeği + kapanmış canonical owner kararları + ratifiye OFFICE Domain Law her zaman üstündür; Phase 1 teslimatlarıyla supersede edilen yapısal/davranışsal beyanları current truth olarak kullanılamaz; CLOSED/CANONICAL OFF/OD kararları o rapora dayanılarak yeniden açılamaz; rapordaki hedef-model önerilerinin normatif otoritesi yoktur ve ratifiye OFFICE hedef modelini override edemez; rapordaki kimlik aileleri kanonik register kimliği değildir ve bu belgelere import edilmemiştir. Raporun ince-taneli ontoloji bulguları bu ratifikasyonla ne kabul ne ret edilmiştir — eşleme/yeniden-adlandırma/canonical-gap triage'ı ayrı bir **Tur 2 Reconciliation GO-ANALYZE** görevine tabidir (henüz başlatılmadı).

## 2. Current-State vs Target-State Disiplini

Bu belgedeki her capability, SYSTEM-CONSTITUTION Bölüm 6 yaşam-döngüsü statüleriyle etiketlenir. `TARGET` hiçbir yerde CURRENT gibi sunulmaz (SYS-SOT-001). "Zemin" = Phase 1'in repository-doğrulanmış teslimatı; "hedef" = ratifiye kararların/invariantların işaret ettiği durum; "kapı" = statü geçişini bloklayan açık owner kararı veya ürün kararı.

**Capability-status kuralı (owner-ratified, 2026-07-17):** Capability statüsü her zaman kanıt-nitelikli ve yaşam-döngüsü-nitelikli kalır. Target-state capability, current repository truth olarak SUNULAMAZ (SYS-SOT-001). Agregat statüler MIXED / PARTIAL / PROPOSED / UNKNOWN (veya eşdeğer nitelikli) durumları KORUR; agregat özetler daha zayıf veya çelişen alt-kanıtı SİLEMEZ/düzleyemez. Roadmap'teki konum readiness, seçim veya implementation authorization İMA ETMEZ.

## 3. Capability Map

*(Format: kimlik — ad · mevcut statü · Phase 1 zemini · hedef durum · bağlı kimlikler · kapılar. Hiçbir satır iş birimi değildir; sıralama alfabetik/tematiktir, öncelik İMA ETMEZ.)*

### `OFF-P2-CAP-01 — Kimlik ve Aktör Modeli Ayrışması`
Statü: TARGET (kavramsal ayrım ratifiye; yapısal ayrışma kısmi). Zemin: mevcut üçlü kimlik yapısı üzerine OD-01 (Person↔UserAccount 1:1 varsayılan) CLOSED. Hedef: OFF-INV-01 karıştırma yasağının (Person ≠ UserAccount ≠ Membership ≠ Employment ≠ Credential) veri modeli ve davranışta tutarlı yürürlüğü. Bağlı: OFF-INV-01/02, OFF/OD-01 (CLOSED); kapılar: OFF/OD-02 (çoklu membership), OFF/OD-03 (çoklu Employment — BLOCKING), OFF/OD-04 (external counsel — DEFERRED), OFF/OD-07 (Tenant↔Org cardinality — BLOCKING, en ağır migration düğümü).

### `OFF-P2-CAP-02 — Nesne-Kapsam Değerlendirmesi (Object-Scope Enforcement)`
Statü: TARGET / NOT_IMPLEMENTED (şema temeli CURRENT, enforcement yok). Zemin: I1 ReportingLine şeması (consumer'sız); OD-08 CLOSED (direct-report/team varsayılan; global erişim ayrı explicit permission). Hedef: OFF-INV-05 zincirindeki object-scope evaluation adımının belge erişimi, manager/team kapsamı ve office-config dahil hedef yüzeylerde davranışsal varlığı. Bağlı: STF-PRD-BOLA-001 (P1), STF-PRD-SCP-001, STF-PRD-CFG-001 (UNMAPPED — owner review), OFF/OD-08 (CLOSED). Not: BOLA-001'in dar S1–S4 remediation'ı kapandı; geniş kapsam açık. Cross-domain ilk dar tüketici emsali: RCV-P2-WS03-P03 (sınır: OFF-P2-BND-03).

### `OFF-P2-CAP-03 — İzin Modeli Consumer-Migration`
Statü: TARGET / NOT_IMPLEMENTED (şema temeli CURRENT, tüketici yok). Zemin: E1 PermissionGrant/SystemRole şeması; OD-05/09 CLOSED (title ≠ SystemRole; sınırlı/süreli direct grant; dar explicit deny). Hedef: OFF-INV-03'ün tutarlı uygulanması — mevcut sert yetkilendirme noktalarının ve izin bayraklarının canonical izin modeline taşınması; eski alanların adapter/cutover disipliniyle emekliliği. Bağlı: STF-PRD-RBAC-001; kapı: bir hattın ürün niyeti (Phase 1'de PRODUCT_DECISION_REQUIRED işaretli finans-onay yetki bayrağı hattı) + migration owner kapıları.

### `OFF-P2-CAP-04 — Atama Uygunluk Zinciri`
Statü: kısmi CURRENT (baseline'lar) / TARGET (tam zincir). Zemin: J1 + K1 baseline gate'leri CANONICAL. Hedef: OFF-INV-04 — assignment ≠ access ayrımı ve eligibility kontrolünün TÜM atama yüzeylerinde varlığı (toplu atama, terfi/rol-değişimi anı, credential-eligibility dahil). Bağlı: STF-PRD-BOLA-002 (OPEN/PARTIALLY MITIGATED), OFF/OD-10 (CLOSED). Kapılar: toplu-atama ürün kararı (ASSIGN-4d DEFERRED), rol/kapasite policy (owner POLICY kararı), credential-eligibility modeli (kanıt boşluğu — Phase 1 sentezinde tekrarlayan UNKNOWN).

### `OFF-P2-CAP-05 — Oturum Yönetimi ve Yetki Tazeliği`
Statü: TARGET / NOT_IMPLEMENTED (mekanizma seçimi RATIFIED, implementasyon DEFERRED). Zemin: OD-14/15 CLOSED (inactive→İLGİLİ TENANT'ın membership+session'ları derhal kapanır, diğer tenant üyelikleri ayrı değerlendirilir; kısa access TTL + refresh anında sunucu-tarafı geçerlilik kontrolü + token-sürümleme — mekanizma ayrıntısı delivery register'ının ilgili kaydındadır). Hedef: OFF-INV-06 — session/token'ın hem hesap hem membership active-state'ine bağlılığı; yetki değişiminin oturum yüzeyine gecikmesiz yansıması. Bağlı: STF-PRD-SES-001 (P1) + SES-002 (birlikte triage edilmeli); Phase 1'de ertelenen revocation altyapı işi bu yeteneğin kapısıdır (auth çekirdeği blast-radius).

### `OFF-P2-CAP-06 — Yaşam Döngüsü ve Offboarding Orkestrasyonu`
Statü: TARGET / NOT_IMPLEMENTED (orkestrasyon hiç inşa edilmedi — "mevcut ama bozuk" değil, "yok" sınıfı). Zemin: A wiring'i (fail-closed + atomic profil→hesap deaktivasyonu) CURRENT. Hedef: OFF-INV-07 zinciri (freeze → revoke → inventory → reassign → terminate → invalidate → verify → audit); reactivation ≠ rehire (OD-17 CLOSED); kısmi-tamamlanma görünürlüğü, compensation, idempotent tekrar-işleme, devir/handoff bütünlüğü. Bağlı: STF-PRD-LIFE-001; kapılar: OFF/OD-16 (revoke↔reassignment sırası — OPEN), OFF/OD-03/04 (Employment modeli).

### `OFF-P2-CAP-07 — Hassas Veri Minimizasyonu ve Alan-Düzeyi Erişim`
Statü: kısmi CURRENT (liste + case-embedded read-model + edit-safe kontrat) / TARGET (detail, export, unmask). Zemin: F1 + H1 CANONICAL; OD-18 CLOSED (maskeli varsayılan + field-level permission + purpose-bound + export/audit/read-model allowlist). Hedef: OFF-INV-10'un tüm projeksiyon yüzeylerinde tam yürürlüğü. Bağlı: STF-PRD-PRIV-001. Kapılar: field-level unmask governance/mekanizma kararı (Phase 1'de BLOCKED bırakılan hat; kim/amaç-bağlama tasarımı tanımsız), export yüzeyi varlığı (Phase 1'de DORMANT — yüzey bulunamadı).

### `OFF-P2-CAP-08 — Onay Aktörü ve Delegasyon (aktör tarafı)`
Statü: çekirdek CURRENT (preserve) / delegasyon TARGET. Zemin: self-approval engeli Person düzeyinde (OD-11 CLOSED; SLICE-02 repository-teslimatı → CURRENT) + onay adım/sıra/eşzamanlılık koruması (Phase 1 evidence-baseline gözlemi PREVENTED sınıfı — REVALIDATION_REQUIRED mirası taşır; canonical HEAD'e karşı yeniden doğrulanmadan tek başına kanıt tabanı sayılmaz). Hedef: ApprovalAuthority'nin scope/amount/currency/validity/version taşıyan aktör modeli ve Delegation yaşam döngüsünün (delegator/delegate/authority/scope/start-end; scope delegator'ı aşamaz) uçtan-uca varlığı. Bağlı: Domain Law §15/§16; ADR-009 + DBIND DOKUNULMAZ engine otoriteleri. Kapılar: OFF/OD-12 (çoklu approval seviyesi — BLOCKING), OFF/OD-13 (delegation kapsamı — BLOCKING), OFF/OD-06 (FoundingLawyer statüsü).

### `OFF-P2-CAP-09 — Denetim İzi ve Atıf (Audit Attribution)`
Statü: TARGET (kısmi mevcut, standardı eksik). Hedef: OFF-INV-08 — acting Person/UserAccount/tenant/authority-kaynağı/delegation/target/before-after/reason/timestamp/outcome/correlation'ın domain audit'te açıklanması; application log ≠ domain audit; hassas alanlar audit projeksiyonlarında da OFF-INV-10'a tabi. Bağlı: Phase 1 §2b'de kayıtlı, register-intake bekleyen yaşam-döngüsü/denetim sınıfı yeni bulgu (ayrıntı private evidence'ta; artık `OFFICE-RISK-REGISTER.md` `STF-PRD-AUDIT-001` olarak kanonikleşti); A'nın carried-forward limitation'ları.

**OWNER RECONCILIATION (2026-07-22, `decision-log.md` § CAP-09 OWNER GO-DECIDE):** CAP-09 owner tarafından üçe ayrıştırılmıştır — **CAP-09A (Audit Attribution Foundation)**, aşağıdaki DEP-03'ün "REQUIRES CAP-01" bağımlılığını TAŞIMAZ (kullanıcı/istek/karar-seviyesi alanlar: `actorUserId`/`actorType`/`reasonCode`/`decisionResult`/`correlationId`/`requestId`/`policyRef`); Decomposition §9/§11/§12/§15'teki "soft enabler, kapı yok" ifadesi bu dilim içindir. **CAP-09B (Person/Profile/Capacity Attribution)** DEP-03'ün "REQUIRES CAP-01" bağımlılığını taşır (`actorProfileRef`, birleşik Person kimliği, gerçek `effectiveRole/capacity`, `actingFor`). **CAP-09C (Enforcement Consumer Adoption)** CONDITIONAL. Bu not aşağıdaki DEP-03 satırını SİLMEZ/DEĞİŞTİRMEZ — yalnız hangi alt-kapsama uygulandığını netleştirir (iki ifade birbiriyle çelişmiyordu, farklı alt-kapsamlara atıfta bulunuyordu).

### `OFF-P2-CAP-10 — Read-Model Güvenilirliği ve Operasyonel Sağlamlık`
Statü: TARGET. Hedef: OFF-INV-09 — read-model'lerin kaynak şeffaflığı, deny ≠ empty ayrımı, mock'un gerçek gibi sunulmaması, freshness; hata/red/boş durum semantiğinin ayrışması; fail-closed operasyonel varsayılanlar ve iş/olay idempotency'si. Bağlı: STF-PRD-OPS-001, STF-PRD-PERF-001 (UNMAPPED — mühendislik iyileştirmesi sınıfı); kapı: OFF/OD-19 (workload kullanım amacı — BLOCKING, Product/HR).

### `OFF-P2-CAP-11 — Veri Bütünlüğü Kısıtları (DB-Level)`
Statü: TARGET / NOT_IMPLEMENTED. Hedef: uygulama-katmanı-yalnız uniqueness/cardinality doğrulamalarının, kapanan kimlik kararlarıyla tutarlı DB-level kısıtlara taşınması. Bağlı: STF-PRD-DATA-001; kapılar: OFF/OD-01 (CLOSED — zemin) + OFF/OD-03 (OPEN — BLOCKING: kısıt işi karar kapanmadan başlamaz).

### `OFF-P2-CAP-12 — Güçlü Çekirdek Koruması (Preserve-Class)`
Statü: korunacak — iki kanıt kademesinde: **(a) repository-teslimatlı üyeler (CURRENT):** self-approval Person-düzeyi engeli (SLICE-02), A'nın fail-closed+atomic wiring'i, F1/H1 maskeleme kontratları, K1'in governance-precise üyelik-uygunluk ayrımı; **(b) evidence-baseline gözlemli üyeler (REVALIDATION_REQUIRED mirası):** onay adım/sıra/eşzamanlılık koruması (PREVENTED), kalıcı silme yolunun yokluğu (PREVENTED / REJECTED RISK), davet/token yaşam-döngüsü kapıları (LIKELY PREVENTED) — bu grup için preserve yükümlülüğü, canonical HEAD'e karşı revalidation'la birlikte geçerlidir. Phase 2'de bu davranışların regresyonu stop-condition'dır; "iyileştirme" adı altında zayıflatılamaz.

## 4. Dependency Map

*(Kenar tipleri Phase 1 delivery modelinden devralınır: REQUIRES / BLOCKED_BY / IMPLEMENTS / RESOLVES. Delivery register'ında gateEffect=BLOCKING kayıtlı kararlardan türeyen kenarlar HARD'dır; NON_BLOCKING/DEFERRED kayıtlı kararlardan türeyen kenarlar aşağıda AÇIKÇA işaretlenir ve HARD sayılmaz; SOFT örnek icat edilmemiştir.)*

### `OFF-P2-DEP-01 — Şema→Enforcement kenarları`
```text
OFF-P2-CAP-03 (consumer-migration)  REQUIRES  E1 PermissionGrant/SystemRole şeması (CURRENT, teslim)
OFF-P2-CAP-02 (object-scope enf.)   REQUIRES  I1 ReportingLine şeması (CURRENT, teslim)
                                    + muhtemel döngü-önleme kısıtı (I1'de bilinçli dışarıda)
OFF-P2-CAP-04 policy katmanı        REQUIRES  J1/K1 baseline gate'leri (CURRENT, teslim)
```
İki şema temeli tamamlayıcı katmandır (izin-kaydı etiket ekseni ↔ o etiketi çözecek hiyerarşi verisi); çakışma/duplicate-authority riski Phase 1'de sıfır olarak kayıtlıdır.

### `OFF-P2-DEP-02 — Owner-Decision kapıları (BLOCKED_BY)`
```text
OFF-P2-CAP-01  BLOCKED_BY  OFF/OD-03 (Employment modeli; BLOCKING) · OFF/OD-07 (Tenant↔Org — en ağır
                            migration düğümü; BLOCKING; OD-02'ye bağlı) · [OFF/OD-02 açık —
                            delivery-register'da NON_BLOCKING kayıtlı · OFF/OD-04 DEFERRED]
OFF-P2-CAP-04  BLOCKED_BY  toplu-atama ürün kararı (ASSIGN-4d DEFERRED) · rol/kapasite POLICY kararı
OFF-P2-CAP-06  BLOCKED_BY  OFF/OD-16 (revoke↔reassignment sırası; delivery-register'da NON_BLOCKING
                            kayıtlı — gate niteliği owner teyidi ister, HARD sayılmaz)
OFF-P2-CAP-07  BLOCKED_BY  field-level unmask governance/mekanizma kararı (olası yeni owner
                            decision — Phase 1 delivery kaydından devralınan tespit, yeni üretim değil)
OFF-P2-CAP-08  BLOCKED_BY  OFF/OD-12 (approval seviyeleri) · OFF/OD-13 (delegation kapsamı)
OFF-P2-CAP-10  BLOCKED_BY  OFF/OD-19 (workload amacı — Product/HR)
OFF-P2-CAP-11  BLOCKED_BY  OFF/OD-03 (DB-constraint işi karar kapanmadan başlamaz)
OFF-P2-CAP-03  BLOCKED_BY  finans-onay yetki bayrağı hattının ürün niyeti (Phase 1
                            PRODUCT_DECISION_REQUIRED kaydı)
```
Açık kararların kendi aralarındaki bağımlılık zinciri `OFFICE-OWNER-DECISIONS.md` DEPENDENCIES alanlarında kayıtlıdır (ör. OD-03↔OD-04, OD-07→OD-02, OD-12→OD-11+ADR-009, OD-13→OD-12); bu belge o zinciri kopyalamaz, devralır.

### `OFF-P2-DEP-03 — Yetenekler-arası kenarlar`
```text
OFF-P2-CAP-05 (oturum tazeliği)     REQUIRES  CAP-01'in active-state ayrışması (OFF-INV-02)
OFF-P2-CAP-06 (offboarding orch.)   REQUIRES  CAP-05 (revoke adımı oturum altyapısına dayanır)
OFF-P2-CAP-09 (audit attribution)   REQUIRES  CAP-01 (acting Person/hesap ayrışması) —
                                    ve TÜM davranışsal yeteneklerin kapanış kanıtı audit'e yazar
                                    [CAP-09B alt-kapsamı için geçerli — CAP-09A bu REQUIRES'ı
                                    taşımaz; bkz. yukarıdaki OWNER RECONCILIATION, 2026-07-22]
OFF-P2-CAP-02/03/04 enforcement     REQUIRES  CAP-09'un atıf standardı (kim/niye reddedildi izi)
OFF-P2-CAP-07 export/detail         REQUIRES  CAP-03'ün field-level permission taşıyıcısı
```

### `OFF-P2-DEP-04 — Cross-domain tüketiciler ve dış sınırlar`
```text
RECEIVABLE (RCV-P2-WS03-P03)  OFF-P2-CAP-02'nin CONTRACT RATIFIED aday tüketicisi (ratified emsal;
                              implementation NOT AUTHORIZED — IMPLEMENTS kenarı ancak teslim
                              kanıtıyla kurulur) — sınır: yeni role/permission/MANAGER kapsamı
                              ÜRETMEZ (OFF-P2-BND-03)
CLIENT-SEC-H2 hattı           AYRI kök neden; OFFICE Phase 2 kapsamı DIŞI (OFF-P2-BND-04)
ADR-009 / DBIND               DOKUNULMAZ engine otoriteleri; CAP-08 yalnız aktör tarafı
Tüm domain'ler                REQUIRES  OFFICE'in ürettiği trusted identity/session context
                              (SYS-AUTH-007) — OFFICE Phase 2 diğer domain'lerin güvenlik ön-koşuludur
```

## 5. Evidence Status and Revalidation

Phase 1 evidence baseline'ının (150 senaryo) tüm teknik iddiaları SYS-COMP-002 gereği REVALIDATION_REQUIRED mirasını taşır; CONTROL GAP / SECURITY-SENSITIVE / PRIVATE EVIDENCE satırları private evidence'ta doğrulanmıştır ve bu sınıflandırma zayıflatılamaz. Bu belgedeki capability statüleri yalnız repository-doğrulanmış Phase 1 teslimatlarına (PR/squash SHA/CI kayıtlı) CURRENT der; sentez-kaynaklı her diğer iddia, Phase 2'de kullanılmadan önce canonical HEAD'e karşı yeniden doğrulanır. Tekrarlayan yüksek-belirsizlik alanları (credential eligibility, kiracılar-arası devir kısıtı, delegasyon yaşam döngüsü) kanıt-üretimi gerektiren alanlar olarak işaretlidir.

## 5a. Tur 2 Canonical Evidence Reconciliation (owner-dispositioned, 2026-07-17)

**Provenance ve otorite sınırı.** "Avukat / Personel Master Audit — Tur 2 (Kimlik/Organizasyon/Yetki Ontolojisi)" raporu **HISTORICAL / NON-NORMATIVE** kanıttır (AS-OF 2026-07-11). Historical anchor `be9c0c90` meşru bir tarihsel dal-işaretçisidir; ancak Tur 2'nin incelediği her dosyanın commit'lenmiş anlık görüntüsü DEĞİLDİR — raporun ayrıntılı gözlemleri o dönemin working-tree'sinden elde edilmiş kanıt içerebilir. Bu nedenle güncel-durum uzlaştırması `be9c0c90..origin/main` diff'iyle değil, **claim-by-claim olarak güncel `origin/main`'e karşı** yapılmıştır (bu, kabul edilen tek tazelik yöntemidir). Bu uzlaştırmanın kendisi kanonik otorite ÜRETMEZ; sonucu yalnız **CANONICAL EVIDENCE DISPOSITION / NON-NORMATIVE** olarak kaydedilir. Güncel `origin/main` repository gerçeği, ratifiye OFFICE Domain Law, kapanmış owner kararları ve Phase 1 delivery kanıtı her zaman önceliklidir.

**Uzlaştırma metrikleri (özet).** 20 material Tur 2 claim'i uzlaştırıldı; 35 tarihsel OD sorusu eşlendi; 11 STF-ONT gözlemi eşlendi veya disposition aldı; 9 Phase 1 milestone'u supersession etkisi için değerlendirildi. Yapısal teslimat ile davranışsal enforcement AYRI nitelenmeye devam eder; ilgili bir dilim teslim edildi diye hiçbir Phase 1 finding'i KAPANMIŞ sayılmaz. *(Tam claim-by-claim teknik matris owner-local analiz kaydındadır; bu public belgeye kopyalanmaz.)*

**Target-model disposition'ı.** Tur 2 **Model B**, ratifiye OFFICE hedef sözlüğüyle (Person / UserAccount / OrganizationMembership / Employment-StaffProfile / LawyerCredential / OrganizationalTitle / SystemRole / PermissionGrant) maddi olarak TUTARLIDIR — Tur 2 yazıldığında (2026-07-11) bu bir alternatifti; iki gün sonra (2026-07-13) ratifiye Domain Law'da tam olarak bu hedef kanonlaştı. Tur 2 **Model A**'nın normatif otoritesi YOKTUR; yalnız bir sıralama/tempo tercihini betimleyebilir, Person'ı veya diğer ratifiye hedef kavramları hedef modelden ÇIKARAMAZ. Tur 2 **Model C**, mevcut kanonik hedefin ÖTESİNDE ratifiye-edilmemiş bir genişlemedir. **"Deferred implementation" ≠ "hedef modelden çıkarıldı"**: yukarıdaki 8 kavramın hiçbiri hedeften çıkarılmamıştır; hepsi bağlayıcı hedeftir, yalnız farklı olgunluk aşamalarındadır.

**Kapanmış owner-karar kümesi (bu uzlaştırmayla ilgili).** `OFF/OD-01, OFF/OD-05, OFF/OD-08, OFF/OD-09, OFF/OD-10, OFF/OD-11, OFF/OD-14, OFF/OD-15, OFF/OD-17, OFF/OD-18, OFF/OD-21` — CLOSED / CANONICAL (hepsi Option B). Bu kümedeki hiçbir karar yeniden açılmaz. Tarihsel `OD-01..35` kimlikleri kanonik değildir ve register'a alınmaz.

**Semantik-atama kanıtı.** `STF-ONT-ASN-001` (operasyon/hukuki/görev "sorumlu" çokluğu) şu nitelikte kaydedilir: **CURRENT / PARTIAL — REUSABLE SEMANTIC EVIDENCE / NO CURRENT CANONICAL MAPPING**. K1'in governance-precise ekip-üyeliği/sorumlu-bayrağı ayrımı bu semantik çokluğun HÂLÂ GÜNCEL olduğunu gösterir. Kanonik finding'e YÜKSELTİLMEZ; yeni ID/severity/verdict ALMAZ.

**Kanıt sınıflandırması (Phase 2 decomposition için).**

```text
REUSABLE EVIDENCE:
  - E1 PermissionGrant yapısal temeli (sıfır consumer)
  - I1 ReportingLine yapısal temeli (sıfır consumer)
  - J1/K1 ileriye-dönük (write-time) uygunluk-kapısı deseni
  - CANDIDATE-A transaction'lı offboarding-wiring deseni
  - 11 CLOSED/CANONICAL OFFICE kararı (yukarıdaki küme) — bağlayıcı tasarım kısıtları

SUPERSEDED EVIDENCE (Phase 1 tarafından; artık current-truth olarak kullanılamaz):
  - "PermissionGrant kalıcılık yapısı yok" (yapısal kısım — artık şema temeli var)
  - "task-assignee baseline uygunluk doğrulaması yok" (J1 gate'i var)
  - "case-ekip baseline aktif-üye doğrulaması yok" (K1 gate'i var)

PROHIBITED ASSUMPTIONS (decomposition'da varsayılamaz):
  - Tur 2 Model A kanonik hedeftir
  - tarihsel STF-ONT ID'leri kanonik finding'dir
  - tarihsel OD numaraları kanonik OFFICE kararıdır
  - yapısal temeller runtime enforcement ima eder
  - delivery closure finding closure ima eder

UNRESOLVED DEPENDENCIES (açık owner kapıları — bu görev hiçbirini çözmez/sıralamaz):
  - OFF/OD-02 · OFF/OD-03 · OFF/OD-04 · OFF/OD-07 · OFF/OD-13 · OFF/OD-16 · OFF/OD-19
  - ASSIGN-4d (ürün kararı) · credential-ilişkili owner triage
```

**Owner-triage adayları (yedi kalem — NON-CANONICAL / NO FINDING ID / NO SEVERITY / NO PRIORITY / NO IMPLEMENTATION AUTHORIZATION).** Kanonik korpusta doğrudan karşılığı olmayan, güncel repository gerçeğiyle uzlaştırılmış ince gözlemler. Hiçbiri kanonik finding olarak yazılmaz; hiçbir owner önceliği/implementasyon sırası atanmaz. Ayrıntılı teknik kanıt owner-local private evidence'ta kalır.

```text
A. LawyerCredential ownership sınırı (credential Person'a mı Employment'a mı bağlı)     — evidence-qualified
B. LawyerCredential uniqueness + intern (stajyer) çift-temsili                          — evidence-qualified
C. ApprovalAuthority modelleme sınırı (title-vs-role ötesi "ayrı entity" ekseni)        — evidence-qualified
D. Lifecycle / tarihsel-durum (history) modeli (mevcut alanlar için temporal iz yok)    — evidence-qualified
E. Audit actor atıf + effective-context kanıtı                                          — HISTORICAL CANDIDATE / REVALIDATION REQUIRED
F. Branch / Department / Team organizasyon-yapısı (birinci-sınıf entity yok)            — evidence-qualified
G. Service / non-human actor modeli                                                     — HISTORICAL CANDIDATE / REVALIDATION REQUIRED
```

**Register-tazelik takip pointer'ı.** STF-PRD-SES-001 kartı ile CANDIDATE-A teslimatı (OFF/OD-14 target control'ünü kısmen implemente eden offboarding-wiring) arasındaki izlenebilirlik gözlemi yalnız **REGISTER FRESHNESS FOLLOW-UP / NON-BLOCKING / SEPARATE OWNER-GATED TASK** olarak kabul edilir. Bu uzlaştırma `OFFICE-RISK-REGISTER.md`'yi DEĞİŞTİRMEZ ve SES-001'in kapandığını İDDİA ETMEZ.

## 6. Non-Normativity Statement

Bu belge norm üretmez; capability/dependency tanımları planlama-referansıdır. Bağlayıcı kurallar yalnız `SYSTEM-CONSTITUTION.md`, `OFFICE-GOVERNANCE.md` ve `OFFICE-PHASE2-CONSTITUTION.md`'dedir (ratifiye, 2026-07-17). Bu belge hiçbir capability'yi seçmez, sıralamaz, önceliklendirmez, iş birimine dönüştürmez; hiçbir açık owner kararına cevap vermez; hiçbir bulguyu kapatmaz. Çelişki halinde üst norm kazanır ve çelişki decision-log'a bulgu olarak taşınır.

## 7. Document Self-Check

```text
- Capability'ler yaşam-döngüsü statülü mü (SYS-SOT-001):        YES (her CAP satırında)
- TARGET, CURRENT gibi sunuldu mu:                              NO
- Wave/Candidate/Task/sıralama/öncelik üretildi mi:             NO (yalnız kapı/kenar tespiti)
- Açık OFF/OD kararlarına ön-karar verildi mi:                  NO (yalnız BLOCKED_BY kaydı)
- Bulgu kapatıldı/severity değiştirildi mi:                     NO
- Phase-1 MASTER-SYNTHESIS ile ad/rol ayrımı beyan edildi mi:   YES (belge başı AD AYRIMI)
- PUBLIC CONTENT RULE ihlali (somut mekanizma detayı):          NO (şema-temel adları + opak ID'ler;
                                                                 public-safe Phase 1 kayıtlarıyla sınırlı)
- Kimlik uzayı çakışması:                                       NO (yalnız OFF-P2-CAP/DEP-*)
- Mutable durum çoğaltıldı mı:                                  NO — yalnız 2026-07-17 tarihli AS-OF
                                                                 snapshot + otorite-belgesi pointer'ları
                                                                 (canlı statü otoritesi ilgili register'larda;
                                                                 §1 başındaki açık şerh)
- Tur 2 reconciliation kanonik finding/ID/severity üretti mi:   NO (§5a — yalnız evidence disposition;
                                                                 7 owner-triage adayı NON-CANONICAL, E+G
                                                                 HISTORICAL CANDIDATE/REVALIDATION REQUIRED)
- Tur 2 uzlaştırması CLOSED OFF/OD kararı yeniden açtı mı:       NO (11'li küme OFF/OD-01 dahil referans;
                                                                 tarihsel OD-01..35 register'a alınmadı)
```
