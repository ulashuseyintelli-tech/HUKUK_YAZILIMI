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
donusemez. Duplicate normatif ifade `instruction-policy.cjs` tarafindan tespit edilir.

## INSTRUCTION SIZE POLICY

Boyut `project/scripts/instruction-policy.cjs` ile olculur (CRLF -> LF): `AGENTS.md`
hedefi WARN, birlesik hard ceiling ERROR (yalniz owner amendment). Okunabilirlik boyut
icin bozulamaz; her degisiklikte once/sonra olcum ve kural izi raporlanir. Ayni guard
referans gecerliligini, `§N` referansini, duplicate ifadeyi, `<ajan>/<konu>` branch
onekini ve instruction + control-plane karisimini test eder.

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

- Kanit tek eslesme uretiyorsa ajan modulu kendisi secer; birden fazla ilgili modul
  varsa tumu okunur.
- UYAP Connector, GitHub/CI/governance control-plane, shared evidence ve
  cross-workstream migration altinci modul degildir; `CROSS_MODULE / SHARED` uygulanir.
- Siniflandirilamayan ya da birden fazla makul ownership secenegi olan gorev
  `UNKNOWN / OWNER REVIEW` kalir; mutation baslamaz.
- Modul siniflandirmasi authority degildir; aktif task, owner mode, competing writer ve
  exact scope ayrica dogrulanir.

## 3. Temel Ilkeler

- Ground Truth First: repository gercek durumunu dosya, komut ciktisi veya resmi kaynakla
  dogrula; repository state uydurma.
- Sohbet ve oturum hafizasi yalniz niyet/karar tasir; gercekler her gorevde repo, git,
  dosya, governance, PR/CI ve komut ciktisindan yeniden dogrulanir.
- Repository root varsayilmaz, guncel git state ile dogrulanir; ikinci clone veya root
  belirsizliginde durulur.
- Buyuk/uzun omurlu workstream baslamadan Session Initialization ozeti: Workspace
  Module(s), Repository State, Execution Context, Context Drift, Concurrent Activity,
  Ready/Not Ready.
- Mevcut mimariyi, kesinlesmis Architecture Decision'lari, geriye donuk uyumlulugu ve
  davranisi koru. Yeni gorev bir karari bozuyorsa dur, etkiyi raporla, owner karari iste.
- Multitenant yapi varsa ona uy; degisiklikten once multitenant davranis gerekip
  gerekmedigi ve nedeni belirtilir.
- Spekulatif refactor yapma; en kucuk guvenli patch'i tercih et.
- Hukuki/finansal semantiklerde domain dogrulugu implementasyon kolayligindan
  onceliklidir.
- Yetkili gorevde ajan inceleme, uygulama, test, derleme ve PR'i tamamlar; yetki merge'u
  kapsiyorsa yeniden onay istemez; kapsam disi is icin yalniz ek karar sorar.
- Dis bagimlilikla bloklanma davranisi (DX-005 / Waiting & Progress Policy) icin bkz.
  `project/docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`.

## 4. Calisma Modlari

- `UNKNOWN / AMBIGUOUS`: read-only kalir; mutation yapilmaz.
- `GO-ANALYZE`: Explicit salt-okunur analizdir. `ANALYZE → REPORT → STOP`; dosya
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
collision NONE.

Merge authority (canonical home) explicit ve task-bounded owner closeout
authority'sidir. Gecerli authority yalniz sunlardan biridir:

- Belirli task veya PR'a bagli `GO-COMPLETE` / `IF GO-COMPLETE`.
- Gate'ler gecince zincirin ikinci owner onayi beklenmeden tamamlanacagini acikca
  soyleyen esdeger owner beyani.
- §5 Serit 1 isi.

Authority task brief'inde ex-ante veya ayni task icinde sonradan verilebilir; verildikten
sonra CI sonrasinda ikinci owner mesaji istenmez. Authority yalniz adi gecen task/PR
icindir ve baska task'a tasinmaz. Ledger authority DEGILDIR (kanit/reuse korumasi);
ajan kendi task'i icin `SEMANTIC_AUTHORITY`/`EXECUTION_GRANT` uretemez/ratify edemez ve
ajan-yazimi authority merge kaynagi sayilmaz.

