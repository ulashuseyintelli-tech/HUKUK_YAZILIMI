# GOV-COORD-V2 — Environment Evidence Appendix

```text
Belge yolu : project/docs/governance/coordination-v2/environment-evidence.md
Durum      : TIMESTAMPED OBSERVATION / NON-NORMATIVE
Rol        : governance-orchestration-contract-v2.md SS14 uyarinca, contract'in
             normatif govdesinden AYRILMIS gozlem kaydi. Buradaki hicbir deger
             hukum degildir; hepsi gozlem anina baglidir ve degisebilir.
Gozlem ani : 2026-07-26
Base SHA   : 0b289ef0aa3a2932e8137c7685e96b8cc632b392
```

## 1. Neden bu belge ayri

Contract SS14:

```text
NORMATIVE CONTRACT : required CI union NASIL belirlenir · executable NASIL
                     resolve edilir · version NASIL dogrulanir · base drift
                     NASIL yonetilir
EVIDENCE APPENDIX  : gozlenen executable path/version/smoke sonucu · gozlenen
                     current required checks · gozlenen current main SHA/drift
                     · gozlenen common-dir topolojisi
```

Bir gozlemin bu belgede yer almasi, onu contract hukmu haline GETIRMEZ.

## 2. Executor gozlemleri

### 2.1 CLAUDE_LOCAL

| Alan | Deger | Kanit kaynagi |
|---|---|---|
| Resolved absolute path | `C:\Users\ulastelli\.local\bin\claude.exe` | ajan tarafindan dogrudan dogrulandi (dosya mevcut, 265 MB) |
| Version | `2.1.220 (Claude Code)` | ajan tarafindan mutlak yolla `--version` cagrisi |
| Headless invocation | `claude -p "<prompt>"` | owner-reported |
| Child-process smoke | `exitCode = 0`, sentinel stdout'ta, `state: AVAILABLE` | **ajan tarafindan calistirildi** (2026-07-26, `verify-executors.cjs`) — onceki `owner-reported` kaydi bu satirla yukseltilmistir |
| PATH resolution (owner ortami) | PASS (`Get-Command claude -CommandType Application`) | owner-reported |
| PATH resolution (ajan Bash-tool shell) | **FAIL** (`command -v claude` -> bulunamadi) | ajan tarafindan iki kez dogrulandi |

**Iki gozlem de dogrudur ve celismez.** Windows User PATH `C:\Users\ulastelli\.local\bin`
icerir (read-only registry sorgusuyla dogrulandi), ancak ajanin Bash-tool sureci
PATH degisikliginden ONCE baslatilmistir; `claude.exe` bu oturum sirasinda
yazilmistir. Bu, contract SS7.1'deki uc numarali adimin (`known installation
fallback`) neden **zorunlu** oldugunun dogrudan kanitidir: uzun omurlu bir
orchestrator daemon'i, bir executor kurulumundan/upgrade'inden once
baslatilmissa PATH resolution kalici olarak basarisiz olur.

Onceki bir taslakta yer alan "`claude` PATH'te cozulmez, mutlak yol zorunlu"
hukmu **geri cekilmistir**; ortama ozgu bir gozlemi genel hukum olarak yazmak
hataydi.

### 2.2 CODEX_LOCAL

| Alan | Deger | Kanit kaynagi |
|---|---|---|
| PATH resolution | PASS | ajan tarafindan dogrulandi |
| Resolved path | `/c/Users/ulastelli/AppData/Local/Volta/bin/codex` | ajan tarafindan dogrulandi |
| Version | `codex-cli 0.144.5` | ajan tarafindan `--version` cagrisi |
| Headless invocation | `codex exec` | resmi OpenAI dokumantasyonu |
| Child-process smoke (git repo cwd) | `exitCode = 0`, `state: AVAILABLE` | ajan tarafindan calistirildi (2026-07-26, disposable git repo icinde) |
| Child-process smoke (git repo DISI cwd) | **FAIL** — `Not inside a trusted directory and --skip-git-repo-check was not specified` | ajan tarafindan calistirildi (2026-07-26, plain temp dizin) |

**Bu iki satir bir kusuru ortaya cikardi ve duzeltildi.** `codex exec` guvenilir
(git repository) olmayan bir working directory'de calismayi reddediyor.
Resolution bunu `SMOKE_FAILED` olarak raporluyordu — bozuk bir CLI'dan
ayirt edilemez, ve orchestrator bunu `EXECUTOR_UNAVAILABLE` -> `BLOCKED` task'a
ceviriyordu. Yani dogru kurulmus bir Codex, yalnizca resolution'in nerede
kostuguna bagli olarak isi bloklayabilirdi. Uretim yolu zaten dogruydu
(resolution izole worktree'yi cwd olarak kullanir), fakat hata modu sessiz ve
yaniltciydi. Artik kosul lane uzerinde belgelenmis ve `SMOKE_PRECONDITION_UNMET`
olarak ayri raporlanir. `--skip-git-repo-check` bilincli olarak EKLENMEDI:
CLI'nin kendi guvenlik kontrolunu smoke'u gecirmek icin baypas etmek, acik bir
basarisizligi sessiz bir basarisizlikla degistirmek olurdu.

## 3. Repository topolojisi

### 3.1 Git common directory

Contract SS6, V2 minimum lease modelinin **tek canonical repository ve
paylasilan Git common directory** varsaydigini belirtir. Gozlem:

```text
canonical root  : C:/Development/HUKUK_YAZILIMI/project        -> .git
ornek worktree'ler (5 adet ornekleme):
  HUKUK_adr014-evidence-runner                 -> C:/Development/HUKUK_YAZILIMI/project/.git
  HUKUK_ccb-001-r                              -> C:/Development/HUKUK_YAZILIMI/project/.git
  HUKUK_client_p2_u03_i02_document_projection  -> C:/Development/HUKUK_YAZILIMI/project/.git
  HUKUK_cutover_smoke                          -> C:/Development/HUKUK_YAZILIMI/project/.git
  HUKUK_of01_history_p04b                      -> C:/Development/HUKUK_YAZILIMI/project/.git
