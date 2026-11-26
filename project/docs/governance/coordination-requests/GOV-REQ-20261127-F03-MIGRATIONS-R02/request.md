# GOV-REQ-20261127-F03-MIGRATIONS-R02

Owner-authorized F03 preparation completion. Fresh main binding at b0db52eb1e8a95ccbe35066563cecc9248e750dd; source template GOV-REQ-20261126-F03-MIGRATIONS-R01 remains unchanged as provenance. Original owner decisions, the fixed migration exception, F03-before-R8 order and maintenance-only rollback are bounded by the direct 2026-11-26 owner instruction. No live authority is granted.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261127-F03-MIGRATIONS-R02",
  "requestFingerprint": "1876ea8a4e921b7604dd72fe35c10cd4528c3a2d30df8b99f68d72dc40f8b6bf",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-26T22:36:48Z",
  "baseMainSha": "b0db52eb1e8a95ccbe35066563cecc9248e750dd",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "F03-CANDIDATE-R01-PREPARATION-DECISIONS-20261126",
    "evidenceSha": "b0db52eb1e8a95ccbe35066563cecc9248e750dd"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "b0db52eb1e8a95ccbe35066563cecc9248e750dd"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/pending-migration-coordination-register.md",
    "recordIdentity": "# Pending Migration Coordination Register\n\n```text\nBelge yolu : project/docs/governance/pending-migration-coordination-register.md\nDurum      : LIVING / NON-NOR",
    "anchor": "i alınır, kolonlar yerinde kalabilir (eski kod kolonları okumaz) |\n| Canlı / dev DB | **NOT APPLIED** — canlı uygulama ayrı owner GO + EXACT-ONE paketi ister |\n",
    "expectedOldValue": "i alınır, kolonlar yerinde kalabilir (eski kod kolonları okumaz) |\n| Canlı / dev DB | **NOT APPLIED** — canlı uygulama ayrı owner GO + EXACT-ONE paketi ister |\n",
    "newValue": "\n\n## F03 — eksik migration koordinasyon girisi (2026-11-26)\n\nDisposition: IMPLEMENTED_IN_MAIN / LOCAL_CANDIDATE_VERIFIED / LIVE_NOT_AUTHORIZED / OWNER_EXCEPTION_APPROVED_FIXED_CANDIDATE_ONLY.\nBu kayit READY veya GO degildir; Ekim–Kasim kuyrugunun diger sahiplerine disposition uretmez.\nCandidate 1794a0f736182903472b1b3967fd78f38974bce2; tree 1f899cc673db4ed4176d6c2c61f0225bf648388b; base 31c8f763c18905c37a12304d000cae9c2560237a; source main 9ca1e00862f23bc321d349e73738ff21f627cd86.\n\n| Migration | Sahip / kaynak | SQL SHA256 | Nesne / durum |\n|---|---|---|---|\n| 20261125100000_task_history_events | OFFICE / F03-A2 #3347 | 8036acbc4618c4492ec5adc86d00a8604e5f1a8a640724f547f9c2a5f37df781 | TaskHistoryEvent tablo, iki indeks, tenant-bound FK, uc CHECK; yalniz ekleme, LIVE NOT APPLIED iddiasi yok: canli bu tur OLCULMEDI |\n| 20261125120000_task_first_review | OFFICE / F03-C #3348 | def6714f9e1349b966f6af0e8e91667fc03dde35526bc615b2749819f61aa100 | Task yedi kolon, bir indeks, iki CHECK; yalniz ekleme, LIVE NOT APPLIED iddiasi yok: canli bu tur OLCULMEDI |\n\nR7 envanter 143, aday 145, main 147. Taban 143 SQL ayni. Bekleyen aday allowlist'i sirayla bu iki migration.\nOwner karariyla adaya alinmayan: 20261115180000_poa_case_links (#3278), 20261116010000_client_statement_native_currency_sets (#3283). Uygulandi diye isaretlenmez; sonraki siralari ayri sahip/yetki/prova ister.\nMevcut sentetik kanit: R7 143 → aday 145; iki gecikmis migration F03'ten sonra uygulaninca temiz main zinciriyle sema esit. Bu teknik kanit contract istisnasi veya GO-MIGRATE degildir.\nOwner 2026-11-26, yalniz yukaridaki SHA/tree/taban ve iki SQL pini icin contract 3.3/4 istisnasini onayladi. Canonical locator: F03-CANDIDATE-R01-PREPARATION-DECISIONS-20261126; sozlesme eki ayri immutable request/execution/result zincirinden gecirilir. Diger guvenlik kurallari korunur; bu kayit GO-MIGRATE degildir. SHA/tree/SQL veya canli taban drifti yeni karar ister; istisna tasinmaz.\nIki migration'in ilgili testleri aday db/core-lifecycle listesinde; gecerli yerel CI yeniden kosulmadi. Yeni runtime'dan once migration + introspection zorunlu.\nYayin, canli okuma, backup, canli kopya, migrate, restore authority NONE. Veri etkisi/yarim kayit bulunmadigi varsayilmaz; ilk P-0'da olculur.\nF03'suz geri donuste kontrol ve gecmis kaybolur; Owner karari: D0 sifir olsa da tum gorev yazicilari ve otomatik yeniden baslaticilar kapali, PID/port/DB oturum kanitli bakim zorunlu; eski runtime otomatik acilmaz. Tekrar uygulama/manuel SQL/resolve/reorder yok.\n\nOwner yayin sirasi: F03, ardindan R8. R8 kendi sahibinin sonraki uyarlama ve dogrulamasidir; bu kayit R8 kanitlarini degistirmez.\n",
    "evidenceSha": "b0db52eb1e8a95ccbe35066563cecc9248e750dd",
    "expectedResultSha256": "9c3332e6db4d19ff7e74e0b67db6203e8c4b4b8578e371afe3457899e68454f9"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/pending-migration-coordination-register.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
