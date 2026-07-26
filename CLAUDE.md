# HUKUK_YAZILIMI Agent Standard

## 1. Purpose

`AGENTS.md` bu repodaki tum ajanlar icin repository-level zorunlu baseline'dir. `CLAUDE.md` Claude'a ozgu operasyonel supplement'tir; `AGENTS.md` ile celisemez veya onu override edemez. Bir kural celiskisi tespit edilirse `AGENTS.md` esas alinir ve celisen supplement/governance kaydi duzeltilmek uzere raporlanir.

Her zaman Turkce konus ve Turkce yorum yap. Ana ilke: mevcut davranisi koru, tekrari azalt, niyeti tarif et. Guvenlik uzun yasak listeleriyle degil, kapsam ve beklenen davranisin netligiyle saglanir.

Governance kayitlari `project/docs/governance/` altindadir; roadmap, backlog, mimari karar ve surec kayitlari burada tutulur.

Her yeni görevde `project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md`
okunur. Claude, kullanıcıdan beş modülü tekrar yazmasını istemeden task/path/governance
kanıtından `WORKSPACE MODULE(S)` alanını sınıflandırır. Tek modül bulunursa ilgili canonical
governance'e; birden çok modül bulunursa `CROSS_MODULE` olarak ilgili tüm governance
kaynaklarına gider. UYAP veya shared control-plane işi altıncı hukuk modülü varsayılmaz.
Sınıflandırma kanıtla yapılamıyorsa `UNKNOWN / OWNER REVIEW` denir ve mutation başlamaz.
Bu routing semantic authority veya execution izni üretmez.

Repo-local uzmanlik skill'leri resmi Codex scan yuzeyi olan `.agents/skills/` altinda tanimlanir. `.codex/` Codex operasyonel config, hooks ve project-scoped custom agents yuzeyidir; mevcut owner/user WIP sayilir ve acik yetki olmadan degistirilmez.

Repository-wide AI ground-truth rule: Sohbet gecmisi yalniz niyet ve karar tasir; mevcut gercekler her gorevde repository state, git state, dosya icerigi, governance kayitlari, PR/CI durumu ve komut ciktilarindan yeniden dogrulanir. Claude oturum hafizasi veya onceki konusma, guncel branch/HEAD/dosya/PR/CI/governance durumu icin otorite degildir.

Buyuk veya uzun omurlu workstream'lerde Claude, ise baslamadan once Session Initialization ozeti uretir: Workspace Module(s), Repository State, Execution Context, Context Drift, Concurrent Activity ve Ready/Not Ready. Bu ozet onceki konusmayi degil, guncel repository gercegini esas alir.

## 2. Architecture Principles

Mevcut mimariye ve kesinlesmis Architecture Decision'lara uy. Yeni gorev bir karari bozuyorsa dur, etkiyi raporla ve kullanici karari iste.

Multitenant yapi varsa ona uy. Degisiklikten once multitenant davranis gerekip gerekmedigini ve nedenini belirt.

Bounded context / workstream scope buyutme. Yeni fikir once triage edilir: mevcut fazin parcasi mi, schema/migration veya mimari degisiklik gerektiriyor mu, Active Roadmap icinde mi? Degilse implement edilmez; Product Backlog maddesi onerilir.

Backlog akisi: `Yeni fikir -> Triage -> Product Backlog -> READY -> Active Roadmap -> Implementation`. Her faz sonunda Backlog Review yap; `BACKLOG -> READY` ve roadmap tasimalari kullanici onayi olmadan uygulanmaz.

## 3. Workflow

Her yeni goreve kisa calisma seviyesi onerisiyle basla:

```text
CALISMA SEVIYESI ONERISI
- Faster
- Normal
- High
- Ultra
Neden: ...
```

Faster: git/cleanup, salt okuma, "su nerede", kavramsal cevap. Normal: docs veya dusuk risk. High: backend/controller/service/repository davranisi. Ultra: migration, finans, multitenant etki, veri butunlugu, odeme/tahsilat/borc-alacak.

Slider/Ultracode kullanicinin oturum ayaridir; ajan degistirmez ve kullanicidan kademe degistirmesini istemez. Basit islerde solo calis; esasli islerde derin analiz yap ve seviyeyi oner.

Gorev yetkileri:

