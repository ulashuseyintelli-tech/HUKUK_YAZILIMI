# RCV Program/Register Alignment and Phase 1 Authorization Record

```text
Program                     : RECEIVABLE (RCV)
Governance task             : RCV-GOV-001
Decision                    : DEC-0030
Master Register owner       : CCB-001
Canonicalization milestone  : CAN-CUT-02
Architecture                : ADR-014
Record status               : CANONICAL / DEC-0030 CLOSED
Canonical merge             : PR #1222 / fcffb12941f33e36e6e42d9d742d0249eb210ab8
Phase 0                     : CLOSED (owner-supplied RCV-P0-T09 baseline)
Phase 1 execution authority : NOT GRANTED
Owner GO                    : OPEN / REQUIRED
```

Bu kayıt yalnız governance/register alignment ve Phase 1 yetki kapısını tanımlar. Kod,
schema, migration, test, runtime, veri erişimi, evidence execution, consumer switch veya
cutover yetkisi üretmez.

## 1. Governance Reconciliation Report

### 1.1 Doğrulanmış repository gerçekleri

- `SYSTEM-CONSTITUTION.md` içindeki `SYS-CAN-006`, tek bir Master Register kaydını ve
  duplicate register oluşturulmamasını zorunlu kılar.
- `product-backlog.md` içindeki `CCB-001`, canonical claim-balance clean-break hattının
  tek implementation-authority/master stream kaydıdır.
- `canonicalization-register.md` içindeki `CAN-CUT-02`, `CCB-001` altında izlenen açık
  milestone'dur; bağımsız veya rakip workstream değildir.
- `CAN-CUT-01` ve `VER-05`, Due/ClaimItem ve UYAP tarafındaki ayrı açık
  canonicalization/verification kayıtlarıdır; `CCB-001` veya bu alignment tarafından
  devralınmaz.
- `ADR-014`, `CCB-001` mimari kaynağıdır. `PR-11` consumer switch ve runtime cutover
  halen `NOT AUTHORIZED` durumundadır.
- `master-triage-register.md`, `CCB-001`in Master Triage'a taşınmamasını açıkça
  zorunlu kılar.

### 1.2 Owner tarafından sağlanan, bu görevde yeniden üretilmeyen baseline

Owner görev brief'i `RCV-P0-T01..T09 = COMPLETE`, `PHASE 0 CLOSED` ve
`PHASE 1 NOT AUTHORIZED` durumlarını precondition olarak verir. Bu kayıt Phase 0 analizini,
coverage'ını veya evidence paketini yeniden üretmez; yalnız bu owner-supplied closure
attestation'ını repository'nin mevcut canonical register zincirine bağlar.

### 1.3 Alignment seçimi

| Seçenek | Uyum sonucu | Disposition |
|---|---|---|
| `RCV-P0/P1` için ayrı program register entry | Mevcut work-item durumlarını ikinci bir program kaydında yeniden taşıyarak `CCB-001`, `CAN-CUT-01/VER-05` ve external-owner kayıtlarıyla paralel status/authority yüzeyi doğurur | **REJECTED — DUPLICATE REGISTER RISK** |
| `CCB-001` altında identity-only explicit cross-pointer | RCV program kimliğine tek bir register anchor verir; work-item execution/status ownership'ini mevcut canonical kayıtlarda bırakır | **SELECTED — MINIMUM COMPATIBLE ALIGNMENT** |

**DEC-0030 disposition:** `RCV-P0/P1`, program identity/register anchor amacıyla `CCB-001`
altında subordinate planning decomposition olarak kaydedilir. Bu pointer, RCV work-item'larının
execution veya status owner'lığını `CCB-001`e taşımaz. Ayrı implementation authority, anayasal
semantik, canonicalization milestone veya cutover hattı oluşturulmaz. PR #1222'nin approved
merge'iyle disposition canonical ve DEC-0030 `CLOSED` olmuştur; Phase 1 owner GO kapısı ayrı ve
açık kalır.

## 2. Program/Register Alignment Kaydı

