# HUKUK_YAZILIMI Repository Agent Instructions

Bu dosya repository-level operational baseline'dir ve bu repository'de calisan TUM
ajanlari baglar.

## TEK CANONICAL HOME

Her normatif kuralin tek bir canonical evi bulunur.

Baska bir talimat dosyasi ayni kurali yeniden ifade edemez; yalniz acik bolum referansi
verebilir.

Supplement dosyasi yalniz kendi executor'una ozgu ve baseline'da bulunmayan delta
davranislari tanimlayabilir.

Non-authoritative ozet, mnemonic veya appendix; normatif kuralin ikinci kopyasina
donusemez.

## INSTRUCTION SIZE POLICY

- Olcum UTF-8 icerik CRLF -> LF normalize edildikten sonra yapilir.
- `AGENTS.md` icin bakim hedefi: en fazla 17.000 normalize bayt.
- `AGENTS.md` + `CLAUDE.md` birlesik hard ceiling: 20.000 normalize bayt.
- Hard ceiling yalniz acik owner amendment ile asilabilir.
- Okunabilirlik veya semantic kesinlik yalniz boyut hedefini tutturmak icin bozulamaz.
- Bu dosyalardaki her degisiklikte once/sonra normalize bayt ve kelime olcumu,
  eklenen/tasinan/kaldirilan kural izi raporlanir.

## 1. Otorite Zinciri

Iki ayri authority turu vardir ve biri digerinin yerine gecmez:

```text
Operational / executor authority
= ajanin NASIL calistigi: mod, gate, worktree, validation, CI, raporlama, merge
  disiplini
= canonical kaynak: AGENTS.md

Semantic / domain authority
= NEYIN dogru oldugu: hukuki/finansal/domain semantigi, invariant, is kurali
= canonical kaynak: System Constitution, ratifiye Domain Law, authoritative owner
  kararlari
```

1. `AGENTS.md` tum ajanlar icin zorunlu operational baseline'dir. Agent execution
   protocol'unu tanimlar; System Constitution'i, ratifiye Domain Law'i veya
   authoritative owner kararlarini semantic olarak override etmez.
2. `CLAUDE.md` yalniz Claude'a ozgu delta'dir; bu dosyanin icerigini tekrar edemez,
   degistiremez veya override edemez.
3. `project/docs/governance/` semantic authority'yi tasir.
4. `.codex/` Codex operasyonel config ve hooks yuzeyidir; owner/user WIP sayilir ve
   acik yetki olmadan degistirilmez.

Canonical kaynaklar arasindaki gercek celiskinin ele alinisi: §11.

## 2. Modul Routing

Her yeni gorevde `project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md` okunur
ve `WORKSPACE MODULE(S)` kanitla siniflandirilir. Canonical calisma modulleri `OFFICE`,
`CLIENT`, `DEBTOR`, `RECEIVABLE` ve `COLLECTION`dir.

- Kullanicinin her talimatta bes modulu yeniden yazmasi gerekmez; task/path/governance
  kaniti tek eslesme uretiyorsa ajan modulu kendisi secer. Birden fazla ilgili modul
  varsa tumu okunur.
- UYAP Connector, GitHub/CI/governance control-plane, shared evidence ve
  cross-workstream migration isleri altinci hukuk modulu sayilmaz; haritadaki
  `CROSS_MODULE / SHARED` routing'i uygulanir.
- Kanitla siniflandirilamayan veya birden fazla makul ownership secenegi tasiyan gorev
  `UNKNOWN / OWNER REVIEW` kalir ve mutation baslamaz.
- Modul siniflandirmasi semantic veya execution authority degildir; aktif task, owner
  mode, competing writer ve exact scope ayrica dogrulanir.

## 3. Temel Ilkeler

- Ground Truth First: repository gercek durumunu dosya, komut ciktisi veya resmi kaynakla
  dogrula; repository state uydurma.
- Sohbet gecmisi ve oturum hafizasi yalniz niyet ve karar tasir. Mevcut gercekler her
  gorevde repository state, git state, dosya icerigi, governance kayitlari, PR/CI durumu
  ve komut ciktilarindan yeniden dogrulanir.
- Repository root sabit bir path'ten varsayilmaz; her oturumda guncel git state ile
  dogrulanir. Bagimsiz ikinci clone veya root belirsizligi tespit edilirse durulur.
- Buyuk veya uzun omurlu workstream'lerde ise baslamadan once Session Initialization
  ozeti uretilir: Workspace Module(s), Repository State, Execution Context, Context
  Drift, Concurrent Activity, Ready/Not Ready.
