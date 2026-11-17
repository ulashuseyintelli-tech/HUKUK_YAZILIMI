# KUR-C / FR-7 DV-13 — approved evidence-bound calculation contract

This request records the owner-approved conditions and the requirement to keep unsupported results uncomputable. The prior KUR-C evidence record and its three open questions stay intact. Product implementation, calculation activation and live operation are outside scope.

## Owner decision

> KUR-C’nin kanıtla sınırlı hesap sözleşmesini onaylıyorum. Doğrulanmış hükümler yalnız belgelenen koşullarında kabul edilsin. Açık matrah, kur ve kısmi ödeme sorularına bağlı kalemler hesaplanamaz kalsın, sıfır veya tahmini tutar üretilmesin. A/geçici D ve E2/E1/H6/G2 korunsun. Kalıcı hesap dalı, eksik dayanak doğrulanıp ilgili koşul ayrıca onaylandığında açılsın.

The owner then instructed CODEX_LOCAL to record this decision through the existing chain. The approved scope links to the [prior evidence request](../GOV-REQ-20261117-OFFICE-KURC-EVIDENCE-SA01/request.md) and the [verified result](../../coordination-results/GOV-REQ-20261117-OFFICE-KURC-EVIDENCE-SA01/result.md). The existing governance authority and execution grant are separate references. This request confers no target writership or merge authority.

## Approved conditions

| Item | Documented condition | Unresolved boundary |
|---|---|---|
| Advance enforcement fee | Harçlar Kanunu m.29: 0.5% of the legally established claim amount in the applicable non-judgment enforcement proceeding, credited against the final fee. | Pre-filing interest inclusion conditions and complete base components. |
| Collection fee | Harçlar Kanunu m.20 and m.28/b: post-filing interest is excluded. In the circumstances addressed in Yargıtay 12. HD 2016/4363, actual-payment-date FX applies where the claim was requested on that basis. | Remaining base components and fallback when no rate is published. |
| Enforcement attorney fee | AAÜT m.11/1 and m.11/4 and m.21: the applicable tariff and its cap are tracked separately from the applicable FX date. The three-quarter tariff amount applies when timely full performance is established. The payment-date FX cases are limited to their documented conditions. | General rate type, complete base, partial-payment discount or full-fee conditions, bands and treatment of prior fee payments. |

Relevant sources are the [Harçlar Kanunu](https://www.mevzuat.gov.tr/MevzuatMetin/1.5.492.pdf), the [AAÜT](https://www.barobirlik.org.tr/dosyalar/belgeler/AvUcretTarifesi/tbb2026.pdf), and Yargıtay 12. HD [2016/4363](https://karararama.yargitay.gov.tr/getDokuman?id=217197700), [2018/5321](https://karararama.yargitay.gov.tr/getDokuman?id=428417700) and [2015/30611](https://karararama.yargitay.gov.tr/getDokuman?id=181095500), İstanbul BAM 12. HD [2022/153](https://emsal.uyap.gov.tr/getDokuman?id=729420200), and Yargıtay 8. HD [2016/10002](https://karararama.yargitay.gov.tr/getDokuman?id=222273700). None of the partial-payment precedents is generalized into an automatic formula.

## Immutable governance request

REQUEST_ONLY: one immutable request plus the generated register.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261118-OFFICE-KURC-CALC-CONTRACT-SA01",
  "requestFingerprint": "66414d0ea78f122831b6b8997c9ab6b5dd5fb32e93f7b07fcff0d487bf85ba64",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-17T21:49:38Z",
  "baseMainSha": "3304dee3d9aa26e98d90b4a85e0ae01c43a5b4e7",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "3304dee3d9aa26e98d90b4a85e0ae01c43a5b4e7"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "3304dee3d9aa26e98d90b4a85e0ae01c43a5b4e7"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-18 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=OFFICE-KURC-CALC-CONTRACT-SA01 --> **SUPPLIED OWNER DECISION — KUR-C EVIDENCE-BOUND CALCULATION CONTRACT (FR-7 / DV-13):** Verified provisions apply solely in their documented conditions. Each calculation requires an applicable official basis for its components and, where relevant, its currency conversion and partial-payment treatment. | Peşin harç, tahsil harcı and enforcement attorney fees retain distinct legal bases, tariff conditions and event dates. Any item that depends on an unresolved base, FX or partial-payment rule remains uncomputable. Do not substitute zero or an estimated amount. Existing source, amount and tariff attribution remains intact. | Direct owner decision in this CODEX_LOCAL task: approval of the bounded KUR-C contract and instruction to record that approval through the existing governance chain. Prior evidence record: [OFFICE-KURC-EVIDENCE-SA01](coordination-results/GOV-REQ-20261117-OFFICE-KURC-EVIDENCE-SA01/result.md). | KUR-C-OPEN-1, OPEN-2 and OPEN-3 and unresolved partial-payment fee calculation remain open. Preserve FR-7 model A and temporary D, E2/E1/H6/G2 and legacy records. A permanent calculation branch requires verification of the missing official basis and separate owner approval of the exact condition. DV-14, product changes and live action remain outside this record. |",
    "evidenceSha": "3304dee3d9aa26e98d90b4a85e0ae01c43a5b4e7",
    "expectedResultSha256": "5bd1d315dc1df17e44789595720706d3abf187437a4689b938e14a622e9192bb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
