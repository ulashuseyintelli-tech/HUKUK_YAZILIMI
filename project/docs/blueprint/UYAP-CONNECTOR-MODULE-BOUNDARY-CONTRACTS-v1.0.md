# UYAP Connector Module Boundary Contracts v1.0

```text
Belge yolu   : project/docs/blueprint/UYAP-CONNECTOR-MODULE-BOUNDARY-CONTRACTS-v1.0.md
Durum        : CANONICAL CONTRACT PACK — UYAP-MODULE-BOUNDARY-CONTRACTS-01 (2026-07-21)
Fonksiyon    : Office/Client/Debtor/Receivable/Collection bounded-context'lerinin UYAP Connector
               ile dar boundary kontratları (canonical girdi/çıktı, authority/evidence gate,
               devredilemez domain ownership, failure/reconciliation sorumlulukları)
Implementation Authority : NONE
Real Transport : 0
UYAP Cutover : HARD HOLD
```

## Belgenin Doğası ve Otoritesi

Bu belge **subordinate normative annex DEĞİLDİR** ve **yeni bir constitution DEĞİLDİR.** Mevcut anayasayı **consume eder** — yeni normatif hüküm üretmez, yalnız beş bounded-context'in connector ile sınır kontratlarını mevcut canonical'a dayanarak kaydeder.

**Otorite kaynakları (consume edilen, DEĞİŞTİRİLMEYEN):**
- `UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md` §19 (Constitution v1.1) ve §4 (Beş Modül Sınır Matrisi), §3 (Connector Sahipliği)
- `UYAP-CONNECTOR-NORMATIVE-ANNEX-v1.0.md` — `UYAP-CONST-001..010`
- `decision-log.md` `UYAP-CONSTITUTION-V11-01` / D12

Merkezi UYAP kuralları (UYAP-CONST hükümleri) bu belgeye **kopyalanmaz** — yalnız referans verilir (OD-UYAP-02). Bir çelişkide synthesis kök + normatif annex + owner karar kaydı üstündür. Bu belge **IMPLEMENTATION AUTHORITY üretmez**; domain ownership'i değiştirmez; runtime/schema/migration/transport/credential kararı vermez; F4-b başlatmaz.

Convergence sınıfları: **REUSE** (mevcut canonical yüzeyi doğrudan tüketilir) · **DELTA** (mevcut yüzey var ama boundary için eksik/uyarlanmalı) · **GAP-NEW** (hiçbir mevcut canonical yüzey karşılamıyor).

---

## Shared Contract Envelope (beş kontrat için ortak, bağlayıcı hükümler)

Aşağıdaki hükümler UYAP-CONST maddelerinden **referansla** taşınır; bu belgede yeniden ratifiye edilmez:

- `tenantId` yalnız authenticated/trusted context'ten gelir (UYAP-CONST-002).
- `operationId`, `attemptId` ve `idempotencyKey` UYAP-CONST-004'e uyar (server-generated/opaque/immutable; idempotencyKey versioned/server-controlled, ham-payload-hash'ine eşitlenemez).
- `clientRequestId` yalnız correlation'dır; authority veya idempotency source DEĞİLDİR.
- Client-supplied ID authority ÜRETMEZ.
- `ProviderState.ACCEPTED ≠ LegalEffectState.CONFIRMED` (UYAP-CONST-005).
- Provider sonucu domain gerçeğine **doğrudan yazılamaz**; provider evidence **önce reconcile edilir** (UYAP-CONST-006).
- Ham PII generic JSON loguna yazılamaz; masked display value canonical evidence DEĞİLDİR (UYAP-CONST-007).
- Her yeni attempt'te authority/POA/CPE yeniden değerlendirilir (UYAP-CONST-002).
- Bir modül başka modülün source-of-truth alanını **yeniden hesaplayamaz.**
- Connector **hiçbir bounded context'in domain owner'ı DEĞİLDİR** (synthesis §3).
- Cross-module mutation yalnız **açık contract + ayrı owner-authorized runtime task** ile mümkündür.
- REAL TRANSPORT 0 · PORTAL AUTOMATION PROHIBITED · CREDENTIAL/PIN/PRIVATE-KEY CUSTODY PROHIBITED · CUTOVER HARD HOLD.

---

## UYAP-BC-OFFICE-001