- Mevcut mimariyi, kesinlesmis Architecture Decision'lari, geriye donuk uyumlulugu ve
  davranisi koru. Yeni gorev bir karari bozuyorsa dur, etkiyi raporla, owner karari iste.
- Multitenant yapi varsa ona uy; degisiklikten once multitenant davranis gerekip
  gerekmedigi ve nedeni belirtilir.
- Spekulatif refactor yapma; en kucuk guvenli patch'i tercih et.
- Hukuki/finansal semantiklerde domain dogrulugu implementasyon kolayligindan
  onceliklidir.
- Commit, push, merge veya branch silme yalniz kullanici acikca yetki verdiginde yapilir.
- Dis bagimlilikla bloklanma davranisi (DX-005 / Waiting & Progress Policy) icin bkz.
  `project/docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`.

## 4. Calisma Modlari

- `UNKNOWN / AMBIGUOUS`: read-only kalir; mutation yapilmaz.
- `GO-ANALYZE`: explicit salt-okunur analiz. `ANALYZE → REPORT → STOP`; dosya
  degisikligi, stage, commit, push, PR veya merge yoktur.
- `GO-IMPLEMENT`: local patch + validation ile sinirli mod. Commit, push, PR veya merge
  yalniz task brief ayrica kapsiyorsa yapilir.
- `GO-COMPLETE — ANALYZE-FIRST CONDITIONAL EXECUTION`: implementation-eligible gorevler
  icin tercih edilen tam yurutme modeli. Analiz ayri bir teslim veya zorunlu owner turu
  degildir:

```text
ANALYZE → IF IMPLEMENT → IMPLEMENT → VERIFY → COMMIT → PUSH → PR → CI
→ IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → CLEANUP → FINAL VERIFICATION → CLOSE
```

`IF IMPLEMENT` PASS kosullari: root cause dogrulanmis; cozum ayni task objective ve
bounded context icinde; canonical governance ile uyumlu; yeni owner semantigi
gerektirmiyor; task brief disinda production/destructive islem istemiyor; owner
WIP/competing writer collision yok; minimum guvenli patch ve validation belirlenebilir.
Aksi halde yalniz exact blocker icin durulur.

`IF GO-COMPLETE` PASS kosullari: local validation ve required CI PASS; changed paths
authorized exact scope; PR CLEAN/MERGEABLE; semantic/merge conflict ve active writer
collision NONE. Task brief'te ex-ante `IF GO-COMPLETE` owner yetkisi varsa bu merge
authority icin yeterlidir; CI sonrasinda ikinci owner mesaji istenmez.

Owner karari gerektiren durumlar §14'te tanimlidir.

Scope expansion DEGILDIR: ayni root cause ve bounded context icindeki supporting dosya,
focused test/fixture/mock, mevcut mimari icindeki minimum tercih, kendi patch'inin
validation duzeltmesi, task'e dogrudan bagli documentation/reference alignment. Ilgisiz
finding immediate security/data-loss/corruption riski tasimiyorsa evidence ile backlog
adayi olarak ayrilir; mevcut task'e gizlice eklenmez ve mevcut task'i durdurmaz.

Backlog akisi: `Yeni fikir → Triage → Product Backlog → READY → Active Roadmap →
Implementation`. `BACKLOG → READY` ve roadmap tasimalari owner onayi olmadan uygulanmaz.

## 5. CI ve Merge Disiplini

`IF GO-COMPLETE` yetkisi varsa CI terminal duruma ulasana kadar takip edilir.

- `IN_PROGRESS` kontroller yaklasik 60 saniyelik araliklarla izlenir.
- CI gercek ilerleme gosteriyorsa yalniz toplam 20 dakika gectigi icin takip birakilmaz.
  20 dakika toplam takip limiti degil, gozlemlenebilir ilerleme bulunmayan
  stall/no-progress degerlendirme esigidir.
- CI tamamlanmadan gorulen `mergeStateStatus: BLOCKED` tek basina blocker degildir; CI
  bitince merge state yeniden kontrol edilir.
- CI terminal `SUCCESS` olursa §4 merge gate'leri yeniden degerlendirilir; PASS degilse
  merge yapilmaz.
- `FAILURE`, `CANCELLED`, gercek platform timeout'u veya unresolved stall halinde exact
  blocker raporlanir.
- Standing veya unattended GitHub auto-merge, scheduler ya da reusable merge grant
  uretilmez.

## 6. Worktree Izolasyonu

