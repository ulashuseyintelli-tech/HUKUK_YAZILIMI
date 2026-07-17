# OFFICE Phase 2 Roadmap — Sequencing and Decomposition Frame

```text
Belge yolu   : project/docs/governance/OFFICE-PHASE2-ROADMAP.md
Durum        : FOUNDATION DRAFT v1.0 (OWNER GO-DOCS, 2026-07-17) — OWNER TEXT-RATIFICATION: PENDING;
               repository etkisi approved merge to main ile başlar (SYS-DEC-002: merge ≠ ratification)
Rol          : SEQUENCING/DECOMPOSITION FRAME — work-sequencing bilgisi taşır; AUTHORITY ÜRETMEZ
               (SYS-GOV-008; Hard Stop #13: roadmap authority gibi kullanılamaz). Bu belge hiçbir
               iş birimi TANIMLAMAZ: Wave yok, Candidate yok, Task yok, Contract yok, takvim yok.
               Yalnız bağımlılık-türevi sıralama KISITLARI ve decomposition PROSEDÜRÜ içerir.
Kimlik uzayı : OFF-P2-SEQ-* (sıralama kısıtları) / OFF-P2-ENTRY-* (decomposition giriş koşulları)
IMPLEMENTATION AUTHORITY: NONE.
GOVERNANCE-INDEX kaydı: PENDING (ratifikasyon sonrası ayrı adım).
```

## RELATED DOCUMENTS

- Normatif çerçeve: `project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md` · `project/docs/governance/OFFICE-GOVERNANCE.md` · `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Girdi: `project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md` (OFF-P2-CAP-*/DEP-* — bu belgenin tek mimari girdisi) · `project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md` (teslimat/çıkış kriterleri)
- Delivery-katmanı emsali: `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md` (Phase 1)

## 1. Bu Belgenin Ne OLMADIĞI

Bu roadmap bir iş planı değildir. İçinde sıralanmış iş listesi, dalga/dilim tanımı, tahmin, tarih, atama veya öncelik YOKTUR. Phase 1 emsalinde bu mekanizmalar delivery katmanında (manifest) yaşadı ve Phase 2'de de anayasal katmanın DIŞINDA kalacaktır (`OFF-P2-GOV-03`). Bu belgenin tek işlevi: decomposition yapılırken ihlal edilemeyecek **sıralama kısıtlarını** ve decomposition'ın **prosedürünü** sabitlemek.

## 2. Sequencing Principles

### `OFF-P2-SEQ-01 — Bağımlılık-Türevi Sıra`
Sıralama takvimden değil bağımlılıktan türer: `OFF-P2-DEP-*` haritasındaki REQUIRES/BLOCKED_BY kenarları decomposition'da bağlayıcıdır. Kapısı (BLOCKED_BY) açık olan hiçbir hat, kapı kapanmadan iş birimine dönüştürülemez; kapı-kapatma işi (karar-paketi) ile enforcement işi ayrı sınıflardır.

### `OFF-P2-SEQ-02 — Additive-First, Enforcement-Second`
Yeni yapısal taşıyıcı gerektiren her hatta önce sıfır-davranış additive adım, sonra ayrı yetkiyle enforcement/consumer bağlama (OFF-P2-PRIN-03). Mevcut şema temelleri (E1/I1) için additive adım teslim edilmiş olduğundan bu hatlarda additive-first kısıtı artık bağlayıcı değildir; enforcement/consumer sınıfı işler decomposition'da değerlendirilebilir durumdadır — bu bir kısıt-durumu tespitidir, seçim/sıralama/başlatma değildir.

### `OFF-P2-SEQ-03 — Baseline-Önce, Policy-Sonra`
Mekanik baseline (ürün-kararsız) katmanı, policy katmanından (owner kararı gerektirir) önce gelir ve policy katmanı baseline'ın üstüne kurulur (OFF-P2-PRIN-04). Bir hatta baseline zaten teslimse (CAP-04'ün J1/K1 kısmı), kalan policy kısmı ancak ilgili owner/ürün kararıyla açılır.

### `OFF-P2-SEQ-04 — Karar-Hazırlık Bağımsızlığı`
Açık owner kararları (OFF/OD-02/03/04/06/07/12/13/16/19 + program kapıları) için karar-paketi üretimi her an yapılabilir ve hiçbir enforcement hattını beklemez; ama paket üretimi kararı KAPATMAZ ve hiçbir hat "karar nasılsa kapanır" varsayımıyla decompose edilemez.

### `OFF-P2-SEQ-05 — Cross-Domain Tüketim Sırası`
OFFICE enforcement semantiğinin cross-domain tüketicileri (emsal: RCV hattı), ilgili OFFICE yeteneğinin kendi kanıtlı teslimini İZLER; tüketici tarafında OFFICE semantiği genişletilemez (OFF-P2-BND-03). OFFICE Phase 2 diğer domain'lere sıra dayatmaz.

### `OFF-P2-SEQ-06 — Koruma Kısıtı Her Sıradan Önce Gelir`
Hangi hat decompose edilirse edilsin, CAP-12 preserve-class davranışlarına regresyon riski taşıyan her adım characterization-test-first disiplinine tabidir; koruma, hiçbir sıralama tercihine feda edilemez.

### `OFF-P2-SEQ-07 — Tek-Yönlü Statü Akışı`
Bir hattın yaşam-döngüsü statüsü yalnız kanıtla ilerler (TARGET → SHADOW_ONLY → CURRENT vb.; gerektiğinde SYS-MIG-002 migration fazlarıyla); decomposition, statü ilerletmenin aracı değildir ve hiçbir decomposition kaydı statü değiştirmez.

## 3. Bağımlılık-Türevi Sıralama Kısıtları (bilgi, sıra önerisi değil)

`OFF-P2-DEP-01..04`'ten decomposition'a devreden bağlayıcı kısıtlar:

```text
- Nesne-kapsam enforcement hattı, hiyerarşi-şema temelinin (teslim) üzerine kurulur;
  döngü-önleme kısıtı ihtiyacı I1'de bilinçli dışarıda bırakılmış AÇIK konudur — hangi iş
  biriminde ele alınacağı decomposition'da belirlenir.