```text
contract_id                 : UYAP-BC-OFFICE-001
title                       : Office / Avukat-Personel Boundary Contract
status                      : CANONICAL CONTRACT / IMPLEMENTATION AUTHORITY NONE
bounded_context_owner       : OFFICE / AVUKAT-PERSONEL
```
**purpose:** Office bounded-context'in connector'a sağladığı actor/lawyer/approval/signature authority girdilerini ve connector'ın kabul ettiği authority-resolution evidence çıktılarını, devredilemez ownership sınırlarıyla kaydetmek.

**canonical_inputs:** tenant/office identity · authenticated `actorUserId` · `actingLawyerId` · `approverId` · `signatureOwnerId` · delegation/reporting relationship reference · role/capability eligibility reference.

**canonical_outputs:** approval evidence reference · signature-authority evidence reference · acting-lawyer resolution evidence · authority failure disposition.

**authority_source:** OFFICE bounded-context governance (OFFICE-GOVERNANCE) + UYAP-CONST-002 (actor/lawyer/representation authority normatif yönü, OD-UYAP-03).

**evidence_requirements:** actor/lawyer/approver/signature resolution kararının persist edilebilir evidence reference'ı; authority failure disposition kaydı. Evidence PII-minimize (UYAP-CONST-007).

**state_and_identity_requirements:** `actorUserId` server principal'dan; her attempt'te authority yeniden değerlendirilir (UYAP-CONST-002/004).

**allowed_consumption:** connector Office'ten actor/lawyer/approval/signature authority *referansı* tüketir; bu referansları operation evidence'ına bağlar.

**prohibited_mutations:** connector Office hierarchy/lawyer identity/approval sonucunu ÜRETMEZ veya yeniden hesaplamaz.

**prohibited_ownership_transfer:** Office authority truth ownership'i connector'a taşınmaz.

**failure_contract:** authority resolve edilemezse fail-closed disposition (execution DURUR); belirsiz authority → MANUAL_REVIEW_REQUIRED (UYAP-CONST-002/006).

**current_repository_support [REPO/F4-a]:** `actorUserId` = `req.user.id` mevcut; **`actingLawyerId` server-side resolve YOK** — `lawyerId` her yazma yolunda `@Body`'den (Lawyer↔JWT `LawyerUser` köprüsü dormant); approval/signature authority persist edilmiyor; `verifyUserEsignature` dead stub.

**convergence_type:** DELTA (actor identity var; lawyer/approval/signature authority resolution + evidence eksik).

**external_authority_dependency:** NONE (Office authority iç modeli; provider gerekmez).

**implementation_status:** NONE (server-side lawyer resolve + authority evidence F4-b/OD-UYAP-03, ayrı owner GO).

**open_residuals:** Lawyer↔JWT binding (OD-UYAP-03) · approval≠signature authority ayrımının runtime tesisi · POA/CPE per-attempt reval.

**decision_basis:** UYAP-MODULE-BOUNDARY-CONTRACTS-01 / D12 + synthesis §4 + UYAP-CONST-002 + F4-a-R1 evidence.

**BOUNDARIES (bağlayıcı):** actorUserId server principal'dan gelir · actingLawyerId server-side relation/delegation ile çözülür · `body.lawyerId` execution authority DEĞİLDİR · personel default final approval/signature/legal execution authority DEĞİLDİR · approval authority ≠ signature authority · Office represented-party/POA/debtor/receivable amount owner'ı DEĞİLDİR.

**PROHIBITED:** staff user'ı avukat veya signature owner varsaymak · Office profilini provider identity ile eşitlemek · Office'ten receivable/debtor domain truth türetmek.

---

## UYAP-BC-CLIENT-001

```text
contract_id                 : UYAP-BC-CLIENT-001
title                       : Client / Müvekkil Boundary Contract
status                      : CANONICAL CONTRACT / IMPLEMENTATION AUTHORITY NONE
bounded_context_owner       : CLIENT / MÜVEKKİL
```
**purpose:** Client bounded-context'in connector'a sağladığı represented-party/POA/representation-scope girdilerini ve connector'ın kabul ettiği representation-decision evidence çıktılarını kaydetmek.

**canonical_inputs:** `representedPartyId`/`clientId` · valid POA reference · representation scope · client legal-personality/type reference · ratified-process instruction evidence reference.