Tek basina merge authority DEGILDIR: "devam", "uygula", "basla", kapsam secimi, tasarim
onayi, implementasyon izni, commit/push/PR izni, CI takip talimati. Ajan ortulu owner
niyetinden merge authority turetemez; authority yoksa merge yapilmaz, durulur ve exact
blocker raporlanir (§14).

Scope expansion DEGILDIR: ayni root cause ve bounded context icindeki supporting dosya,
focused test/fixture/mock, mevcut mimari icindeki minimum tercih, kendi patch'inin
validation duzeltmesi, task'e dogrudan bagli documentation/reference alignment. Ilgisiz
finding immediate security/data-loss/corruption riski tasimiyorsa evidence ile backlog
adayi olarak ayrilir; mevcut task'e gizlice eklenmez ve mevcut task'i durdurmaz; kabulu engelleyen bulgu dar
duzeltmeye girer, genel refactor/altyapi/gelecek modul hazirligi gorev devami degildir.

Backlog akisi: `Yeni fikir → Triage → Product Backlog → READY → Active Roadmap →
Implementation`. `BACKLOG → READY` ve roadmap tasimalari owner onayi olmadan uygulanmaz.

## 5. CI ve Merge Disiplini

`IF GO-COMPLETE` varsa CI ~60 sn'de izlenir; 20 dk ilerlemesiz stall eşiğidir. `BLOCKED`
terminalde yeniden okunur; `SUCCESS` gate sonrası merge edilir; `FAILURE`/`CANCELLED`/
timeout/stall exact blocker'dır.

Merge authority PASS ise `pnpm orch:closeout`; Runner kullanilamiyor, senaryoyu desteklemiyor,
exact blocker veya ledger materialize edilemiyorsa ajan fallback ile kapatir; gate'ler elle
dogrulanir, ikinci owner mesaji ISTENMEZ, dogfood raporlanir. `MERGED` yalniz governance-only
gorevde terminaldir; runtime-affecting gorev
post-merge acceptance gate'leri olmadan CLOSED sayilmaz (bkz. `project/docs/runbooks/pr-closeout.md`).
Orkestra execution coordinator'dır; `ELIGIBLE`/dispatch authority değildir. Mutation task-bound
ayrı `SEMANTIC_AUTHORITY` + `EXECUTION_GRANT`, merge task/PR/head/scope/check pinli;
Serit 1 disinda reusable authority yoktur. Semantic checkpoint hukuk/business/security, migration,
production/scope/unique-WIP; mechanical checkpoint grant'taki base/branch/PR/CI/merge/cleanup/
eligibility'dir. Tuple değişmezse re-ratify yok. `GO-ANALYZE` read-only; `GO-COMPLETE`
scope-içi. Successor exact grantli; Stage 1/2 ayrı grant. Same-file writer durdurur. Öncelik
P0/P1 → product activation → runtime/prod certification → governance cleanup; lock/fence korunur.

Seritler: 1 (test, belge — governance/AGENTS/CLAUDE disi —, kum saati, yerel hazirlik)
kontroller gecince basa bagli squash merge, onaysiz. 2 (urun kodu, yurutucu, guvenlik
kapisi, migration) gorev+merge yetkiliyse PR basina onay yok. 3 canli: faz GO. CI yoksa bos
kontrol listesi basari degil; yerel dogrulama esas. Arac/yetki engeli dosyayla asilmaz.

## 6. Worktree Izolasyonu (developer workstation policy)

Bu bolum PR artifact'indan dogrulanamaz; makineye tasinamaz ve metin olarak baglayicidir.

Canonical project root icinde implementasyon yapilmaz. Her dosya degisikliginden once
directory, branch ve worktree izolasyonu dogrulanir; canonical root icinde edit, PR branch
ve commit durdurulur.

