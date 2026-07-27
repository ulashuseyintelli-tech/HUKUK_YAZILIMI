# T5 LIVE_TWO_PROGRAM — Closure

<!-- GOV-COORD-AUTHORITY kind=PILOT_CLOSURE recordId=T5-LIVE-TWO-PROGRAM-CLOSURE-R01 -->

```text
Record ID  : T5-LIVE-TWO-PROGRAM-CLOSURE-R01
Contract   : GOV-COORD-V2 (RATIFIED WITH LIMITATION, 2026-07-26)
Pilot      : LIVE_TWO_PROGRAM (contract §10)
Date       : 2026-07-27
Result     : PASS
```

## Sonuç

```text
T5 LIVE_TWO_PROGRAM : PASS
```

İki program da gerçek executor'larla, izole worktree'lerde, ratifiye plan
hash'leri ve owner grant'ları altında çalıştırıldı; ikisinin de sonucu sınır
doğrulamasından, yerel required test'lerden ve tam CI'dan geçti; ikisi de owner
tarafından açık squash merge ile main'e alındı. Auto-merge her aşamada OFF.

## COLLECTION

```text
taskId          RCV-COL-W2.2D-1A-CHARACTERIZATION-R01
taskSpecSha256  f5c11d0b41be2d9895aa0d9769936950d0e8cbdcf2d5beed64f366293ece5318
grantId         T5-COLLECTION-EXECUTION-GRANT-R02
executor lane   CODEX_LOCAL  (codex-cli 0.144.5)
PR              #1660   head 9f1516b1370068a7c10a08bc3c94f51c4b07088a
CI              9/9 SUCCESS
merge           168daec75fe877f65b241b489eec92820167dc7e
degisen         1 dosya · +24 −2 · production 0 · schema/migration 0
```

Çivilenen davranış: Collection confirmation kararı `status` üzerinden verilir;
`confirmedAt` confirmation yetkisi üretmez; `status=CONFIRMED` + `confirmedAt=null`
yine COLLECTION payment üretir; `confirmedAt` kanonik effective-date alanına
dönüşmez.

**MERGE_READY üretilmedi.** Koşu `CI_PENDING`'de bloke oldu; sebebi o sırada
henüz kanonik olmayan bir kontrol düzlemi kusuruydu (CI beklemesi yoktu, PR #1661
ile düzeldi). Owner bu PR'ı §1 gerekçesiyle — gerçek diff, geçerli sınır, tam CI,
sonradan kanonikleşmiş düzeltme — ceremony için yeniden üretmeden merge etti.

```text
MERGE READINESS : OWNER DISPOSITION AFTER FULL CI
REEXECUTION     : NOT REQUIRED
```

## OFFICE

```text
taskId          OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01
taskSpecSha256  bbf1d6a2cfaf20363c7a7bb9077ec6654baeea5b7a860db18fd9c8d4aa4d3acd
grantId         T5-OFFICE-CAP02-EXECUTION-GRANT-R02
executor lane   CLAUDE_LOCAL  (Claude Code 2.1.220)
PR              #1666   head f60f898e6bb1955b1b79cd98cebf844705e386e0
CI              9/9 SUCCESS
merge           c9e6da47be756e2adb68311f80dbf4047b008e74
degisen         1 dosya · +354 −0 · production 0 · schema/migration 0
```

Tam terminal zincir üretildi:

```text
ELIGIBLE(resumed) -> CLAIMED -> WORKTREE_READY -> ENVIRONMENT_PREPARED
-> EXECUTOR_RUNNING -> VALIDATING -> PR_OPEN -> CI_PENDING -> MERGE_READY

executor exit        0 (NORMAL_EXIT, 295 sn) · orphanProcess false
boundary             withinBoundary=true · changeCount=1 · violations 0
requiredTests        5/5 status 0
attestation          conjunction 15/15 true · false olan YOK
```

`TESTING`, `PUBLISHING` ve `CI_SUCCESS` ayrı trace girdisi üretmez; sırasıyla
`VALIDATING`→`PR_OPEN` arası required-test koşusu, `PR_OPEN` içindeki
add/commit/push, ve CI poll döngüsünün `ci.pass` ile çıkışıdır. Semantik
aşamaların tamamı mevcuttur ve her biri yukarıdaki olgularla ölçülmüştür.

Çivilenen davranış — `listActive`: tenant scope, yalnız `validUntil=null`,
kapanmış ilişkiler dışlanır, projection kapalı ilişki detayı sızdırmaz.
`listEligible`: tenant scope, pasif ve cross-tenant kullanıcılar dışlanır, aktif
`StaffMember` veya `Lawyer` profili şartı, dar projection.

`profileType` **yalnız iki profil de aktifken** karakterize edildi
(`lawyer > staffMember`). Bilinen sapma — aktif StaffMember + pasif Lawyer'ın
`LAWYER` etiketlenmesi — teste **çivilenmedi**; owner kaydı sapan davranışın
sabitlenmesini yetkilendirmiyor. Production kodu değiştirilmedi.

