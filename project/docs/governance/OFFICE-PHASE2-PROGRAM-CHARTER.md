# OFFICE Phase 2 Program Charter

```text
Belge yolu   : project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md
Durum        : RATIFIED / CANONICAL PHASE PROGRAM AUTHORITY — v1.0 (owner text-ratification:
               2026-07-17, `decision-log.md` § "OFFICE Phase 2 Constitutional Foundation Owner
               Text-Ratification"; kuruluş: OWNER GO-DOCS, PR #1359 squash `20423d4a`)
Rol          : PHASE 2 PROGRAM CHARTER — hedefler, faz teslimatları (outcome-sınıfı), başarı ve
               çıkış kriterleri, program-seviyesi non-goal'ler. AUTHORIZATION BELGESİ DEĞİLDİR:
               hiçbir iş birimini yetkilendirmez/başlatmaz (emsal: faz-kapanış/authorization
               kayıtlarının 'NOT AUTHORIZED / NOT STARTED' açık-kapı disiplini).
Kimlik uzayı : OFF-P2-OBJ-* / OFF-P2-DLV-* / OFF-P2-SC-* / OFF-P2-EXIT-* / OFF-P2-PNG-*
IMPLEMENTATION AUTHORITY: NONE (SYS-GOV-003, SYS-DEC-003) — ratifikasyon da yetki üretmez.
GOVERNANCE-INDEX kaydı: COMPLETED — ratifikasyon PR'ıyla yapıldı (OFF-P2-ENTRY-02).
```

## RELATED DOCUMENTS

