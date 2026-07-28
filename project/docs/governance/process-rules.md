# Process Rules

Bu dosya `AGENTS.md`'nin **açıklama, örnek ve şablon katmanıdır**. Normatif authority
üretmez ve `AGENTS.md`'yi override edemez.

Bir hüküm doğrudan ajan davranışını veya authority sınırını belirliyorsa canonical evi
`AGENTS.md`'dir ve burada yeniden kurulmaz; yalnız ilgili bölüme referans verilir.
Çelişki halinde `AGENTS.md` uygulanır ve çelişen kayıt düzeltilmek üzere raporlanır.

| Konu | Canonical ev |
|---|---|
| Otorite zinciri, operational/semantic authority ayrımı | `AGENTS.md` §1 |
| Modül routing | `AGENTS.md` §2 |
| Ground-truth, temel ilkeler, Session Initialization zorunluluğu | `AGENTS.md` §3 |
| Çalışma modları, `IF IMPLEMENT`, merge authority, scope expansion, backlog akışı | `AGENTS.md` §4 |
| CI takip ve merge disiplini | `AGENTS.md` §5 |
| Worktree izolasyonu (developer workstation policy) | `AGENTS.md` §6 |
| Uygulama kuralları ve ön analiz | `AGENTS.md` §9 |
| Validation | `AGENTS.md` §10 |
| Raporlama ve `Onay Bekleniyor` semantiği | `AGENTS.md` §13 |
| Stop condition'lar | `AGENTS.md` §14 |
| Worktree/branch cleanup mekaniği | `project/docs/runbooks/worktree-cleanup.md` |
| Claude'a özgü delta (dil, çalışma seviyesi önerisi, slider) | `CLAUDE.md` |

Aşağıdaki bölümler yalnız şablon, örnek ve rehberlik sağlar.

## Session Initialization şablonu

`AGENTS.md` §3 büyük veya uzun ömürlü workstream'lerde Session Initialization özetini
zorunlu kılar. Kullanılacak şablon:

```text
SESSION INITIALIZATION

Workspace Module(s):

Repository State:
- Branch:
- HEAD:
- Working tree:
- Main / origin-main:

Execution Context:
- Requested mode:
- Bounded context:
- Allowed scope:

Context Drift:
- Conversation assumptions re-verified:
- Concurrent commits:
- Relevant upstream/local changes:
- Requires re-analysis:

Concurrent Activity:
- Untracked/user WIP:
- Other active branch/worktree signal:
- PR/CI state if relevant:

Readiness:
- Ready / Not Ready:
- Reason:
```

Bu özet tam rapor değildir; işe başlamadan önce repository-first durumunu hızlı görünür
kılan kısa güvenlik kontrolüdür.

## Çalışma modları — okuma notu

Modların normatif tanımı, gate'leri ve merge authority semantiği `AGENTS.md` §4'tedir.
Aşağıdaki not yalnız hatırlatmadır ve yeni hüküm kurmaz.

`GO-ANALYZE` Explicit read-only moddur; dosya değişikliği, commit, PR veya merge yoktur.
`GO-IMPLEMENT` local patch + validation ile sınırlıdır. `GO-COMPLETE — ANALYZE-FIRST
CONDITIONAL EXECUTION` implementation-eligible görevlerde tercih edilen tam yürütme
modelidir ve analiz ayrı bir owner turu değildir.

Merge authority yalnız `AGENTS.md` §4'te tanımlanan explicit task-bounded owner closeout
authority'sidir. "devam", "uygula", kapsam seçimi, tasarım onayı veya commit/push/PR izni
tek başına merge authority üretmez.

## Lane Ownership: Analysis Owner ≠ Implementation Owner

Analiz/review sahipliği ile implementation/execution sahipliği farklı kavramlardır; biri
diğerini ima etmez. Bir workstream'in analizini bir ajanın yapmış olması implementation
lane'inin de o ajanda olduğu anlamına gelmez; tersi de geçerlidir (ör. Analysis: Claude /
Implementation: Codex veya Analysis: Codex / Implementation: Claude).

