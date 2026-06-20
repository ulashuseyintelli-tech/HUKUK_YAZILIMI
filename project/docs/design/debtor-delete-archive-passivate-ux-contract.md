# PR-D5a - Debtor Delete / Archive / Passivate UX Contract

Status: Draft UX/product contract

Scope: documentation only. This document does not change schema, create a
migration, implement endpoints, modify runtime behavior, modify UI, modify
tests, or change data.

Base decisions:

- PR-D3 defines the `Debtor` hard-delete invariant.
- PR-D4 expands `DebtorService.delete()` preflight so hard-delete remains only
  for a truly empty tenant-local trash debtor.
- `CaseDebtor` lifecycle is already case-specific and independent from any
  future debtor-level lifecycle.

Core product rule:

```text
"Delete", "passivate", and "archive" are different user intentions.

Do not use one button or one endpoint to silently mean all three.
```

## 1. Terms

### Kalici Sil

Meaning:

- Permanently removes a debtor row.
- Allowed only when the debtor is a tenant-local trash record with no case,
  history, address, task, intelligence, audit, attribution, or external
  dependency.
- Backed by the existing `DELETE /debtors/:id` route and the PR-D4 preflight.

User intent:

```text
"Yanlis veya bos acilmis, hic kullanilmamis borclu kaydini kaldir."
```

### Kullanimdan Kaldir / Pasiflestir

Meaning:

- Keeps the debtor and all history.
- Prevents the debtor from being selected for new debtor-level operational
  use by default.
- Does not delete or mutate existing case-specific relationships.
- Requires a future explicit debtor-level lifecycle field and endpoint if
  approved.

User intent:

```text
"Bu borclu artik yeni dosyalarda kullanilmasin, ama gecmis dursun."
```

### Arsivle

Meaning:

- Keeps the debtor and all history.
- Hides the debtor from default debtor list/search surfaces.
- May also imply the debtor is not selectable for new case creation unless
  restored first.
- Requires a future explicit debtor-level lifecycle/archive field and endpoint
  if approved.

User intent:

```text
"Gecmisi sakla, ama normal listelerde gormeyeyim."
```

### Geri Al / Reactivate

Meaning:

- Restores a debtor from a future passive or archived state.
- Must be explicit, tenant-scoped, and audited if implemented.
- Must not automatically reactivate any passive `CaseDebtor` relationship.

User intent:

```text
"Bu borcluyu yeniden kullanilabilir hale getir."
```

## 2. API Meaning

Current implemented behavior:

```text
DELETE /debtors/:id
```

means:

```text
Kalici Sil, only for an empty trash Debtor.
```

Rules:

- The route must keep tenant-scoped ownership validation.
- The route must keep PR-D4 dependency preflight.
- If any blocker exists, the route must reject rather than passivate,
  archive, detach, hide, or mutate lifecycle state.
- A rejected delete does not imply any other action has happened.

Future routes, not implemented by PR-D5a:

```text
POST /debtors/:id/passivate
POST /debtors/:id/archive
POST /debtors/:id/reactivate
```

or equivalent route names may be designed later. Their exact shape is an open
API decision.

Non-current behavior:

- `DELETE /debtors/:id` is not a passivation endpoint.
- `DELETE /debtors/:id` is not an archive endpoint.
- `DELETE /debtors/:id` is not a "remove from all cases" endpoint.
- `DELETE /debtors/:id` is not an admin hard-delete override.

## 3. UI Rules

Current UI uses labels such as:

```text
Borcluyu Sil
```

Target terminology:

- The debtor delete action should eventually be labelled `Kalici Sil`.
- The confirmation copy should explain that it only works for unused debtor
  records.
- Linked debtors cannot be deleted through the normal user route.
- Future passive/archive actions must be separate buttons or menu items.

Recommended future action labels:

| Action | Label | Meaning |
| --- | --- | --- |
| Hard-delete empty trash debtor | `Kalici Sil` | Permanently delete only if no blockers exist. |
| Prevent new use | `Kullanimdan Kaldir` or `Pasiflestir` | Keep history, block new operational selection by default. |
| Hide from normal lists | `Arsivle` | Keep history, hide from default list/search. |
| Restore | `Geri Al` or `Yeniden Aktif Et` | Restore future passive/archive state. |