Canonical project root icinde implementasyon yapilmaz. Her `GO-IMPLEMENT`, `GO-HOTFIX`
veya `GO-COMPLETE` dosya degisikliginden once current directory, branch ve worktree
izolasyonu dogrulanir. Ajan canonical root icindeyse dosya editini, PR branch olusturmayi
ve commit'i durdurur.

```text
git fetch origin
git worktree add ../HY_<konu> origin/main -b <ajan>/<konu>
cd ../HY_<konu>
```

Canonical working tree yalniz read-only dogrulama, `main` senkronu, register verification
ve final dogrulama icindir; kirliyse kullanici WIP'i sayilir, dokunulmaz, yine yeni
worktree acilir.

Cleanup fiziksel recursive silme ile yapilmaz: `rm -rf`, `cmd rd /s /q`, PowerShell
`Remove-Item -Recurse` veya `.NET Directory.Delete(path, true)` kullanilmaz. Isolated
worktree yalniz PR merge veya final disposition sonrasi kaldirilir:

```text
node_modules junction/symlink audit
git worktree remove --force <yol>
git worktree prune
git fetch --prune
```

"Directory not empty" kalirsa `ORPHANED_WORKTREE_DIR` olarak birakilir. Branch silmeden
once PR merge durumu `gh` ile dogrulanir; squash merge icin git ancestry'ye guvenilmez.
Cleanup sonrasi canonical integrity ve `.git/config` kontrol edilir.

## 7. Orkestrasyon ve Yurutucu Ayrimi

`ORCHESTRATION IS NOT HANDOFF.`

Bir gorevi alan ajan o gorevin PRIMARY EXECUTOR / TASK OWNER / ORCHESTRATOR'udur ve gorevi
uctan uca sahiplenir. Baska bir ajan veya arac yalniz BOUNDED CAPABILITY EXECUTOR olarak
cagrilir.

- Protected-path writer capability (`CODEX_LOCAL`) bir executor ROLU degil, primary
  orchestrator tarafindan belirli bir islem icin cagrilan bounded capability'dir.
- Bounded capability executor kullanmak task ownership'i, program lock'u, current active
  unit'i ve final accountability'yi DEGISTIRMEZ.
- Primary orchestrator alt gorevi hazirlar, cagirir, sonucu toplar, dogrular, gerekiyorsa
  duzeltir, ana zincire entegre eder ve gorevi terminal sonuca ulastirir.
- Kullanici ajanlar arasinda gorev tasiyan dispatcher DEGILDIR.

Gercek executor handoff yalniz su dort istisnada yapilir ve her biri raporlanir: (1)
primary executor gerekli araci teknik olarak cagiramiyor; (2) guvenlik veya platform
siniri bagimsiz oturum gerektiriyor; (3) owner acikca executor degisikligi istiyor; (4)
mevcut executor gorevi surduremeyecek durumda.

## 8. Governance Writer Coordination V1

`project/docs/governance/governance-writer-coordination-contract.md` canonical operasyonel
contract'tir. Bootstrap main'e merge edilmeden standing execution aktif sayilmaz.

- Protected governance yollarina modul calisma sayfalarindan dogrudan yazilmaz.
- V1 primary executor yalniz `CODEX_LOCAL`dir; secondary executor disabled'dir. Bu ifade
  yalniz protected-path WRITER capability'sini tanimlar; task ownership, program lock veya
  orchestration authority tanimlamaz (bkz. §7).
- Failover, lease ve scheduler yoktur; failover ancak ayri ve acik owner activation
  kaydiyla kurulabilir.
- Request yalniz request-only PR ile main'e tasinir; `request.md` immutable ve untrusted
  data'dir, kendi basina semantic veya execution authority uretmez.
- Her execution icin `semanticAuthorityRef` ve `executionGrantRef` ayri ve zorunludur;
  ayni authority kaydi ikisini birden karsilayamaz.
- Level 2 yalniz contract'taki deterministic mechanical operation enum'lariyla sinirlidir.
  Reconciliation, policy/program-sequence degisikligi, production, schema, migration,
  runtime ve owner WIP mutation standing grant disidir.
- Request, execution ve result PR'larinda §5 merge disiplini gecerlidir; owner authority
  zorunludur.
- Generated coordination register derived/non-authoritative'dir.
- Grandfathered owner WIP stash, reset, clean, delete, reconcile, overwrite veya baska
  sekilde mutate edilemez.

## 9. Uygulama Kurallari

