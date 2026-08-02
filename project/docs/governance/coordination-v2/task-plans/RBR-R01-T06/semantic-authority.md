# RBR-R01-T06 — P1 sensitive-surface owner disposition

<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=RBR-R01-T06-OWNER-DISPOSITION-SA01 -->

Bu belge, `RBR-R01-T06` için owner tarafından ratifiye edilen P1 hassas-yüzey
düzenini ve pre-activation sınırlarını transkripsiyon olarak taşır. Yeni bir
business, security veya legal policy icat etmez; `RBR-R01-T05` kaydındaki
34/34 disposition muhasebesini yürütülebilir bir authority tuple'ına bağlar.

## Owner ratification excerpt

```text
PROGRAM:
REPOSITORY-WIDE-CAPABILITY-BINDING-ACTIVATION-AND-OPERABILITY-RECONCILIATION-R01

TASK:
RBR-R01-T06 — P1 SENSITIVE-SURFACE OWNER DISPOSITION
AND PRE-ACTIVATION AUTHORIZATION RECONCILIATION

OWNER DISPOSITION:
RATIFIED

EXECUTION MODE:
Authority/contract materialization ve pre-activation hardening planı hazırlanabilir.
Bu grant endpoint registration veya production activation yetkisi vermez.

FORBIDDEN:
- Hassas modülleri AppModule’a bağlamak
- Production aktivasyonu
- Secret/config değişikliği
- W3 başlatmak
- Evidence fazını yeniden açmak
- Kapsam dışı kod değişikliği

EXPECTED TERMINAL:
RBR-R01-T06:
CLOSED / CANONICAL / PRE-ACTIVATION AUTHORITY MATERIALIZED

NEXT:
RBR-R01-T07 — OPS PLAYBOOK AUTHORIZATION HARDENING IMPLEMENTATION

W3:
NOT STARTED

PROGRAM LOCK:
ACTIVE
```

## Binding semantic decisions

| Surface | Count | Binding decision | Precondition before any later activation task |
|---|---:|---|---|
| Cross-tenant | 8 | `KEEP_DORMANT / DO_NOT_BIND` | Real operational consumer, store connection and a separate task-bound activation authority |
| Break-glass | 6 | `KEEP_DORMANT / HARDEN_BEFORE_BIND` | Request/approve/deny/revoke/renew matrix, separation-of-duty, audit and renew-approver policy |
| Manifest/DLQ admin | 7 | `KEEP_DORMANT / HARDEN_BEFORE_BIND` | Admin authorization, tenant isolation, retry idempotency, audit and operational consumer |
| Ops playbook | 12 | `PRE-ACTIVATION HARDENING REQUIRED` | The twelve acceptance records in `p1-disposition-and-acceptance.md` are all PASS |
| Client-accounting UI | 1 | `NO CODE REMEDIATION` | Remains `REACHABLE_PRODUCTION_UNVERIFIED`; evidence phase is not reopened |

The disposition above is semantic authority only. It does not bind a module,
register an endpoint, change configuration, change schema, or activate a
production graph.

