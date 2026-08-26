# WR01-C14-C15 LEDGER RECONCILIATION — R01

```text
RECORD ID        : WR01-C14-C15-LEDGER-RECONCILIATION-R01
GOREV            : OFFICE-C15-GOVERNANCE-LEDGER-CATCHUP-R01
YETKI            : C15-LEDGER-CATCHUP-IMPL-R01 / SINGLE USE (owner; PR-hazirlamaya kadar — MERGE AYRI OWNER CHECKPOINT)
recordedAt       : 2026-08-26T11:38:00Z
KAPSAM TABANI    : canonical main 66c9271da11a43486caa9891389fec6e4eca52b8 (origin/main ile esit, 0/0, dirty 0)
retrospective    : true  (geriye donuk kayit uzlastirmasi; REGULARIZE disiplini)
DOSYA STATUSU    : Bu dosya YENI bir additive kayittir — "append-only gecmis dosya" iddiasi KURULMAZ.
```

Bu kayit YENI semantic karar, implementation grant, deployment, migration,
production activation veya execution authority URETMEZ ve program sirasi SECMEZ.
Tarihsel ledger satirlari DEGISTIRILMEMISTIR; bu kayit superseding/additive'dir.
Statu disiplini aynen korunur: MERGED != DEPLOYED · DEPLOYED != QUALIFIED ·
DESIGN COMPLETE != IMPLEMENTATION AUTHORIZED · BLOCKED != CLOSED ·
FROZEN != ABANDONED · evidence POINTER != kanonik evidence ICERIGI (repo-disi
kanit iceri TASINMAMISTIR; yalniz ad + SHA-256 + bayt + tarih kaydedilir).
Secret / parola / JWT / ham telefon / ham kimlik / PII icermez.

## 1. OLCULMUS BOSLUK (append oncesi taze grep, 2026-08-26)

`project/docs/governance` genelinde: `C15` = yalniz 2 yanlis-pozitif (AC15 test
adi; hex alt-dizgi) · `C14`, `RELEASE12`, `RELEASE13`, `#2439..#2457`,
`20260825160000_tenant_lifecycle_foundation`, `AUTHPUB` = 0 gercek eslesme.
Asagidaki tum satirlar bu bosluga karsilik gelir.

## 2. WR01 B01–B10 MATRISI

Ortak: kanonik ledger'da onceki satir YOK. SHA'lar 40-hex; ancestry =
`git merge-base --is-ancestor <sha> 66c9271d` sonucu. CI = merge anindaki
statusCheckRollup.