- `UNKNOWN / AMBIGUOUS`: read-only kalir; mutation yoktur.
- `GO-ANALYZE`: explicit read-only analizdir; `ANALYZE → REPORT → STOP`. Dosya degisikligi, commit, PR veya merge yoktur.
- `GO-IMPLEMENT`: `ANALYZE → IMPLEMENT → VERIFY → REPORT → STOP`; local patch ve validation ile sinirlidir. Commit/push/PR/merge yalniz task brief ayrica kapsiyorsa yapilir.
- `GO-COMPLETE — ANALYZE-FIRST CONDITIONAL EXECUTION`: implementation-eligible gorevler icin tercih edilen tam modeldir. Analiz ayri teslim veya zorunlu owner turu degildir: `ANALYZE → IF IMPLEMENT → IMPLEMENT → VERIFY → COMMIT → PUSH → PR → CI → IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → CLEANUP → FINAL VERIFICATION → CLOSE`.

`IF IMPLEMENT`, root cause + bounded objective + canonical uyum + minimum guvenli patch/validation + no owner-WIP/competing-writer + no task-disi production/destructive islem kosullarinin tamamina baglidir. `IF GO-COMPLETE`, validation/required CI PASS + exact authorized scope + CLEAN/MERGEABLE + no semantic/merge/writer conflict kosullarinin tamamina baglidir. Ex-ante `IF GO-COMPLETE` owner yetkisi merge icin yeterlidir; CI sonrasinda ikinci owner mesaji istenmez. Bu GitHub standing auto-merge, scheduler veya reusable merge grant'i degildir.

Owner karari yalniz `AGENTS.md`'deki gercek semantic/architecture/production/data/destructive/scope/conflict/risk gate'lerinde istenir. Ayni root cause ve bounded context icindeki supporting dosya/test/fixture/mock/validation duzeltmesi scope expansion degildir. Ilgisiz finding immediate security/data-loss/corruption riski yoksa evidence ile backlog adayi olarak ayrilir; mevcut task'e eklenmez ve task'i durdurmaz.

Repository root sabit bir Windows path'inden varsayilmaz; her oturumda guncel Git/repository state ile dogrulanir. Bagimsiz ikinci clone veya root belirsizligi tespit edilirse kodlamadan once dur ve raporla.

Implementation default: canonical project root icinde implementasyon yapilmaz. Her `GO-IMPLEMENT`, `GO-HOTFIX` veya `GO-COMPLETE` dosya degisikliginden once current directory ve branch dogrulanir. Ajan canonical root icindeyse dosya editini, PR branch olusturmayi ve commit'i durdurur; `origin/main` tabanli fresh isolated worktree olusturur ve yalniz o worktree icinde calisir.

Her implementasyon ayri branch ve ayri worktree ile, dogrulanmis repository root'un git agindan ve `origin/main` bazindan acilir. Canonical working tree yalniz read-only dogrulama, `main` senkronu, register verification ve final dogrulama icindir; kirliyse kullanici WIP'i say, dokunma, yine yeni worktree ac.

```text
git fetch origin
git worktree add ../HUKUK_<konu> origin/main -b codex/<konu>
cd ../HUKUK_<konu>
```

## 4. Verification

Kod veya davranis degisikliginden once etkiyi dogrula. Degistirecegin dosya, servis, controller veya metodu kimin nereden cagirdigini tespit et; metot degisiyorsa tum cagiranlari kontrol et.

On analiz ihtiyaca gore cagiran yerler, impact scope, multitenant etki, tablo iliskileri, schema/migration ihtimali, runtime, guvenlik ve mimari uyumu kapsar. Docs-only islerde tek tek "yok" listesi yazma; "documentation-only, davranis etkisi yok" yeterlidir.

Tablo uzerinde islem yapacaksan iliskili tablolari ve yan etkileri incele. Yeni gelistirmeden once mevcut uygulama var mi bak; kod tekrarindan kacin. Riskli UI/API dogrulamasindan once localhost servisinin hangi worktree'den calistigini kontrol et.

## 5. Development Rules

Acik execution authority olmadan kodlamaya gecme. `GO-COMPLETE — ANALYZE-FIRST` verilmis ve `IF IMPLEMENT` PASS ise ayrica analiz onayi istemeden ayni task icinde ilerle; ne yaptigini, nedenini ve beklenen etki alanini gorunur tut.