Recommended blocked-delete copy:

```text
Bu borclu dosya, adres, gorev, tarihce veya atif kayitlariyla baglantili
oldugu icin kalici olarak silinemez.
```

Important UX distinction:

- `Kalici Sil` answers "Can this unused record disappear?"
- `Kullanimdan Kaldir` answers "Can this debtor stop being used in new work?"
- `Arsivle` answers "Can this debtor be hidden from ordinary browsing?"

These should not be collapsed into one control.

## 4. Selector / List / Detail Behavior

Future state semantics, if a debtor lifecycle field is approved:

| Debtor state | New case debtor selector | Debtor list default | Debtor detail/history |
| --- | --- | --- | --- |
| `ACTIVE` | Visible and selectable | Visible | Readable |
| `PASSIVE` | Hidden or disabled by default | Visible with badge or filterable | Readable |
| `ARCHIVED` | Hidden by default | Hidden by default; visible with `archive included` filter | Readable |

Selector rules:

- New case debtor selectors should default to active debtors only.
- Passive debtors should not be silently added to new cases.
- Archived debtors should require explicit reactivation before use.
- Search results should not surprise users by returning archived records unless
  an archive-inclusive filter is active.

List rules:

- The default debtor list should remain focused on ordinary usable debtors.
- Passive and archived states need visible labels if they are shown.
- Archived debtor discovery should be opt-in, similar to the existing case
  archive precedent.

Detail/history rules:

- Historical records should remain readable for passive or archived debtors.
- Existing case relationships, service history, collections, tebligats,
  address research, asset queries, third-party records, external cases, tasks,
  and audit records should remain explainable.

## 5. CaseDebtor Independence

`Debtor` lifecycle and `CaseDebtor` lifecycle are different axes.

Rules:

- Debtor lifecycle must not automatically mutate `CaseDebtor.lifecycleStatus`.
- `CaseDebtor.lifecycleStatus` remains case-specific.
- A debtor can be globally active while one case relationship is passive.
- A debtor can become globally passive while an existing case relationship
  remains active, if the product/legal decision allows that relationship to
  continue.
- Reactivating a debtor must not automatically reactivate passive
  `CaseDebtor` rows.
- Reactivating a `CaseDebtor` must not automatically reactivate a passive or
  archived debtor.

Interaction examples:

| Combination | Product meaning |
| --- | --- |
| `Debtor.ACTIVE + CaseDebtor.PASSIVE` | Debtor is generally usable, but this case relationship is no longer active. |
| `Debtor.PASSIVE + CaseDebtor.ACTIVE` | Debtor is not for new use, but this existing case relationship may still be active. |
| `Debtor.ARCHIVED + CaseDebtor.ACTIVE` | Needs explicit product decision before implementation; do not infer automatic case relationship mutation. |

## 6. Non-goals

PR-D5a does not:

- decide final debtor lifecycle schema fields;
- add `Debtor.lifecycleStatus`;
- create migrations;
- implement passivate, archive, or reactivate endpoints;
- change `DELETE /debtors/:id`;
- change UI labels or buttons;
- change selectors, debtor list, or detail views;
- change `CaseDebtor` lifecycle behavior;
- introduce admin hard-delete override;
- solve legacy orphan references or JSON debtor references.

## 7. Future Decision Checklist

Before implementing schema or endpoints, answer:

1. Is `PASSIVE` a global "do not use in new work" state, or only a visual
   warning?
2. Is `ARCHIVED` only hidden-from-list, or also blocked from selectors?
3. Can a passive debtor be edited?
4. Can a passive debtor receive new addresses or intelligence?
5. Who can reactivate a debtor?
6. What audit event is required for passivation, archive, and reactivation?
7. Should the debtor list support `includePassive` and `includeArchived`
   separately?
8. Should API clients receive lifecycle state in all debtor DTOs?

## 8. Exit Criteria

This contract is complete when:

- product terms are separated;
- current `DELETE /debtors/:id` meaning is documented;
- future passivate/archive/reactivate endpoints are explicitly non-current;
- selector/list/detail expectations are documented;
- `Debtor` and `CaseDebtor` lifecycle independence is documented;
- non-goals are explicit;
- no code, schema, migration, UI, tests, or data are changed.
