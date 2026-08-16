# OFFICE-WR01 — DECOMPOSITION BRIEF (R01)

```text
DOKÜMAN            wr01-decomposition-brief-r01.md
GÖREV              OFFICE-WR01-DECOMPOSITION-BRIEF-R01 (GO-ANALYZE / SALT ANALİZ)
STATÜ              DRAFT / PENDING_OWNER_SOURCE_VERIFICATION
BASE               origin/main @ f5ccdb0bfa95ee0f5e0a86b1a926a261d3a50595 (2026-08-16)
ÜRETİLEN AUTHORITY NONE — bu doküman karar üretmez, ratifiye etmez, sıra/scope seçmez
ÜRÜN DİFF          YOK (kod / schema / migration / test / flag / runtime / production: DOKUNULMADI)
```

---

## 0. Kaynağın sınırı + statü kilidi

> **NOT 1 — KAYNAK SINIRI.** `D-WR-1..7` ve `B01-B10` içeriği **PAGE-O0 aktarımına**
> dayanır; `decision-log.md` satır 539'daki `OFFICE-WR01 — MASTER PLAN KAYDI`
> yalnız **kimlik+statü envanteridir** ve kararların içerik detayını taşımaz
> (kaydın kendi ifadesi: *"Bu kayıt kimlik+statü envanteridir; karar içerik
> detayları owner oturum kaydındadır."*). **Owner bu bölümü onaylamadan önce
> doğrulamalıdır.**

> **NOT 2 — STATÜ KİLİDİ.** Bu doküman, owner doğrulamasına kadar
> `DRAFT / PENDING_OWNER_SOURCE_VERIFICATION` statüsündedir; **hiçbir D-WR
> kaydını yeniden ratifiye etmez**, hiçbir bloğa execution authority vermez ve
> B01-B10 arasında bağlayıcı bir sıra seçmez.

### 0.1 Repo'da fiilen yazılı olan (VERIFIED)

Üç kanonik yüzeyde birbiriyle tutarlı, **yalnız envanter** düzeyinde kayıt vardır:

| Yüzey | Konum | İçerik |
|---|---|---|
| `decision-log.md` | satır 539 (2026-08-13) | `DECISION_RATIFIED / DECOMPOSITION_REQUIRED`; D-WR-1..6 RATIFIED + D-WR-7 OPEN; B01..B10 iskeleti; PRODUCT EXTENSION dalı; P8 FINAL'i BEKLETMEZ |
| `OFFICE-DELIVERY-MANIFEST.md` | §13.5 | aynı blok, `EXECUTION AUTHORITY NONE` ek satırıyla |
| `product-backlog.md` | § OFFICE-WR01 — Master Plan Kaydı | aynı blok |

**Repo'da BULUNMAYAN (aktarıma kalan):** D-WR-1..7'nin metinleri, B01-B10'un
başlıkları/kapsamları, blok bağımlılık grafiği. `B01..B10` ifadesi repo'da geçer;
`B01 contract+taxonomy`, `B06 approval-orchestration+ledger` gibi **blok adları
geçmez**. Bu brief'teki blok adları aktarımdır.

### 0.2 Mevcut binding'lerin WR01'e bakışı (VERIFIED)

`governance-writer-coordination-contract.md` içindeki **yürürlükteki iki binding**
(F04 status reconciliation, satır ~2372; F07 physical orphan disposition, satır
~2447) `OFFICE-WR01`'i açıkça **yetkilendirilmemiş iş** olarak sayar. Bu brief o
sınırla çelişmez: analiz üretir, WR01 authority'si tüketmez.

---

## 1. D-WR-1..7 — aktarım + blok eşlemesi

> Aşağıdaki yedi kararın **metni PAGE-O0 aktarımıdır** (NOT 1). Bu bölüm onları
> genişletmez, yeniden yorumlamaz ve eksiğini tahminle tamamlamaz.

| # | Karar (aktarım özeti) | Statü | Etkilediği blok(lar) |
|---|---|---|---|
| D-WR-1 | **STRICT ROUND-ROBIN** — deterministik, concurrency-safe; pasif/izinsiz aday atlanır; başarısız transaction sırayı tüketmez | RATIFIED (aktarım) | **B03** (birincil) · B02 (havuz girdisi) · B04 (yeniden atama sırayı nasıl etkiler) |
| D-WR-2 | **Ayrı ilk-kontrol aşaması** — uygulayıcı ≠ kontrolör. Veri modeli yalnız contract'ta tarif edilir; bu aşamada alan/migration icat edilmez | RATIFIED (aktarım) | **B05** (birincil) · B01 (contract tarifi) · B06 (kontrol → onay geçişi) |
| D-WR-3 | **Politika sözlüğü** `ANY_ONE` / `ALL` / `QUORUM` / `SEQUENTIAL` / `PARALLEL`. **Bildirim kümesi ≠ kapanış karar sayısı.** Delegasyon: action-scoped + süreli + geri-alınabilir + yetki büyütemez | RATIFIED (aktarım) | **B06** (birincil) · B01 (sözlüğün contract'ta yeri) · B07 (bildirim/karar ayrımı) |
| D-WR-4 | **FINANCIAL / JUDICIAL / ADMIN** sınıflandırması `actionCode` bazında; envanter kesinleşmeden hard-code yapılmaz | RATIFIED (aktarım) | **B01** (birincil — taxonomy) · B06 · D-WR-7'nin ön-koşulu |
| D-WR-5 | **Digest kişi-performans üretmez** — yalnız iş durumu / bekleyen / gecikme / eskalasyon | RATIFIED (aktarım) | **B07** (birincil) · B08 (UI'da performans metriği göstermeme sınırı) |
| D-WR-6 | **FOUNDER = `ANY_ONE`** — bildirim tüm uygun kuruculara gider, ilk geçerli karar kesinleşir, kalan aksiyonlar atomik kapanır. Self-approval action-bazlı istisnalarla korunur. Requester çıkınca uygun kurucu kalmazsa **FAIL-CLOSED**, alt kademeye düşmez | RATIFIED (aktarım) | **B06** (birincil) · B02 (kurucu havuzu) · B07 (fan-out bildirimi) |
| D-WR-7 | **Yüksek-etkili FINANCIAL işlemlerde `ALL` override gerekir mi?** | **OPEN** | B06 · B01 (D-WR-4 kesinleşmeden cevaplanamaz) — bkz. §5 Açık Soru 1 |

### 1.1 Üstteki değiştirilemez sınırlar (D-WR'lerin üstünde)

Bu üç sınır D-WR'lerden **bağımsız olarak bağlayıcıdır** ve decomposition hiçbir
blokta bunları gevşetemez:

1. **DBIND §5 + OWN-29-C** — *kurucu bile* `FINANCIAL_CASE_CLOSE`'da kendi
   talebini onaylayamaz.
   **VERIFIED:** `dbind-financial-authority-decisions.md` §5 —
   *"OWN-29-C runtime sınırı (2026-07-10): Financial case close
   `FINANCIAL_CASE_CLOSE` action'ıdır ve payout değildir; bu nedenle DBIND §5
   self-approval istisnasını miras almaz. PARTNER, founding lawyer veya super
   admin dahil requester kendi finansal dosya kapanış talebini onaylayamaz."*
   Aynı §5, self-approval istisnasını **yalnız** `CLIENT_PAYOUT_POST` için ve
   yalnız `approve()` kararında tanır (VER-36, 2026-07-10).
2. **ReportingLine grafiği yalnız organizasyoneldir** — havuz/dağıtım/yetki/onay
   ÜRETMEZ.
   **VERIFIED:** owner kararı 2026-07-28 / OPTION A, kodda yürürlükte —
   `apps/api/src/scripts/office-cap02-authorization-shadow.core.ts:10`:
   *"`ReportingLine` yalnız organizasyonel hiyerarşi gerçeğidir"*; katman nötr
   sınıf karşılaştırması yapar ve **hiçbir kararı etkilemez**
   (`office-approval-reportingline-shadow.spec.ts`).
3. **Staff hiçbir durumda nihai onaycı olamaz.**
   **VERIFIED:** iki bağımsız yerde kodlanmış —
   `client-financial-disclosure-approval-eligibility.ts:33`
   (*"Lawyer linki YOK → staff; final financial approver OLAMAZ."*) ve
   `client-payout-approval.policy.ts` (*"Staff DEĞİL (Lawyer linki yok)"*).

### 1.2 Kanonik ReportingLine grafiği (referans, sabit)

```text
Ulaş                     TOP_LEVEL
Fatma        → Ulaş
Ege          → Fatma
Aysu         → Ege
Büşra        → Ege
Fatih        → Ege
```

### 1.3 FOUNDER kimliği ile ReportingLine ayrımı (D-WR-6 alt bölümü)

**Bu iki kavram karıştırılmamalıdır ve bu brief onları karıştırmaz.**

- Fatma'nın `Fatma → Ulaş` şeklindeki **organizasyonel** bağlantısı FOUNDER
  uygunluğunu **ne azaltır ne üretir**. Bir kişinin amiri olması onu kurucu
  yapmaz; amiri olmaması da kurucu yapmaz.
- **FOUNDER kimliği ReportingLine grafiğinden gelmez**; ayrı bir yetki
  kaynağından gelir.
- **Repo'da hâlihazırda var olan FOUNDER kaynağı (VERIFIED, emsal):**
  `operational-escalation.service.ts:245-247` FOUNDER tier'ını
  `Office.escalationFounderLawyerIds` (açık liste) ile çözer; liste boşsa
  `Lawyer.role IN ("OWNER","PARTNER")` fallback'ine düşer. `schema.prisma:4218`
  bu ikiliyi enum yorumunda kayıt altına alır:
  `FOUNDER // L3: Kurucu/ortak (escalationFounderLawyerIds | role OWNER/PARTNER)`.
  **Bu, ReportingLine'dan tamamen bağımsız bir kaynaktır.**
- **Sonuç (ANALİZ, karar değil):** D-WR-6'nın FOUNDER havuzu için repo'da zaten
  ReportingLine'dan bağımsız, iki katmanlı (açık liste → rol fallback) bir emsal
  vardır. Bu emsalin WR01'de aynen mi kullanılacağı, sıkılaştırılacağı mı yoksa
  ayrı bir kaynak mı tanımlanacağı **owner kararıdır** — bu brief seçmez.

---

## 2. B01-B10 — blok iskeleti, hedef yüzey taslağı, ön-koşul durumu

> Blok adları PAGE-O0 aktarımıdır (§0.1). Aşağıdaki "hedef dosya/modül taslağı"
> **öneridir**; hiçbir dosya yaratılmamış, hiçbir isim rezerve edilmemiştir.
> Entity / migration / endpoint / test **adedi taahhüdü verilmemiştir** — kapsam
> sınırı yalnız niteldir.

| Blok | Aktarımdaki konu | Ön-koşul durumu |
|---|---|---|
| **B01** | contract + taxonomy | Blok-özel ek ön-koşul saptanmadı (WR01 program ön-koşulu §2.2'de) |
| **B02** | effective-dated pools | Blok-özel ek ön-koşul saptanmadı |
| **B03** | round-robin + single-assignee | Blok-özel ek ön-koşul saptanmadı |
| **B04** | reassignment / absence / audit | Blok-özel ek ön-koşul saptanmadı |
| **B05** | first-review | Blok-özel ek ön-koşul saptanmadı |
| **B06** | approval-orchestration + ledger | **`UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED`** — bkz. §2.1 |
| **B07** | notification + digest | Blok-özel ek ön-koşul saptanmadı |
| **B08** | UI-API admin | Blok-özel ek ön-koşul saptanmadı |
| **B09** | migration + runtime verify | **`BLOCKED_DEPENDENCY`** — cross-workstream migration contract **YOK** (§2.3) |
| **B10** | governance closure | Tüm önceki blokların terminal durumuna bağlı (yapısal) |

### 2.1 B06 ön-koşulu — `X4/P4 canonical closure`: **`UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED`**

PAGE-O0 aktarımına göre X4/P4 kapanmıştır. Bu brief, kendi fresh `origin/main`
kontrolünde **ne kapanışı doğrulayabildi ne de açıklığı kesinleştirebildi.**
Sebep yapısaldır: `X4/P4` etiketi **iki farklı kapanış kavramına** işaret
edebilir ve repo bu iki kavram için **birbirinden ayrı** kanıt taşır. Ön-koşulun
hangisini kastettiği owner tarafından netleştirilmelidir.

> `X4/P4 canonical closure` → **UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED**
> Bu brief "kapandı" da yazmaz, "açık" da yazmaz.

#### (a) Fonksiyonel P4 write-path closure — **kapandığı yönünde kanıt VAR**

Onay motorunun yazma yolu (`OfficeApprovalRequest` yaşam döngüsü + enforce)
kapanmış görünüyor:

| Bulgu | Kanıt |
|---|---|
| P4 approval motoru teslim + enforce DONE | `master-triage-register.md:197` — *"P4 Office Approval FE PR #823/#832 ile teslim edilmiş ve **P4-6 DONE**"* (VER-26, 2026-07-10) |
| `P4-6 = enforce` semantiği | `office-approval-shadow.service.ts:13-15` — *"İşlemi durdurma + typed response + fail-closed = 'enforce' (P4-6)"* |
| Write-path kodda mevcut | `office-approval.service.ts` — `createPendingRequest` / `approve` / `reject` / `approveWithChanges` / `requestRevision` / `cancel` + executor (`office-approval-executor.service.ts`) |

**B06'nın fiilen ihtiyaç duyduğu şey budur** — üzerine `ALL`/`QUORUM`/
`SEQUENTIAL` politikalarını inşa edeceği çalışan bir tek-aşamalı motor. Bu
okumaya göre ön-koşul **karşılanmıştır**.

#### (b) Umbrella final closeout — **kapanmadığı yönünde kanıt VAR**

Program/lane düzeyindeki final sertifikasyon kapanmamıştır:

| Bulgu | Kanıt |
|---|---|
| P8 FINAL X4'ü bekliyor | `OFFICE-DELIVERY-MANIFEST.md:1860` — *"**P8 FINAL CLOSEOUT DEĞİLDİR** (X4 ve kalan lane'ler kapanmadan final sertifikasyon yapılmaz)"* (aynı ifade `product-backlog.md:3662`) |
| X4 hâlâ **iş alan** taraf | `OFFICE-DELIVERY-MANIFEST.md:1924` — `CLF-O0-01 · requestRevision domain-owned guard → X4` |
| `OFFICE-P4-AUTHORIZATION-COMPLETION-R01` uçuşta | Bu umbrella'ya bağlı semantic authority kayıtları **2026-08-15 / 2026-08-16** tarihli: F03 `issuedAt : 2026-08-15`; F04 `issuedAt : 2026-08-16 / status : ACTIVE_FOR_THIS_EXACT_RECONCILIATION_PR`; F07 `issuedAt : 2026-08-16 / status : ACTIVE_AFTER_APPROVED_MERGE_SINGLE_TASK` (`decision-log.md` §§ OFFICE-SC-F03/F04/F07 authority record blokları) |
| Successor envanteri açık | `OFFICE-DELIVERY-MANIFEST.md` §13.4 — tüm kalemler `OWNER GO REQUIRED / NOT STARTED` |

#### (c) X4'ün kendisi hakkında ölçülen boşluk

Repo'da **X4'ün ne teslim ettiğini tanımlayan bir lane sayfası veya kapanış
kaydı yoktur**; X4 yalnız *başka kalemlerin hedefi* olarak (`… → X4`) geçer.
Dolayısıyla "X4 kapandı mı" sorusu repo kanıtıyla **hiçbir yönde**
cevaplanamaz — bu bir bilgi boşluğudur, bir açıklık tespiti değildir.

#### Sonuç

`(a)` kapanmış, `(b)` kapanmamış, `(c)` ölçülemiyor. Bu üçü aynı etiket altında
toplandığı için tek bir verdict verilemez. **Ön-koşul "P4 write-path"i mi yoksa
"umbrella final closeout"u mu kastediyor?** — bkz. §5 Açık Soru 5.

Not: B06 zaten §4'teki D3 gerilimi ve §5 Açık Soru 1 (D-WR-7) sebebiyle owner
kararı beklemektedir; bu belirsizlik **ek** bir engel getirmez, mevcut owner
kapısına eklenir.

**Ancestry doğrulanan alt-parçalar (tamlık için; hiçbiri P4'ün *bütününü* kapatmaz):**

| Kalem | PR | Squash SHA | main ancestry |
|---|---|---|---|
| P5 SECURITY Phase A | `#2362` | `e6a22c7f8c6bf1531e36229971df0f84f0a46bcb` | `ANCESTOR_OF_MAIN` (VERIFIED) |
| P5 SECURITY Phase B | `#2368` | `4e228cb2a535a2ffac9ea9901a7904dddaada8a4` | `ANCESTOR_OF_MAIN` (VERIFIED) |
| P5 SECURITY B02R1 | `#2371` | `957eae28e0c48abb352ca435baa1d5c8b8f3649a` | `ANCESTOR_OF_MAIN` (VERIFIED) |
| F06 open-OD disposition | `#2376` | `a3db41bda8c9f09bcec5c563862f5ca10e0a9411` | `ANCESTOR_OF_MAIN` (VERIFIED) |
| P7 dormant disposition | `#2358` | `66773661e67f95495f5a9955a93b6d8b8d4a09c8` | `ANCESTOR_OF_MAIN` (VERIFIED) |

### 2.2 WR01 implementation ön-koşulu — `C2 PHASE B CLOSED`: **KARŞILANDI (VERIFIED)**

`"C2 PHASE B"` literal dizgisi repository'de geçmez; ancak **semantik bağ
kurulabildi ve repo kanıtıyla doğrulandı.** `C2`, executor **lane kimliğidir**
(`CLAUDE-C2`) ve OFFICE lane kanıt belgelerinde açıkça kayıtlıdır.

**Zincir (her adım VERIFIED, `origin/main` @ `f5ccdb0b`):**

| # | Adım | Kanıt |
|---|---|---|
| 1 | `CLAUDE-C2` = OFFICE execution lane | `office-p5-security-r01/README.md:8` — tablo satırı: `| Lane | CLAUDE-C2 (OFFICE execution lane) |` |
| 2 | C2'nin görevi = `OFFICE-P5-SECURITY-COMPLETION-R01` | `office-p5-security-r01/README.md:7` — `| Task | OFFICE-P5-SECURITY-COMPLETION-R01 |` |
| 3 | Bu lane PHASE A / PHASE B ile bölünmüş | `office-p5-security-r01/README.md:9,20` — `| Phase | PHASE A — evidence-only (B01 + B03) |`; *"PHASE B (B02/B04/B05 implementasyonu) yalnız X3 terminal + PAGE-O0 lease sonrası açılır"* |
| 4 | PHASE B gerçekten açıldı ve teslim edildi | PR `#2368` squash `4e228cb2a535a2ffac9ea9901a7904dddaada8a4` — */auth/me credential containment, seed kanonik-servis yolu, staff okuma projeksiyonu + DTO (F-B01-01, B02, B04/S3, B05)*; commit başlığı literal olarak *"P5 guvenlik PHASE B"* |
| 5 | PHASE B main'de | `git merge-base --is-ancestor 4e228cb2 origin/main` → **`ANCESTOR_OF_MAIN`** (VERIFIED) |
| 6 | Program CLOSED | `master-triage-register.md:199` — *"**OFFICE / P5 SECURITY — PHASE A + PHASE B + B02R1 (OFFICE-P5-SECURITY-R01)** — **CLOSED / VERIFIED** (2026-08-13; kanonik kayıt: `OFFICE-P8-C4-CANONICAL-RECONCILIATION-R01`)"*; `F-B02-01 CLOSED`; üç SHA da *"gh ile MERGED + origin/main ancestry VERIFIED"* |
| 7 | Kanonik ikinci kayıt | `OFFICE-DELIVERY-MANIFEST.md` §13.1 — `PROGRAM STATUS: CLOSED / VERIFIED (2026-08-13)`, `CHAIN: #2362 → #2368 → #2371` |

**Adım 3'teki lease kapısı da karşılanmıştır:** PHASE B'nin ön-koşulu olan
*"X3 terminal + PAGE-O0 lease"*, PHASE B'nin fiilen merge edilmiş olmasıyla
(adım 4-5) geriye dönük olarak doğrulanır — açılmamış olsaydı `#2368`
bulunmazdı. Aynı README §1, DB write ve CI manifest lease'lerinin o tarihte
`CODEX-X3`'te olduğunu ve C2'nin bunlara **dokunmadığını** kayıt altına alır.

**Identity completion bağlamı (yan doğrulama):** C-lane kimlikleri repo'da tek
başına P5'e özgü değildir — `office-p5-security-r01/b03-staff-authorization-compatibility-matrix.md:59`
*"3 aktif ve üçü de User'a bağlı (**C1 P2-B03 pilotları**)"* der; `:75` *"**C1'in
bağladığı** 3 personel"* diye devam eder. Yani C1 identity-binding pilotlarını,
C2 P5 security'yi, C3 P7 dormant'ı (`office-p7-dormant-r01/README.md:3` —
`LANE: CLAUDE-C3`), C4 P8 reconciliation'ı (`cross-lane-findings.md:11` —
`TARGET LANE: CLAUDE-C4 (P8)`) yürütmüştür. **C-numaralı executor sayfa şeması
repo'da tutarlı biçimde kayıtlıdır**; §2.2'nin ilk okumasındaki "executor-sayfa
kimlikleri repo'da tutulmaz" varsayımı yanlıştı.

```text
C2 PHASE B CLOSED   → KARŞILANDI / VERIFIED
                      (CLAUDE-C2 lane · OFFICE-P5-SECURITY-R01 PHASE B ·
                       PR #2368 · squash 4e228cb2 · ancestry VERIFIED ·
                       program CLOSED / VERIFIED 2026-08-13)
```

**Sonuç:** Bu ön-koşul **B01-B10'u bloklamaz.** Önceki taslakta yer alan
*"hiçbir blok açılamaz"* çıkarımı **geri alınmıştır**.

### 2.3 B09 ön-koşulu — `cross-workstream migration contract`: **KARŞILANMAMIŞ**

Böyle bir contract repo'da **yoktur**. En yakın emsal, `TRAIN-R02` reusable
migration contract'ıdır (ayrı program), ama WR01'i kapsayan bir
cross-workstream sözleşme bulunmamaktadır. B09 bu nedenle
**`BLOCKED_DEPENDENCY` / açık, karşılanmamış bağımlılık** olarak işaretlenir.

### 2.4 Blok başına hedef yüzey taslağı (ÖNERİ — hiçbir dosya yaratılmadı)

> Kural: yeni Prisma modeli / migration / entity **icat edilmedi**. Aşağıdaki
> "yeni dosya" satırları yalnız **isim önerisidir**; şekil ve alanlar B01
> contract'ının işidir.

| Blok | Dokunacağı mevcut yüzey (VERIFIED mevcut) | Önerilen yeni dosya (YARATILMADI) | Nitel kapsam sınırı |
|---|---|---|---|
| **B01** | `modules/office-approval/office-approval-domain-ownership.ts`, `modules/policy-engine/types/action-code.enum.ts` | `office-work-routing.contract.ts`, `office-work-routing-taxonomy.ts` | Saf tip/sözleşme + `actionCode` sınıflandırma tablosu. **Sıfır runtime davranışı**, sıfır schema |
| **B02** | `schema.prisma` — `Office.escalationManagerLawyerIds` / `escalationFounderLawyerIds` / `opStaffTypes` (2402-2411) | `office-work-pool.resolver.ts` | Effective-dated havuz **okuma** katmanı. Alan ekleme B01 contract'ı kesinleşmeden değerlendirilemez |
| **B03** | (emsal yok — §3.8) | `office-work-round-robin.ts` (saf, IO-suz) + persist adaptörü | Deterministik sıra fonksiyonu ayrı, concurrency-safe persist ayrı tutulmalı. **Repo'da round-robin emsali YOK** |
| **B04** | `modules/audit/audit.service.ts` | `office-work-reassignment.service.ts` | Yeniden atama + yokluk + audit izi. D-WR-1'in "sırayı tüketmez" kuralı burada da geçerli |
| **B05** | `office-approval.service.ts` (statü makinesi deseni) | `office-first-review.service.ts` | Uygulayıcı ≠ kontrolör ayrımı. Veri modeli **yalnız B01 contract'ında** tarif edilir |
| **B06** | `office-approval.service.ts`, `client-payout-approval.policy.ts`, `client-financial-disclosure-approval.policy.ts` | `office-approval-policy-vocabulary.ts` + politika-başına policy dosyaları | Mevcut `resolveApproverEligible()` **actionCode dispatch** desenini genişletir. `ALL/QUORUM/SEQUENTIAL` için çok-kararlı taşıyıcı gerekir → §5 Açık Soru 2. Ön-koşul: **`UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED`** (§2.1) |
| **B07** | `operational-escalation.service.ts` (tier + çift-gönderim guard + SENT/FAILED/SKIPPED sonucu) | `office-work-digest.service.ts` | Bildirim fan-out'u D-WR-3 gereği karar sayısından **ayrı** kalmalı. D-WR-5: digest'te kişi-performans alanı **olmaz** |
| **B08** | `office.controller.ts` (`opStaffTypes` / eskalasyon listelerinin admin yüzeyi) | `office-work-routing.controller.ts` + admin DTO'ları | **UYARI (VERIFIED emsal riski):** `office-p5-security-r01/b03-...matrix.md` — allowlist projection + tam-form POST birleşimi sınıflandırılmamış alanı önce görünmez yapıp sonra siler. Admin yüzeyi **fark-payload** ile tasarlanmalı |
| **B09** | `prisma/migrations/**` | — | Ön-koşul yok (§2.3). **`BLOCKED_DEPENDENCY`** |
| **B10** | `decision-log.md`, `product-backlog.md`, `OFFICE-DELIVERY-MANIFEST.md` §13.5 | `office-wr01-decomposition-r01/` altında closure kanıtı | Governance-only. §13.5 bloğunun terminal hâle güncellenmesi ayrı owner yetkisi ister |

---

## 3. Emsal envanteri — 7 grup / 9 benzersiz dosya

Tüm dosyaların `origin/main` @ `f5ccdb0b` üzerinde **aynı yolda ve aynı amaçla
var olduğu** doğrulandı (VERIFIED).

| Grup | Dosya | Satır | Son commit | Temel olduğu blok(lar) |
|---|---|---|---|---|
| 1 | `apps/api/src/modules/escalation/operational-escalation.service.ts` | 492 | `fdaf21e6` 2026-08-01 | **B07** · B02 (FOUNDER havuzu) |
| 1 | `apps/api/src/modules/escalation/__tests__/operational-escalation.service.spec.ts` | 244 | `fdaf21e6` 2026-08-01 | **B07** (test deseni) |
| 2 | `apps/api/src/modules/office/office.service.ts` | 547 | `2cae1fb1` 2026-08-02 | **B02** · B08 |
| 2 | `apps/api/src/modules/office/office.controller.ts` | 309 | `2cae1fb1` 2026-08-02 | **B08** |
| 3 | `apps/api/src/modules/office-approval/office-approval.service.ts` | 618 | `2a388b10` 2026-08-11 | **B06** (en yakın emsal) · B05 |
| 3 | `apps/api/src/modules/office-approval/__tests__/office-approval.service.spec.ts` | — | — | **B06** (test deseni) |
| 4 | `apps/api/src/modules/client-settlement/client-payout.service.ts` | 619 | `038dbbb9` 2026-07-15 | **B06** (action-özel policy tüketicisi) |
| 5 | `apps/api/src/modules/client-financial-disclosure/client-financial-disclosure-approval-eligibility.ts` | 49 | `691ef164` 2026-07-28 | **B06** (`SEQUENTIAL` / çok-kişi) |
| 6+7 | `apps/api/prisma/schema.prisma` | 10502 | `3728ffcf` 2026-08-09 | **B06** (Grup 6) · **B01/B06** (Grup 7) |

### 3.1 Grup 1 — eskalasyon (`operational-escalation.service.ts`)

Çıkarılan desen (taklit edilmeyecek, **desen olarak** alınacak):

- **Üç kademeli tier**: `STAFF → MANAGER → FOUNDER`, her tier'ın alıcı çözümü
  ayrı (`resolveRecipients`, :218-255).
- **Çift-gönderim guard'ı sonuca göre yazılır**: `Task.lastNotifiedLevel` yalnız
  `SENT`'te ilerler; `FAILED`/`SKIPPED`'te baseline'da kalır → sonraki tick aynı
  tier'ı retry eder. Zaman çizelgesi gönderimden **bağımsız** kalıcıdır (:34-37).
- **Bu motor iş ATAMAZ, yalnız bildirir.** WR01'in atama motoru (B03) bunun
  yerine değil, **yanına** gelir.

**B07 için doğrudan aktarılabilir ilke:** D-WR-1'in *"başarısız transaction
sırayı tüketmez"* kuralı, bu servisin *"guard gönderim SONUCUNA göre yazılır"*
kuralıyla **aynı ailedendir**; B03/B07 tasarımı bu emsali gerekçe olarak
kullanabilir.

### 3.2 Grup 2 — office rol modeli

- `Office.opStaffTypes` (`schema.prisma:2411`, default
  `[MUHASEBE, ADLI_KATIP, SEKRETER]`) → L1 alıcı personel türleri.
- `Office.escalationManagerLawyerIds` / `escalationFounderLawyerIds`
  (`schema.prisma:2402-2403`) → açık liste; boşsa rol fallback'i.
- Bu üç alan `office.service.ts:502-528` ve `office.controller.ts:289-296`
  üzerinden **zaten admin-yönetilebilir**dir.

**B02/B08 için:** effective-dated havuz kavramı **yoktur** (bu alanlar
tarihsiz düz listelerdir); WR01'in "effective-dated" gereksinimi bu emsalin
**üstünde** bir katmandır.

### 3.3 Grup 3 — mevcut onay motoru (B06'nın en yakın emsali)

`office-approval.service.ts`, **tek-aşamalı `ANY_ONE`-of-eligible** onay
motorudur. B06 için kritik desenler:

- **`resolveApproverEligible()` (:515-522)** — eligibility `actionCode`'a göre
  **dispatch** edilir. `CLIENT_PAYOUT_POST` izole `PayoutApprovalPolicy`'ye
  gider; her başka `actionCode` paylaşılan `isApproverEligible()`'ı **aynen**
  kullanır → *"genişleme başka hiçbir actionCode'a SIZMAZ"*. Dosyanın kendi
  yorumu üçüncü bir action-özel policy'nin **buraya** ekleneceğini söyler
  (:519-521). **D-WR-4'ün `actionCode` bazlı sınıflandırması bu genişleme
  noktasına birebir oturur.**
- **Kimlik-tabanlı self-approval** — `resolveSelfApprovalIdentityCandidates()` /
  `isSameApprovalIdentity()` (:386-424) requester ile approver'ı **kullanıcı
  id'si eşitliğinden daha geniş** bir kimlik kümesiyle karşılaştırır. D-WR-6'nın
  "self-approval action-bazlı istisnalarla korunur" ifadesi bu mekanizmanın
  üstüne kurulur; `assertApproveSelfApprovalPolicy()` (:433-437) istisnayı
  **yalnız** `CLIENT_PAYOUT_POST` + `approve()` için açar.
- **Inbox paritesi** — `listForTenant()` (:324-333) `view='inbox'`'ta
  `requesterUserId: { not: callerUserId }` filtresi uygular; *"kendi talebini
  onaylama paritesi → inbox'ta gösterme"*. D-WR-3'ün **"bildirim kümesi ≠
  kapanış karar sayısı"** ayrımının hâlihazırdaki karşılığı budur.

**B06'nın kapatması gereken yapısal boşluk (VERIFIED):**
`OfficeApprovalRequest` (`schema.prisma:9940-9982`) **tek** `approverUserId`
kolonu taşır ve karar izini `decidedAt` + `decisionNote` ile **tek satırda**
tutar. Yani şema `ANY_ONE` dışındaki hiçbir politikayı (`ALL`, `QUORUM`,
`SEQUENTIAL`, `PARALLEL`) taşıyamaz — bunlar **N adet karar** kaydı ister.
Bu, B06'nın "ledger" ihtiyacının **ölçülmüş** gerekçesidir.

### 3.4 Grup 4 — payout policy (action-özel policy emsali)

`PayoutApprovalPolicy` (`modules/office-approval/client-payout-approval.policy.ts`)
kuralı: **aktif + aynı tenant + linkli Lawyer + (`lawyerRank ∈ {PARTNER, MANAGER}`
VEYA `canApproveOfficeActions = true`)**. İki yüzeyi vardır:
`isEligible()` (bool, throw etmez — generic dispatcher bunu kullanır) ve
`assertEligible()` (403 fırlatır, yetkilendiren `Capacity`'yi döner — audit
izinde görünsün diye). `client-payout.service.ts:267` finalize yolunda aynı
policy'yi **defense-in-depth** olarak yeniden çalıştırır.

**B06 için ilke:** her politika sınıfı **çift yüzeyli** (predikat + assert)
tanımlanmalı ve **kritik yolda iki kez** doğrulanmalıdır.

### 3.5 Grup 5 — FD zinciri (`SEQUENTIAL` / çok-kişi emsali)

`client-financial-disclosure-approval-eligibility.ts` **saf, IO-suz** bir
predikattır (49 satır) ve iki çağıranın (Nest policy + dormant service) tek
kaynağıdır → *"drift YOK"*.

Çok-kişi kuralı **eligibility'de değil, transition contract'ında** yaşar:
`client-financial-disclosure-approval.contract.ts:180-182` üç ayrı hata kodu
tanımlar —
`DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN` (*"The requester … may not approve
any of its approval stages"*),
`DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION` (*"Office approver and content
approver must be two distinct actors"*),
`DISCLOSURE_APPROVAL_STALE_SNAPSHOT`.

**B06 için ilke (VERIFIED):** `SEQUENTIAL`'ın "N farklı kişi" kısıtı
**eligibility predikatına gömülmez**; ayrı, tipli bir ihlal kodları kümesiyle
transition katmanında zorlanır. Ayrıca `STALE_SNAPSHOT` kodu, çok-aşamalı
onayda **aşamalar arası içerik değişimi** riskini kapatan hazır bir emsaldir —
`ALL`/`QUORUM` politikalarında aynı risk doğar.

### 3.6 Grup 6 — dormant ledger (`IcrabotApprovalDecision`) + genişletilmiş doğrulama

**Model şekli (VERIFIED, `schema.prisma:8324-8338`):**
`IcrabotApprovalRequest` (1) ──< `IcrabotApprovalDecision` (N), alanlar:
`approvalRequestId`, `userId`, `decision` (`APPROVE`/`REJECT`), `note`,
`createdAt`; indeksler `approvalRequestId` ve `userId`.
**Bu, tam olarak B06'nın ihtiyaç duyduğu "bir talep → N karar" şeklidir.**

**Genişletilmiş dormant doğrulaması (talimat §3, prefiks kısıtı OLMADAN):**

```text
git grep -n "IcrabotApprovalDecision" origin/main -- .
```

Yöntem notu: tarama `origin/main` **ağacı** üzerinde yapıldı; bu, tanımı gereği
yalnız **tracked** dosyaları kapsar — `node_modules/.prisma/**`,
`**/generated/**` gibi Prisma-generated çıktılar tracked olmadığı için
sonuç kümesine **hiç girmez** (yanıltıcı eşleşme riski kaynağında elenmiştir).

**Tüm eşleşmeler (4 dosya, 8 satır):**

| Dosya | Satır sayısı | Niteliği |
|---|---|---|
| `prisma/migrations/00000000000000_baseline/migration.sql` | 5 | Tablo + PK + 2 index + FK — **şema tanımı** |
| `prisma/schema.prisma` | 2 | `model` + ters ilişki (`decisions`) — **şema tanımı** |
| `src/modules/icrabot/README.md` | 1 | `| IcrabotApprovalDecision | v38 | Onay kararları |` — **dokümantasyon** |

**El yazımı (generated olmayan) çalıştırılabilir kod içinde referans sayısı: 0.**
Hiçbir `.ts` dosyası bu modeli okumaz veya yazmaz.

```text
SONUÇ: IcrabotApprovalDecision = DORMANT (VERIFIED)
       — tablo mevcut, şema mevcut, dokümante edilmiş; runtime tüketicisi YOK.
```

**B06 için not:** dormant tablo bir **şekil emsalidir**, bir taşıyıcı **değildir**.
`Icrabot` bounded-context'ine aittir; OFFICE onaylarının oraya yazılması
bounded-context ihlali olur. Bu brief taşıyıcı seçmez.

### 3.7 Grup 7 — delegasyon taşıyıcısı (`PermissionGrant`)

**Model (VERIFIED, `schema.prisma:10021-10042`):** `tenantId`, `subjectUserId`,
`permissionKey`, `effect` (`ALLOW`/`DENY`), `scope`
(`DIRECT_REPORTS`/`TEAM`/…), `validFrom`, `validUntil?`, `grantedByUserId?`,
`reason?`.

D-WR-3'ün dört delegasyon niteliğine karşı **fark analizi**:

| D-WR-3 niteliği | `PermissionGrant` karşılığı | Değerlendirme |
|---|---|---|
| **action-scoped** | `permissionKey` | Kısmen — `permissionKey` ile `actionCode` arasındaki eşleme repo'da tanımlı değil |
| **süreli** | `validFrom` / `validUntil?` | **Karşılanıyor** (`validUntil` index'li) |
| **geri-alınabilir** | — | **Karşılanmıyor** — `revokedAt` / `revokedByUserId` alanı **yok**. Geri alma yalnız `validUntil` geçmişe çekilerek dolaylı yapılabilir; bu, "geri alındı" ile "süresi doldu" ayrımını **kaybettirir** |
| **yetki büyütemez** | — | **Karşılanmıyor** — modelde escalation-guard yoktur; kısıt tüketici tarafında yaşamak zorundadır |

**Kritik VERIFIED bulgu — şema yorumu BAYAT:** `schema.prisma`'daki
`PermissionGrant` yorum bloğu *"Bu tablo HENÜZ hiçbir authorization consumer
tarafından okunmuyor — yalnız şema temeli"* der. **Bu artık doğru değildir.**
Tam-repo taraması, en az **dört test-dışı servis**in tabloyu fiilen okuduğunu
gösteriyor:

```text
modules/bank/settlement-verifier-authorization.service.ts
modules/client-intake-review/client-intake-review-authorization.service.ts   (:52  permissionGrant.findMany)
modules/uyap/authority/trigger-haciz-authorization.service.ts
modules/uyap/authority/trigger-haciz-capability-authorization.service.ts     (:42  permissionGrant.findMany)
```

**Sonuç:** `PermissionGrant` **dormant değildir**; en az üç bounded-context
(BANK, CLIENT-INTAKE, UYAP) tarafından tüketilen **canlı** bir yetki
taşıyıcısıdır. WR01 delegasyonunun bu tabloya bindirilmesi, bu üç context'in
davranışını **etkileyebilecek** bir değişikliktir — bu, B01/B06 tasarımında
hesaba katılması gereken bir risktir ve bu brief bunu **karara bağlamaz**.

> **KAYIT (bu brief'in scope'u dışında, düzeltilmedi):** yukarıdaki bayat şema
> yorumu bir governance kalemidir; `CLF-P7-0x` "stale yorumlar" ailesiyle
> ilişkili olabilir. Bu brief **yalnız gözlem kaydeder**, düzeltme önermez.

### 3.8 Emsalsiz kalan blok: B03

Yedi emsal grubunun **hiçbiri** round-robin / deterministik sıra / tekil-atama
davranışı içermez. `operational-escalation.service.ts` **tüm** uygun alıcılara
fan-out yapar (dağıtım değil, yayın). Dolayısıyla:

```text
B03 = SIFIR EMSAL — en yüksek tasarım belirsizliği taşıyan blok.
```

Bu, B03'ün ilk açılan blok **olmaması** için değil, contract'ının (B01) **en
ayrıntılı** tarif edilmesi gereken blok olduğu için önemlidir.

---

## 4. Açık gerilim — D3 ↔ B06 (çözülmedi, işaretlendi)

**Gerilim:** eğer B06'nın decision-ledger'ı **CAP-09A kolonlarını** dolduracaksa,
bu OFFICE Phase 2'nin **D3** kararını (*"yeni OFFICE producer YOK"*) ihlal eder.

**Repo kanıtı (VERIFIED):**

- `office-p7-dormant-r01/cap09a-disposition-record.md:82` — ratifiye edilen
  bulgu satırı: **"Yeni OFFICE producer YOK"**.
- CAP-09A producer statüsü, **yürürlükteki** dört ayrı binding/grant'ta aynı
  literal ile tekrarlanır:
  `DORMANT_CANONICAL / NOT_AUTHORIZED / DO NOT OPEN`
  (`OFFICE-CAP-09A-CONSUMER-01-R01-EG01.md:57`,
  `OFFICE-SC-F03-…-EG01.md:27,61`, `OFFICE-SC-F04-…-EG01.md:38`,
  `decision-log.md:305`).
- Söz konusu kolonlar: `AuditLog`'un **7 attribution kolonu**
  (`actorType`, `decisionResult`, `reasonCode`, `correlationId`, `requestId`,
  `policyRef`, `policyVersion`; `schema.prisma:5896-5903`, migration
  `20260722213239_office_phase2_cap09a_foundation_audit_attribution`).
- **Ölçülmüş mevcut durum** (P7-B01, 2026-08-13, read-only DB): toplam 931
  `AuditLog` satırında `actorType`/`decisionResult`/`reasonCode` = 4;
  `correlationId`/`requestId`/`policyRef`/`policyVersion` = **0**. Kod
  seviyesinde 6 üretici çağrı noktasının **tamamı OFFICE dışıdır**; OFFICE
  tarafında üretici sayısı **sıfır**dır (`office-approval.service.ts:597-617`
  attribution alanı taşımaz, bilgi yalnız `metadata` içindedir).

**Çıkarım (ANALİZ, karar DEĞİL):** OFFICE bugün CAP-09A kolonlarının
üreticisi **değildir**; B06'nın ledger'ı bu kolonlara yazarsa OFFICE **ilk
CAP-09A producer'ı** olur ve D3 doğrudan ihlal edilir. Repo'da ayrıca
**alternatif bir emsal** vardır: `claim-item-lifecycle-contract.ts:225-258` ve
`collection-audit.ts:90-121`, aynı kavramları (`actorType`, `policyRef`,
`correlationId`) **birinci-sınıf kolon yerine `metadata` JSON'ına** yazar; P7-B01
bunu açıkça *"birinci-sınıf üretici SAYILMAZ"* olarak sınıflandırır.

```text
DİSPOZİSYON: Contract şerhi GEREKLİDİR. Owner kararı olmadan B06 bu yönde
             TASARLANMAZ. Bu brief bir yol seçmez.
```

---

## 5. Açık sorular — owner'a doğrudan

> Bu bölüm **soru sorar, cevap vermez.** Hiçbiri bu brief tarafından
> çözülmemiştir.

**AÇIK SORU 1 — D-WR-7 (kaydın kendisi OPEN):**
Yüksek-etkili FINANCIAL işlemlerde `ALL` override gerekli midir?
Bu soru, D-WR-4'ün `actionCode` sınıflandırması kesinleşmeden cevaplanamaz —
"yüksek-etkili FINANCIAL"in hangi `actionCode` kümesi olduğu tanımsızdır.
*Bağlı alt-soru:* eğer `ALL` gerekiyorsa, DBIND §5'in `CLIENT_PAYOUT_POST` için
tanıdığı self-approval istisnası `ALL` altında **korunur mu, düşer mi**?

**AÇIK SORU 2 — D3 ↔ B06 gerilimi (§4):**
B06'nın decision-ledger'ı (a) CAP-09A birinci-sınıf kolonlarını mı dolduracak
(→ D3 ihlali, owner istisnası gerekir), (b) `metadata`-taşıyıcı deseni mi
kullanacak (→ D3 korunur, sorgulanabilirlik düşer), yoksa (c) OFFICE'e ait ayrı
bir ledger taşıyıcısı mı olacak (→ yeni model; **bu brief model icat etmedi**)?

**AÇIK SORU 3 — B09 migration contract eksikliği (§2.3):**
Cross-workstream migration contract yoktur. B09 (a) böyle bir contract'ın
üretilmesini mi bekleyecek, (b) WR01'e özel dar bir migration protokolü mü
tanımlanacak, yoksa (c) WR01 migration-suz mu tasarlanacak?

**~~AÇIK SORU 4~~ — ÇÖZÜLDÜ (soru değil, teyit kalemi):**
`"C2 PHASE B"` = `CLAUDE-C2` lane'inin `OFFICE-P5-SECURITY-R01` PHASE B teslimi;
`CLOSED / VERIFIED` (§2.2, yedi adımlı zincir). Owner'dan **karar** gerekmiyor;
yalnız bu eşlemenin kastedilen olduğu teyit edilebilir.

**AÇIK SORU 5 — `X4/P4 canonical closure` ön-koşulunun kapsamı (§2.1):**
Etiket iki ayrı kapanış kavramını birlikte anıyor ve repo bunlar için **ters
yönde** kanıt taşıyor: **fonksiyonel P4 write-path** kapanmış görünüyor
(`P4-6 DONE`, VER-26), **umbrella final closeout** ise kapanmamış (P8 FINAL X4'ü
bekliyor); **X4'ün kendisi** için repo'da kapanış/teslim kaydı hiç yok.
B06'nın ön-koşulu bunlardan hangisidir?
*(a)* fonksiyonel write-path yeterli mi — bu okumada ön-koşul **karşılanmıştır**;
*(b)* umbrella final closeout mu gerekiyor — bu okumada B06 gerçekten bekler;
*(c)* X4 için ayrı bir tanım/lane sayfası mı üretilmeli?

**AÇIK SORU 6 — `PermissionGrant`'ın canlı tüketicileri (§3.7):**
Tablo üç bounded-context tarafından okunuyor ve `revokedAt` alanı yok. WR01
delegasyonu (a) bu tabloyu mu genişletecek (→ üç context'e yayılma riski),
yoksa (b) kendi delegasyon taşıyıcısını mı kullanacak?

---

## 6. Önerilen execution sırası — **TAVSİYE** (owner GO'suz bağlayıcı DEĞİL)

> Aşağıdaki sıra bağımlılık grafiğinden türetilmiş bir **öneridir**. Owner GO'su
> olmadan hiçbir blok açılamaz — ama bu, WR01'in *bütününün* bloklu olduğu
> anlamına gelmez: `C2 PHASE B` ön-koşulu **karşılanmıştır** (§2.2) ve açık
> kalan belirsizlikler (§2.1, §2.3) yalnız **B06 ve B09**'a dokunur.

**Salt analiz / docs-only contract çalışması otomatik bloklanmaz.** §2.1 ve
§2.3'teki `UNVERIFIED` / `BLOCKED_DEPENDENCY` kalemleri **ürün
implementasyonuna** ilişkindir. B01 gibi kod-üretmeyen, yalnız tip/sözleşme ve
`actionCode` sınıflandırması üreten bir blok bu belirsizliklerden **etkilenmez**;
tersine, onları cevaplanabilir hâle getirir.

```text
KADEME 1  B01  contract + taxonomy
  Gerekçe: D-WR-3 sözlüğü, D-WR-4 sınıflandırması ve B03'ün sıfır-emsal
  belirsizliği (§3.8) yalnız burada kapanır. B02/B03/B05/B06 hepsi bunun
  çıktısını tüketir. Emsal: FD eligibility'nin "saf, IO-suz, tek kaynak"
  deseni (§3.5).
  NOT: D-WR-4 envanteri B01 içinde kesinleşir; kesinleşmeden D-WR-7
       (Açık Soru 1) cevaplanamaz.

KADEME 2  B02  effective-dated pools      (B01'e bağlı)
          B07  notification + digest      (B01'e bağlı; Grup 1 emsali hazır)
  Bu ikisi birbirinden bağımsızdır.

KADEME 3  B03  round-robin + single-assignee   (B01 + B02'ye bağlı)
  En yüksek risk; sıfır emsal.

KADEME 4  B04  reassignment/absence/audit  (B03'e bağlı)
          B05  first-review                (B01'e bağlı; B03'ten bağımsız)

KADEME 5  B06  approval-orchestration + ledger
  Ön-koşul UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED (§2.1 — Açık Soru 5).
  Bağımsız olarak Açık Soru 2 (D3 gerilimi) ve Açık Soru 1 (D-WR-7) çözülmeden
  tasarlanamaz; yani §2.1 netleşse bile B06 owner kapısında bekler.

KADEME 6  B08  UI-API admin                (B02+B03+B06'ya bağlı)

KADEME 7  B09  migration + runtime verify
  ŞU ANDA BLOCKED_DEPENDENCY (§2.3) — Açık Soru 3.

KADEME 8  B10  governance closure          (hepsine bağlı)
```

**Sıra dışı gözlem (TAVSİYE):** açık kalan iki belirsizlik yalnız B06 ve B09'a
dokunduğundan, owner **B01**'i bunları beklemeden açabilir. B01 salt tasarım
üretir (tip/sözleşme + `actionCode` sınıflandırması), kod davranışı değiştirmez
ve programın en büyük belirsizliğini — D-WR-4 envanteri, B03 contract'ı (sıfır
emsal, §3.8) ve `ALL/QUORUM/SEQUENTIAL` taşıyıcı şekli — tek bir blokta
kapatır. Bu, D-WR-7 (Açık Soru 1) ve D3↔B06 gerilimini (Açık Soru 2) **ancak o
zaman** cevaplanabilir hâle getirir.

---

## 7. Preflight kanıt kaydı

| Kontrol | Sonuç |
|---|---|
| `git fetch origin main` → SHA | `f5ccdb0bfa95ee0f5e0a86b1a926a261d3a50595` (2026-08-16 13:00:21 +0300) VERIFIED |
| `decision-log.md:539` WR01 kaydı | `DECISION_RATIFIED / DECOMPOSITION_REQUIRED` — **değişmemiş** VERIFIED |
| §3'teki 9 emsal dosya yolu | **9/9 mevcut**, aynı yol, aynı amaç VERIFIED (§3 tablosu) |
| X4/P4 canonical closure | **`UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED`** — fonksiyonel write-path kapanmış, umbrella final closeout kapanmamış, X4'ün kendisi ölçülemiyor (§2.1) |
| C2 PHASE B CLOSED | **KARŞILANDI / VERIFIED** — `CLAUDE-C2` lane · `OFFICE-P5-SECURITY-R01` PHASE B · PR `#2368` · squash `4e228cb2` · ancestry `ANCESTOR_OF_MAIN` · program `CLOSED / VERIFIED` (§2.2) |
| Cross-workstream migration contract | **YOK** → B09 `BLOCKED_DEPENDENCY` (§2.3) |
| Rakip PR — başlık/body | `gh pr list --search "OFFICE-WR01 in:title,body" --state open` → `[]` |
| Rakip PR — mekanik dosya taraması | `gh pr list --state open --json number,files` + `office-p4-authz-r01\|OFFICE-WR01\|office-approval` testi → **0**. Repository'de **hiç açık PR yok** (gh auth VERIFIED, merged PR listesi ile sanity-check yapıldı) |

### 7.1 Klasör yolu tercihi (gerekçe)

Görev talimatı `office-p4-authz-r01/` altını veya *"mevcut OFFICE governance
klasör konvansiyonuna uyan bir yol"*u serbest bırakmıştı. Bu doküman
`office-wr01-decomposition-r01/` altına yerleştirildi. Gerekçe:

1. **Konvansiyon uyumu (VERIFIED):** mevcut OFFICE lane kanıt klasörleri
   `office-p4-authz-r01/`, `office-p5-security-r01/`, `office-p6-runtime-truth-r01/`,
   `office-p7-dormant-r01/`, `office-spring-cleaning-reconciliation-r01/`
   biçimindedir — **lane başına bir klasör**.
2. **Semantik ayrım:** WR01, `decision-log.md:539` ve manifest §13.5 uyarınca
   ayrı bir **PRODUCT EXTENSION** dalıdır; `OFFICE-P4-AUTHORIZATION-COMPLETION-R01`
   programının parçası **değildir**. P4 klasörüne konması yanlış-dosyalama olurdu.
3. **Eşzamanlılık riski:** `office-p4-authz-r01/` **aktif** bir lane'dir (F04 ve
   F07 semantic authority kayıtları `issuedAt : 2026-08-16`). Analiz-amaçlı bir
   doküman o klasöre girerse başka bir ajanın yürüyen exact-scope binding'iyle
   çakışma riski doğar.

---

## 8. Terminal disposition

```text
STATÜ                DRAFT / PENDING_OWNER_SOURCE_VERIFICATION
ÜRETİLEN KARAR       YOK
RATIFIYE EDİLEN      YOK — hiçbir D-WR kaydı yeniden ratifiye edilmedi
SEÇİLEN SIRA         YOK — §6 yalnız TAVSİYEDİR
YARATILAN MODEL      YOK — hiçbir Prisma modeli / migration / entity icat edilmedi
ÇÖZÜLEN GERİLİM      YOK — D-WR-7 ve D3↔B06 açık bırakıldı
PROGRAM ÖN-KOŞULU    C2 PHASE B = KARŞILANDI / VERIFIED (§2.2) — WR01 bütünü
                     bloklu DEĞİL
B06 ÖN-KOŞULU        UNVERIFIED / OWNER_SCOPE_CONFIRMATION_REQUIRED (§2.1)
B09 ÖN-KOŞULU        BLOCKED_DEPENDENCY — cross-workstream migration contract
                     YOK (§2.3)
DİĞER BLOKLAR        Ön-koşul engeli saptanmadı; owner GO'suna tabi
SONRAKİ ADIM         PAGE-O0 — owner §0 kaynak doğrulaması + §5 açık soruları
                     (Soru 4 çözüldü; Soru 1/2/3/5/6 açık)
```