Dosya editinden once hard gate: current directory, current branch ve worktree izolasyonu dogrulanir. Canonical root icindeysen edit yapma; isolated worktree'e gecmeden implementation baslatma.

Yeni servis metodu veya controller action yazarken XML yorum ekle; mevcut metodu degistirirken listeyi kontrol edip guncelle:

```csharp
/// <remarks>
/// Cagrildigi yerler:
/// - {Controller/Servis}.{Metod}() -> {HTTP METHOD} {endpoint} ({aciklama})
/// - {Servis}.{Metod}() -> {aciklama}
/// </remarks>
```

Degisiklikleri mevcut modul sinirlari ve yerel pattern'ler icinde tut. Yeni abstraction yalniz gercek karmasayi azaltirsa veya mevcut mimariyle uyumluysa eklenir.

## 6. Testing

Test seviyesi riskle orantili secilir. Docs-only degisikliklerde diff, kapsam ve uzunluk kontrolu yeterlidir. Kod veya davranis degisikliginde ilgili unit/integration/e2e veya smoke validation calistirilir.

`GO-IMPLEMENT` task brief'i commit/PR/merge kapsamiyorsa validation sonucu raporlanir ve durulur. `IF GO-COMPLETE` owner yetkisi varsa CI takip edilir: `IN_PROGRESS` ise yaklasik 60 saniyede bir, en fazla 20 dakika kontrol et; `SUCCESS` olursa merge ve cleanup zinciri devam eder; `FAIL` veya timeout olursa dur. CI bitmeden gelen `mergeStateStatus: BLOCKED` tek basina stop condition degildir; CI bitince yeniden kontrol edilir. CI sonrasi `mergeStateStatus` `CLEAN` degilse dur.

DB-gated integration test gerektiren gorevlerde production veya local development veritabanina karsi test kosulmaz. Guvenli sira:

```text
disposable Docker PostgreSQL container ayaga kaldir
migration bu container uzerinde calistir
integration test bu container uzerinde kos
PASS olmadan PR acma
test tamamlaninca container istege bagli silinebilir
```

## 7. Reporting

Raporlar kisa, karar odakli ve kapsama uygun olsun. Docs-only islerde tekrarlayan "schema yok/migration yok/runtime yok" boilerplate'i yazma.

Onay semantigi: `GO-ANALYZE` ve bounded `GO-IMPLEMENT` kendi tesliminde durur; yalniz yeni owner karari/authority gerekiyorsa `Onay Bekleniyor: YES` yazilir. Acik `IF GO-COMPLETE` owner yetkisiyle tamamlanan zincirde stop condition yoksa `NO`, varsa `YES`.

Kapanista is gerektiriyorsa su bilgileri ver: degisen dosyalar, ozet, kaldirilan veya yeniden ifade edilen kural gruplari, verification, kalan risk, sonraki adim. Backlog veya mimari karar yoksa sabit blok uretme.

## 8. Dangerous Operations

Stop condition olusursa dur ve raporla: CI failure, merge conflict, scope/mimari degisimi, beklenmeyen dosya, schema/migration degisimi, guvenlik riski, yeni backlog veya Active Roadmap ihtiyaci, kullanici karari gereksinimi, beklenmeyen teknik risk.

Kullaniciya ait WIP'e dokunma; bilinmeyen degisiklikleri revert etme, stash'leme, tasima veya temizleme. Ilgiliyse uyumlu calis, ilgisizse yok say.

Worktree cleanup fiziksel recursive silme ile yapilmaz: `rm -rf`, `cmd rd /s /q`, PowerShell `Remove-Item -Recurse`, `.NET Directory.Delete(path, true)` kullanma. Isolated worktree yalniz PR merge/final disposition sonrasi kaldirilir. Guvenli sira:

```text
node_modules junction/symlink audit
git worktree remove --force <yol>
git worktree prune
git fetch --prune
```

"Directory not empty" kalirsa `ORPHANED_WORKTREE_DIR` olarak birak. Branch silmeden once PR merge durumunu `gh` ile dogrula; squash merge icin git ancestry'ye guvenme. Cleanup sonrasi canonical integrity ve `.git/config` kontrol edilir.

## 9. Appendix

```text
Preserve behavior.
Reduce duplication.
Prefer principles over prohibition lists.
Use isolated worktrees for implementation.
Verify impact before editing.
Stop on real risk.
```

Runbook: `project/docs/runbooks/worktree-cleanup.md`.
