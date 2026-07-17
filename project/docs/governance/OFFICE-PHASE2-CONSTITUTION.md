# OFFICE Phase 2 Constitution — Program Constitutional Frame

```text
Belge yolu   : project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md
Durum        : FOUNDATION DRAFT v1.0 (OWNER GO-DOCS, 2026-07-17) — OWNER TEXT-RATIFICATION: PENDING;
               repository etkisi approved merge to main ile başlar (SYS-DEC-002: merge ≠ ratification)
Rol          : PROGRAM-LEVEL CONSTITUTIONAL FRAME — OFFICE Canonical Architecture Transformation
               Phase 2'nin vizyon, mimari kapsam, domain sınırı, non-goal, implementation principle
               ve governance rule çerçevesi. SYSTEM-CONSTITUTION DEĞİLDİR (SYS-CAN-002) ve
               OFFICE-GOVERNANCE.md Domain Law'ını DEĞİŞTİRMEZ/ZAYIFLATMAZ (SYS-AUTH-002).
Kimlik uzayı : OFF-P2-* (bu belge setinin kimlikleri) — SYS-* / OFF-INV-* / OFF/OD-* / STF-PRD-* /
               CANDIDATE-* ile çakıştırılamaz; SYS-GOV-011/012 gereği mevcut kimlikler yeniden
               kullanılmaz, yalnız referanslanır.
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir kod/schema/migration/runtime değişikliği,
               candidate seçimi veya GO-IMPLEMENT yetkisi ÜRETMEZ (SYS-GOV-003, SYS-DEC-003).
GOVERNANCE-INDEX kaydı: PENDING — ratifikasyon + Bölüm 2 belge haritası kaydı ayrı governance
               adımıdır; bu kayıt olmadan belge zorunlu discovery zincirine dahil DEĞİLDİR.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md` (SYS-CONST-001; bu belge ona TABİDİR)
- Domain Law: `project/docs/governance/OFFICE-GOVERNANCE.md` (RATIFIED v1.0; OFF-INV-01..10 — bu belge onu ayrıntılandırır, değiştiremez)
- Phase 2 kardeş belgeler: `project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md` · `project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md` · `project/docs/governance/OFFICE-PHASE2-ROADMAP.md`
- Phase 1 mirası: `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md` (Phase 1 delivery authority) · `project/docs/governance/OFFICE-RISK-REGISTER.md` (STF-PRD-*) · `project/docs/governance/OFFICE-OWNER-DECISIONS.md` (OFF/OD-*) · `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md` (Phase 1 non-normative evidence baseline)
- Karar otoritesi: `project/docs/governance/decision-log.md` (kapanmış karar) · Global triage otoritesi: `project/docs/governance/master-triage-register.md` · Yetkili iş sırası: `project/docs/governance/product-backlog.md`
- Dokunulmaz dış otoriteler: `project/docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md` (approval engine) · `project/docs/governance/dbind-financial-authority-decisions.md` (finansal self-approval)

## 1. Status and Authority

Bu belge, OFFICE Canonical Architecture Transformation programının Phase 2'sine ait **program-seviyesi anayasal çerçevedir**. Adındaki "Constitution" sözcüğü program-içi kurucu rolü ifade eder; bu belge **system Constitution değildir ve olamaz** (SYS-CAN-002 — tek system Constitution yolu sabittir). Konumu: `SYSTEM-CONSTITUTION.md` → `OFFICE-GOVERNANCE.md` (Domain Law) altında, Domain Law'ı ayrıntılandıran program çerçevesi → Phase 2 kardeş belgeler → gelecekteki delivery-katmanı kayıtları. **Ratifiye semantic authority zinciri (Constitution → Domain Law → ADR → Implementation) DEĞİŞMEZ**: bu çerçeve ADR katmanının ÜSTÜNDE DEĞİLDİR ve hiçbir ADR'yi override edemez; ADR'lerle çelişki halinde OFF-P2-GOV-07 çelişki protokolü uygulanır.

Bu belge setinin dört üyesi ve öğe sahipliği §11'de tanımlıdır. Bu belge ile üst norm arasında çelişki tespit edilirse üst norm kazanır, implementation durur ve yalnız Governance Reconciliation önerilir (GOVERNANCE-INDEX normatif çelişki protokolü); çelişki sessizce çözülmez.