- Her workstream, lane kararı ve execution-lane governance kaydında iki sahiplik ayrı ve
  açık yazılır:

```text
Analysis / Review Owner : <ajan>
Implementation Owner    : <ajan>
```

- Lane devri normaldir ve ayrı owner kararıyla kaydedilir; devredilen eski kayıt gerçekleşmiş
  owner kararı olarak silinmez, `SUPERSEDED BY <yeni kayıt>` işaretlenir.

Kaynak: COL/OD-18A (`decision-log.md` § `2026-07-15 — RC-COL / COL/OD-18A`).

## Task Revision Protokolü

Normatif çekirdek `AGENTS.md` §7'dedir; bu bölüm uygulama detayıdır ve yeni hüküm kurmaz.

Dört kavram ayrıdır ve hiçbiri diğerinin yerine geçmez:

```text
TASK REVISION           = aynı task, yeni immutable revision — yürütme devam eder
TASK TERMINATION        = task terminal bir disposition ile kapanır
EXECUTOR HANDOFF        = primary ownership başka bir yürütücüye geçer
OWNER DECISION REQUIRED = owner semantic kararı olmadan ilerlenemez
```

### Revision tetikleyicileri — yürütme durmaz

Aşağıdakiler tek başına ne termination ne de handoff nedenidir. Task identity, semantic
outcome ve primary ownership değişmediği sürece aynı task altında yeni revision açılır:

- implementation design superseded
- test design veya validation yaklaşımı superseded
- allowlist / scope daralması (task hedefi aynı kaldığı sürece)
- conflict içermeyen base revision: rebase, base drift, ilerlemiş main
- daha yeni bir contract, spec veya şablonun yayımlanmış olması
- CI'nin sürüyor olması, PR'ın açık olması, sonraki task'ın beklemesi

Revision'da yapılacak iş:

1. WIP korunur: worktree, branch ve mevcut diff silinmez, stash'lenmez, revert edilmez.
2. Mevcut diff yeni tasarıma göre yeniden değerlendirilir; hâlâ geçerli olan kısım kalır,
   yalnız gerçekten geçersizleşen kısım yeniden yazılır.
3. Yeni revision immutable kaydedilir; önceki revision düzeltilmez,
   `SUPERSEDED BY <yeni revision>` işaretlenir.
4. Task identity (`taskId`), semantic outcome ve primary ownership aynı kalır.
5. Değişen tasarım ve gerekçesi raporlanır; sessiz tasarım değişikliği yapılmaz.

### Terminal disposition sınıfları

Bir task yalnız şu sınıflardan biriyle kapanabilir:

```text
COMPLETED                  CLOSED                      CANCELLED_BY_OWNER
BLOCKED_EXTERNAL           BLOCKED_OWNER_DECISION      BLOCKED_CANONICAL_CONFLICT
BLOCKED_SECURITY_RISK      BLOCKED_DATA_LOSS_RISK      BLOCKED_AUTHORITY_MISSING
BLOCKED_UNRESOLVED_TECHNICAL_RISK
```

Şunlar terminal disposition DEĞİLDİR ve tek başlarına kapanış olarak kullanılamaz:

```text
HANDOFF_REQUIRED       SUPERSEDED             DESIGN_CHANGED        IMPLEMENTATION_CHANGED
TEST_DESIGN_CHANGED    NEWER_CONTRACT_EXISTS  NEEDS_REEVALUATION    BASE_DRIFT
CI_RUNNING             PR_OPEN                NEXT_TASK_PENDING     REVISION_REQUIRED
```

Bu ifadeler geçerli bir kapanışın yanında next-action veya revision gerekçesi olarak
geçebilir; tek başına kapanış olarak geçemez. Makine kontrolü:
`project/scripts/governance/task-disposition-guard.cjs`.

### BLOCKED_* kapanışının zorunlu alanları