| RCV kimliği | Canonical bağ | Yetki etkisi |
|---|---|---|
| `RCV` | `CCB-001` altında identity-only program/planning cross-pointer'ı | Yeni master stream veya work-item owner'lığı oluşturmaz |
| `RCV-P0` | Owner-supplied Phase 0 analytical closure | Execution veya implementation authority üretmez |
| `RCV-P1` | `CCB-001` altında owner-gated Phase 1 planning decomposition | Explicit owner GO olmadan task açılamaz |
| `RCV-P0-CP-01` | `Receivable Program Governance and Source Control` control-plane node'u | Yalnız §3 entry condition ile Phase 1 route'una izin verir; domain workstream değildir |
| `RCV-P0-BAR-0021:PHASE1_ENTRY` | Phase 1 execution entry barrier | Yalnız §4 kriterleriyle kapanır |
| `WAVE 0 / RCV-P1-T15-A` | İlk ve tek Phase 1 task adayı | Eligible adaydır; authorized veya started değildir |

### Namespace ayrımı

`RCV-P1 WAVE 0`, RCV planlama modelindeki wave kimliğidir. ADR-014 split-plan'daki tarihsel
`W0 — Scenario Infra` ile aynı kayıt değildir ve onu yeniden açmaz. Benzer şekilde RCV içindeki
`Phase 1`, ADR-014 cutover policy'deki pilot/cohort fazlarına veya `PR-11`e eşitlenemez.
Bu cross-pointer hiçbir RCV task'ını `ADR014-REP-*`, evidence run, consumer switch veya cutover
işi olarak kendiliğinden sınıflandırmaz; task kapsamı ancak ayrıca owner-authorized task brief'i
ile doğar.

### Mevcut execution/status owner'larının korunması

| Yüzey | Canonical owner kaydı | Alignment etkisi |
|---|---|---|
| Claim-balance / Hesap Özeti cutover | `CCB-001` / `CAN-CUT-02` / `ADR-014` | Status ve gate'ler korunur |
| Due / ClaimItem / UYAP cutover ve verification | `CAN-CUT-01` / `VER-05` | `CCB-001`e taşınmaz; open gate'ler korunur |
| External-domain sınırları | İlgili ratified domain governance ve kendi owner kayıtları | RCV pointer'ı external authority üretmez |
| RCV analytical task/wave modeli | `RCV-P0/P1` planning decomposition | Explicit task authority olmadan execution üretmez |

## 3. `RCV-P0-CP-01` Entry Koşulu

`RCV-P0-CP-01`, T03 kaynak modelindeki adıyla **Receivable Program Governance and Source
Control** control-plane node'udur. Document authority, semantic/execution authority ayrımı,
reading order, source hierarchy, rule placement, `REC-*` namespace'i, terminology,
ratification vocabulary, status-chain discipline, no-code-during-audit, repository provenance
ve program identifier status alanlarını kontrol eder. Domain workstream veya closure artifact'ı
değildir.

Bu control-plane'in Phase 1 entry condition'ı ancak aşağıdaki koşulların tümü sağlandığında
`SATISFIED` olur:

1. Owner-supplied `RCV-P0-T01..T09 COMPLETE / PHASE 0 CLOSED` attestation'ı korunur.
2. Canonical okuma/authority zinciri `GOVERNANCE-INDEX → SYSTEM-CONSTITUTION →
   RECEIVABLE-GOVERNANCE → ilgili canonical owner records → Decision Log → Master Register`
   olarak pinned ve çelişkisizdir.
3. Bu record, `product-backlog.md` içindeki `CCB-001` cross-pointer'ı,
   `canonicalization-register.md` içindeki `CAN-CUT-02` cross-pointer'ı ve DEC-0030
   Decision Log disposition'ı aynı approved merge ile `main` üzerinde canonical olur.
4. Ayrı RCV master register entry oluşturulmaz; mevcut execution/status owner kayıtları
   duplicate edilmez veya RCV tarafından override edilmez.
5. `CAN-CUT-01/VER-05`, `CAN-CUT-02`, representative evidence, `PR-11` ve runtime cutover
   statüleri bu alignment nedeniyle değiştirilmez.
