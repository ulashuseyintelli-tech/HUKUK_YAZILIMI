# Runtime Operability Certification R01 — Decision Log

Audit base: `cf82ea70d37a16287674e82d0bee99d540277b88`

## ROC-W0-DEC-001 — Two independent axes

Runtime status and historical closure certification are independent. Neither merge nor static
binding is operational closure evidence.

## ROC-W0-DEC-002 — Contextual closure claims

Closure claims require contextual terminal-delivery language. Behavioral fail-closed terms,
default-closed states, feature/command names, and technical closure concepts are excluded.

## ROC-W0-DEC-003 — Evidence-level mapping

Only exact capability references, exact changed package-script keys, and direct implementation
files can associate a reliable closure claim with a capability. Broad or absent mappings cannot
support defect or operational-confirmation certification.

## ROC-W0-DEC-004 — Legacy metric containment

`incorrectlyClosed` remains backward-compatible and explicitly non-authoritative for closure
certification. New defect, uncertified, and confirmed counts are computed from the two-axis model.

## ROC-W0-DEC-005 — Sealed audit preservation

This successor methodology does not mutate or retroactively rewrite
PR #1795 sealed audit artifacts.

It re-evaluates closure certification using the current canonical
repository snapshot and the corrected methodology.