```text
blockerCode    : tam blocker
blockingLayer  : hangi katman (EXTERNAL_DEPENDENCY / GOVERNANCE / SEMANTIC / ...)
evidence       : gözlenen kanıt
whyNotRevision : neden revision ile çözülemiyor
requiredAction : owner veya dış taraf için gereken eylem
preservedWip   : korunan worktree / branch / diff
```

Alanları eksik bir `BLOCKED_*` kapanışı, kapanış sayılmaz.

### Gerçek executor handoff istisnaları

Handoff yalnız şu dört durumda yapılır ve her biri raporlanır:

1. Primary executor gerekli aracı teknik olarak çağıramıyor.
2. Güvenlik veya platform sınırı bağımsız oturum gerektiriyor.
3. Owner açıkça executor değişikliği istiyor.
4. Mevcut executor görevi sürdüremeyecek durumda.

Handoff bir disposition değil, ayrı ve owner-gated bir taleptir: `BLOCKED_OWNER_DECISION`
ile ve yukarıdaki alanlarla raporlanır. Bounded capability executor çağırmak handoff
değildir; task ownership değişmez (`AGENTS.md` §7).

## Waiting & Progress Policy

Bir görev dışsal bir bağımlılıkla (CI, başka worktree'nin WIP'i, PR review, owner
deploy/karar bekleyişi) bloklandığında ajan doğrudan pasif beklemeye geçmez; önce onaylı
kapsam içinde güvenli ilerlemeyi maksimize eder. Tam politika ve üç katmanlı model
(Active Progress / Parallel Preparation / Passive Wait) için bkz.
`project/docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`.

ADR-012 yalnız "beklerken ne yapılır"ı tanımlar; "ne zaman durulur" `AGENTS.md` §5 ve
§14'te kalır.

## Backlog Review

Her faz sonunda Backlog Review zorunludur. Bağımlılığı tamamlanan maddeler için
`BACKLOG → READY` önerisi raporlanır. Akışın kendisi `AGENTS.md` §4'tedir.

## Required Report Ending

```text
══════════════════════════════

NEXT RECOMMENDED STEP

Aktif Faz:

Önerilen Sonraki İş:

Backlog Review Gerekli mi?
YES / NO

READY Durumuna Geçen Maddeler:

Yeni Eklenen Product Backlog Maddeleri:

Bekleyen Mimari Kararlar:

══════════════════════════════
```

## Çağrılma listesi yorum şablonu

`AGENTS.md` §9 yeni servis metodu veya controller action yazarken çağrılma listesinin
yorumda tutulmasını zorunlu kılar. Kullanılacak biçim:

```ts
/**
 * Cagrildigi yerler:
 * - {Controller/Servis}.{Metod}() -> {HTTP METHOD} {endpoint} ({aciklama})
 * - {Servis}.{Metod}() -> {aciklama}
 */
```

Mevcut bir metot değiştirilirken liste kontrol edilip güncellenir.

## DB-gated integration test prosedürü

`AGENTS.md` §10 production veya local development veritabanına karşı test koşulmasını
yasaklar. İzlenecek sıra:

```text
disposable Docker PostgreSQL container ayaga kaldir
migration bu container uzerinde calistir
integration test bu container uzerinde kos
PASS olmadan PR acma
test tamamlaninca container istege bagli silinebilir
```

Container imajı repository'nin pinlediği PostgreSQL sürümüyle aynı olmalıdır.

## Worktree / Branch Cleanup

Normatif çekirdek `AGENTS.md` §6'dadır: canonical root'ta mutation yasağı, isolated
worktree zorunluluğu, fiziksel recursive silme yasağı, `ORPHANED_WORKTREE_DIR` fail-safe
davranışı ve branch silmeden önce `gh` ile PR merge doğrulaması.

Bağlayıcı mekanik prosedür — junction/hardlink riski, worktree sınıflandırma tablosu,
`remove`/`prune` sırası, canonical integrity checklist, `.git/config` torn-write recovery
ve incident geçmişi — canonical runbook'tadır:
`project/docs/runbooks/worktree-cleanup.md`.
