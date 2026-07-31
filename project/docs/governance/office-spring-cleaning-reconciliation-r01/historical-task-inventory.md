# Historical OFFICE Task Inventory

## Current count

```text
RATIFIED PREDECESSOR RECORDS                         199
POST-BOUNDARY RECORDS                                  3
CURRENT PRE-RECONCILIATION TOTAL                     202
UNKNOWN                                                0
```

The predecessor count is owner-ratified evidence at observed main
`b5bf8977e3e4458c2da294f75aa48558df5e581c`. It is not silently expanded into invented
task identifiers. Instead, the current inventory preserves that sealed aggregate and
adds the exact first-parent deltas that became relevant after that boundary:

| Record | PR | Merge SHA | Classification | Current disposition |
|---|---:|---|---|---|
| W2 push-event changed-file parser reconciliation | #1975 | `2952860a2f5bbd3b5a5986f21e9c1f02604ea8eb` | shared CI dependency | CLOSED / parser blocker resolved |
| OFFICE reconciliation authority bootstrap binding | #1992 | `d46bca4a9530b6fcbafdc344bb2859305ea2ce11` | shared control-plane | CLOSED / consumed by authority materialization |
| OFFICE reconciliation authority materialization | #1993 | `5228d633f02337cc32b245a5af35919f6241573d` | OFFICE/shared governance | CLOSED / SA01 + EG01 canonical |

The current reconciliation itself is not counted before its merge. Once merged it
becomes a new historical record; that closeout fact must be derived from the PR, not
predeclared here.

## Evidence classes retained per record

The machine-readable companion preserves:

- task/program/capability identity where current evidence exposes it;
- PR and merge SHA;
- implementation, consumer, migration, test and governance evidence references;
- claimed state separately from final disposition;
- explicit `UNKNOWN` rather than inferred details.

The 199-record predecessor aggregate was not deposited as a record-level repository
artifact. This reconciliation therefore keeps its ratified count and provenance intact
and does not fabricate the missing row expansion. The three post-boundary records are
fully enumerated.

## Historical interpretation

The count is a work-item inventory, not a delivery score. Multiple records may concern
the same capability, and a governance/CI record is not an implemented runtime
capability. Capability state is authoritative only in `capability-delivery-matrix.md`
and `capability-status.json`.