## Kapatılan, merge EDİLMEYEN OFFICE denemeleri

İkisi de geçerli iş ürünüdür, başarısız implementasyon değildir. Terminal
attestation eksik olduğu için kapatıldılar; kanıtları PR yorumlarında saklıdır.

```text
#1662  head ca8364b97a0013e29f4da2dc69dde57eeffcf197
       +331 −0 · CI 9/9 · diff sha256 57bdbf67310caf41e724288bfc1df53e4933715d2a850bdd590c9d6f2ab1d05a
       blok: CI_PENDING — o an CI check'leri henuz kaydedilmemisti (PR #1663 duzeltti)

#1664  head dde1f390022a6deeb54dc53c3aab13da8a4d4e01
       +195 −0 · CI 9/9 · diff sha256 a91a7404c0f8a41bfe44a3238d71c5edd2a65e1b70f219cd92ce3541ec4724fe
       blok: MERGE_READY_CONJUNCTION_FAILED prOpen,prMergeable (PR #1665 duzeltti)

DISPOSITION: VALID BUT NOT MERGED — CLOSED FOR TERMINAL-ATTESTATION RE-RUN
             NOT A FAILED IMPLEMENTATION
```

## Pilotun asıl çıktısı — canlı koşunun bulduğu kusurlar

T5'in değeri iki testin yazılması değil, hiçbir birim testinin yakalayamadığı
**altı entegrasyon kusurunun** ortaya çıkması oldu. Her biri canlı kanıtla
bulundu, sınırlı biçimde düzeltildi ve regresyon testine bağlandı.

```text
#1657  BLOCKED -> ELIGIBLE owner resume yolu hic uygulanmamisti
       gecici bir ariza ratifiye plan hash'ini kalici olarak yakiyordu

#1658  iki executor lane'i de YAZMA IZINSIZ yapilandirilmisti
       codex 260 sn kosup sifir dosya degistiriyordu
       + bos diff push'tan once durdurulmuyordu
       + pilot fixture'lari hic gercek diff dogrulamamisti

#1659  executor'in isini hicbir sey COMMIT ETMIYORDU
       push bos branch uretiyor, PR "No commits between" ile dusuyordu
       + PR govdesi her zaman "changedFiles: 0" yaziyordu

#1661  CI bir kez gozleniyordu; "bitmedi" "gecmedi" sayiliyordu
       dogru bir deneme MERGE_READY'ye asla ulasamazdi

#1663  push'tan sonraki ilk saniyelerde her check absent'tir
       yokluk aninda fail-closed sayiliyordu

#1665  gh-pr-provider.state() string donduruyordu, orchestrator boolean okuyor
       prOpen ve prMergeable KALICI OLARAK false — MERGE_READY erisilemezdi
```

Ortak kök neden: her katman ayrı ayrı test edilmişti, **birleşim noktaları
edilmemişti**. Altısından beşi, sahte bir collaborator'ın gerçeğinden farklı
şekil döndürmesi ve yalnız sahtenin test edilmesiydi. `#1665` bu sınıfı bir
sözleşme testiyle sabitledi.

## Kapanış koşulları

```text
iki program calistirildi                    PASS
calisma aninda iki gecerli grant            PASS
iki izole worktree yasam dongusu            PASS
iki gercek sinirli diff                     PASS
yerel required test'ler                     PASS
required CI                                 PASS  (9/9 · 9/9)
manuel owner squash merge                   PASS
OFFICE tam MERGE_READY zinciri              PASS
cleanup                                     PASS
production degisikligi                      NONE
schema / migration                          NONE
auto-merge                                  OFF
```

## Artık risk

```text
ORPHANED_WORKTREE_DIR
  C:/HY_ORCH/OFFICE-CAP-02-REPORTINGLINE-READ-CHARACTERIZATION-R01-7a44cf57
  git worktree kaydi ve branch'i kaldirildi; fizikse dizin Windows MAX_PATH
  nedeniyle silinemedi. AGENTS.md geregi recursive silme kullanilmadi.

blockerCode enum
  NO_CHANGES_PRODUCED (#1658) ve BLOCKED_RESUME_NOT_AUTHORIZED (#1657)
  result.schema.json'daki 15 degerlik enum'un DISINDA. Calisma zamaninda sema
  dogrulamasi olmadigi icin calisiyorlar; owner amendment adayi.

competingWriter / baseDriftSatisfied
  gh-pr-provider bu ikisini gozleyemiyor; conjunction onlari `!== true` /
  `!== false` ile okudugu icin sessizce gecerli sayiyor. Raporlanmis bosluk.
```

---

**IMPLEMENTATION AUTHORITY: NONE.** Bu kayıt T5 pilotunun sonucunu tescil eder;
yeni bir task, grant, program veya runtime yetkisi üretmez. GOV-COORD-V2'nin
`MECHANICAL_GOVERNANCE` profili `NON-ELIGIBLE` olarak kalır.