```text
git fetch origin
git worktree add ../HY_<konu> origin/main -b <ajan>/<konu>
cd ../HY_<konu>
```

Canonical working tree yalniz read-only dogrulama, `main` senkronu, register verification
ve final dogrulama icindir; kirliyse kullanici WIP'i sayilir, dokunulmaz, yine yeni
worktree acilir.

Cleanup fiziksel recursive silme ile YAPILMAZ (`rm -rf`, `cmd rd /s /q`,
`Remove-Item -Recurse`, `Directory.Delete(path, true)`). Isolated worktree yalniz PR merge
veya final disposition sonrasi kaldirilir; "Directory not empty" kalirsa
`ORPHANED_WORKTREE_DIR` olarak raporlanir ve fiziksel silme yapilmaz. Branch silmeden once
PR merge durumu `gh` ile dogrulanir; squash merge icin git ancestry'ye guvenilmez.
Baglayici prosedur, junction/hardlink riski ve karar tablosu:
`project/docs/runbooks/worktree-cleanup.md`.

## 7. Orkestrasyon ve Yurutucu Ayrimi

`ORCHESTRATION IS NOT HANDOFF.`

Bir gorevi alan ajan o gorevin PRIMARY EXECUTOR / TASK OWNER / ORCHESTRATOR'udur ve gorevi
uctan uca sahiplenir. Baska bir ajan veya arac yalniz BOUNDED CAPABILITY EXECUTOR olarak
cagrilir.

- Protected-path writer capability (`CODEX_LOCAL`) executor ROLU degil bounded
  capability'dir; task ownership'i, program lock'u, current active unit'i ve final
  accountability'yi DEGISTIRMEZ. Bounded capability degisikligi handoff degildir.
- Kullanici ajanlar arasinda gorev tasiyan dispatcher DEGILDIR.

`TASK REVISION ≠ TASK TERMINATION ≠ EXECUTOR HANDOFF.` Task identity, semantic outcome ve
primary ownership degismediyse is durmaz; WIP korunur, mevcut diff yeniden degerlendirilir
ve yurutme ayni task altinda yeni immutable revision ile devam eder. Revision authority
genisletmez ve terminal disposition degildir; allowlist genislemesi revision degildir;
semantic outcome degisikligi yeni task veya owner karari, primary executor degisikligi
explicit handoff ister. Handoff istisnalari, revision tetikleyicileri, supersededLayer ve
terminal disposition sinifları: `project/docs/governance/process-rules.md`.

Yetkili kapsamdaki yerel komutlari ajan kosar, cikis kodu ve kanitla dogrular; owner'a
yalniz yetki/UAC engelinde en kucuk mudahale verilir. Yeni authority uretmez. Bkz.
`project/docs/governance/process-rules.md`.

## 8. Governance Writer Coordination V1

Bu bolum uygulanmadan once
`project/docs/governance/governance-writer-coordination-contract.md` okunmasi
zorunludur; contract'taki invariant ve hard-stop kurallari baglayicidir. Uygulama
detayi, istisna, enum ve ornekler contract'tadir. Gorev sirasinda unutulmamasi gereken
ozet yukumlulukler:

- Protected governance yollarina modul calisma sayfalarindan dogrudan yazilmaz; request
  yalniz request-only PR ile main'e tasinir.
- `CODEX_LOCAL` yalniz protected-path WRITER capability'sidir; task ownership, program
  lock veya orchestration authority tanimlamaz (bkz. §7).
- Her execution icin `semanticAuthorityRef` ve `executionGrantRef` ayri ve zorunludur;
  ayni authority kaydi ikisini birden karsilayamaz.
- Reconciliation, policy/program-sequence degisikligi, production, schema, migration,
  runtime ve owner WIP mutation standing grant disidir.
- Grandfathered owner WIP mutate edilemez; merge disiplini §5'tedir.

## 9. Uygulama Kurallari

- Degisiklikten once ilgili dosyalar ve yakin cevre okunur; cagiranlar, iliskili
  tablolar, tenant siniri, schema/migration, runtime ve guvenlik degisikligin etkiledigi
  olcude incelenir. Her kucuk degisiklikte butun sistem yeniden analiz edilmez.
