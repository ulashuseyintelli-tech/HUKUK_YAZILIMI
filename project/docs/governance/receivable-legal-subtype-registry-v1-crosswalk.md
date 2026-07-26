# Receivable Legal Subtype Registry V1 — Crosswalk

Bu crosswalk, `RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY` v1 machine artifact'ının canonical Receivable
contracts ile izlenebilirliğini gösterir. Normatif subtype alanlarının authority'si registry JSON,
checksum manifest ve ratification record birlikteliğidir.

## Legal Basis → allowed subtype

| Legal Basis code | Ratified legal role | Registry category | Exact allowed subtype code(s) |
|---|---|---|---|
| `KANUN_3095_1` | `RATE_AUTHORITY` | `ACCRUED_INTEREST` | `STATUTORY_INTEREST` |
| `KANUN_3095_2` | `RATE_AUTHORITY` | `ACCRUED_INTEREST` | `COMMERCIAL_DEFAULT_INTEREST`, `STATUTORY_DEFAULT_INTEREST` |
| `TBK_117` | `FORMATION_CONDITION`, rate authority yok | `ACCRUED_INTEREST` | `DEFAULT_INTEREST` |
| `TBK_118` | `CONSEQUENCE_AUTHORITY` | `ANCILLARY` | `DELAY_DAMAGE` |
| `TBK_120` | `RATE_CONSTRAINT / CONTRACTUAL_RATE_AUTHORITY` | `ACCRUED_INTEREST` | `CONTRACTUAL_DEFAULT_INTEREST` |
| `TTK_1530` | `FORMATION_CONDITION / RATE_AUTHORITY / COST_AUTHORITY` | `ACCRUED_INTEREST`, `COST` | `COMMERCIAL_COLLECTION_COST`, `COMMERCIAL_DEFAULT_INTEREST` |

`COMMERCIAL_DEFAULT_INTEREST` için `KANUN_3095_2` ve `TTK_1530` exactly-one-of alternatiflerdir;
birbirinin default'u değildir. `TTK_1530` yalnız kapsama giren ticari mal/hizmet tedarikinde
kullanılır.

## Subtype → formation evidence

| Subtype | Formation condition | Rate/amount authority | Mandatory distinguishing evidence |
|---|---|---|---|
| `DEFAULT_INTEREST` | Exact maturity + TBK_117 default start | Ayrı exact policy/rate source | Maturity, notice/no-notice basis, default start; generic fallback prohibition |
| `DELAY_DAMAGE` | Exact default fact | Proven damage amount | Damage, causation and liability source; automatic interest/penalty prohibition |
| `CONTRACTUAL_DEFAULT_INTEREST` | Exact contract clause + default start | Contract rate + TBK_120 limit inputs | Exact contract version/fingerprint, clause, rate, limit and liability context |
| `STATUTORY_INTEREST` | Exact interest-claim source/start | KANUN_3095_1 rate record | Default-condition inference prohibited |
| `STATUTORY_DEFAULT_INTEREST` | Exact default start | KANUN_3095_2 rate record | Pre-default classification prohibited |
| `COMMERCIAL_DEFAULT_INTEREST` | Exact commercial character + default start | Exact selected Legal Basis and rate/policy | Commercial evidence; TTK_1530 use additionally requires qualifying supply evidence |
| `COMMERCIAL_COLLECTION_COST` | Qualifying TTK_1530 supply | Proven fixed statutory commercial cost | Invoice/request, delivery/performance, due/payment term and party-status evidence |

## Canonical contract traceability

| Registry concern | Canonical source |
|---|---|
| ClaimItem formation authority/invariants | `SYSTEM-CONSTITUTION.md` v1.4; `RECEIVABLE-GOVERNANCE.md` §23.7–§23.8 |
| Exact Document/source binding | `DOCUMENT-SOURCE-GOVERNANCE.md`; S08-D01A |
| Legal Basis registry ownership | S08-D01B; `RECEIVABLE-GOVERNANCE.md` §23.19 |
| Exact-version deferred execution | D02-R01 |
| Non-circular Legal Basis release identity | D02-R01A |
| Canonical component categories | D02-CR01; `allowedComponentCategories[]` membership-and-echo |
| Initial Legal Basis semantics | D02-F01-R03; `RECEIVABLE-GOVERNANCE.md` §23.32.2 |
| Eligibility resolver parity evidence | PR #1575 / `92a478692903e231785281daccbe871f991efca7` |
| Subtype registry authority | SR01 machine artifact + schema + checksum + ratification record |

## Runtime boundary

The registry is ratified data/contract, not an activated resolver. I02B admission and I03 finalizer
remain default-disabled; I04 remains blocked. A production consumer must later prove exact registry
checksum/version binding, exact Legal Basis projection binding and exact Document V4 adapter
availability without current/latest/default behavior.