**canonical_outputs:** POA/representation decision evidence · representation failure disposition · curated/fail-closed provider-result visibility candidate.

**authority_source:** CLIENT bounded-context governance (CLIENT-GOVERNANCE-CHARTER) + UYAP-CONST-002.

**evidence_requirements:** POA/representation kararının evidence reference'ı (hangi POA yetkilendirdi — persist edilebilir); representation failure disposition. Provider-result visibility curated/fail-closed.

**state_and_identity_requirements:** POA her attempt'te yeniden değerlendirilir; representedParty operasyon anında doğrulanır (UYAP-CONST-002).

**allowed_consumption:** connector Client'tan representedParty + POA state + representation scope *referansı* tüketir.

**prohibited_mutations:** connector POA/representation truth ÜRETMEZ; Client instruction'ı yeniden yorumlamaz.

**prohibited_ownership_transfer:** representation/POA authority ownership'i connector'a taşınmaz.

**failure_contract:** geçerli POA yoksa fail-closed (execution DURUR); representation belirsizse MANUAL_REVIEW_REQUIRED.

**current_repository_support [REPO/F4-a]:** `validatePowerOfAttorney` → `poaService.checkValidPoa` (`ClientPowerOfAttorney` ACTIVE model, read-only) mevcut; **POA kararı persist EDİLMİYOR** (transient, `poaId` döner ama yazılmıyor) → hangi POA yetkilendirdiği kalıcı değil; POA koşullu (skipPoaCheck + missing-lawyerId bypass riski).

**convergence_type:** DELTA (POA validate mevcut; persist edilen representation evidence + curated provider visibility eksik).

**external_authority_dependency:** NONE.

**implementation_status:** NONE (POA evidence persist + curated visibility F4-b, ayrı owner GO).

**open_residuals:** POA-decision persistence (non-repudiation) · POA missing-input bypass · curated/fail-closed provider-result visibility tasarımı.

**decision_basis:** UYAP-MODULE-BOUNDARY-CONTRACTS-01 / D12 + synthesis §4 + UYAP-CONST-002 + F4-a-R1.

**BOUNDARIES:** portal authentication legal execution authority DEĞİLDİR · password reset/session authenticated legal instruction DEĞİLDİR · POA her attempt'te yeniden değerlendirilir · Client acting lawyer/approver/signature owner belirleyemez · Client internal note/file-path/raw entity alanları varsayılan input DEĞİLDİR · Client Debtor veya Receivable source-of-truth owner'ı DEĞİLDİR.

**PROHIBITED:** Portal kullanıcı durumundan doğrudan UYAP execution authority türetmek.

---

## UYAP-BC-DEBTOR-001

```text
contract_id                 : UYAP-BC-DEBTOR-001
title                       : Debtor / Borçlu Boundary Contract
status                      : CANONICAL CONTRACT / IMPLEMENTATION AUTHORITY NONE
bounded_context_owner       : DEBTOR / BORÇLU
```
**purpose:** Debtor bounded-context'in connector'a sağladığı identity/role/address/asset snapshot girdilerini ve connector'ın kabul ettiği provider-observation evidence çıktılarını, ownership sınırlarıyla kaydetmek.

**canonical_inputs:** `debtorId` · canonical debtor identity reference · debtor role/classification reference · address reference · asset reference · case-debtor relationship reference · ServiceOccurrence evidence reference (yalnız canonical Debtor fact olarak mevcutsa).

**canonical_outputs:** provider observation evidence · debtor/asset query evidence · unsupported/unverified role disposition · reconciliation candidate.

**authority_source:** DEBTOR bounded-context governance (DEBTOR-GOVERNANCE) + UYAP-CONST-005/007.