- Normatif çerçeve: `project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md` (vizyon/sınır/ilke/kural) · `project/docs/governance/OFFICE-GOVERNANCE.md` · `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Mimari zemin: `project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md` (OFF-P2-CAP-*/DEP-*)
- Sıralama çerçevesi: `project/docs/governance/OFFICE-PHASE2-ROADMAP.md`
- Phase 1 delivery otoritesi: `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md` · kapanmış karar otoritesi: `project/docs/governance/decision-log.md`

## 1. Program Context

OFFICE Canonical Architecture Transformation programının Phase 1'i, owner ratifikasyonuyla **CLOSED / COMPLETE WITH RECORDED RESIDUALS** olarak kapanmıştır (2026-07-17, `decision-log.md` § "OFFICE Phase 1 Closure with Recorded Residuals"; milestone dizisi PHASE 1 MILESTONE 01–09 teyitli, son milestone main `423d72ea`; delivery register'ında NEXT ELIGIBLE UNIT = NONE). Bu kapanış hiçbir OPEN/PARTIALLY MITIGATED bulguyu kapatmaz, hiçbir PARTIAL invariant'ı tamamlamaz; deferred/blocked/dormant/owner-gated tüm residual'ları ileriye taşır ve hiçbir candidate seçimi/implementation yetkisi üretmez. Register taraması sonucu (2026-07-17): `product-backlog.md` ve `decision-log.md`'de OFFICE Phase 2'ye dair önceden var olan hiçbir kayıt, yetki, rezervasyon veya HOLD yoktu; OFFICE'e ait tek MPB kaydı MPB-031 (Phase 1 delivery tracking) Closed Register bölümündedir ve kapanış-kanıtı hücresi bayat metin taşır — o hücrenin reconciliation'ı bu setin kapsamı dışında ayrı bir register-hijyen adımıdır. Bu Charter, OWNER GO-DOCS (2026-07-17, PR #1359) ile üretilmiş ve owner text-ratification + INDEX/README kaydıyla **Phase 2 hattının kurucu kaydı olmuştur** — kendisi hiçbir işi başlatmaz.

## 2. Objectives

### `OFF-P2-OBJ-01 — Enforcement Boşluğunun Kapanması`
Phase 1'in şema temelleri ve baseline'ları üzerine, ratifiye hedef modellerin davranışsal enforcement'ının inşası: nesne-kapsam değerlendirmesi (CAP-02), izin modeli consumer-migration'ı (CAP-03), atama uygunluk zincirinin tamamlanması (CAP-04), oturum tazeliği (CAP-05).

### `OFF-P2-OBJ-02 — Yaşam Döngüsü Bütünlüğü`
Offboarding orkestrasyonunun (CAP-06) ve denetim atfının (CAP-09) OFF-INV-07/08 ile uyumlu inşası; reactivation ≠ rehire semantiğinin davranışsal güvencesi.

### `OFF-P2-OBJ-03 — Veri Minimizasyonunun Tamamlanması`
OFF-INV-10'un kalan projeksiyon yüzeylerine (detail/export; unmask-governance kararına bağlı) genişletilmesi (CAP-07).

### `OFF-P2-OBJ-04 — Karar-Kapısı Hijyeni`
9 açık OFF/OD kararının ve program-kapılarının (toplu-atama ürün kararı, unmask governance, workload amacı) **karar-hazır paketlerle** owner önüne gelmesi; hiçbirinin implementasyon katmanında fiilen "verilmiş" hale gelmemesi. (Kararların kapanması owner'a aittir; Objective yalnız karar-hazırlığıdır.)

### `OFF-P2-OBJ-05 — Kanıt ve Statü Dürüstlüğü`
Her yetenek statü geçişinin kanıt merdiveniyle (test + CI + SHA + governance kaydı + triage otoritesi) yapılması; sentez-mirası iddiaların kullanılmadan önce canonical HEAD'e karşı yeniden doğrulanması (SYS-COMP-002); güçlü çekirdeğin (CAP-12) regresyonsuz korunması.

## 3. Phase Deliverables (outcome-sınıfı — iş birimi DEĞİL)

*(Her teslimat, Capability Map'e bağlı bir SONUÇ durumudur. Somut iş birimleri — candidate/contract — bu Charter'da tanımlanmaz; decomposition ayrı owner adımıdır. "Teslim edilmiş" sayılma ölçütü §4-§5'tedir.)*

### `OFF-P2-DLV-01` — Nesne-kapsam değerlendirmesinin hedef yüzeylerde ENFORCED olması **veya** kalan kısmının açık owner-disposition'la (deferred/blocked gerekçeli) kayıt altına alınması (CAP-02).
### `OFF-P2-DLV-02` — İzin modelinin canonical taşıyıcıya migration'ının başlamış ve tanımlı bir cutover disiplinine bağlanmış olması; eski/yeni çifte-otorite durumunun SHADOW etiketiyle açık yönetimi (CAP-03; SYS-SOT-003).
### `OFF-P2-DLV-03` — Atama uygunluk zincirinin ürün-kararsız kısımlarının tamamlanması; ürün-kararlı kısımların (toplu atama, rol/kapasite policy) karar-paketli owner-disposition alması (CAP-04).
### `OFF-P2-DLV-04` — Ratifiye oturum mekanizmasının (OD-14/15'in seçtiği model) davranışsal varlığı veya açık owner-erteleme kaydı (CAP-05).
### `OFF-P2-DLV-05` — Offboarding orkestrasyon zincirinin OFF-INV-07 adımlarıyla tanımlı, gözlemlenebilir ve idempotent hale gelmesi (CAP-06) + yaşam-döngüsü/denetim hattındaki register-intake bekleyen yeni bulgunun resmi register'a alınıp disposition alması (CAP-09).
### `OFF-P2-DLV-06` — CAP-07'nin kalan hatlarının (detail yüzeyi genişlemesi dahil) unmask-governance/mekanizma kararına bağlı olarak ya kanıtlı teslim ya açık owner-disposition alması; detail'in kapı kapsamında olup olmadığı owner'ın açık sorusudur — bu belge onu çözmez.
### `OFF-P2-DLV-07` — Açık owner kararlarının hiçbirinin paketlenmemiş kalmaması: her açık karar için karar-hazır paket sınıfı çıktı (owner kapatmak zorunda değildir; kalem sayımı otorite dossier'ine pointer'dır) (OBJ-04).
### `OFF-P2-DLV-08` — UNMAPPED bulgu sınıfının ve register-dışı yeni bulgu sınıfının global triage otoritesine taşınmış olması (kalem listesi otorite belgelerinde; bu belge sayım kopyalamaz).

## 4. Success Criteria

### `OFF-P2-SC-01` — Davranışsal kanıt: Enforcement-sınıfı her teslimde pozitif/negatif senaryo testleri + differential regression + CI 4/4 PASS + squash SHA kaydı; şema-sınıfı her teslimde additive-only + zero-consumer + rollback provası kanıtı. Test-skip yeşili başarı sayılmaz (SYS-COMP-003).
### `OFF-P2-SC-02` — Bulgu-kapanışı otoritesi: Bir STF-PRD bulgusunun kapanmış sayılması yalnız TARGET CONTROL'ün davranışsal sağlanması + `master-triage-register.md` üzerinden statü değişimiyle olur; "slice teslim edildi" tek başına başarı değildir.
### `OFF-P2-SC-03` — Karar hijyeni: Hiçbir açık owner kararı implementasyonda fiilen verilmemiş olur; eşik/policy icadı sıfırdır; her karar-kapısı ya owner kararıyla kapanmış ya karar-hazır pakette bekliyor olur.
### `OFF-P2-SC-04` — Koruma: CAP-12 güçlü çekirdeğinde sıfır regresyon; F1/H1/A/K1 binding kontratları ihlalsiz.
### `OFF-P2-SC-05` — Governance dürüstlüğü: Statü alanları otorite belgelerinde tekil güncellenir; TARGET hiçbir kayıtta CURRENT gibi sunulmaz; PUBLIC CONTENT RULE ihlali sıfırdır; tüm kapanışlar append-only kayıtlıdır.
### `OFF-P2-SC-06` — Geçiş yönetimi: Kapanmış kararların ilan ettiği davranış kısıtlamaları (erişim daralması, oturum kapanışı, maskeleme) operasyonel geçiş/iletişim planıyla devreye alınır; sessiz davranış değişikliği yoktur.

## 5. Phase Exit Criteria

Phase 2, aşağıdakilerin TÜMÜ sağlandığında ve owner kapanış kararı verdiğinde kapanabilir (kapanış ilanı tek başına yeterli değildir — SYS-CAN-005/006 kanıt kümesi + Master Register kontrolü):

### `OFF-P2-EXIT-01` — Her OFF-P2-DLV teslimatı ya kanıtlı teslim ya açık owner-disposition (deferred/blocked/retired, gerekçeli) durumundadır; sessiz/etiketsiz kalan teslimat yoktur.
### `OFF-P2-EXIT-02` — Kapsamdaki her capability'nin yaşam-döngüsü statüsü günceldir ve kanıt-izlidir; SHADOW/çifte-otorite durumları ya kapanmış ya açık etiketlidir.
### `OFF-P2-EXIT-03` — Phase 2'de üretilen tüm bulgular register'lıdır; hiçbir bulgu "kapandı" iddiasını triage otoritesi olmadan taşımaz.
### `OFF-P2-EXIT-04` — Kapanış paketi: kapanış kaydı + kalan-iş envanteri (owner-gated kalemler açık listeyle) + sonraki faz için giriş koşulları — WAVE 3 kapanış deseninin (CLOSED / COMPLETE WITH RECORDED RESIDUALS emsali; kalan kapsamların "owner-gated future scope" olarak açık devri) devamı.
### `OFF-P2-EXIT-05` — Governance mutabakatı: Phase 2 belgelerinin statüleri, GOVERNANCE-INDEX/README kayıtları ve decision-log zinciri tutarlıdır; çözülmemiş Governance Reconciliation yoktur.

## 6. Program Governance (referansla)

Yetki modları (GO-ANALYZE/GO-IMPLEMENT/GO-COMPLETE), onay semantiği, stop-condition listesi, lane ownership, izole-worktree zorunluluğu ve PUBLIC CONTENT RULE `OFFICE-PHASE2-CONSTITUTION.md §7–§8` ile `AGENTS.md`/`process-rules.md`'den aynen devralınır; bu Charter alternatif süreç tanımlamaz. Program-izolasyon ilkesi geçerlidir: bu Charter hiçbir açık kalemi sıralamaz/seçmez; her ilerleme owner'ın ayrı, açık kararıyla olur.

## 7. Program Non-Goals

*(Anayasal non-goal'ler `OFF-P2-NG-01..10`'da; aşağıdakiler program-seviyesi netleştirmelerdir.)*

### `OFF-P2-PNG-01` — Phase 2, Phase 1'in owner-gated bıraktığı kalemleri (ertelenen oturum-altyapısı işi, ürün-kararı bekleyen hatlar, dormant/blocked hatlar) OTOMATİK devralmaz; her biri decomposition'da owner önüne ayrı gelir.
### `OFF-P2-PNG-02` — Phase 2, diğer domain'lerin programlarına (DEBTOR/CLIENT/RECEIVABLE/COLLECTION hatları, ADR-009 approval-engine backlog'u, ADR-014 runtime cutover) iş tanımlamaz; cross-domain temaslar yalnız OFF-P2-BND-03 sınırıyla tüketim ilişkisidir.
### `OFF-P2-PNG-03` — Phase 2, production ortam/deploy/retention/tenant-enforcement-teknolojisi kararlarını (SYSTEM-CONSTITUTION Bölüm 18 açık kararları) vermez.
### `OFF-P2-PNG-04` — Phase 2, performans-iyileştirme hattını (PERF sınıfı) güvenlik-kritik hatlarla aynı zorunluluk sınıfına koymaz; PERF işleri değer-bazlı ayrı owner tercihidir.

## 8. Entry into Force

Bu Charter'ın bağlayıcılık yolu tamamlanmıştır: owner text-ratification (2026-07-17, decision-log kaydı) → approved merge → GOVERNANCE-INDEX/README kaydı (ratifikasyon PR'ıyla). Ratifikasyon hiçbir işi başlatmaz; herhangi bir Phase 2 iş biriminin varlık ön-koşulu, ayrı owner GO'lu decomposition sürecidir (`OFFICE-PHASE2-ROADMAP.md §4-§5`).

**FOUNDATION STATUS: READY FOR PHASE 2 DECOMPOSITION** — giriş kapıları: OFF-P2-ENTRY-01 **PASS** (owner text-ratification verildi) · OFF-P2-ENTRY-02 **PASS** (INDEX/README authority kaydı tamamlandı) · OFF-P2-ENTRY-03 **OPEN** (ayrı decomposition GO-ANALYZE brief'i gerekli). Decomposition'ın kendisi bu belgeyle NE başlatılmış NE yetkilendirilmiştir; PHASE 2 DECOMPOSITION: NOT STARTED.

## 9. Document Self-Check

```text
- Wave/Candidate/Task/Contract/impl-plan üretildi mi:           NO (teslimatlar outcome-sınıfı)
- Deliverable'lar iş birimine dönüştürüldü mü:                  NO (CAP-bağlı sonuç durumları)
- Açık OFF/OD kararlarına ön-karar verildi mi:                  NO (OBJ-04/DLV-07 yalnız paketleme)
- Authorization üretildi mi:                                    NO (IMPLEMENTATION AUTHORITY: NONE;
                                                                 §8 açık-kapı beyanı)
- Success/Exit kriterleri ölçülebilir kanıta bağlı mı:          YES (CI/SHA/triage/register zinciri)
- Bulgu-kapanışı otoritesi doğru mu:                            YES (SC-02: master-triage-register)
- PUBLIC CONTENT RULE ihlali:                                   NO
- Kimlik uzayı çakışması:                                       NO (yalnız OFF-P2-OBJ/DLV/SC/EXIT/PNG-*)
```
