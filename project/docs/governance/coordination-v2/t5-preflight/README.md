# T5 Preflight — Index

```text
Task      : GOV-COORD-V2-T5-PREFLIGHT-RECONCILIATION-R01
Base      : origin/main @ 7fcd3b98
Tarih     : 2026-07-26
Planner   : CLAUDE   ·   Gelecek live executor : CODEX
AUTHORITY : NONE — buradaki hiçbir belge ratifiye etmez, yetkilendirmez,
            execution grant üretmez, statü alanı değiştirmez
```

T5 live pilot'un önündeki dört canonical tutarsızlığın giderilmesi ve
COLLECTION için semantik karar gerektirmeyen ilk ratifiable bounded task'ın
zemininin hazırlanması. Bu tur **canlı program kodu uygulamaz**, executor
başlatmaz, execution grant üretmez.

## Belgeler

| Belge | Kapsam | Disposition |
|---|---|---|
| `contract-path-correction.md` | 1 — §1 immutable forbidden path listesi | **CORRECTED** (uygulandı) |
| `collection-pr1415-reconciliation.md` | 2 — PR #1415 / `80a11c2a` | **MERGED_WITHOUT_MATCHING_GOVERNANCE_RECORD** |
| `office-stale-register-reconciliation.md` | 3 — OFFICE bayat kayıtlar | **STALE — DOĞRULANDI** (5/5 residual icra edilmiş) |
| `collection-test-only-decision-pack.md` | 4 — test-only characterization | **READY** — owner seçimi bekliyor |
| `office-owner-decision-pack.md` | 5 — CAP-09A SLICE sıralaması | **READY** — OPTION A / OPTION B |
| `t5-route.md` | T5 kapı zinciri ve ulaşılabilir yol | **SYSTEM_READY / LIVE_PILOT_BLOCKED_NO_AUTHORIZED_TASKS** |

## Önceki turla ilişki

`../task-plans/` altındaki üç belge, bu görevin öncesindeki
`T5 LIVE PILOT TASK PLAN AUTHORING` (GO-ANALYZE) turunun çıktısıdır ve o turda
owner'a raporlanan hâliyle **değiştirilmeden** taşınmıştır — bir raporun kaydını
sonradan düzeltmek onu tahrif etmek olurdu. Bu turda düzeltilen noktalar:

| Önceki ifade | Bu turdaki düzeltme |
|---|---|
| `boundary-review.md` §5: "liste var olmayan dizinleri gösteriyor" | Asıl mekanizma: V2, `BOUNDED_CODE_TASK` için `project/apps/`'i listeden çıkarırken schema/migration alt-yüzeyini oymamış — `contract-path-correction.md` §3 |
| OFFICE summary §2: "`lawyer.service.ts` iki `auditLog` içerir" | Mekanizma `AuditService.logInTransaction` (`:620`, `:638`); parite boşluğu aynen gerçek — `office-owner-decision-pack.md` §3 |
| OFFICE summary §5a: "audit taxonomy — üç ayrı action" | Kodda **dört** action var (`_COMPLETED` dahil) — `office-stale-register-reconciliation.md` §2 |
| COLLECTION summary §4: "#1415 hiçbir kayıtta yok" | Doğrulandı ve genişletildi: yetkisizlik merge anında yürürlükteydi ve merge'den 85 dakika önce tazelenmişti — `collection-pr1415-reconciliation.md` §4 |

## Bu turda ortaya çıkan, düzeltilmeyen bulgular

Hepsi owner işlemidir; hiçbirine dokunulmadı.

```text
1. product-backlog.md:3327/3338/3342 + active-roadmap.md:56 bayat
   (owner WIP — grandfatheredOwnerWipExactPaths; dokunulamaz)
2. OFFICE-DELIVERY-MANIFEST.md §8 + active-roadmap.md:54 bayat (Phase 2 seçimi)
3. decision-log.md:30 ile OFFICE-RISK-REGISTER.md:190 arasında SLICE 3
   authority çelişkisi
4. project/v28_ops_bundle/ ne V1 ne V2 deny listesinde — V1'den devraldığı
   boşluk, bir politika kararı
5. collection-confirmed.util.ts <remarks> çağıran listesi eksik (6 tüketici
   var, 4 yazılı) — CLAUDE.md §5 ihlali
6. collection-confirmed.util.spec.ts CI allowlist'inde yok; 8 testi CI'da hiç
   koşmuyor. ci.yml control plane olduğu için hiçbir task boundary'sine
   giremez → ayrı owner işlemi
7. MECHANICAL_GOVERNANCE profilinin ulaşılabilir hedef yüzeyi YOK — contract
   §1.2 CANONICAL GAP olarak kaydedildi. Profil tabloda KULLANILAMAZ
   işaretlendi; yüzey verilmesi policy kararıdır, bu turda YAPILMADI.
   Ratifikasyondan önce çözülmezse ölü profil sabitlenir.
```

## T5 durumu

```text
T5: BLOCKED_PENDING_OWNER_SELECTION_AND_GRANT
```

İki program için de ratifiye edilecek bir plan **yoktur**. Bloke edenler:

```text
COLLECTION  #1415 tescili (hard precondition) → sonra ŞEKİL 1/2 seçimi
OFFICE      SLICE 3 authority çelişkisinin giderilmesi → OPTION A/B
```