6. İlk aday yalnız `WAVE 0 / RCV-P1-T15-A` olarak kaydedilir; başka task veya wave açılmaz.

`RCV-P0-CP-01 ENTRY CONDITION = SATISFIED`, tek başına Phase 1 execution authority değildir;
control-plane Phase 1 boyunca source/status discipline için uygulanmaya devam eder.

## 4. `RCV-P0-BAR-0021:PHASE1_ENTRY` Kapanış Kriteri

Barrier yalnız aşağıdaki kriterlerin tümü sağlanırsa kapanabilir:

1. `RCV-P0-CP-01 ENTRY CONDITION = SATISFIED` canonical main üzerinde doğrulanır.
2. Owner, aşağıdaki exact scope ile ayrı ve açık `GO-PHASE-1` verir.
3. Owner kararı Decision Log veya owner-approved authoritative record'a bağlanır.
4. Yetki yalnız `WAVE 0 / RCV-P1-T15-A` için geçerlidir; WAVE 1+ ve diğer RCV-P1 task'ları
   kapsam dışı kalır.
5. `RCV-P1-T15-A` başlamadan önce kendi task brief'i mode, mutation/runtime/data/evidence
   authority ve hard-stop sınırlarını açıkça taşır. Bu record eksik task authority'sini
   varsayımla tamamlamaz.
6. RCV task yetkisi; `PR-11`, representative evidence execution/acceptance,
   production data access, consumer switch, feature activation veya cutover yetkisi olarak
   yorumlanmaz. Bunların mevcut ayrı gate'leri korunur.

Barrier kapanmadan Phase 1 task execution başlatılamaz.

## 5. Phase 1 Authorization Record Taslağı

```text
Authorization ID : RCV-P1-AUTH-001
Program          : RECEIVABLE / RCV
Parent register  : CCB-001
Entry barrier    : RCV-P0-BAR-0021:PHASE1_ENTRY
Authorized wave  : [UNSET — owner decision required]
Authorized task  : [UNSET — owner decision required]
Owner decision   : [UNSET]
Decision date    : [UNSET]
Decision-log ref : [UNSET]
Status           : DRAFT / NOT AUTHORIZED
```

Beklenen owner kararı yalnız şudur:

```text
GO-PHASE-1:
Authorize WAVE 0 / RCV-P1-T15-A only.
```

Bu metnin taslakta bulunması kararın verilmiş olduğu anlamına gelmez. Alanlar owner'ın ayrı,
açık kararı gelene kadar `UNSET` kalır.

## 6. WAVE 0 Entry Checklist

| Kontrol | Gerekli durum | Mevcut durum |
|---|---|---|
| `CCB-001` cross-pointer canonical main'de | PASS | PASS — PR #1222 |
| `CAN-CUT-02` cross-pointer canonical main'de | PASS | PASS — PR #1222 |
| DEC-0030 canonical disposition | CLOSED | CLOSED — PR #1222 |
| `RCV-P0-CP-01` entry condition | SATISFIED | SATISFIED — PR #1222 |
| Explicit owner `GO-PHASE-1` | PRESENT | MISSING / REQUIRED |
| Authorized scope | Yalnız `WAVE 0 / RCV-P1-T15-A` | NOT AUTHORIZED |
| WAVE 1+ | CLOSED TO ENTRY | CLOSED TO ENTRY |
| Phase 1 execution | NOT STARTED before barrier closure | NOT STARTED |

## 7. Açık Owner GO Alanı

```text
OWNER DECISION: ______________________________________________
OWNER / RATIFIER: _____________________________________________
DECISION DATE: ________________________________________________
AUTHORITATIVE RECORD REFERENCE: ________________________________
```

Owner GO verilmezse korunacak safe-hold:

```text
PHASE 1 NOT AUTHORIZED
NO RCV-P1 TASK STARTED
CAN-CUT-01 / VER-05 OPEN
CAN-CUT-02 OPEN
PR-11 NOT AUTHORIZED
RUNTIME CUTOVER NOT AUTHORIZED
```
