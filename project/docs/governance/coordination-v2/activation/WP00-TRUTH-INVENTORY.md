# WP00 — Fresh Truth Inventory

<!-- GOV-COORD-AUTHORITY kind=ACTIVATION_INVENTORY recordId=OPA-WP00-TRUTH-INVENTORY-R01 -->

```text
Program        : ORCHESTRA-PRODUCTION-ACTIVATION-R01
Parent grant   : OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01
Work package   : WP00
Baseline       : bfcea811114dd339e6460882321aad0fd216106b
Concurrency    : 1 (serial)
```

Bu belge rapor değildir; sonraki iş paketlerinin **bağımlılık haritasıdır**.
Her satır repository'den ölçülmüştür, hatırlanmamıştır.

## 1. Pilot kusurlarının gerçek zincirde olduğu kanıtı

WP00 bunları "test double üzerinde düzeltilmiş olabilir" şüphesiyle yeniden
doğrulamayı şart koşuyor. Sekiz düzeltmenin sekizi de **gerçek çalışma
yolundadır**, test dosyalarında değil:

```text
#1657 resume yolu          orchestrator.cjs   ctx.resumeFromBlocked !== true
#1658 lane yazma izni      run-task.cjs       workspace-write · acceptEdits
#1658 bos diff kapisi      orchestrator.cjs   NO_CHANGES_PRODUCED
#1659 publish commit       gh-pr-provider.cjs runGit(['add','-A'])
#1659 gercek changeCount   gh-pr-provider.cjs verdict.changeCount
#1661 CI bekleme dongusu   orchestrator.cjs   ciWaitMs
#1663 missing grace        orchestrator.cjs   ciMissingGraceMs · settlingMissing
#1665 provider boolean     gh-pr-provider.cjs open: parsed.state === 'OPEN'
```

Ayrıca canlı kanıt: OFFICE koşusu bu sekizi de içeren main üzerinde
`MERGE_READY`'ye ulaştı (`PR #1666` → `c9e6da47`). Yani zincir yalnız kodda
değil, çalışırken de doğrulanmıştır.

## 2. Mevcut yetenekler

```text
grant modeli                authority.cjs        validateAgainstGrant
plan/hash ratification      authority.cjs        specDigests
task state machine          state.cjs            20 durum, ALLOWED gecis tablosu
executor secimi             resolve.cjs          scanPath · spawn-mode
worktree lifecycle          worktree.cjs         createIsolated · listWorktrees
CI polling                  orchestrator.cjs     ciWaitMs · ciMissingGraceMs
boundary dogrulama          boundary.cjs         validate · IMMUTABLE_FORBIDDEN
audit log                   state.cjs            append-only jsonl
base drift                  orchestrator.cjs     BLOCKED_BASE_SHA_DRIFT
provider evidence           mergeready.cjs       resultSetSha256
```

## 3. Operasyonel servis için EKSİK olanlar

Bunlar WP01–WP06'nın kapsamıdır. Her biri ölçülmüştür.

```text
EKSIK  kalici gorev kuyrugu        run-task.cjs tek gorev alir, kuyruk yok
EKSIK  idempotency key             ayni gorev iki kez enqueue edilebilir
EKSIK  service start/stop/status   surekli calisan bir surec yok
EKSIK  kill switch (calisma ani)   killSwitch kodu hicbir yerde yok
EKSIK  crash sonrasi lease devri   stale lease takeover yok
EKSIK  orkestrator ici plan review bagimsiz review elle yapiliyor
EKSIK  auto-merge                  performMerge halen MERGE_NOT_PERMITTED firlatiyor
KISMI  restart sonrasi devam       yalniz BLOCKED durumundan (--resume-blocked)
```

## 4. İki ağır bulgu

### 4a. `revocationPath` hiç okunmuyor

`grant.schema.json` `revocationPath`'i **zorunlu** alan yapar ve grant'lar onu
taşır. Ama repository genelinde o dosyanın varlığını kontrol eden **hiçbir kod
yoktur**:

```text
grant alani                VAR   grant.R02.json · revocationPath
dosya varlik kontrolu      YOK   existsSync(revocationPath) hicbir yerde
```