| Blok | Nihai durum | PR | Squash SHA | Ancestry | CI | Deploy | Authority/GO durumu |
|---|---|---|---|---|---|---|---|
| B01 contract+taxonomy | MERGED (2026-08-16) | #2439 | b28a7f980b65a0f9093561fa4b09bdbdd7666b9c | ATA | 9/9 | UNKNOWN (tip-only; deploy elle) | UNKNOWN — GO izi yalniz PR govdesi ("C7 handoff + PAGE-O0"); mekanik owner-mesaj bagi kurulamadi, regularize EDILMEDI |
| B02 design R01/R02/R03 | MERGED | #2444 | 75edf7afb23fa0da9db89a8ec4f2cd30693e5d7d | ATA | 9/9 | n/a (dokuman) | OD-B02-01..04 OWNER_RATIFIED (dokuman-ici); dokuman basligi "IMPLEMENTATION_NOT_AUTHORIZED" olarak DURUYOR — asama GO'lariyla uzlastirilmasi ayri is |
| B02 Asama 1-2 (+R01 onarim) | MERGED | #2446 + #2447 | bf88efaceee4e5c0932a3f9d0598d782e44596fa + 48a5153044056742fff2fc2a37726b8561a83224 | ATA | 9/9 | EVET (GO-03 kapsaminda, bkz. §3) | UNKNOWN (asama GO izi oturum/PR-govdesi; regularize edilmedi) |
| B02 Asama 3 resolver | MERGED | #2448 | 1495899fce8b430ddfa3c967bbf3565da3e1db9e | ATA | 9/9 | EVET | UNKNOWN (ayni) |
| B02 Asama 4 dual-write | MERGED (G8 NOT_STARTED) | #2449 | a5bb7d56dc9ac43d5c467624adac169b86a60ab1 | ATA | 9/9 | EVET | UNKNOWN (ayni) |
| B02 C13-R01 provenance | MERGED + DEPLOYED | #2450 | 00c7731d1ff3a54d66ae6d043874b3b4d1ee135e | ATA | 9/9 | EVET (production LAST_MIGRATION = 20260818120000_office_wr01_b02_c13r01_provisioning_provenance) | UNKNOWN (ayni) |
| B02 C14-R1A compiled catch-up | MERGED | #2451 | 49918e4152545f445ebac09e5b9ff6f892eeb04a | ATA | 9/9 | icerik R13 soyunda ayri commit (6292cc87) olarak; squash R13 atasi DEGIL | UNKNOWN (ayni) |
| B02 C14-R2-R01 CLI onarim | MERGED / NOT DEPLOYED | #2452 | bcf6a654412f316203aefc26c0818bfa068fc8e1 | ATA | 9/9 | HAYIR (RELEASE12/13 package.json PRE-REPAIR) | UNKNOWN (ayni); NOT: "GO-03 = bcf6a654" esitligi YANLIS — bcf6a654 sapma-SONRASI repair squash'idir |
| B02 Asama 5 (C15 gozlem penceresi) | BLOCKED / FROZEN — pencere BASLAMADI | — | — | — | — | HAYIR | canary gate NOT PROVEN; FROZEN != ABANDONED; BLOCKED != CLOSED |
| B03 round-robin | NOT STARTED / owner GO bekliyor | — | — | — | — | HAYIR | GO YOK |
| B04 reassignment/absence/audit | NOT STARTED / owner GO bekliyor | — | — | — | — | HAYIR | GO YOK |
| B05 first-review | NOT STARTED / owner GO bekliyor | — | — | — | — | HAYIR | GO YOK |
| B06 approval-orchestration | NOT STARTED / BLOKLU (owner scope-confirm + Acik Soru 1/2/5) | — | — | — | — | HAYIR | X4 belirsizligi cozulmeden tasarlanamaz |
| B07 digest katmani | MERGED (2026-08-16) | #2442 | 7e497cfa6ffbed1a4377a3d63b84712ad35cc1c2 | ATA | 9/9 | UNKNOWN (aktivasyon-yok beyani) | UNKNOWN — B01 ile ayni desen; kalan kapsam (notification) UNKNOWN |
| B08 UI-API admin | NOT STARTED / owner GO bekliyor | — | — | — | — | HAYIR | GO YOK |
| B09 migration+runtime verify | BLOCKED_DEPENDENCY (cross-workstream migration contract YOK) | — | — | — | — | HAYIR | B02'nin fiili migration uretimiyle iliskisi karara baglanmamis |
| B10 governance closure | NOT STARTED | — | — | — | — | n/a | kapsami = bu kaydin olctugu acigin kapanisi |

## 3. C14 MATRISI

