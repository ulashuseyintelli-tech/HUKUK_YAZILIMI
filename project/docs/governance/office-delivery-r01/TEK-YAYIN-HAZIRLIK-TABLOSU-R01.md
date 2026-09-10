# TEK YAYIN HAZIRLIK TABLOSU — RELEASE21 → main (R01)

```text
BELGE          : TEK-YAYIN-HAZIRLIK-TABLOSU-R01
URETEN         : OFFICE hatti — owner GO 2026-09-10 "FD GENEL KUTU IPTAL SINIRI" kapanis adimi
YAYIN SAHIBI   : Office/C33 — surum adi, sira, paket, muhur, cutover ve owner-command O HATTA KALIR
OLCUM ANI      : 2026-09-10T21:10:04Z makine saati — GitHub Date basligina gore makine saati 248 s GERIDE (≈ 21:14Z);
                 yerel salt-okuma; canliya dokunulmadi, production yazmasi 0; sira icin SHA'lar esastir
DURUM          : HAZIRLIK TABLOSU — canli gecis onayi ISTENMEDI · migration YOK · A-07 tekrari YOK
CANLI KAYNAK   : RELEASE21 2187a78b1621f168605920cdffccb17381dc171a
HEDEF (main)   : 137406701248858221d12be94a941f8837a2a245
```