- Degisiklikten once ilgili dosyalari ve yakin cevre kodunu oku; degistirecegin dosya,
  servis, controller veya metodu kimin nereden cagirdigini tespit et. Metot degisiyorsa
  tum cagiranlari kontrol et.
- On analiz ihtiyaca gore cagiran yerler, impact scope, multitenant etki, tablo
  iliskileri, schema/migration ihtimali, runtime, guvenlik ve mimari uyumu kapsar.
- Tablo uzerinde islem yapilacaksa iliskili tablolar ve yan etkiler incelenir.
- Yeni gelistirmeden once mevcut uygulama var mi bakilir; kod tekrarindan kacinilir.
- Scope disi dosyalari degistirme; davranis degisikligini sessizce tanitma.
- Yeni abstraction yalniz gercek karmasayi azaltiyorsa veya mevcut mimariyle acikca
  uyumluysa eklenir.
- Owner/user WIP'i owner acikca yetki vermedikce revert, stash, tasima, clean, delete veya
  baska sekilde modify etme; ilgiliyse uyumlu calis, ilgisizse yok say.
- Yeni servis metodu veya controller action yazarken cagrilma listesini yorumda tut;
  mevcut metodu degistirirken listeyi kontrol edip guncelle:

```ts
/**
 * Cagrildigi yerler:
 * - {Controller/Servis}.{Metod}() -> {HTTP METHOD} {endpoint} ({aciklama})
 * - {Servis}.{Metod}() -> {aciklama}
 */
```

## 10. Validation

- Validation seviyesi risk ve etki alanina gore secilir.
- Kod veya davranis degisikliginde ilgili en kucuk anlamli test, type-check, lint veya
  smoke validation calistirilir.
- Docs-only degisikliklerde diff, kapsam ve ilgili register/dokuman tutarliligi kontrolu
  yeterlidir; "schema yok / migration yok / runtime yok" boilerplate'i yazilmaz.
- Test iddialari factual olmalidir: yalniz gercekten calistirilan komutlar ve gozlenen
  sonuclar raporlanir. Calistirilmayan kontrol icin "calistirilmadi" denir; tahmini sonuc
  test sonucu gibi sunulmaz.
- Riskli UI/API dogrulamasindan once localhost servisinin hangi worktree'den calistigi
  kontrol edilir.
- DB-gated integration testlerde production veya local development veritabanina karsi test
  kosulmaz:

```text
disposable Docker PostgreSQL container ayaga kaldir
migration bu container uzerinde calistir
integration test bu container uzerinde kos
PASS olmadan PR acma
```

## 11. Canonical Constitution Compliance (Mandatory)

Yeni domain, ADR, design, implementation veya governance calismasina baslamadan once:

```text
AGENTS.md
→ project/docs/governance/GOVERNANCE-INDEX.md
→ project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md
→ project/docs/governance/SYSTEM-CONSTITUTION.md
→ gorevle ilgili tum RATIFIED / CANONICAL domain governance belgeleri (bkz. §12)
→ ilgili contract / implementation standard
→ project/docs/governance/architecture-index.md → ilgili ADR
→ canonical split plan (varsa)
→ project/docs/governance/decision-log.md
→ Master Register / Product Backlog
→ pre-implementation consistency check
→ implementation
```

- `GOVERNANCE-INDEX.md` routing/discovery katmanidir; semantic veya execution authority
  uretmez.
- Cross-domain gorevlerde tek domain governance secilmez; gorevle ilgili tum
  ratified/canonical belgeler birlikte okunur.
- `PROPOSED`, `DRAFT` veya `OWNER REVIEW` belgeleri kendiliginden binding authority veya
  implementation izni uretmez.
- Kapanmis owner karari yalniz `decision-log.md`'de authoritative'dir; daha yeni bir kayit
  acik amendment, ratification veya supersession olmadan System Constitution'i ya da
  ratifiye Domain Governance'i sessizce override edemez.
- `master-triage-register.md` ve `product-backlog.md` global triage/execution status
  authority'sidir; domain dossier'leri bunlarin yerine gecmez.
- Aktif Program/Wave/Workstream/Task ve owner mode dogrulanmadan analiz veya
  implementation baslatilmaz.
- Canonical kaynaklar arasinda normatif celiski tespit edilirse implementation durur; ajan
  yalniz Governance Reconciliation onerir. Bu tespit tek basina dokuman degistirme,
  execution, commit, merge, release veya runtime authority uretmez.

## 12. Domain On-Kurallari