**evidence_requirements:** provider observation/query evidence PII-minimize (ham TCKN/adres/IBAN/plaka generic JSON'a KOPYALANMAZ — UYAP-CONST-007); unsupported/unverified role disposition kaydı.

**state_and_identity_requirements:** provider observation ProviderState olarak modellenir; Debtor domain mutation değildir (UYAP-CONST-005).

**allowed_consumption:** connector Debtor'dan identity/role/address/asset *referansı* tüketir; official role mapping yalnız verified authority ile.

**prohibited_mutations:** connector debtor identity/asset truth ÜRETMEZ; provider observation Debtor domainine otomatik mutation DEĞİLDİR.

**prohibited_ownership_transfer:** Debtor fact ownership'i connector'a taşınmaz.

**failure_contract:** unresolved/unverified role → REJECT / no silent BORCLU fallback (LEGACY PATH UNCHANGED); belirsiz observation → reconciliation candidate + MANUAL_REVIEW.

**current_repository_support [REPO/F1/F4-a]:** iki debtor-role mapper — legacy `mapDebtorRoleToUyapKod` (1-10, LIVE, `TASFIYE_MEMURU`/`IFLAS_MASASI` sessiz BORCLU '2' fallback) + official `resolveOfficialRole` (22/33, DEAD/test-only); `queryDebtorAssets` ham `debtorIdentityNo`'yu `requestData`+`responseData`'ya maskesiz persist ediyor (F4-a risk kartı); ServiceOccurrence = PR #1503 schema foundation (runtime writer YOK).

**convergence_type:** REUSE (identity/role/address/asset snapshot mevcut canonical) + DELTA (evidence PII + role authority + official mapping).

**external_authority_dependency:** official role target değerleri + Contract A DTD = EXT (UYAP/BİGM); legacy role code ≠ domain role truth.

**implementation_status:** NONE (PII remediation P-E1 + official role authority F4-b, ayrı owner GO).

**open_residuals:** dual role mapper reconciliation · ham TC PII persistence (P-E1) · official role verified authority (EXT) · asset action exact reference tesisi.

**decision_basis:** UYAP-MODULE-BOUNDARY-CONTRACTS-01 / D12 + synthesis §4 + UYAP-CONST-005/007 + F1-R2 + F4-a-R1.

**ServiceOccurrence precision (owner-korumalı):**
- PR #1503 schema foundation olarak **REUSE** edilir.
- ServiceOccurrence, Tebligat mutable process ile LegalDeadlineSnapshot derived assessment arasında **Debtor-owned observed-fact layer**'dır.
- ServiceOccurrence bugün **runtime UYAP provider evidence writer'ı DEĞİLDİR.**
- **UYAP result → ServiceOccurrence automatic write YOKTUR.**
- Backfill/dual-write/outbox/deadline recalculation YOKTUR.
- F3, bu runtime yollarını **yetkilendirmez.**
- ServiceOccurrence occurrence identity, UYAP operation/attempt identity **yerine geçmez.**
- ServiceOccurrence **legal-effect confirmation DEĞİLDİR.**

**BOUNDARIES:** ham TCKN/adres/IBAN/plaka generic evidence JSON'una kopyalanmaz · Connector debtor identity/asset truth ÜRETMEZ · provider observation Debtor domainine otomatik mutation DEĞİLDİR · legacy UYAP role code domain role truth DEĞİLDİR · official role mapping yalnız verified authority ile · asset action exact asset reference taşır.

**PROHIBITED:** provider sonucuyla Debtor veya ServiceOccurrence satırını otomatik üretmek/overwrite etmek · ServiceOccurrence'ı UYAP provider acceptance veya legal-effect fact'i saymak · Debtor fact ownership'ini connector'a taşımak.

---

## UYAP-BC-RECEIVABLE-001

```text
contract_id                 : UYAP-BC-RECEIVABLE-001
title                       : Receivable / Alacak Boundary Contract
status                      : CANONICAL CONTRACT / IMPLEMENTATION AUTHORITY NONE
bounded_context_owner       : RECEIVABLE / ALACAK
```
**purpose:** Receivable bounded-context'in connector'a sağladığı canonical claim/calculation snapshot girdilerini ve connector'ın kabul ettiği payload-amount evidence çıktılarını, calculation-authority sınırıyla kaydetmek.

**canonical_inputs:** canonical receivable/claim snapshot reference · versioned snapshot/hash · exact minor-unit amount · currency · bucket identity · principal/interest/fee classification · calculation policy/version · canonical owner tarafından oluşturulmuş target-native plan input.

**canonical_outputs:** payload amount evidence · provider fee/amount observation · acceptance/rejection evidence · reconciliation input.

**authority_source:** RECEIVABLE governance (RECEIVABLE-GOVERNANCE) + ADR-014 (calculation authority) + UYAP-CONST-005.

**evidence_requirements:** payload amount evidence snapshot-hash-tutarlı; provider fee/amount observation ProviderState olarak; snapshot bytes/hash korunur.

**state_and_identity_requirements:** provider amount/fee ProviderState; canonical receivable truth değildir; amount conservation korunur (UYAP-CONST-005).

**allowed_consumption:** connector Receivable'dan canonical snapshot + hash + amount + bucket + policy *referansı* tüketir.

**prohibited_mutations:** connector receivable amount YENİDEN HESAPLAMAZ; provider sonucunu canonical amount'a çevirmez.

**prohibited_ownership_transfer:** calculation authority (ADR-014) connector'a taşınmaz.

**failure_contract:** snapshot/hash uyuşmazsa REJECT; provider amount ≠ canonical → reconciliation input + MANUAL_REVIEW.

**current_repository_support [REPO/charter §2]:** connector `HUKUKİ BORÇLULUK ÜRETEMEZ / ClaimItem yeniden sınıflandıramaz / faizTipKod seçemez` (charter §2, kod-seviyesi tutarlı); TPA-04B required-evidence schema amendment (snapshot/hash/bucket-before-after) canonical TEXT contract; ADR-014 calc authority ayrı.

**convergence_type:** REUSE (canonical snapshot/hash/amount contract mevcut; charter §2 ownership sınırı kod-tutarlı).

**external_authority_dependency:** provider fee/amount semantiği = EXT (provider-guaranteed yok).

**implementation_status:** NONE (target-native plan input + payload amount evidence F4-b/ilgili, ayrı GO).

**open_residuals:** target-native plan input üretimi (canonical owner) · provider fee/amount reconciliation · ClaimItem ≠ tek başına legal-application target.

**decision_basis:** UYAP-MODULE-BOUNDARY-CONTRACTS-01 / D12 + synthesis §4 + charter §2 + ADR-014 + UYAP-CONST-005.

**BOUNDARIES:** Connector receivable amount yeniden hesaplamaz · ClaimItem tek başına UYAP legal-application target DEĞİLDİR · snapshot bytes/hash korunur · amount conservation korunur · display text/list index canonical identity DEĞİLDİR · provider amount/fee canonical receivable truth DEĞİLDİR · Receivable Collection receipt lifecycle owner'ı DEĞİLDİR.

**PROHIBITED:** connector içinde TBK100/faiz/balance hesaplamak · provider sonucunu canonical receivable amount'a çevirmek.

---

## UYAP-BC-COLLECTION-001

```text
contract_id                 : UYAP-BC-COLLECTION-001
title                       : Collection / Tahsilat Boundary Contract
status                      : CANONICAL CONTRACT / IMPLEMENTATION AUTHORITY NONE
bounded_context_owner       : COLLECTION / TAHSİLAT
```
**purpose:** Collection bounded-context'in connector'a sağladığı receipt/settlement/reconciliation girdilerini ve connector'ın kabul ettiği provider-receipt/makbuz evidence çıktılarını, receipt-lifecycle-ownership sınırıyla kaydetmek.

**canonical_inputs:** receipt/payment reference · settlement evidence reference · exact minor-unit amount · provider receipt/makbuz correlation reference · reconciliation status · canonical legal-application orchestration reference.

**canonical_outputs:** provider receipt/makbuz evidence · payment/fee observation · reconciliation candidate · duplicate financial-effect warning.

**authority_source:** COLLECTION governance (COLLECTION-GOVERNANCE, receipt lifecycle/outer transaction owner) + UYAP-CONST-005/006.

**evidence_requirements:** provider receipt/makbuz correlation evidence; duplicate financial-effect warning (UYAP-CONST-006 idempotency); reconciliation candidate kaydı.

**state_and_identity_requirements:** provider receipt presence ≠ reconciliation; duplicate financial effect idempotency ile önlenir (UYAP-CONST-004/006).

**allowed_consumption:** connector Collection'dan receipt/settlement/reconciliation-status *referansı* tüketir; provider makbuz correlation reference üretir.

**prohibited_mutations:** connector receipt/payment finality YARATMAZ; UYAP makbuz evidence'ı Collection'a otomatik mutation DEĞİLDİR.

**prohibited_ownership_transfer:** receipt lifecycle ownership Collection'da kalır; Receivable snapshot/bucket ownership Collection'a taşınmaz.

**failure_contract:** provider receipt yok/uyuşmaz → reconciliation candidate + duplicate financial-effect warning; belirsiz → MANUAL_REVIEW.

**current_repository_support [REPO/COLLECTION-GOVERNANCE]:** Collection receipt lifecycle/outer transaction owner (COLLECTION-GOVERNANCE v1.7); TPA-04B required-evidence schema amendment; `ApplicationAttribution` değişmez ve non-authoritative; provider receipt/makbuz correlation runtime YOK (transport 0).

**convergence_type:** REUSE (receipt lifecycle/reconciliation Collection-owned canonical) + GAP-NEW (provider makbuz correlation yüzeyi henüz yok).

**external_authority_dependency:** provider receipt/makbuz semantiği = EXT.

**implementation_status:** NONE (provider makbuz correlation + reconciliation F4-b, ayrı GO).

**open_residuals:** provider makbuz correlation reference tesisi · duplicate financial-effect warning modeli · reconciliation candidate akışı.

**decision_basis:** UYAP-MODULE-BOUNDARY-CONTRACTS-01 / D12 + synthesis §4 + COLLECTION-GOVERNANCE + UYAP-CONST-005/006.

**BOUNDARIES:** Collection receipt lifecycle ve outer transaction orchestration owner'ıdır · Connector receipt/payment finality yaratmaz · provider receipt presence reconciliation DEĞİLDİR · UYAP makbuz evidence'ı Collection'a otomatik mutation DEĞİLDİR · Receivable snapshot/bucket ownership Collection'a taşınmaz · ApplicationAttribution legal-calculation authority DEĞİLDİR.

**PROHIBITED:** provider makbuzunu banka finality saymak · provider receipt ile Collection confirmation'ı otomatik yazmak · Receivable calculation authority'yi Collection veya connector'a taşımak.

---

## Cross-Module Matrix

Tek ve eksiksiz cross-module matris. `runtime_status` bugünkü REPO gerçeğidir; hepsinde REAL TRANSPORT 0.

| work_unit | input_owner | output_consumer | canonical_input | canonical_output | authority_gate | evidence_gate | allowed_write | prohibited_write | convergence | current_runtime_status | open_residual |
|---|---|---|---|---|---|---|---|---|---|---|---|
| actor/lawyer authority | OFFICE | Connector | actorUserId, actingLawyerId, approverId | acting-lawyer resolution evidence | server principal + delegation | resolution evidence | operation evidence bağı | Office authority truth üretme | DELTA | actorUserId var, lawyer resolve YOK | Lawyer↔JWT (OD-UYAP-03) |
| represented-party/POA | CLIENT | Connector | representedPartyId, POA reference | POA decision evidence | POA per-attempt reval | POA evidence | representation evidence | POA truth üretme | DELTA | checkValidPoa read-only, persist YOK | POA persist (non-repudiation) |
| debtor identity | DEBTOR | Connector | debtorId, identity reference | provider observation evidence | tenant + Debtor owner | PII-minimized evidence | provider observation | debtor identity üretme/overwrite | REUSE | identity reference mevcut | — |
| debtor role | DEBTOR | Connector | role/classification reference | unsupported/unverified role disposition | verified authority (official) | role disposition | official role yalnız verified | legacy code = domain truth sayma | REUSE+DELTA | legacy 1-10 LIVE, official DEAD | dual mapper + official authority (EXT) |
| address reference | DEBTOR | Connector | address reference | provider observation | Debtor owner | PII-minimized | reference tüketimi | ham adres JSON'a kopyalama | REUSE | reference var; ham adres persist riski | PII (P-E1) |
| asset reference | DEBTOR | Connector | asset reference (exact) | debtor/asset query evidence | Debtor owner + exact ref | PII-minimized | exact asset reference | ham IBAN/hesap/plaka JSON'a | REUSE+DELTA | targetDetails ham persist (F4-a) | PII (P-E1) + scope mismatch |
| ServiceOccurrence observed fact | DEBTOR | Connector (read) | ServiceOccurrence evidence reference | reconciliation candidate | Debtor owner | observed-fact layer | reference tüketimi (read) | provider→ServiceOccurrence auto-write | REUSE (schema foundation) | PR #1503 schema, runtime writer YOK | runtime wiring NOT AUTHORIZED |
| receivable snapshot | RECEIVABLE | Connector | snapshot reference + hash | payload amount evidence | ADR-014 calc authority | snapshot-hash tutarlı | snapshot tüketimi | receivable amount yeniden hesaplama | REUSE | charter §2 ownership sınırı kod-tutarlı | target-native plan input |
| amount/bucket identity | RECEIVABLE | Connector | exact minor-unit amount, bucket identity | acceptance/rejection evidence | canonical owner | amount conservation | amount referansı | connector'da TBK100/faiz/balance | REUSE | connector hesaplamaz (charter §2) | provider amount reconciliation |
| document/payload preparation | OFFICE+CLIENT+DEBTOR+RECEIVABLE | Connector | curated inputs | SERIALIZED_DRAFT | tenant + POA + CPE | payload digest | payload üretimi (local) | ham payload/content persist | REUSE+DELTA | XML üretimi LIVE (legacy), UDF YOK | official path DEAD |
| approval | OFFICE | Connector | approverId | approval evidence | approval authority | approval evidence | evidence bağı | approval=signature sayma | GAP-NEW | approval evidence persist YOK | approval≠signature tesisi |
| signature | OFFICE | Connector | signatureOwnerId | signature-authority evidence | operator-present/external-signed | signature evidence | evidence bağı | credential/PIN custody | GAP-NEW | verifyUserEsignature DEAD stub | OD-UYAP-04 (EXT) |
| dispatch | Connector | (provider) | encoded+validated payload | dispatch attempt evidence | tenant+authority+CPE+POA | attempt lineage | attempt evidence (stub) | real send (UNAUTHORIZED) | DELTA | stub, transmitted:false | transport (OD-UYAP-08, EXT) |
| provider status | Connector | all modules | provider response | ProviderState evidence | — | status query evidence | ProviderState yazma | domain'e direkt yazma | GAP-NEW | status collapse (tek status alanı) | 3-state model (F4-b) |
| provider receipt/makbuz | Connector | COLLECTION | provider receipt | makbuz correlation evidence | — | receipt correlation | correlation reference | makbuz→Collection auto-write | GAP-NEW | evkNo latent-null (hiç yazılmaz) | makbuz correlation |
| payment/fee | RECEIVABLE+COLLECTION | Connector | fee/amount reference | provider fee/amount observation | canonical owner | fee evidence | observation | provider fee=canonical truth | REUSE+GAP-NEW | uyap'ta harç/ödeme entegrasyonu YOK | fee observation model |
| reconciliation | COLLECTION | all modules | reconciliation status | reconciliation candidate | Collection owner | reconciliation evidence | candidate üretimi | receipt presence=reconciled sayma | GAP-NEW | reconciliation NOT IMPLEMENTED | reconciliation akışı |
| legal-effect confirmation | Connector→(judicial) | all modules | authoritative evidence | LegalEffectState evidence | authoritative evidence gate | legal-effect evidence | LegalEffectState.CONFIRMED | provider ACCEPTED=CONFIRMED sayma | GAP-NEW | LegalEffectState YOK | authoritative evidence (EXT) |

---

## Owner Approval Record

```text
UYAP-MODULE-BOUNDARY-CONTRACTS-01 — OWNER GO-DOCS + IF GO-COMPLETE
Kaynak: F2 (UYAP-CONSTITUTION-V11-01) / D12 (F3 = MODULE-BASED UYAP BOUNDARY CONTRACTS).
Consume edilen otorite: synthesis §19/§4/§3 + normatif annex UYAP-CONST-001..010 + decision-log
UYAP-CONSTITUTION-V11-01/D12. Bu belge subordinate normative annex DEĞİL, yeni constitution DEĞİL.
Ratifiye kontratlar: UYAP-BC-OFFICE-001, UYAP-BC-CLIENT-001, UYAP-BC-DEBTOR-001,
UYAP-BC-RECEIVABLE-001, UYAP-BC-COLLECTION-001 (CANONICAL CONTRACT / IMPLEMENTATION AUTHORITY NONE).
Domain ownership DEĞİŞMEDİ; runtime/schema/migration/transport/credential kararı YOK.
IMPLEMENTATION AUTHORITY: NONE. REAL TRANSPORT: 0. UYAP CUTOVER: HARD HOLD.
F3: CLOSED/CANONICAL (onaylı merge ile). F4-b: NOT AUTHORIZED / NOT STARTED.
```