- Consumer-migration hattı, izin-şema temelinin (teslim) üzerine kurulur; çifte-otorite dönemi
  SHADOW etiketiyle yönetilir; cutover SYS-MIG-002/007 fazlarına tabidir.
- Oturum-tazeliği hattı ratifiye mekanizma seçimine sahiptir (OD-14/15) ama auth-çekirdeği
  blast-radius'u nedeniyle kendi ayrı owner GO'suna tabidir (Phase 1'de bilinçli ertelendi).
- Offboarding orkestrasyonu, oturum-revocation yeteneğine dayanır (revoke adımı) —
  bu kenar ters çevrilemez.
- DB-kısıt hattı OFF/OD-03 kapanmadan iş birimine dönüştürülemez (kayıtlı gate).
- Toplu-atama hattı ürün kararına (ASSIGN-4d) bloke; karar DEFERRED durumda.
- Unmask/detail-masking hattı governance/mekanizma kararı olmadan açılamaz (Phase 1 BLOCKED kaydı).
- Workload/read-model hattı OFF/OD-19'a bloke.
- Kimlik-modeli derin değişimleri (çoklu membership/Employment, Tenant↔Org) OFF/OD-02/03/07'ye
  bloke; OD-07 en ağır migration düğümüdür ve migration SYS-MIG disiplinine tabidir.
```

Bu liste envanterdir; içinden bir hattın seçilmesi/öne alınması bu belgenin işi değildir.

## 4. Decomposition Procedure (kanıtlanmış Phase 1 boru hattının devamı)

Phase 2 decomposition'ı, Phase 1'de 5 kez işlemiş desenin devamıyla yapılır — ama bu belge o deseni İCRA ETMEZ, yalnız prosedür olarak sabitler:

```text
1. OWNER GO-ANALYZE (decomposition brief'i)   → aday envanteri + readiness değerlendirmesi
2. OWNER SELECTION                             → tek dar birim seçimi (bu belge aday üretmez)
3. Contract Draft + OWNER RATIFICATION         → bağlayıcı sınırlar (in/out-of-scope, invariants,
                                                 stop conditions, kanıt planı)
4. Ayrı OWNER GO-IMPLEMENT                     → izole worktree'de dar implementasyon + kanıt
5. Implementation Closure (GO-CANONICALIZE)    → delivery-katmanı statü uzlaştırması + kayıt
```

Kurallar: "tam kapsam tek Contract için büyükse" first-slice re-scope emsali uygulanır (Phase 1'de beş decomposition turunda — C/E/I/J/K re-scope hatlarında — işlemiş desen); her adım kendi owner kapısına tabidir; readiness ≠ authorization; hiçbir adım bir sonrakini otomatik tetiklemez. Decomposition kayıtlarının yaşayacağı delivery yüzeyinin belirlenmesi, ratifikasyon sonrası ayrı bir owner tasarrufudur (`OFF-P2-GOV-03`); bu belge yer/biçim önermez.

## 5. Entry Conditions for Decomposition

### `OFF-P2-ENTRY-01` — Bu 4-belgelik setin owner text-ratification'ı (decision-log kaydıyla) tamamlanmıştır.
### `OFF-P2-ENTRY-02` — Set approved merge ile repository-canonical olmuştur ve GOVERNANCE-INDEX Bölüm 2 + README kayıtları (ayrı governance adımı) yapılmıştır.
### `OFF-P2-ENTRY-03` — Owner, decomposition için açık GO-ANALYZE brief'i vermiştir (bu belge o brief'in yerine geçmez).

Üç koşul da sağlanmadan hiçbir Phase 2 iş birimi tanımlanamaz. Koşulların sağlanması bu belgeyle DEĞİL, her biri kendi kaydıyla kanıtlanır. (Decomposition kayıtlarının yaşayacağı delivery yüzeyinin belirlenmesi de ratifikasyon sonrası ayrı bir owner tasarrufudur — `OFF-P2-GOV-03`.)

## 6. Son Hüküm

Bu roadmap Phase 2'nin sıralama fiziğini (neyin neyi beklemek zorunda olduğunu) ve decomposition prosedürünü sabitler; ne bir işi başlatır, ne bir hattı seçer, ne bir tarihi taahhüt eder. Phase 1'in mevcut durumundan (NEXT ELIGIBLE UNIT = NONE; faz-seviyesi kapanış kaydı ratifikasyon adımında işlenecek ayrı kalemdir) Phase 2'nin ilk iş birimine giden yolun HER adımı owner kapısındadır.

**FOUNDATION STATUS: READY FOR PHASE 2 DECOMPOSITION** (OFF-P2-ENTRY-01..03 koşullarına tabi).

## 7. Document Self-Check

```text
- Wave/Candidate/Task/Contract/impl-plan/takvim/öncelik var mı: NO (§1 beyanı; yalnız kısıt+prosedür)
- Authority/izin üreten hüküm var mı:                           NO (SYS-GOV-008; Hard Stop #13 uyumu)
- Bir hat seçildi/öne alındı mı:                                NO (§3 envanter, sıra önerisi değil)
- Açık kararlara ön-karar verildi mi:                           NO (yalnız gate kaydı)
- Decomposition başlatıldı mı:                                  NO (ENTRY-01..03 açık koşullar)
- PUBLIC CONTENT RULE ihlali:                                   NO
- Kimlik uzayı çakışması:                                       NO (yalnız OFF-P2-SEQ/ENTRY-*)
```
