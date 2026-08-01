# UYAP Official AlacakKalemi Structured Emission I01 v1.0

## Status and authority

- Task: `UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01`
- Program: `UYAP-MODULE-FULL-GAP-CLOSURE-R02`
- Semantic authority: `UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-SA01`
- Execution grant: `UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01-EG01`
- Predecessor: canonical M01 Legal-Basis consumer binding
- Runtime: dormant and default-OFF
- Production call site: none

This package consumes the canonical RECEIVABLE M01 projection unchanged. UYAP does not
derive, replace, upgrade, or reinterpret Legal Basis authority.

## Bounded flow

```text
opaque claim/snapshot relation
  -> canonical M01 exact-version consumer
  -> same-tenant/same-case relation guard
  -> server-owned ClaimItem, instrument, proceeding and judgment evidence
  -> W-01...W-05 wrapper resolver
  -> opaque M01-qualified builder capability
  -> canonical codelist/party preflight
  -> structured wrapper/alacakKalemi XML
  -> lossless ISO-8859-9 encoding
```

The service exposes no controller, route, transport, persistence writer, module provider, or export.
Activation requires `UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_ENABLED=true` and the
already-canonical M01 activation gates. The default state is disabled.

## Wrapper contract

| Rule | Canonical server evidence | Wrapper | Disposition |
|---|---|---|---|
| W-01 | `InstrumentType.CEK` | `cek` | allowed |
| W-02 | `InstrumentType.SENET` | `senet` | allowed |
| W-03 | `InstrumentType.BONO` | `senet` | allowed |
| W-04 | `InstrumentType.POLICE` | `police` | allowed |
| W-05 | judgment enforcement + `ClaimItem.sourceDocumentType=ILAM` + canonical `CaseJudgment` | `ilam` | allowed |
| W-06 | contract | none | not authorized |
| W-07 | other claim | none | not authorized |

Caller-supplied wrapper or Legal Basis fields are not part of the input contract. Instrument
and judgment signals are read with exact tenant/case/claim predicates. Instrument plus ILAM is
ambiguous and fails closed. No `digerAlacak` or `kontrat` fallback exists.

The evidence-reader result must repeat the exact M01 tenant, case, ClaimItem, snapshot identity,
and snapshot hash. Any mismatch is rejected before wrapper qualification or serialization.

## Claim and money boundary

- `INTEREST`, `PRE_INTEREST`, and `POST_INTEREST` ClaimItems are rejected.
- An M01 projection with `componentCategory=INTEREST` is rejected even if the persisted row is
  not typed as interest.
- `faiz` child emission is not implemented.
- `Decimal(15,2)` is converted through an exact minor-unit `bigint` representation; floating
  point conversion and silent rounding are forbidden.
- Claim order is preserved and duplicate claim relations are rejected.

## Fail-closed and no-partial-output contract

Every M01 relation must succeed before any ClaimItem or wrapper evidence is read. Any M01,
scope, persistence-read, wrapper, base-serialization, structured-serialization, or encoding
failure returns only a deterministic `REJECTED` result. Rejected results contain neither XML
nor bytes. There are no writes, events, outbox messages, network calls, or partial artifacts.

The existing public `serializeOfficialExchange` entry point continues to reject every direct
non-empty `alacakKalemleri` input with `UNAUTHORIZED_ALACAK_KALEMI_PARENT`. Structured emission
is reachable only through factory-issued runtime capabilities created after M01 and W-01...W-05
qualification.

## Output claims

Success means only:

- deterministic official-shaped XML was produced;
- the XML declaration and actual ISO-8859-9 bytes match;
- the encode/decode round trip is lossless;
- emitted codelist fields passed the existing canonical registry gate.

It does not mean strict DTD validation, UYAP acceptance, submission readiness, transport
delivery, production activation, or legal-basis creation. `officialDtdValidated` remains `false`.

## Verification surface

- structured emission behavior and all-or-nothing tests;
- M01 failure matrix and zero downstream-read evidence;
- W-01...W-05 resolution tests;
- ambiguity, unresolved wrapper, interest, scope, duplicate and encoding rejection tests;
- legacy direct-parent regression tests;
- static no-call-site, module-local, default-OFF, no-write and no-fallback guards;
- CI manifest inclusion so the tests cannot silently become orphaned.
