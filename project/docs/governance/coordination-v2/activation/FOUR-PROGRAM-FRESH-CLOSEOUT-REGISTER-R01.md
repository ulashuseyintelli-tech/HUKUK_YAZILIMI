# Dort Program Fresh Kapanis Kaydi (R01)

`POST-PHASE-5-RESIDUAL-HYGIENE-AND-CANONICAL-CLOSEOUT-R01` gorevinin WP05-WP06
adimlarinin canonical kaydi. CLIENT, DEBTOR, RECEIVABLE, UYAP_CONNECTOR
programlarinin fresh main uzerinde (paralel, salt-okuma Explore ajanlariyla,
RECEIVABLE bu oturumun kendi WP04'unde) yeniden dogrulanmis durumu.

## CLIENT

| Alan | Durum |
|---|---|
| standing grant | `PROGRAM_STANDING`; `allowedPathRoots` icinde `client-financial-disclosure/` ve `client-settlement/` VAR (FOUR-PROGRAM-ACTIVATION-DECISION-PACK-R01.md CLIENT-A karari geregi main'de) |
| WRITE flag | `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED`, `process.env` uzerinden katı `=== 'true'`, varsayilan KAPALI — deployment-controlled, repo kod degisikligiyle tetiklenmiyor |
| PUBLICATION flag | `CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED`, ayni desen, bagimsiz, varsayilan KAPALI |
| runtime activation | deployment/owner-controlled (repo icinde deger DEGISTIRILMEDI) |
| bekleyen plan/request | YOK |
| acik PR | #1943 (`claude/client-arc-07-lifecycle-invariant-i01`) — **OTHER_SESSION**, bu gorevin disinda, dokunulmadi |
| next authority-valid task | YOK (`CLIENT-P2-U03-TRACK-B-I01` decision-log'da NEXT-ELIGIBLE olarak adlandirilmis ama "owner ratifikasyonu olmadan baslatilmaz" — owner-gated, kriteri karsilamiyor) |

## DEBTOR

| Alan | Durum |
|---|---|
| standing grant | `PROGRAM_STANDING`; yalniz `TEST_ONLY_CHARACTERIZATION`/`BOUNDED_CODE_FIX` |
| `prepareNotification` | `case-debtor.service.ts:149` — fonksiyon degil, DTO/Prisma boolean alani; satir 162 `// TODO: If prepareNotification is true, create notification record`; gercek SMS/e-posta/push saglayicisina baglanmamis |
| provider/kanal/retry politikasi | materialize edilmemis — FOUR-PROGRAM-ACTIVATION-DECISION-PACK-R01.md DEBTOR-C/D/E: kanal "Hicbir kanal aktif olmaz" (default), saglayici "ticari karar", retry "kodda tanimli degil" |
| bekleyen plan/request | YOK |
| acik PR | YOK |
| queue entry | YOK |
| next authority-valid task | **YOK** |

## RECEIVABLE

Ayrintili kayit: `RECEIVABLE-CONTROLLED-DEFAULT-OFF-CLOSURE-R01.md`. Ozet:
resolver implemented, activation flag default KAPALI, module binding ABSENT,
dormancy intent korunmus, PR #1930 canonical/MERGED, queue+task store CLOSED.
**Next authority-valid task: YOK** (program bu is icin kapandi).

## UYAP_CONNECTOR

| Alan | Durum |
|---|---|
| standing grant | `PROGRAM_STANDING`; `externalActivation.permitted=false`, `requiresSeparateOwnerDecision=true` |
| technical eligibility | mevcut — "YALNIZ TEKNIK IS: parser, transformation, runtime registration, queue/worker entegrasyonu ve synthetic/local dogrulama" |
| external production cutover | yetkisiz — R02-PARENT-AUTHORIZATION-ENVELOPE.md "UYAP ozel siniri": gercek credential YOK, gercek dosyalama/tevdi YOK, gercek musteri verisi gonderimi YOK, production external activation AYRI OWNER KARARI |
| hard hold guard (kod) | `official-dormant-dispatch.ts:32` — `UYAP_DORMANT_DISPATCH_ENABLED = false as const`, env ile acilamiyor, DI'ya kayitli degil |
| semantic mapping residual | `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01` (#1838, MERGED) yalniz bir MATRIS sundu, ratifikasyon degil; Canary CS-01/09/10/11 hala `OWNER_RATIFICATION_REQUIRED` |
| gercek production endpoint/credential | YOK — tek gorunen adres yalniz provenance yorumunda, test tarafindan ag cagrisi olarak yasaklaniyor; `.env.example`'da yalniz `UYAP_AVAILABLE=true|false` ops sinyali |
| bekleyen plan/request | YOK |
| acik PR | YOK |
| queue entry | YOK |
| next authority-valid task | **YOK** (teknik yetki var, ama hazirlanmis somut bir task/plan/PR/queue-entry yok) |

## WP06 — Next-task materialization scan sonucu

`programs.manifest.json` sekiz programin tamamini `liveExecutionEligibility:
ELIGIBLE` gosteriyor — ancak bu yalniz PROGRAM seviyesinde teknik yetki,
somut bir gorev degil. Owner'in NEXT_ELIGIBLE kriterleri (exact authority +
exact plan + predecessors closed + boundary valid + not owner-gated + not
dormant + not duplicate + not superseded + not active elsewhere + tests
determinable) hicbir program icin birlikte saglanmiyor:

```text
NEXT AUTHORITY-VALID EXECUTABLE TASK: NONE
```

Taranan yuzeyler: task-plans/, requests/, decision-log.md (son kayitlar),
owner decision records, programs.manifest.json, acik PR'lar (`gh pr list
--state open`), aktif worktree'ler (`git worktree list`), orkestrasyon
queue'su (`orch-service.cjs queue`), standing grant'lerin `allowedTaskClasses`
sinirlari. Hicbirinde CLIENT/DEBTOR/RECEIVABLE/UYAP_CONNECTOR icin hazir,
owner-ratifiye, hemen calistirilabilir bir is bulunamadi.