## 2. Disambiguation — "OFFICE" Adı

Bu belge setindeki **OFFICE**, `SYS-GOV-013/014` anlamındaki primary legal-operation domain'idir (actor, user/staff role, authorization, organizational responsibility, office-level approval **policy** sahibi). Repository'de ayrıca **office-approval modülü / ADR-009 Universal Office Approval** bounded context'i vardır (ör. `UA-1`, `INTAKE-4.7d-2bc`, `ALC-P2-5` kayıtları): o context bu programın PARÇASI DEĞİLDİR. ADR-009 `OfficeApprovalRequest` engine/executor için tek otorite kalır; bu belge seti approval'ın yalnız **aktör tarafını** (kimlik, yetki kaynağı, ApprovalAuthority, Delegation) ele alır ve ikinci bir approval engine tanımlamaz (Domain Law §15, Forbidden Conflation #13).

## 3. Vision

### `OFF-P2-VIS-01 — Phase 2 Vizyonu`
Phase 1, hedef mimarinin **yapısal temellerini** döşedi (izin/rol şema temeli, hiyerarşi şema temeli, maskeleme baseline'ları, atama uygunluk baseline'ları, offboarding wiring) ve **hiçbir STF-PRD bulgusunu kapatmadı** — bu dürüst başlangıç noktasıdır. Phase 2'nin vizyonu: OFFICE domain'inde **ratifiye edilmiş hedef yetkilendirme ve kimlik mimarisinin davranışsal olarak yürürlüğe girmesi** — yani `OFF-INV-05` hedef zincirinin (Authentication → active-state → tenant resolution → permission evaluation → object-scope evaluation → business invariant → atomic mutation → audit) yalnız şemada değil, **enforcement'ta** var olması; Phase 1 şema temellerinin tüketicilerine bağlanması; ve kapanmış 11 owner kararının (tümü Option B; yetki-eksenindeki kararların — OFF/OD-05/08/09/10 çizgisinin — ortak karakteri: deny-by-default, explicit policy, otomatik yetki türetme yok) runtime davranışına dönüşmesi. Vizyon, TARGET durumları CURRENT gibi sunmaz (SYS-SOT-001): her yetenek, yaşam-döngüsü statüsüyle etiketlenir ve statü geçişi yalnız kanıtla olur.

### `OFF-P2-VIS-02 — Koruma Vizyonu`
Phase 2 yalnız boşluk kapatmaz; Phase 1 ve öncesinde kanıtlanmış **güçlü çekirdeği korur**: onay bütünlüğü çekirdeği (self-approval engeli, adım/sıra/eşzamanlılık koruması — evidence-baseline'da PREVENTED sınıfı), kalıcı silme yolunun bilinçli yokluğu (REJECTED RISK), davet/token yaşam-döngüsü kapıları (evidence-baseline'da LIKELY PREVENTED — REVALIDATION_REQUIRED mirası taşır; preserve yükümlülüğü revalidation'la birlikte geçerlidir), fail-closed + atomic offboarding wiring'i ve F1/H1 maskeleme kontratları. Bu davranışlar Phase 2'de "yeniden inşa hedefi" değil, **preserve yükümlülüğüdür**.

## 4. Architectural Scope

### `OFF-P2-SCOPE-01 — Kapsam Tanımı`
Phase 2'nin mimari kapsamı, `OFFICE-PHASE2-MASTER-SYNTHESIS.md`'deki Capability Map (OFF-P2-CAP-*) ile sınırlıdır ve şu eksenleri içerir: kimlik/aktör modeli ayrışması, yetkilendirme zinciri ve nesne-kapsam değerlendirmesi, izin modeli consumer-migration'ı, atama uygunluk zinciri, oturum/yetki tazeliği, yaşam döngüsü ve offboarding orkestrasyonu, hassas veri minimizasyonu, onay aktörü/delegasyon (aktör tarafı), denetim izi/atıf, read-model güvenilirliği, veri bütünlüğü kısıtları ve güçlü çekirdek koruması. Kapsamın ayrıntı düzeyi bu belgede değil sentez belgesindedir (tek canonical yerleşim, SYS-GOV-007).

### `OFF-P2-SCOPE-02 — Kapsam Statü Disiplini`
Kapsamdaki her yetenek `CURRENT / TARGET / NOT_IMPLEMENTED / SHADOW_ONLY / PRODUCTION_NO_GO / DEPRECATED / SUPERSEDED` yaşam-döngüsü ekseninde etiketlenir (SYSTEM-CONSTITUTION Bölüm 6). Kapsama alınmış olmak implementasyon yetkisi, sıra veya taahhüt üretmez; her yetenek ancak delivery katmanında, owner'ın ayrı seçim ve GO'suyla işe dönüşür.

## 5. Domain Boundaries

### `OFF-P2-BND-01 — Sahiplik Sınırı (değiştirilemez)`
OFFICE'in sahip olduğu ve olmadığı alanlar `SYS-GOV-014` ve Domain Law §3–§4'te sabittir. Phase 2 bu sınırı GENİŞLETEMEZ: task instance, legal truth, liability, receivable calculation ve creditor disposition OFFICE kapsamına alınamaz; alınması Constitutional Amendment (SYS-CAN-009) gerektirir ve bu belge seti öyle bir amendment DEĞİLDİR. Workflow/Task supporting context'tir, OFFICE'e ait değildir (SYS-GOV-019).

### `OFF-P2-BND-02 — Sibling Domain Sınırları`
CLIENT (client identity/mandate/instruction/visibility), DEBTOR (debtor identity/legal role/status), RECEIVABLE (claim/calculation), COLLECTION (receipt/provenance/allocation bağlantısı) sahiplikleri aynen korunur. OFFICE→RECEIVABLE ve OFFICE→DEBTOR cross-domain contract ilkeleri Domain Law §21'dedir; Phase 2 bu kontratları yalnız **tüketici ekseninde** ayrıntılandırabilir, karşı domain'in canonical semantiğini değiştiremez.

### `OFF-P2-BND-03 — Cross-Domain Tüketim Sınırı`
OFFICE yetkilendirme semantiğinin diğer domain'lerce tüketimi (emsal: RCV-P2-WS03-P03'ün ratifiye dar object-scope tüketimi) yeni role/permission/approval kapsamı veya global enforcement semantiği ÜRETMEZ; `OFF/OD-08`'in direct-report/team varsayılanı ve "global erişim ayrı explicit permission" sınırı her tüketimde korunur.

### `OFF-P2-BND-04 — CLIENT-SEC Hattı Ayrımı`
CLIENT-SEC-H2-STRUCT-01/02 kartları CLIENT domain provenance taşır; kök nedenleri OFFICE bulgularından ayrıdır ve OFFICE Phase 2 kapsamına ALINMAZ (yalnız sınır-referansı). H2A fail-closed davranışı PERMANENT PRODUCT POLICY'dir; ilgili kullanıcıya-dönük read yüzeyinin geri açılması ve production backfill bu programın konusu değildir ve ancak yeni owner ratifikasyonuyla mümkündür.

### `OFF-P2-BND-05 — Dokunulmaz Otoriteler`
ADR-009 (approval engine/executor) ve `dbind-financial-authority-decisions.md` (aksiyon-bazlı finansal self-approval istisnaları) tek otorite kalır; Phase 2 bunları yeniden üretmez, daraltmaz, genişletmez (OFF/OD-11 kaydındaki sınır aynen geçerli).

## 6. Non-Goals (Constitutional)

### `OFF-P2-NG-01` — İkinci bir system Constitution, ikinci bir approval engine veya ikinci bir finansal otorite üretmek (SYS-CAN-002, Domain Law §15).
### `OFF-P2-NG-02` — Açık OFF/OD kararlarına (OFF/OD-02, -03, -04, -06, -07, -12, -13, -16, -19) örtük veya açık ön-karar vermek; bu kararlar yalnız owner'ındır ve bu belge seti hiçbirini "verilmiş" sayamaz.
### `OFF-P2-NG-03` — Retroaktif enforcement'ı varsayılan yapmak: Phase 1'in ileriye-dönük (write-time) baseline deseni korunur; mevcut kayıtların retroaktif taranması/değiştirilmesi ancak ayrı owner kararıyla kapsamlaştırılabilir.
### `OFF-P2-NG-04` — İş/politika eşiklerini (rol/kapasite eşikleri, severity/kategori eşikleri, sonuç-sayısı limitleri) implementation katmanında icat etmek — eşikler owner POLICY kararıdır.
### `OFF-P2-NG-05` — Impersonation yeteneği inşa etmek: Phase 1 sentezi bu yönde hiçbir ihtiyaç kaydetmemiştir; bilinçli non-goal'dür, ancak owner talebiyle yeniden değerlendirilebilir.
### `OFF-P2-NG-06` — Kalıcı silme (hard-delete) yolu açmak: yolun yokluğu kayıtlı REJECTED RISK'tir ve korunur.
### `OFF-P2-NG-07` — Matrix/çoklu-amir organizasyon desteği ve "team"in hiyerarşiden bağımsız modellenmesi: I1'in kayıtlı tasarım tercihleri (tek-amirli, team hiyerarşiden türetilir) ancak ayrı owner kararıyla değişir.
### `OFF-P2-NG-08` — CLIENT-SEC kalıcı-emekli yüzeyinin restorasyonu, production backfill, NOT NULL/FK hardening: bu programda yetkilendirilmemiştir (OFF-P2-BND-04).
### `OFF-P2-NG-09` — Bu belge setinde Wave, Candidate, Task, Owner Decision, Contract veya implementation plan üretmek: bunlar delivery katmanına aittir (§8 `OFF-P2-GOV-03`).
### `OFF-P2-NG-10` — Phase 1'i "riskler kapandı" diye nitelemek: Phase 1 hiçbir STF-PRD bulgusunu kapatmadı; bulgu kapanışı yalnız TARGET CONTROL'ün davranışsal sağlanması + global triage otoritesi üzerinden olur.

## 7. Implementation Principles

*(Bu ilkeler, Phase 2 kapsamında GELECEKTE yetkilendirilecek her implementasyon için bağlayıcı çerçevedir; kendileri implementasyon başlatmaz.)*

### `OFF-P2-PRIN-01 — Deny-by-Default / Explicit Policy`
Kapanan 11 owner kararının ortak çizgisi programın genel ilkesidir: varsayılan ret; her yetki explicit, kapsamlı ve gerekiyorsa süreli grant ile; title/assignment/membership'ten otomatik yetki türetme yok (OFF/OD-05/08/09/10 çizgisi, OFF-INV-03/04).

### `OFF-P2-PRIN-02 — Fail-Closed`
Belirsizlik, eksik kanıt, provider hatası veya kısmi durumda davranış kapalıdır (SYS-GOV-004, SYS-AUTH-011, SYS-AI-010). "Boş sonuç" ile "yetkisiz" ayrımı gözetilir (Domain Law OFF-INV-09 deny≠empty).

### `OFF-P2-PRIN-03 — Additive-First, Enforcement-Second`
Kanıtlanmış Phase 1 deseni: önce sıfır-davranış additive şema/altyapı (E1/I1 emsali: yalnız CREATE, sıfır consumer, rollback provası), sonra ayrı yetkiyle enforcement/consumer bağlama. Şema temeli teslimi hiçbir bulguyu kapatmaz.

### `OFF-P2-PRIN-04 — Baseline → Policy Katmanlaması`
Davranışsal enforcement iki ayrı katmandır: mekanik baseline (tenant + aktiflik türü, ürün-kararsız) ve policy katmanı (rol/kapasite/amaç, owner kararı gerektirir). İki katman aynı işte birleştirilmez (J1/K1 + mechanical-vs-policy emsali).

### `OFF-P2-PRIN-05 — Tek Canonical Owner / Tek Write Path`
Her veri alanının tek canonical yazarı olur; canonical owner dışından direct write ARCHITECTURAL_DRIFT'tir; canlı legacy adapter'la yaşar; CUTOVER başlamış hatta legacy tarafına yeni business logic eklenmez (`canonicalization-policy.md` ilkeleri aynen).

### `OFF-P2-PRIN-06 — Kanıt Disiplini`
Her teslim: CI 4/4 PASS + squash SHA + mergeStateStatus CLEAN; şema işlerinde additive-only kanıt + zero-consumer grep + disposable ortamda rollback provası + differential tsc; enforcement işlerinde pozitif/negatif senaryo testleri + differential regression (pre-existing hatalar bağımsız kanıtlanır). Paylaşımlı/production veritabanına test koşulmaz.

### `OFF-P2-PRIN-07 — Append-Only Tarih ve Supersession`
Kayıt silinmez; düzeltme izli yapılır, supersession "SUPERSEDED BY" işaretiyle append-only kaydedilir (SYS-GOV-006, SYS-EVID-006, SYS-CAN-003).

### `OFF-P2-PRIN-08 — İzole Yürütme`
Her implementasyon `origin/main` tabanlı izole worktree'de yapılır; canonical root'ta edit yasaktır; tek register maddesi = tek patch; migration'lar docs-only işlere karıştırılmaz; base SHA kaydı zorunludur.

### `OFF-P2-PRIN-09 — Geriye-Uyumluluk ve Tersinirlik Varsayılanı`
Adımlar additive/reversible/backward-compatible varsayılandır (SYS-MIG-010); davranış değiştiren kesimler characterization/regression testi ister; kapanan kararların ilan ettiği davranış değişiklikleri (ör. OD-08/14/18 kısıtlamaları) operasyonel geçiş planıyla ele alınır.

### `OFF-P2-PRIN-10 — AI/Otomasyon Sınırı`
Phase 2'de tanımlanacak her otomasyon advisory kalır; yetkili yazma ancak explicit policy + canonical input + deterministic guard + required human approval + domain command zinciriyle olur (SYS-AI-001..004, SYS-AI-010).

## 8. Governance Rules

### `OFF-P2-GOV-01 — İki-Eksen Otorite`
Semantic authority (Constitution → Domain Law → ADR → implementation standard; bu çerçeve Domain Law'ı ayrıntılandıran, ADR katmanının üstünde OLMAYAN program belgesidir) ile execution/safety authority (`AGENTS.md` + repository policies + task authorization) ayrı eksenlerdir; biri diğerini üretmez (SYS-AUTH-006). Bu belge seti execution izni üreten hiçbir hüküm içermez.

### `OFF-P2-GOV-02 — Statü Progresyonu ve İki-Adımlı Bağlayıcılık`
Belgeler DRAFT → (owner text-ratification, decision-log kaydıyla) RATIFIED → (approved merge to main ile) repository-CANONICAL progresyonunu izler; merge ratifikasyon değildir (SYS-DEC-002), ratifikasyon implementasyon yetkisi değildir (SYS-DEC-003). Bu setin 4 belgesi ratifiye edilip GOVERNANCE-INDEX Bölüm 2 haritasına ve README dosya listesine kaydedilmeden zorunlu discovery zincirine girmez ve binding sayılmaz.

### `OFF-P2-GOV-03 — Katman Ayrımı (Anayasal ↔ Delivery)`
Bu belge seti anayasal katmandır ve Wave/Candidate/Task/Owner-Decision/Contract/implementation-plan İÇERMEZ. Bu mekanizmalar delivery katmanında yaşar (Phase 1 emsali: `OFFICE-DELIVERY-MANIFEST.md`). Phase 2 decomposition kayıtlarının hangi delivery yüzeyinde yaşayacağının belirlenmesi, ratifikasyon sonrası ayrı bir owner tasarrufudur; bu set o tasarrufu yapmaz ve seçenek önermez.

### `OFF-P2-GOV-04 — Yetki Semantiği Sabitleri`
readiness ≠ authorization; NEXT ELIGIBLE ≠ AUTHORIZED; ratification ≠ GO-IMPLEMENT; merge ≠ ratification; decision closure ≠ finding closure; wave/phase closure ≠ finding closure; IMPLEMENTED ≠ VERIFIED ≠ MERGED ≠ CANONICAL ≠ CLOSED. Görev yetkileri `AGENTS.md`'nin üç modunu (GO-ANALYZE / GO-IMPLEMENT / GO-COMPLETE) esas alır; GO-DOCS / GO-CANONICALIZE gibi yerleşik owner talimat biçimleri bu çerçevenin içinde kalır; bu set YENİ yetki modu tanımlamaz.

### `OFF-P2-GOV-05 — Otorite Haritası Sabitleri`
Kapanmış karar otoritesi `decision-log.md`; açık karar dossier'i `OFFICE-OWNER-DECISIONS.md`; global yürütme/triage statüsü `master-triage-register.md`; yetkili iş sırası `product-backlog.md`; Phase 1 teslimat/slice durumu `OFFICE-DELIVERY-MANIFEST.md`. Bu set bu otoriteleri absorbe etmez, mutable durumu çoğaltmaz (yalnız pointer) ve her belge kendi negatif-yetki beyanını taşır.

### `OFF-P2-GOV-06 — PUBLIC CONTENT RULE (yazılı hüküm)`
Repository PUBLIC'tir ve bazı bulgular UNPATCHED'tır. Unremediated bulgular için mekanizma-seviyesi bilgi (somut route/endpoint, dosya:satır, metot/alan imzası, payload/reproduction, bypass ön-koşulları) HİÇBİR public governance belgesine yazılmaz; yalnız opak risk ID + severity + soyut hedef kontrol + statü + PR/SHA/CI kanıt üçlüsü taşınır. Ayrıntılı teknik kanıt owner-local private evidence'ta kalır. Redaksiyon kararı yazma anında verilir; sanitizasyon severity düşürmez, riski çözülmüş göstermez. Bu kural bu setin tüm belgeleri ve Phase 2'nin gelecekteki tüm public kayıtları için bağlayıcıdır. **Kapsam: ileriye-dönüktür** — mevcut kanonik belgelerdeki tarihsel içeriğin geriye-dönük sanitizasyonu bu hükümle emredilmez; o ayrı bir owner kararı/reconciliation kalemidir (sessiz çelişki değil, açık kapsam sınırı).

### `OFF-P2-GOV-07 — Çelişki Protokolü`
Bu set ile üst norm veya kardeş canonical belgeler arasında çelişki tespit edilirse: üst norm esas alınır, implementation durur, çelişki decision-log'a bulgu olarak taşınır ve yalnız Governance Reconciliation önerilir. Daha yeni tarihli bir kayıt, açık amendment/supersession olmadan ratifiye normu override edemez.

### `OFF-P2-GOV-08 — Lane Ownership ve Kayıt Disiplini`
Her Phase 2 workstream kaydında Analysis/Review Owner ile Implementation Owner ayrı satırlarda yazılır (COL/OD-18A emsali); lane devri ayrı owner kararıyla ve SUPERSEDED BY işaretiyle kaydedilir. Stop-condition listesi (`process-rules.md`) aynen geçerlidir.

### `OFF-P2-GOV-09 — Kimlik Uzayı Hijyeni`
Bu setin kimlikleri OFF-P2-* uzayındadır. SYS-*, OFF-INV-*, OFF/OD-*, STF-PRD-*, CANDIDATE-*, LF/OP/PR-RT-* kimlikleri yalnız referanslanır; anlamları değiştirilmez; emekli numaralar (ör. OFF/OD-20) yeniden kullanılmaz.

### `OFF-P2-GOV-10 — İzlenebilirlik Zinciri`
Bu setteki her normatif hüküm için hedef iz: hüküm → dayanak (Domain Law maddesi / kapanmış OFF-OD kararı / STF-PRD hedef kontrolü / Phase 1 kanıtı) → decision-log ratifikasyon kaydı. Ratifikasyonla birlikte GOVERNANCE-INDEX Bölüm 4'e ("Neden bu kural var?" zinciri) OFFICE zinciri + Phase-2 girdisinin eklenmesi beklenir (ayrı adım; OFFICE zinciri o bölümde henüz hiç yoktur — ratifikasyon adımı bunu da kapsamalıdır).

## 9. Capability Lifecycle ve Kanıt Standardı

Capability Map'teki her yeteneğin statü geçişi yalnız şu kanıt merdiveniyle olur: davranışsal kanıt (test + CI + squash SHA) → repository merge → governance kaydı → (bulgu ilişkiliyse) global triage otoritesinde statü değişimi. Sentez-kaynaklı iddialar SYS-COMP-002 gereği REVALIDATION_REQUIRED mirasını taşır; Phase 2'de bir iddiaya dayanmadan önce canonical HEAD'e karşı yeniden doğrulanması esastır. Compliance/gap kaydı implementation emri değildir (SYS-COMP-008).

## 10. Ratification and Amendment

Bu belge setinin bağlayıcı hale gelme yolu: (1) owner text-ratification + decision-log kaydı; (2) approved merge (repository-canonical etki); (3) GOVERNANCE-INDEX Bölüm 2 kaydı + README mutabakatı. Bu üç adım bu GO-DOCS görevinin diff kapsamında DEĞİLDİR (yalnız 4 belge üretilir); her biri ayrı owner adımıdır. Set ratifiye edildikten sonra değişiklik yalnız governance PR + decision-log kaydıyla yapılır (SYS-CAN-004); supersession append-only'dir.

## 11. Document Set and Element Ownership

| Öğe (owner brief) | Sahip belge |
|---|---|
| Vision | Bu belge (§3) |
| Architectural Scope | Bu belge (§4, özet) + PHASE2-MASTER-SYNTHESIS (ayrıntı) |
| Domain Boundaries | Bu belge (§5) |
| Non-Goals | Bu belge (§6, anayasal) + PROGRAM-CHARTER (program-seviyesi) |
| Implementation Principles | Bu belge (§7) |
| Governance Rules | Bu belge (§8) |
| Capability Map | PHASE2-MASTER-SYNTHESIS |
| Dependency Map | PHASE2-MASTER-SYNTHESIS |
| Objectives | PROGRAM-CHARTER |
| Success Criteria | PROGRAM-CHARTER |
| Phase Deliverables | PROGRAM-CHARTER |
| Phase Exit Criteria | PROGRAM-CHARTER |
| Sequencing/Decomposition çerçevesi *(owner brief dışı, set-içi ek çerçeve)* | PHASE2-ROADMAP (authority üretmez) |

## 12. Son Hüküm

Bu belge Phase 2'nin ne olduğunu tanımlar; neyi KAPATMADIĞI da açıktır: hiçbir STF-PRD bulgusunu kapatmaz, hiçbir açık OFF/OD kararını vermez, hiçbir candidate seçmez/sıralamaz/başlatmaz, hiçbir kod/schema/migration değişikliği yapmaz, ADR-009/DBIND/CLIENT-SEC otoritelerine dokunmaz ve kendi kendini ratifiye edemez. Phase 2'nin işe dönüşmesi, bu setin ratifikasyonu SONRASINDA owner'ın ayrı decomposition ve seçim kararlarıyla olur.

## 13. Document Self-Check

```text
- SYSTEM-CONSTITUTION ile rekabet eden üst-norm iddiası:        NO (SYS-CAN-002 uyumu, §1)
- Domain Law değiştirildi/zayıflatıldı mı:                      NO (yalnız ayrıntılandırma, SYS-AUTH-002)
- Wave/Candidate/Task/Owner-Decision/Contract/impl-plan var mı: NO (OFF-P2-NG-09, OFF-P2-GOV-03)
- Açık OFF/OD kararlarına ön-karar verildi mi:                  NO (OFF-P2-NG-02; yalnız referans)
- TARGET, CURRENT gibi sunuldu mu:                              NO (SYS-SOT-001; §4/§9 statü disiplini)
- Kendi kendine RATIFIED/CANONICAL ilan var mı:                 NO (Durum: DRAFT / RATIFICATION PENDING)
- Implementation authority üretildi mi:                         NO (IMPLEMENTATION AUTHORITY: NONE)
- PUBLIC CONTENT RULE ihlali (somut mekanizma detayı):          NO (OFF-P2-GOV-06 uygulanır)
- Kimlik uzayı çakışması:                                       NO (yalnız OFF-P2-*; mevcut ID'ler referans)
- 12 zorunlu öğenin sahiplik haritası tanımlı mı:               YES (§11 — 12 öğe + 1 brief-dışı
                                                                 ek çerçeve satırı, açıkça işaretli)
```