| Kalem | Nihai durum | PR/SHA | Ancestry | CI | Deploy | Authority |
|---|---|---|---|---|---|---|
| C14-R0 rehearsal | CLOSED / PASS; PRODUCTION GO NOT GRANTED; aday 00c7731d REJECTED FOR DIRECT DEPLOY | (PR yok — rehearsal) | — | n/a | HAYIR | owner runbook (repo-disi journal) |
| C14-R1B minimal candidate | CERTIFIED (ERRATA kayitli: ratifiye 3796 vs disk 3798 = 2 tsbuildinfo; 3796 byte-identical) | commit 6292cc8761cbbcc01b8d1af7a5f2b4c6391721ab (main-DISI candidate branch) | ATA DEGIL (main-disi) | main-disi | EVET — RELEASE12/13 soy tabani | owner-ratifiye dist kimligi (journal) |
| C14-R1C RELEASE12 self-contained | CERTIFIED | (olcum kaydi; PR yok) | — | n/a | n/a | journal |
| C14-GO-03 production execution | EXECUTED_WITH_MATERIAL_DEVIATION — migrate deploy exit 0, EXACT 2 migration, ledger 125→127; catch-up RUN1 init-error SIFIR YAZIM; sapma OD-01 OWNER_RATIFIED / ONE-TIME / NOT PRECEDENT | operasyonel eylem (commit'le yapilmadi); repair PR #2452 bcf6a654412f316203aefc26c0818bfa068fc8e1 | repair: ATA | repair: 9/9 | migrationlar DEPLOYED; repair NOT DEPLOYED | owner GO-03 + OD-01 (repo-disi journal) |

## 4. C15 MATRISI

| Kalem | Nihai durum | PR | Squash SHA | Ancestry | CI | Deploy | Authority/GO |
|---|---|---|---|---|---|---|---|
| T0 baseline + canary gate | BLOCKED / FROZEN (gate: olculen 3 tenant'ta condition3+condition4 FAIL; pencere BASLAMADI) | — | — | — | — | HAYIR | Asama-5 init gorevi (repo-disi kanit) |
| Canary safety design R01/R01A | DESIGN COMPLETE / IMPLEMENTATION NOT AUTHORIZED | — | — | — | — | HAYIR | analiz gorevi |
| S1-MODIFIED PR-1 lifecycle foundation | MERGED / NOT DEPLOYED | #2454 | 30db4aca3c10625ebf4946d71a8022a8d2599ab6 | ATA (main); R13 atasi DEGIL | 9/9 | HAYIR | OWNER_GO_REGULARIZED · recordedAt 2026-08-26T11:58:00Z · historicalTarget PR-1 (#2454) · retrospective true · backdated false · kaynak: owner mesaji (bu gorusme zinciri; ratifikasyon: C15-LEDGER-CATCHUP-MERGE-R01) |
| S1-MODIFIED PR-2 enforcement | MERGED / NOT DEPLOYED | #2455 | 0e0a0aebc43b7835e11067239c1791c34b5385e1 | ATA; R13 atasi DEGIL | 9/9 | HAYIR | OWNER_GO_REGULARIZED · recordedAt 2026-08-26T11:38:00Z · historicalTarget PR-2 (#2455) · retrospective true · kaynak: owner mesaji (bu gorusme zinciri; ratifikasyon: owner adjudication §8.4) |
| S1-MODIFIED PR-3 transition authority | MERGED / NOT DEPLOYED / DORMANT / NOT DI-BOUND / uretim call-site 0 | #2456 | 115d872d805da097bb4d6642755b2d0261d287e7 | ATA; R13 atasi DEGIL | 9/9 | HAYIR | OWNER_GO_REGULARIZED · recordedAt 2026-08-26T11:38:00Z · historicalTarget PR-3 (#2456) · retrospective true · ayrica owner post-merge adjudication: iki sapma ratifiye (tek tagged-template raw CAS; DI kaydi PR-4'e) |
| PR-4A cron lifecycle enforcement | MERGED / NOT DEPLOYED | #2457 | 66c9271da11a43486caa9891389fec6e4eca52b8 | = kapsam tabani | 9/9 | HAYIR (RELEASE13 payload 3798/3798 + aggregate EXACT olcumuyle kanitli) | OWNER_GO_REGULARIZED · recordedAt 2026-08-26T11:38:00Z · historicalTarget PR-4A (#2457, LIMITED GO + C15-PR4A-MERGE-R01) · retrospective true |
| PR-4B / PR-4C | DESIGN COMPLETE (R02 + R03-addendum) / NOT AUTHORIZED | — | — | — | — | HAYIR | uc bagimsiz beyan; canary creation da NOT AUTHORIZED |
| R1B canary qualification | STOP RECORD — qualification BASLAMADI (4 durdurma kosulu) | — | — | — | — | HAYIR | repo-disi stop record |
| R1C dedicated canary | OWNER DISPOSITION (adjudication §8.5, BAGLAYICI): R1C-R02 HARD STOP GECERLIDIR; "siradaki canary yolu" YALNIZ planlama yonudur — canary creation/production mutation yetkisi DEGILDIR; PR-4 remediation zinciri bu blocker'in successor programidir | — | — | — | — | HAYIR | owner adjudication (2026-08-26) |

Pending migration kaydi: `20260825160000_tenant_lifecycle_foundation` —
MERGED (repo, #2454) · LOKAL kalici DB'de PENDING (uygulanmis kalici lokal DB
tespit edilmedi; test kosumlari tek-kullanimlik silinmis container'lardaydi) ·
PRODUCTION'da NOT APPLIED (LAST_MIGRATION = 20260818120000_..., ledger 127/0/0,
fingerprint be995051e55c42bca343d7ae864ae10c EXACT) · C15 ASAMA 5 FROZEN.
BAGLAYICI KURAL (owner §8.6): exact migration allowlist yoksa HARD STOP; ayri
owner GO olmadan production'a UYGULANAMAZ; bu catch-up gorevi migration
CALISTIRAMAZ. Ayrinti: pending-migration-coordination-register.md EOF kaydi.

## 5. AUTHPUB / RELEASE13 / T+24 MATRISI

| Kalem | Nihai durum | Kanit/deger |
|---|---|---|
| OFFICE-AUTH-PUBLIC-USER-PROJECTION-R02 | MERGED (canonical) | #2453 · acbef381847d25eae1ab16961c7e7e27531e95a9 · ATA · 9/9 |
| Runtime candidate | DEPLOYED OLAN — main-DISI, push edilmemis | 0cf1642f65818801d389ae797479da40939c9e7d (base 6292cc87); 5 auth dosyasi canonical squash ile byte-identical (sertifika S25) |
| AUTHPUB-R03-DEPLOY-R01 | CONSUMED / FAILED / ROLLED_BACK | journal |
| AUTHPUB-R03-DEPLOY-R02 | CONSUMED / FAILED / ROLLED_BACK (DB PRE==POST be995051…) | journal |
| AUTHPUB-R03-DEPLOY-R03 | CONSUMED / SUCCESS / NOT REUSABLE — 2026-08-25T15:15:23Z | receipt 257cc83c (12 alan; forbidden 0 / unexpected 0 / identityParity PASS) |
| RELEASE13 runtime | **ACTIVE / VERIFIED / T+24 CLOSEOUT PENDING** | task action + PID start 15:13:42Z; payload 3798/3798; aggregate 03928894cd40007be8a522c356b190082bb3f85a8fced0b45ae871139474ae9d |
| T+24 closeout | ARMED / PENDING — esik 2026-08-26T15:15:23Z; owner tetigiyle TEK kosum; PASS olmadan program KAPATILAMAZ | pre-window 22 PASS / 1 FAIL (yalniz zaman kapisi) — stabilizasyon kaniti DEGILDIR |
| AUTHME EXPOSURE disposition R01 | kararlar kayitli (repo-disi journal); IMPLEMENTATION NOT AUTHORIZED | journal |

## 6. RUNTIME REFERANS KAYDI (SUPERSEDING — tarihsel satirlar DEGISMEDI)

KANONIK GUNCEL HUKUM: `RELEASE13 = ACTIVE / VERIFIED / T+24 CLOSEOUT PENDING`.
T+24 tamamlanmadan su hukumler YASAKTIR: TERMINALLY CLOSED · OBSERVATION
COMPLETE · FULLY QUALIFIED.

Tarihsel zincir (korunur):
- RELEASE10 @ 77a347a9831522aebddcb4a0ec14767ff21c851b (#2340) — TARIHSEL ESKI
  POINTER. Bu degeri tasiyan kayitlar (OFFICE-DELIVERY-MANIFEST §13.3 ·
  product-backlog P8-C4 · decision-log:539/:558 · master-triage-register:199 ·
  OFFICE-RISK-REGISTER:212 · active-roadmap:59 · p5-security b01/b03/b05)
  2026-08-13 anlik goruntusudur ve DEGISTIRILMEMISTIR.
- RELEASE12 @ 6292cc8761cbbcc01b8d1af7a5f2b4c6391721ab — ONCEKI aktif runtime
  (C14/GO-03 donemi) ve MEVCUT ROLLBACK TARGET (korunuyor; SILINMEMELI).
- RELEASE13 @ 0cf1642f65818801d389ae797479da40939c9e7d — MEVCUT aktif runtime
  (cutover 2026-08-25T15:15:23Z, AUTHPUB-R03-DEPLOY-R03).

## 7. OWNER GO REGULARIZATION KAYDI

Owner adjudication (2026-08-26, §8.4): PR-2, PR-3 ve PR-4A owner GO'larinin bu
gorusme zincirinde FIILEN verildigi RATIFIYE edilmistir. Kayit sozlesmesi:

```text
OWNER_GO_REGULARIZED
  retrospective    : true
  backdated        : false   (gercek kayit zamanlari; geriye tarihlenMEMIStir)
  historicalTarget : PR-1 (#2454)  recordedAt 2026-08-26T11:58:00Z
                     (ratifikasyon: C15-LEDGER-CATCHUP-MERGE-R01 owner karari)
                     PR-2 (#2455)  recordedAt 2026-08-26T11:38:00Z
                     PR-3 (#2456)  recordedAt 2026-08-26T11:38:00Z
                     PR-4A (#2457) recordedAt 2026-08-26T11:38:00Z
                     (PR-2/3/4A ratifikasyonu: owner adjudication §8.4)
  not              : Bu kayitlar gecmis tarihte yazilmis veya o tarihte kanonik
                     artefakt varmis gibi GOSTERILMEZ. GO metin taslaklari
                     (C15-PR2-GO-TEXT-R01A "TASLAK", C15-PR3-GO-TEXT-R03
                     "NOT AUTHORIZED" baslikli) verilis anini TASIMAZ; verilis
                     kaydi bu regularization satiridir.
```

Regularize EDILMEYENLER (mekanik owner-mesaj bagi kurulamadi → UNKNOWN kalir,
owner §8.4 kurali): B01 (#2439) · B07 (#2442) · B02 asama GO'lari (#2444-#2452).

## 8. ACIK-KALEM SNAPSHOT (scope-bound; 45 kalem, adli, tekil kategori)

Eski 13/19/9 sayimi RATIFIYE EDILMEMISTIR ve KULLANILMAZ. Kapsam siniri:
OFFICE P8-C4 sonrasi ana hat + OFFICE-WR01 (B01..B10, B02 C13/C14/C15) +
R03/RELEASE13 guvenlik programi ve canary zinciri. Kategoriler paketin kabul
edilen semantigiyle yazilmistir (GO-BEKLEYEN=20 · BLOKLU=10 · KAPALI=11 ·
UNKNOWN=4; toplam 45).

GO-BEKLEYEN (20): F-B01-03 · F-B01-04 · F-B01-05 · StaffDetailModal
diff-payload · CLF-P5-01 · CLF-P7-01 · CLF-P7-02 · CLF-P7-03 · CLF-O0-01 ·
kozmetik personel ad-hijyeni · D-WR-7 karari · WR01-B03 · WR01-B04 · WR01-B05 ·
WR01-B08 · C15 PR-4B · C15-R1C canary (yalniz planlama yonu — §8.5 disposition
gecerli) · credential-exposure remediation readiness · HY_C15_PR4A_CRON_SCOPE
orphan cleanup · kanonik ledger reconciliation (bu kayitla KISMEN karsilanir;
merge + kalan kalemler owner'da).

BLOKLU (10): P8 FINAL closeout · WR01-B06 · WR01-B09 · WR01-B10 · B02 Asama 5 /
C15 gozlem penceresi · B02 Asama 6 · B02 Asama 7 · C15 PR-4C · R03/RELEASE13
program kapanisi (T+24) · P8-C4 runtime residual verdict.

KAPALI (11) — kapanis kaniti git-merge + repo-disi sertifika; bu kayit onlarin
ILK kanonik satiridir: WR01-B01 (#2439) · B02 Asama 1-2 (#2446+#2447) · Asama 3
(#2448) · Asama 4 (#2449) · C13-R01 (#2450) · C14 (#2451+#2452) · C15 PR-1
(#2454) · PR-2 (#2455) · PR-3 (#2456) · PR-4A (#2457) · canary-yolu R01/R01A
dispozisyonu.

UNKNOWN (4 — zorla siniflandirilMAMIStir, owner §8.2): X4 lane'i ·
/auth/me passwordChangedAt celiskisi (icerik RELEASE13'te kapali [cert T7 PASS]
↔ register satiri GO-bekliyor; disposition kaydi yok) · WR01-B07 kalan kapsam ·
OFFICE-P4 umbrella terminal kaydi.

## 9. REPO-DISI EVIDENCE POINTER ENVANTERI (icerik TASINMADI)

Dizinler: `C:\Development\HUKUK_YAZILIMI\C15_EVIDENCE\` ·
`...\C14_EXECUTION_JOURNAL\` · `...\C14_R0_EVIDENCE\` · `...\R03_DEPLOY_BACKUP\`
· `...\C15_TOOLS\` (probe paketleri R01..R06). SHA-256'lar 2026-08-26'da bu
kayit icin taze hesaplandi.

| Dosya | SHA-256 | Bayt | Baglanti |
|---|---|---|---|
| R03-DEPLOYMENT-JOURNAL.md | f0137bdae4870870461c0c8bd924ba98f140cacf4bf0ebf013944ae68363f2ed | 42490 | AUTHPUB R01-R03 + RELEASE13 + T+24 |
| C15-PR4A-CLOSURE-R01.md | 3c68492b0513a351aef2a63bd022a392cc9e5852d3eeb77cbaa4f8ea2a5f9292 | 5342 | #2457 kapanis + post-merge 15/15 |
| C15-PR4A-CRON-INVENTORY-R01.md | 779c82f2ee83daaacfc18a1fcfd76a477941e4dbce5960c5d9bc8415f593a0a5 | 13823 | PR-4A ratifiye envanter |
| C15-PR4A-EDIT-ALLOWLIST-R01.md | 4a56e898ad9429bdfbdc3e4b8477e8ea4ac6c7375943fbdda2508e6e9224efe3 | 5684 | PR-4A allowlist |
| C15-PR4-ANALYSIS-DESIGN-R01.md | b3a4c8523ed8adfa243dd1b8a473ff1f5aff2d36ffc52c4d162ab34659b7ccb3 | 15935 | PR-4 tasarim |
| C15-PR4-ANALYSIS-DESIGN-R02.md | 431586fd3cd5136d985f1019e1ce1d3dd483813c83c6d27cd6cc931d9d1d1d87 | 10691 | PR-4 tasarim (OD-1..9 ratifiye) |
| C15-PR4-ANALYSIS-DESIGN-R03-ADDENDUM.md | f1cf6f864e52f00faab29844478dbf1ce565b079f7f8e11ab01483dc6ae05ce4 | 7006 | baglanti-kardinalite tadili |
| C15-CANARY-SAFETY-REMEDIATION-DESIGN-R01.md | 1a7fb7c47c069c3f56ddedd5578df41e506995712308d8912cb362374c3911a3 | 28562 | S1 tasarim |
| C15-CANARY-SAFETY-REMEDIATION-DESIGN-R01A.md | d5d7c0dc413cbc33a485d1f4e34eb6953b2af595af687c725948ace758e2e8ea | 25809 | R01A |
| C15-PR3-GO-TEXT-R03.md | eadcb1321fcab49057f5820d4cbe21f6fae4081c2dec43d81f4810fafa592d98 | 18868 | PR-3 GO metni (taslak-zinciri) |
| C15-PR2-GO-TEXT-R01A.md | a74c49a98537e9962d4eb560cf37984b3ef6a7327742991e8c261465684e1e75 | 9301 | PR-2 GO metni (TASLAK baslikli) |
| R1C-DEDICATED-CANARY-TENANT-DESIGN.md | 9061890df668972e5c0f3f40f9e20d35eca240e81fc7a44deae1503c83a0e6ef | 23993 | R1C tasarim |
| R1C-R02-EXECUTION-READINESS-CERTIFICATION.md | a9dcbfedc3a850a6ca606934b8178b5638532c293df136787eafb0cee3a268ba | 12485 | R1C HARD STOP sertifikasi |
| R1B-STOP-RECORD.md | 45f7a1717a8433744ddfb09524756028c7e5d647840ab51a34b37f243b59f588 | 4749 | R1B stop |
| R01A-SINGLE-FIELD-PROVENANCE-ADJUDICATION.md | cdd34c5e7ab4c67acbfd0a922db69b79edabb0f13f8543b63371991a3f3b6481 | 13387 | canary-yolu dispozisyonu |
| MANIFEST.md (C15_EVIDENCE) | a2843680cd726381ca095a9cf7ccc1f7c6fb44553c913f3b249725b5fe151d8e | 6314 | Asama-5 kanit envanteri |
| T0-baseline.json | 31e0c741ff35a67b8cf8fd635c79b7b75f3d0461158e08b0d355ed0f096f4a0c | 12446 | T0 |
| T1-closing-recheck.json | 14337d60e19258d56f18b03371d5bff90b946c3f3a40eee015900844020382b4 | 12453 | T1 |
| canary-gate-probe.json | 2a4e3e7bae17f055a3917c7084db7fd12b4676c88eae9f4783ef19213eb85a54 | 3826 | canary gate |
| AUTH-PUBLIC-USER-R02-CERTIFICATION.md | 2b93996b4c73ad35bbf62651090f6de28e90b216f6520d6c9a02676ccba9626c | 12851 | R02 sertifika (S25/T7) |
| C15-LEDGER-CATCHUP-CHECKPOINT-R01.md | ee86aff7a9571f4a9d3b0420359cac2f88679a7c6f037d84637d7c91e37218f9 | 19722 | bu kaydin analiz paketi |
| c14-r2-execution-journal.md | 7b69122e04aa279cab0a98df498a70ab3b0a0af4de457b2d99d5fdf5647a495a | 23830 | C14/GO-03 |
| MANIFEST.md (C14_R0_EVIDENCE) | 71516f1368e8bcfd6a78236db2b5a9009e2ef746ad6121eef44d9c4a0f91ecca | 8812 | C14-R0 |

## 10. FERAGAT

Bu kayit: deployment YAPMAZ · migration UYGULAMAZ · lifecycle aktivasyonu
BASLATMAZ · PR-4B/PR-4C/canary/qualification/observation ACMAZ · T+24 hukmu
KURMAZ (T+24 PENDING) · sira SECMEZ. Bu kaydi tasiyan PR'in merge'i AYRI owner
checkpoint'ine tabidir.