```

Ornekleme tamdir denemez (tum worktree'ler tek tek dogrulanmadi), ancak
ornekteki bes worktree'nin tamami ayni common-dir'i paylasir. SS6'nin varsayimi
bu ornekleme kapsaminda **gecerlidir**.

### 3.2 Lease ref namespace

```text
refs/governance-coordination/**  -> BOS (cakisma yok)
```

`git for-each-ref` ile dogrulandi; SS6'nin onerdigi namespace kullanilabilir
durumdadir.

## 4. CI / branch protection gozlemi

Ayni gun icinde IKI KEZ degisti:

```text
gozlem 1 (sabah) : ["Web Tests (vitest)"]                              strict=false
gozlem 2 (aksam) : ["Web Tests (vitest)", "Architectural Guardrails"]  strict=false
```

Ayrica PR-seviyesindeki check kumesi de degisti: ayni gun bir push'ta 4 check
gorulurken sonraki push'ta 8 check gorunmustur (uc `Analyze (...)` CodeQL job'i
ve toplayici `CodeQL` check'i eklendi). Toplayici `CodeQL` check'i, alt Analyze
job'lari surerken gecici olarak `NEUTRAL` raporlar; bu bir basarisizlik degil,
ara durumdur — terminal durum ayrica okunmalidir.

`gh api repos/<owner>/<repo>/branches/main/protection` ile her iki gozlem de
dogrulandi.

**Onemli:** kume hem platform seviyesinde (1 -> 2) hem de kosu bazinda (4 -> 8)
degisti. Contract SS5.1'deki `effectiveRequiredCiChecks` birlesimi tam olarak bu
yuzden vardir — orchestrator yalnizca GitHub'in `mergeable` sinyaline guvenemez,
ve hicbir check adi contract'a sabitlenemez. Bu gozlem yine degisebilir;
SS5.1 kural olarak kalir. Buradaki degerlerin yaslandigi bu bolumun kendi
tarihcesiyle kanitlanmistir.

## 5. Base drift gozlemi (SS13 gerekcesi)

Bu contract'in hazirlandigi oturum sirasinda canonical `main` **fiilen
ilerledi**:

```text
oturum ortasi gozlem : 4c5ed903882be359a161e9487ea749f2dc141035  (local main)
                       69a0ee2fd8db7cf3a37cccc63dfe53ff16605de8  (origin/main)
oturum sonu gozlem   : 0b289ef0aa3a2932e8137c7685e96b8cc632b392  (HEAD = main = origin/main)
```

`4c5ed903` HEAD'in atasidir ve o commit'te GOV-COORD-V1 kontrol duzlemi
dosyalari **henuz yoktu** (`git cat-file -e` ile dogrulandi). Yani ayni
oturumda yapilan iki tarama farkli sonuc uretmistir ve ikisi de kendi aninda
dogruydu.

Bu, SS13 `STRICT_PINNED_BASE` varsayilaninin somut gerekcesidir: analiz veya
executor calisirken base'in altindan kaymasi teorik degil, bu repoda **gozlenen**
bir olaydir.

## 6. Program authorization gozlemi

`programs.manifest.json` uretimi aninda alti programin **tamami**
`liveExecutionEligibility: DENIED` cikmistir:

```text
UYAP_CONNECTOR  NOT_AUTHORIZED
CLIENT          NOT_AUTHORIZED
OFFICE          OWNER_GATED
DEBTOR          NOT_AUTHORIZED
COLLECTION      OWNER_GATED
RECEIVABLE      NOT_AUTHORIZED
```

Contract SS10 uyarinca bu bir program basarisizligi DEGILDIR. `T5` icin
beklenen disposition:

```text
SYSTEM_READY / LIVE_PILOT_BLOCKED_NO_AUTHORIZED_TASKS
```

`T5`'in acilabilmesi, owner tarafindan ratifiye edilmis en az iki immutable
standing grant'e baglidir (SS15). Boyle bir grant bu gozlem aninda **mevcut
degildir**.

---

**Bu belge normatif degildir.** Icerdigi her deger gozlem anina baglidir ve
contract hukmu olarak alintilanamaz.
