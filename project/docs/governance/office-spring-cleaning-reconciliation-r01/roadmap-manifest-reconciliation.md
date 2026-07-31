# Roadmap, Manifest and Backlog Reconciliation

## Drift verified

| Surface | Stale fact | Reconciled current fact |
|---|---|---|
| `active-roadmap.md` | current pointer remained on early CAP02 planning units | CAP02 technical chain is closed; next owner-gated unit is F01 |
| `OFFICE-DELIVERY-MANIFEST.md` | §10/§11 still presented CAP02 planning units as next | Spring-cleaning snapshot records CAP02 closure, CAP09A consumer gap and successors |
| `product-backlog.md` | hardening said `OPEN / NOT IMPLEMENTED` | PR #1494 and recorded migration application make it implemented/canonical; production still uncertified |

Corrections are additive. Historical statements retain the status that was true at
their original time; a later section marks them superseded for current-state reading.

## Current sequence

```text
1  OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01
2  OFFICE-SC-F06-OPEN-OD-DECISION-PACK-R01
3  OFFICE-CAP-09A-CONSUMER-01-R01
4  OFFICE-SC-F03-DEDICATED-OFFICE-E2E-R01
5  OFFICE-SC-F04-EXECUTION-OFFICE-TEST-SUITE-R01
6  OFFICE-SC-F05-PRODUCTION-CONFIG-AND-DEPLOYED-EVIDENCE-R01
7  OFFICE-SC-F07-CAP02-PHYSICAL-ORPHAN-DISPOSITION-R01
```

The W2 parser task is absent because PR #1975 resolved that dependency. Every listed
successor remains `OWNER GO REQUIRED / NOT STARTED`.