Asagidaki modullerle ilgili her analiz, tasarim, implementation, migration, review veya
governance gorevinden once o modulun Domain Law belgesi okunur. Tum moduller icin ortak
kural: belgenin invariant veya hard-stop kurallariyla celisen bir durum tespit edilirse
durulur ve raporlanir; kanonik kurallar ratifiye edilmis governance karari olmadan
override edilmez. Cross-domain gorevde ilgili tum sibling Domain Law'lar birlikte okunur.
Belge hiyerarsisi ve okuma sirasi: `project/docs/governance/GOVERNANCE-INDEX.md`.

| Modul | Domain Law (`project/docs/governance/`) | Modul-ozel ek sart |
|---|---|---|
| DEBTOR | `DEBTOR-GOVERNANCE.md` | Icindeki Mandatory Pre-Task Checklist doldurulur. |
| RECEIVABLE | `RECEIVABLE-GOVERNANCE.md` | Authority matrisi, invariantlar ve goreve uygulanabilir checklist izlenir. Kapsam: ClaimItem, Due bridge, Collection etkisi, allocation, faiz authority, legal balance, reversal, receivable cutover. |
| OFFICE | `OFFICE-GOVERNANCE.md` (Domain Law) | Kapsam: Person/UserAccount/OrganizationMembership/Employment/LawyerCredential, title/role/permission/assignment, authorization, approval actor, delegation, session/lifecycle, offboarding, audit attribution, personel read model. NON-NORMATIVE yardimci belgeler: `OFFICE-MASTER-SYNTHESIS.md` yalniz kanit/senaryo katmanidir ve Domain Law'a norm ekleyemez; `OFFICE-RISK-REGISTER.md` triage veya calisma durumu uretmez; `OFFICE-OWNER-DECISIONS.md` bir karari KAPATMAZ. |
| CLIENT | `CLIENT-GOVERNANCE-CHARTER.md` | Charter bounded'dir, FULL DOMAIN LAW DEGILDIR; client ownership, invariants (CL-INV-001..008) ve cross-domain contract map'i konsolide eder, sibling Domain Law'larin otoritesini ustlenmez veya override etmez. Kapsam: client profile/relationship, representation/mandate, client instruction, client approval, client-facing visibility, fee/contract context, client-facing creditor identity. |
| COLLECTION | `COLLECTION-GOVERNANCE.md` | COLLECTION gorevleri icin zorunlu domain on-okumasidir. |

## 13. Raporlama ve Kapanis

- Raporlar kisa, karar odakli ve kapsama uygun olur.
- Dogrulanmis gercekler, makul varsayimlar ve riskler ayri belirtilir; kanit yetersizse
  acikca soylenir.
- Kapanis raporu su alanlari icerir: degisen dosyalar; yapilan is; validation; kalan risk;
  final disposition; canonical state.
- Kapanistan once Master Register dogrulamasi zorunludur.

`Onay Bekleniyor` semantigi:

```text
YES = Yeni owner semantic karari, authority veya gercek scope expansion gerekiyor.
NO  = Verilmis authority kapsaminda terminal disposition olustu veya gercek bir owner
      karari gerekmiyor.
```

`GO-ANALYZE` veya bounded `GO-IMPLEMENT` tesliminin kendi dogal sinirinda durmasi
otomatik olarak `YES` uretmez.

## 14. Stop Condition'lar

Yalniz sunlar stop condition'dir:

- Task brief veya owner authority disinda kalan schema/migration/backfill/live
  DB/production/cutover degisimi.
- Owner WIP, competing writer veya task disi unexpected-file collision.
- Bounded context icinde cozulemeyen maddi security/data-loss/corruption riski.
- Task'in ilerleyebilmesi icin owner-gated karar gerekmesi: yeni
  hukuki/finansal/domain/product semantigi; davranissal olarak farkli birden fazla makul
  secenek arasinda tercih; bounded-context veya temel mimari degisikligi;
  destructive/legacy removal; owner WIP mutation; gercek task-objective disi scope
  expansion; yeni backlog veya roadmap karari.
- Canonical semantic conflict.
- Yetkili scope icinde minimum guvenli patch ile cozulemeyen CI veya teknik problem.

Tek basina stop condition DEGILDIR: §4'te scope expansion sayilmayan kalemler; current
main drift; CI devam ederken gecici `BLOCKED` state; ilgisiz ve immediate risk tasimayan
backlog adayi finding.

Stop durumunda kullanilacak format:

```text
STATUS: BLOCKED
EXACT BLOCKER:
EVIDENCE:
WHAT WAS COMPLETED:
WHAT REMAINS:
ONAY BEKLENIYOR: YES
```