Bu belge bir **girdi**dir: surum adi veya sirasi belirlemez, paket uretmez, cutover baslatmaz, deploy/restart
istemez. Tek yayin yurutucusu Office/C33'tur (CLIENT R02 plani I-7). Hat bazli ayrintili girdi ornegi:
`client-remaining-decisions-r01/CLIENT-B1-RELEASE-ENTRY-R01.md` (#2611).

## 1. Canli durum (salt-okuma olcum)

| Konu | Deger |
|---|---|
| Canli surum | **RELEASE21** `2187a78b` (`HY_W4_RELEASE21` worktree HEAD) |
| Canli API | `:8080` PID 50716 — `HY_W4_RELEASE21\project\apps\api\dist\...` |
| Canli Web | `:3002` PID 22440 — `HY_W4_RELEASE21\project\apps\web\...` |
| Onceki nesil (RELEASE21'in geri donus hedefi) | RELEASE20 `08ce8e25` — dizin mevcut |
| Sonraki yayinin geri donus hedefi | canli RELEASE21 (C33 teyit eder) |
| Prisma (schema + migrations) farki | **YOK** → migration adimi YOK |

## 2. Paket kapsami — canlida OLMAYAN commit'ler (`2187a78b` → `13740670`, 42 commit)

| # | Squash SHA | PR | Tarih (UTC) | Konu | Dosya siniflari |
|---|---|---|---|---|---|
| 1 | `d0efebbc` | #2571 | 2026-09-08 15:02 | fix(client): I3 tasima kaniti — yapilandirma tek kaynak + gercek dispatcher.send olcumu | DOCS 6 |
| 2 | `24674d12` | #2572 | 2026-09-08 15:13 | docs(governance): A-03..A-07 canli kabul kosum plani - kosum BASLAMADI | DOCS 2 |
| 3 | `19df6182` | #2573 | 2026-09-08 15:30 | docs(governance): A-07 kabul bayragi kesinti butcesi (R02 eki) - owner karari bekler | DOCS 2 |
| 4 | `5fc410ab` | #2574 | 2026-09-08 15:46 | docs(governance): A-07 bayrak penceresi DARALTILDI (owner (a) secimi) + paket dort kalemi | DOCS 2 |
| 5 | `0ae8a85d` | #2575 | 2026-09-08 16:00 | docs(governance): §3.3 secenek tablosu baglamdan koparilamasin (yanlis alinti riski) | DOCS 1 |
| 6 | `90e558d8` | #2576 | 2026-09-08 16:16 | fix(client): I3 uyusmayan yapilandirma kaniti — calisma zamani bagi | DOCS 8 |
| 7 | `df1ff252` | #2577 | 2026-09-08 17:35 | fix(client): I5b — F04 erisim kapanisi cikis kodundan BAGIMSIZ hale getirildi | DOCS 7 |
| 8 | `f3bad905` | #2578 | 2026-09-08 18:17 | docs(client): I6 uzlastirma — RELEASE21 adayi dogrulandi, mukerrer paket URETILMEDI | DOCS 1 |
| 9 | `45dcab5a` | #2579 | 2026-09-08 19:21 | docs(client): I7 uygulama onayi hazirligi — RELEASE21 kesin kimlik + on kosullar + engel | DOCS 1 |
| 10 | `349e1a57` | #2580 | 2026-09-09 12:10 | docs(governance): A-07 on kosul kontrol listesi — iz uretmeyen bes yol (ikisi SESSIZ) | DOCS 1 |
| 11 | `b6032501` | #2581 | 2026-09-09 12:23 | docs(governance): §8.11 — iki yetki sert durusu kayda gecti (A-03..A-07 · O-4/O-4-LAWYER) | DOCS 1 |
| 12 | `ed80da5a` | #2582 | 2026-09-09 20:30 | docs(governance): A-03..A-06 CANLIDA KABUL EDILDI; A-07 OLCULEMEDI (bayrak ACL) | DOCS 13 |
| 13 | `74d85d66` | #2583 | 2026-09-09 20:31 | docs(governance): §8.12 — A-03..A-06 canli kabul KAPANDI, A-07 OLCULEMEDI + bayrak duzeltmesi | DOCS 1 |
| 14 | `a76b119e` | #2584 | 2026-09-09 20:52 | docs(governance): §8.13 — O-4/O-4-LAWYER KAPANDI · A-07 maliyeti IKI kalem · canli PID degisimi | DOCS 1 |
| 15 | `71cfc8ea` | #2585 | 2026-09-09 21:04 | docs(client): I7 uzlastirma — cutover UYGULANDI ve DOGRULANDI, rollback kaydi KUSURLU | DOCS 1 |
| 16 | `28f41b68` | #2586 | 2026-09-09 21:11 | docs(governance): §8.14 — canli baslik duzeltildi · cutover makbuzu kayda gecti · rollback buildId kusuru | DOCS 1 |
| 17 | `9e6adefa` | #2587 | 2026-09-09 21:27 | docs(client): I7 KAPANDI — OFFICE §8.14 sonrasi kapanis uzlastirmasi, bag zinciri muhurle dogrulandi | DOCS 1 |
| 18 | `31ef9fef` | #2588 | 2026-09-09 21:44 | docs(governance): §8.15 nihai teslim tablosu + paket disi rollback BUILD_ID erratum | DOCS 2 |
| 19 | `7f48d674` | #2589 | 2026-09-09 22:23 | docs(governance): A-07 owner calistirma paketi — hazir, DOGRULANDI; kosum DB engelinde | DOCS 6 |
| 20 | `b1808709` | #2590 | 2026-09-09 22:37 | docs(client): I1b canli sentetik kabul alani — onay paketi hazirligi (canli yazma YOK) | DOCS 7 |
| 21 | `195bb1f1` | #2592 | 2026-09-09 23:17 | docs(client): I1b R02 — login sirasi olculuyor (201/200 -> kapatma -> 401/401 -> tekrar) + kalici cron etkisi kapatiliyo | DOCS 4 |
| 22 | `277c8496` | #2593 | 2026-09-09 23:27 | fix(governance): restart hazir-butcesi 60 s -> 300 s + ilerleme olcumu (yanlis "toparlanma BASARISIZ") | DOCS 1 |
| 23 | `750b8235` | #2594 | 2026-09-10 09:09 | fix(governance): A-07 R02 — PASS gorunumu, restart sayaci, kor kapanis durdurmasi + kimlik kaydi | DOCS 7 · TEST 1 |
| 24 | `d5485248` | #2591 | 2026-09-10 09:15 | docs(governance): 8.16 — canli kesinti · A-07 maliyet duzeltmesi · toparlanma olcutu kusuru | DOCS 1 |
| 25 | `91c91a72` | #2595 | 2026-09-10 09:50 | docs(governance): 8.17 - R01 A-07 denemesi, 3 dk kesinti, eszamanli surec, atif duzeltmeleri | DOCS 1 |
| 26 | `fe55c70a` | #2596 | 2026-09-10 10:27 | docs(client): I1b CANLI KABUL KAPANDI — OWNER-GO-CLIENT-I1B-20260910-R01 (6/17→7/17) | DOCS 1 |
| 27 | `f6ed306f` | #2597 | 2026-09-10 10:34 | docs(governance): 8.18 - A-07 KAPANDI (7/7), nihai teslim tablosu, OFFICE butunsel canli teslim TAMAMLANDI | DOCS 1 |
| 28 | `8f3fd86d` | #2598 | 2026-09-10 12:36 | docs(client): I8 canli kabul onay paketi — kapsam kaynaktan, B2 tek acik bacak | DOCS 5 |
| 29 | `f079996e` | #2599 | 2026-09-10 12:53 | fix(lawyer): AK-2 — avukat olusturmada ayricalik siniri + tek-transaction LAWYER_CREATE audit | MANIFEST 1 · API 5 · TEST 4 |
| 30 | `a47b4184` | #2600 | 2026-09-10 13:14 | docs(client): I8 §6.0 duzeltme — olculen ikili RELEASE21 DEGIL RELEASE20 dist | DOCS 1 |
| 31 | `7d03bb75` | #2601 | 2026-09-10 13:58 | docs(client): I8 nihai onay paketi — R21 derlemesinde kosuldu, canli hedef duzeltildi | DOCS 1 |
| 32 | `7eaa1242` | #2602 | 2026-09-10 14:00 | fix(lawyer): AK-2 — mukerrer daldan ayricalikli pasif avukat yeniden etkinlestirme siniri + LAWYER_REACTIVATE audit | MANIFEST 1 · TEST 2 · API 1 |
| 33 | `8b3e3821` | #2603 | 2026-09-10 14:42 | docs(client): I8 CANLI KABUL KAPANDI — sayac 8/17 (OWNER-GO-CLIENT-I8-20260910-R01) | DOCS 1 |
| 34 | `ebb869be` | #2604 | 2026-09-10 15:07 | fix(office): AK-1a — VIEWER icin OFFICE salt-okuma siniri + AK takip kaydi | MANIFEST 1 · TEST 5 · API 6 · DOCS 1 |
| 35 | `d6c51ca0` | #2605 | 2026-09-10 18:31 | docs(client): I9 H1 kimlik kabul paketi — yerel prova 13/14, A-8 KUSUR nedeniyle KAPANMIYOR | DOCS 5 |
| 36 | `42d109fe` | #2606 | 2026-09-10 18:45 | fix(office-approval): VIEWER onay karari siniri (AK-1a eki) + AK takip kaydi | MANIFEST 1 · API 4 · TEST 2 · DOCS 1 |
| 37 | `97c1f51d` | #2607 | 2026-09-10 19:29 | fix(ci): PR-1.3 tuketilmis onay kurtarma spec'ini pure/client-portal manifestine bagla | MANIFEST 1 |
| 38 | `b335cc4a` | #2608 | 2026-09-10 19:51 | fix(office-approval): CLF-O0-01 — requestRevision PR-1.3 domain-sahiplik kapisi + AK takip kaydi | MANIFEST 1 · TEST 2 · API 1 · DOCS 1 |
| 39 | `845b92d9` | #2609 | 2026-09-10 20:19 | fix(client): B-1 — saf no-op update 404 yerine 200 doner, yan etki URETMEZ | TEST 1 · API 1 |
| 40 | `c78f0963` | #2610 | 2026-09-10 20:43 | fix(ci): FD'nin baglanmamis 5 spec'ini client-portal ve domain-integration manifestlerine bagla | MANIFEST 2 |
| 41 | `c7969d4d` | #2611 | 2026-09-10 20:49 | docs(client): B-1 yayin girdisi — OFFICE/C33 icin kaynak SHA, urun farki ve test kaniti | DOCS 1 |
| 42 | `13740670` | #2612 | 2026-09-10 21:12 | fix(office-approval): FD genel kutu iptal siniri — cancel() PR-1.3 domain-sahiplik kapisi + AK takip kaydi | MANIFEST 1 · TEST 3 · API 1 · DOCS 6 |

## 3. Calisma zamanini etkileyen kalemler (7 commit) — yayin + canli kabul gerektirir

| PR | Squash | Kalem | Calisma-zamani dosyalari | Onerilen canli kabul adimi |
|---|---|---|---|---|
| #2599 | `f079996e` | AK-2 — avukat olusturmada ayricalik siniri + tek-transaction LAWYER_CREATE audit | `api/src/modules/case/case.service.ts` `api/src/modules/lawyer/dto/create-lawyer.dto.ts` `api/src/modules/lawyer/lawyer.service.ts` `api/src/modules/seed/seed.controller.ts` `api/src/modules/seed/seed.service.ts` | ADMIN/bagli PARTNER disi aktor PARTNER/MANAGER rutbesi, canModifyOtherPermissions veya permissionsLocked ile avukat olusturamaz → 403, yazma 0 |
| #2602 | `7eaa1242` | AK-2 — mukerrer daldan ayricalikli pasif avukat yeniden etkinlestirme siniri + LAWYER_REACTIVATE audit | `api/src/modules/lawyer/lawyer.service.ts` | ayricalikli PASIF kayit yalniz ADMIN / bagli PARTNER ile yeniden etkinlesir; audit yazmayla ayni transaction |
| #2604 | `ebb869be` | AK-1a — VIEWER icin OFFICE salt-okuma siniri | `api/src/modules/case/case.service.ts` `api/src/modules/lawyer/lawyer.service.ts` `api/src/modules/office-approval/office-approval.service.ts` `api/src/modules/office-approval/office-f01-authorization.guard.ts` `api/src/modules/office-approval/office-write-role.policy.ts` `api/src/modules/seed/seed.controller.ts` | VIEWER ile F01 yazma rotasi, `POST /cases` dosya ici avukat ve seed OFFICE uclari → 403 `OFFICE_WRITE_DENIED_VIEWER`; OKUMA degismez |
| #2606 | `42d109fe` | AK-1a (ek) — VIEWER onay karari siniri | `api/src/modules/client-financial-disclosure/client-financial-disclosure-approval-eligibility.ts` `api/src/modules/client-financial-disclosure/client-financial-disclosure-approval.service.ts` `api/src/modules/office-approval/office-approval.service.ts` `api/src/modules/office-approval/office-write-role.policy.ts` | bagli VIEWER genel kutu karari / dagitim onayi → 403 `OFFICE_APPROVAL_DECISION_DENIED_VIEWER`; FD ofis/icerik onayi → 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE` |
| #2608 | `b335cc4a` | CLF-O0-01 — genel kutu `request-revision` domain-sahiplik kapisi | `api/src/modules/office-approval/office-approval.service.ts` | FD talebinde genel kutunun dort karar rotasi → 409 `DOMAIN_ACTION_REQUIRED`, yazma 0 |
| #2609 | `845b92d9` | CLIENT B-1 — saf no-op update 404 yerine 200, yan etki yok | `api/src/modules/client/client.service.ts` | girdi belgesi `client-remaining-decisions-r01/CLIENT-B1-RELEASE-ENTRY-R01.md` (#2611); CLIENT I9 canli kabulu bu yayina bagli |
| #2612 | `13740670` | FD genel kutu iptal siniri — `cancel()` domain-sahiplik kapisi | `api/src/modules/office-approval/office-approval.service.ts` | FD talebinin sahibi genel kutudan geri cekemez → 409 `DOMAIN_ACTION_REQUIRED`, yazma 0; talep sahibi olmayan 403; FD disi iptal degismez |

## 4. Yalniz test / CI manifest kalemleri (3 commit) — calisma zamani etkisi YOK

- #2594 `750b8235` — fix(governance): A-07 R02 — PASS gorunumu, restart sayaci, kor kapanis durdurmasi + kimlik kaydi
- #2607 `97c1f51d` — fix(ci): PR-1.3 tuketilmis onay kurtarma spec'ini pure/client-portal manifestine bagla
- #2610 `c78f0963` — fix(ci): FD'nin baglanmamis 5 spec'ini client-portal ve domain-integration manifestlerine bagla

## 5. Yalniz governance / docs kalemleri (32 commit)

#2571 · #2572 · #2573 · #2574 · #2575 · #2576 · #2577 · #2578 · #2579 · #2580 · #2581 · #2582 · #2583 · #2584 · #2585 · #2586 · #2587 · #2588 · #2589 · #2590 · #2592 · #2593 · #2591 · #2595 · #2596 · #2597 · #2598 · #2600 · #2601 · #2603 · #2605 · #2611

## 6. Sema, migration, env / bayrak, web

- Prisma farki: **YOK** (schema.prisma ve migrations dizini birebir).
- Calisma-zamani farkinda yeni `process.env` / `*_ENABLED` / `FEATURE_FLAG` referansi: **0**.
- `apps/web/src` calisma-zamani farki: **0 dosya** (web yeniden derleme gereksinimini C33 olcer; bu belge BUILD_ID iddiasi URETMEZ).

## 7. Bu yayina bagli kabul / sayac etkileri

- OFFICE AK kalemleri (AK-2, AK-1a, AK-1a ek, CLF-O0-01 + FD iptal siniri): `product-backlog.md` AK takip bolumu — her kalem
  "MAIN'DE TAMAM / CANLIDA DEGIL"; canli yayin + kabul AYRI asama.
- CLIENT I9 canli kabulu B-1 yayinina baglidir (#2611); sayac ve hizmet kabulu bu belgeyle DEGISMEZ.

## 8. Kapsam disi / acik kararlar (bu yayinla KAPANMAZ)

- AK-1b (cross-office kapsami) · AK-1c (ADMIN kisa-yol sirasi) — owner karari.
- Onceden tuketilmis FD talepleri (genel kutudan REVISION_REQUESTED / CANCELLED) — kurtarma / veri degisikligi ayri karar; canlida OLCULMEDI.
- FD kurtarma VIEWER politikasi ve VIEWER yurutme/kurtarma yollari — ayri acik kalem.

## 9. Sinir beyanlari

```text
CANLI GECIS ONAYI = ISTENMEDI · MIGRATION = YOK · A-07 TEKRARI = YOK · SURUM ADI / SIRASI = BELIRLENMEDI
NEW EXECUTION AUTHORITY = NONE
```
