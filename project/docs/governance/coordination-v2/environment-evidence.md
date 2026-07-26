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
| Child-process smoke | `exitCode = 0`, stdout `CLAUDE_HEADLESS_OK` | **owner-reported** (ajan bu smoke'u kendisi calistirmadi) |
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

```text
required_status_checks.contexts : ["Web Tests (vitest)"]
required_status_checks.strict   : false
```

`gh api repos/<owner>/<repo>/branches/main/protection` ile dogrulandi.

**Onemli:** bu, platform seviyesinde zorunlu kilinan TEK check'tir. Contract
SS5.1'deki `effectiveRequiredCiChecks` birlesimi tam olarak bu yuzden vardir —
orchestrator yalnizca GitHub'in `mergeable` sinyaline guvenemez; owner-tanimli
ve governance-tanimli kapilari **ayrica** dogrulamak zorundadir. Bu gozlem
degisebilir; SS5.1 kural olarak kalir.

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