Sonuç: bir grant'ı iptal etmek için `REVOKED` dosyası oluşturmak **hiçbir şey
yapmaz**. `validateAgainstGrant` yalnız `ctx.grantRevoked === true` bayrağını
okur ve o bayrağı canlı yolda kimse doldurmaz.

Bu, standing grant modeli kurulmadan **önce** kapatılmalıdır: kalıcı yetkinin
iptal edilememesi, kalıcı yetkiden daha tehlikelidir.

### 4b. Attestation'ın üç terimi sabit `true`

`MERGE_READY` conjunction'ı 15 terim içerir ve "15/15 true" diye raporlanır.
Üçü ölçülmez:

```text
taskSpecHashMatchesGrant    SABIT true   (validateAgainstGrant'ta ayrica dogrulanir — redundant)
requiredInvariantsPass      SABIT true   HIC OLCULMEZ
worktreeStateValid          SABIT true   HIC OLCULMEZ
```

`requiredInvariantsPass` ve `worktreeStateValid` bugün hiçbir şey ifade etmiyor.
Attestation'ın kanıt değeri bu üç terim kadar zayıftır.

## 5. Eligibility authority — otoriter kaynak YOK

```text
programs.manifest.json    "authority": "DERIVED / NON-AUTHORITATIVE"
                          alti programin altisi da liveExecutionEligibility: DENIED
generator                 YOK — manifest neyden turetiliyor belirsiz
otoriter kaynak           TESPIT EDILEMEDI
```

Manifest kendini türetilmiş ilan ediyor ama **neyden türetildiği tanımlı
değil**. WP07/WP08 bir programı `ELIGIBLE` yapmadan önce otoriter kaynağın
kendisi tanımlanmalıdır; manifest'i elle düzenlemek sahte eligibility üretir ve
direktif bunu açıkça yasaklıyor.

## 6. Bağımlılık haritası

```text
WP01  residual correctness
        girdi : §4a revocationPath · §4b uc sabit terim · orphan worktree · enum
        cikti : olculebilir revocation · gercek invariant/worktree kontrolu
        bagimli: WP02 (revocation olmadan standing grant kurulamaz)

WP02  program authorization envelope + standing grant
        girdi : WP01 revocation · mevcut task-scoped grant modeli
        cikti : parent envelope · iki standing grant · deterministic validator
        bagimli: WP03 (kuyruk child plan'i envelope'a baglar)

WP03  durable queue + task state machine
        girdi : WP02 envelope · mevcut state.cjs
        cikti : kalici kuyruk · idempotency · 20 durum genisletmesi
        bagimli: WP04, WP05

WP04  recovery + idempotency
        girdi : WP03 kuyruk · mevcut lease
        cikti : crash/restart devami · duplicate koruma · stale lease devri

WP05  CI + merge controller + cleanup
        girdi : WP03/WP04 · mevcut performMerge (firlatan)
        cikti : bounded auto-merge · exact head SHA baglama · orphan recovery
        NOT   : performMerge bilerek firlatiyor; auto-merge owner tarafindan
                bu programda ACIKCA yetkilendirildi (direktif §5)

WP06  observability + audit + kill switch + service lifecycle
        girdi : WP03–WP05
        cikti : start/stop/status/health · kill switch · restart recovery

WP07  OFFICE live activation      girdi: WP02 + WP06 · otoriter eligibility kaynagi
WP08  COLLECTION live activation  girdi: WP07 kanitli kapanis
WP09  MECHANICAL_GOVERNANCE       girdi: WP02 (dar profil allowlist'i)
WP10  operasyonel kabul           girdi: WP01–WP09 · 25 kabul kriteri
```

## 7. WP00 dispozisyonu

```text
WP00  SATISFIED
      alti pilot kusuru gercek zincirde dogrulandi
      dokuz eksik yetenek olculdu ve sonraki paketlere baglandi
      iki agir bulgu (revocation · sabit conjunction terimleri) WP01'e verildi
      eligibility otoriter kaynagi eksikligi WP07'ye verildi
```

---

**IMPLEMENTATION AUTHORITY:** `OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01`
altında, yalnız bu programın sıralı iş paketleri için. Bu belge yeni bir
program, task veya runtime yetkisi üretmez.