- Yeni gelistirmeden once mevcut uygulama var mi bakilir; kod tekrarindan kacinilir.
- Scope disi dosyalari degistirme; davranis degisikligini sessizce tanitma.
- Yeni abstraction yalniz gercek karmasayi azaltiyorsa veya mevcut mimariyle acikca
  uyumluysa eklenir.
- Owner/user WIP'i owner acikca yetki vermedikce revert, stash, tasima, clean, delete veya
  baska sekilde modify etme; ilgiliyse uyumlu calis, ilgisizse yok say.
- XML `/// <remarks>` cagrilma listesi yalniz .NET/C#; TypeScript/Python/PHP'ye
  tasinmaz, kod yalniz yorum standardi icin toplu degistirilmez.

## 10. Validation

- Validation riske gore secilir; baslangicta yeterli kanit belirlenir, kontroller gecip
  somut kaygi kalmayinca biter. Kirmizi test hata duzeltmesinde, mutant kritik korumada,
  tam takim ortak etki/zorunlu kontrolde; gecerli sonuc gerekcesiz tekrarlanmaz.
- Kod veya davranis degisikliginde ilgili en kucuk anlamli test, type-check, lint veya
  smoke validation calistirilir.
- Docs-only degisikliklerde diff, kapsam ve ilgili register/dokuman tutarliligi kontrolu
  yeterlidir; "schema yok / migration yok / runtime yok" boilerplate'i yazilmaz.
- Yalniz gercekten calistirilan komut ve gozlenen sonuc raporlanir; calistirilmayan
  kontrol "calistirilmadi" diye yazilir, tahmin test sonucu gibi sunulmaz.
- Riskli UI/API dogrulamasindan once localhost servisinin hangi worktree'den calistigi
  kontrol edilir.
- DB-gated integration testlerde production veya local development veritabanina karsi test
  kosulmaz; disposable container prosedduru
  `project/docs/governance/process-rules.md`'dedir.

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

Bir modulle ilgili her analiz, tasarim, implementation, migration, review veya governance
gorevinden once o modulun Domain Law belgesi okunmasi zorunludur; belgenin invariant ve
hard-stop kurallari baglayicidir ve ratifiye governance karari olmadan override edilmez.
Cross-domain gorevde ilgili tum sibling Domain Law'lar birlikte okunur.

| Modul | Domain Law (`project/docs/governance/`) |
|---|---|
| DEBTOR | `DEBTOR-GOVERNANCE.md` (icindeki Mandatory Pre-Task Checklist doldurulur) |
| RECEIVABLE | `RECEIVABLE-GOVERNANCE.md` |
| OFFICE | `OFFICE-GOVERNANCE.md` |
| CLIENT | `CLIENT-GOVERNANCE-CHARTER.md` (bounded charter; FULL DOMAIN LAW DEGILDIR) |
| COLLECTION | `COLLECTION-GOVERNANCE.md` |

Modul kapsamlari, hangi yardimci belgenin NON-NORMATIVE oldugu, charter sinirlari ve
belge statuleri icin tek canonical kaynak `project/docs/governance/GOVERNANCE-INDEX.md`
(§11 routing zincirinin ilk adimi).

## 13. Raporlama ve Kapanis

- Raporlar kisa ve karar odaklidir; dogrulanmis gercek, varsayim ve risk ayri yazilir,
  kanit yetersizse soylenir.
- Kapanis raporu: degisen dosyalar, yapilan is, validation, kalan risk, final
  disposition, canonical state.
- Kapanistan once Master Register dogrulamasi zorunludur.
- Hazir / merge / calisan surumde dogrulandi / kabul ayridir. Liste: Baslangic | Kapanan
  | Kalan | +Kapsam; kalan isin tek sorumlusu ve bitme kosulu var. Kabul calisan arayuzle;
  engelde tek mudahale yazilir, bagimsiz is surer.

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
