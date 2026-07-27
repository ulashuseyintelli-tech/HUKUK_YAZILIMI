# PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : Main'e merge edilmiş fakat governance kapanışı eksik kalan işleri kaydeder.
             Mekanik reconciliation UYGULANIR; semantic karar ÜRETİLMEZ.
Tarih      : 2026-07-27
```

## 0. Tespit yöntemi

Son 80 merged PR, üç bağımsız arama yüzeyine karşı tarandı:

```text
(a) PR numarası referansı      grep -rl "#<N>\b" project/docs/governance/
(b) squash SHA referansı       grep -rl "<sha>"  project/docs/governance/
(c) task ID referansı          grep -rl "<TASK-ID>" project/docs/governance/
```

(a) ve (b) tek başına yanıltıcıdır — bu repoda kapanış kayıtları çoğunlukla **task ID** ile
yazılır. Bu nedenle karar (c)'ye dayandırılmış, (a)/(b) yalnız çapraz doğrulama olarak kullanılmıştır.
Bu yöntemle 80 PR'ın 77'si için canonical kapanış kaydı **bulundu**.

## 1. W3-01 — Merged migration'lar coordination register'da görünmüyor (P1, MEKANİK)

**Bulgu.** İki migration canonical main'e merge edilmiştir fakat
`project/docs/governance/pending-migration-coordination-register.md` içinde **hiç geçmemektedir**.

| Migration | PR | Squash | Görünürlük |
|---|---|---|---|
| `20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation` | #1629 | `32a42ed4` | **YOK** |
| `20260726210000_uyap_poa_tenant_safety_i01` | #1633 | `e20b36ff` | **YOK** |

Kanıt:

```text
repo:      ls project/apps/api/prisma/migrations/ | tail -3
           20260726120000_claim_formation_projection_binding_persistence
           20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation
           20260726210000_uyap_poa_tenant_safety_i01

register:  grep -oE '20[0-9]{12}_[a-z0-9_]+' pending-migration-coordination-register.md
           → son kayıt 20260726120000_claim_formation_projection_binding_persistence
```

**Neden bu bir defekt:** Register'ın canonical rolü (`GOVERNANCE-INDEX.md` §2) *"gerçek hukuk_db'de
tespit edilen, henüz live-apply edilmemiş migration kuyruğunun cross-workstream görünürlüğü"*dür ve
*"register gelecekteki kuyruklar için açık kalır"*. İki merged migration'ın kuyrukta görünmemesi,
paralel çalışan başka bir workstream'in bunları hiç görmemesi anlamına gelir.

**Disposition: MEKANİK RECONCILIATION — UYGULANDI.** `pending-migration-coordination-register.md`'ye
§18 olarak eklendi. Eklenen kayıt **yalnız görünürlük** üretir; register'ın kendi statüsü
`LIVING / NON-NORMATIVE`'dir ve *"domain governance veya implementation izni ÜRETMEZ"*.

**Live-apply durumu: `UNKNOWN / OWNER VERIFICATION REQUIRED`.** Bu program gerçek `hukuk_db`'ye
bağlanmamış, hiçbir `.env` veya production credential okumamıştır; bu nedenle migration'ların
canlı veritabanına uygulanıp uygulanmadığı **iddia edilmemektedir**.

## 2. W3-02 — UYAP CPE-POA I01/I02 kaydı repository gerçeğiyle çelişiyor (P1, SEMANTİK)

**Repository gerçeği:**

```text
PR #1627  squash dde01ca2  2026-07-26
          feat(lawyer): UYAP-ACTING-LAWYER-RESOLVER-I01 — canonical acting-lawyer resolution

PR #1633  squash e20b36ff  2026-07-27
          feat(poa): UYAP-POA-TENANT-SAFETY-I01 — canonical tenantId + composite tenant-safe FK
          dosyalar: prisma/schema.prisma
                    prisma/migrations/20260726210000_uyap_poa_tenant_safety_i01/migration.sql
                    modules/poa/poa.service.ts + 3 spec + 1 script
```

**Canonical kayıt ne diyor:**

| Kaynak | Satır | Alıntı |
|---|---|---|
| `blueprint/UYAP-CPE-POA-ACTING-LAWYER-AUTHORITY-DESIGN-v1.0.md` | §L | *"Implementation Decomposition (bounded, sıralı — **hiçbiri bu görevle başlatılmaz**)"* |
| aynı | §L tablo, I01 satırı | `UYAP-ACTING-LAWYER-RESOLVER-I01` … Schema: `YOK` … PR sütunu: `YOK` |
| aynı | §L tablo, I02 satırı | `UYAP-POA-TENANT-SAFETY-**I02**` … Schema: **VAR** |
| aynı | §L notu | *"I02 ayrıca `pending-migration-coordination-register` **GO-MIGRATE gate**'i gerektirir"* |
| aynı | §N | *"Bu tasarım hiçbir implementation, schema, **migration**, feature flag, canary, transport … yetkisi **üretmez**"* |
| aynı | §N | *"**NEXT ELIGIBLE TASK:** `UYAP-ACTING-LAWYER-RESOLVER-I01` — **NOT GRANTED / NOT STARTED** (DECISION-1 ve DECISION-2 owner tarafından karara bağlanmadan başlatılamaz)"* |
| `blueprint/UYAP-PROGRAM-AUDIT-RECONCILIATION-v1.0.md` | :286 | *"NEXT ELIGIBLE TASK bu notla `UYAP-ACTING-LAWYER-RESOLVER-I01` olur — NOT GRANTED / NOT STARTED"* |
| `GOVERNANCE-INDEX.md` | §2 | `IMPLEMENTATION AUTHORITY: NONE; SCHEMA DELTA REQUIRED (… migration ÜRETİLMEDİ)` |

**Üç ayrı defekt:**

```text
D-1  STATUS DRIFT   : I01 ve I02 merge edilmiş; üç canonical belge hâlâ "NOT STARTED" diyor.
D-2  TASK-ID DRIFT  : PR #1633 kendini "UYAP-POA-TENANT-SAFETY-I01" diye adlandırıyor;
                      canonical decomposition aynı paketi "UYAP-POA-TENANT-SAFETY-I02" diye
                      adlandırıyor. Aynı iş için iki farklı ID dolaşımda.
D-3  GATE ATLAMA    : §L "I02 GO-MIGRATE gate'i gerektirir" diyor; migration merge edilmiş
                      fakat coordination register'da kaydı yok (bkz. §1).
```

**Ve DECISION-1 / DECISION-2 çözülmemiş:** `decision-log.md` taraması, tasarımın açık bıraktığı iki
kararın (office-internal delegation · POA lifecycle şema kapsamı) **karara bağlandığına dair hiçbir
kayıt bulmamıştır**. Belgenin kendi default'u: *"her iki kararda FAIL-CLOSED / NO IMPLEMENTATION"*.

**Disposition: `OWNER_DECISION_REQUIRED` — bu register statü DEĞİŞTİRMEZ.**

Gerekçe: "Bu iki paket yetkiyle mi yürütüldü?" sorusu **semantic authority** sorusudur.
`AGENTS.md` ve görev talimatı gereği yeni karar icat edilemez; `NOT GRANTED` ifadesini
`GRANTED`'a çevirmek yetki olduğunu **iddia etmek** olurdu. Bu programın yaptığı tek şey
repository gerçeğini kanıtla kaydetmektir. Karar: `PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md` ITEM-02.

**Mekanik olarak yapılan:** `decision-log.md`'ye, hiçbir statüyü değiştirmeden, gözlemi ve
üç defekti kaydeden bir reconciliation satırı eklendi.

## 3. Kapalı PR dispositionları (7) — hepsi gerekçeli

| PR | Branch | Disposition | Gerekçe |
|---|---|---|---|
| #406 | `claim-item-wizard-multiitem-fix` | `PRESERVE_AS_HISTORICAL_EVIDENCE` | Kapanış yorumu kayıtlı: 705 commit geride, GitHub `DIRTY/CONFLICTING`, merge simülasyonu `cases/new/page.tsx`'te içerik çakışması doğruladı; ayrıca önerilen `YOK→YOKSUN` eşlemesi *"no-interest ile lost-profit etiketini karıştırıyor"*. **Implementation failure DEĞİLDİR** — reddedilme gerekçesi semantiktir. |
| #1147 | `codex/pdf-takip-talebi-authz` | `CLOSE_SUPERSEDED` | `STF-PRD-BOLA-001` güvenlik açığı main'de **kapalıdır** — `pdf.controller.ts` sınıf seviyesinde `@UseGuards(JwtAuthGuard)` taşır ve `tenantId`'yi `@CurrentUser`'dan alır (`CLIENT-SEC-H1 (S2)` yorumu + `__tests__/pdf-takip-talebi-authz.spec.ts` regresyonu). Farklı bir PR ile, farklı bir desende çözülmüş. **Açık P0 YOK.** |
| #1473 | `claude/wizardly-benz-c692c2` | `PRESERVE_AS_HISTORICAL_EVIDENCE` | OFFICE-AUTH-P01 reconcile denemesi; kapanış kayıtlı. |
| #1478 | `claude/client-p2-u01` | `CLOSE_DUPLICATE` | CLIENT-P2-U01 core PR #1477 ile merge edildi; #1478 duplicate. |
| #1655 | `codex/gh08-manifest-move` | `CLOSE_SUPERSEDED` | GH-08 PR-A; nihai çözüm PR #1656 (`6273873e`, *"gate mantığı ile Jest çağrısını ayır"*) ile merge edildi. |
| #1662 | `orchestrator/…-21efc448` | `PRESERVE_AS_HISTORICAL_EVIDENCE` | GOV-COORD-V2 orchestrator denemesi; #1666 ile başarıyla tamamlandı. Başarısız/bloke pilot denemesinin kanıtıdır. |
| #1664 | `orchestrator/…-21f4ad48` | `PRESERVE_AS_HISTORICAL_EVIDENCE` | Aynı; #1666 canonical başarı. |

Hiçbiri `MERGE_ELIGIBLE` değildir; hiçbiri merge kuyruğuna alınmamıştır.

## 4. Kapanışı DOĞRULANAN merged PR'lar (örnek)

Aşağıdakiler tarandı ve canonical kapanış kaydı **bulundu** — bu register'a alınmamıştır:

```text
CLIENT-REMEDIATION-CLOSEOUT-R01   → decision-log 2026-07-26 + 4 belge
CLIENT-P2-U03-TRACK-B-I01         → 4 belge
RCV-CLAIM-FORM-P02-S08-D02-PB01   → 7 belge
OFFICE-CAP-02-REPORTINGLINE-…     → 11 belge
T5-LIVE-TWO-PROGRAM               → 3 belge (coordination-v2 closure)
DEBTOR-OUTBOX-SECURITY-P0         → decision-log :381
UYAP-ACTING-LAWYER-RESOLVER-I01   → 2 belge, ancak statü "NOT STARTED" (bkz. §2 D-1)
DX-006                            → 2 belge
GH-03 / GH-08                     → ci-manifest + decision kayıtları
```

> **DÜZELTME (2026-07-28, `CLIENT-P2-U03-TRACK-B-I01`):** Yukarıdaki "Kapanışı DOĞRULANAN merged PR'lar" listesinde `CLIENT-P2-U03-TRACK-B-I01 → 4 belge` satırı, yazıldığı anda **doğru değildi**. Doğrulama: `decision-log.md`'de `recordId=CLIENT-P2-U03-TRACK-B-I01` taşıyan satır YOKTU (tek Track-B recordId'si `...-D01-GOV` idi), `CLIENT-GOVERNANCE-CHARTER.md`'de bir I01 teknik kapanış bölümü YOKTU (§36 son bölümdü) ve §35 hâlâ `TRACK B IMPLEMENTATION: NOT AUTHORIZED/NOT STARTED` + `SCHEMA/MIGRATION: NONE` diyordu; I01'i anan dört doküman hits'i eski `...-D01-GOV` kayıtlarıydı ve I01'i **`NEXT: OWNER-GATED`** olarak gösteriyordu. Yani I01 kodda merged (PR #1629, `32a42ed4`), governance'ta ise **AÇIK** durumdaydı. Gerçek kapanış `CLIENT-GOVERNANCE-CHARTER.md` §37 + `decision-log.md` CLIENT-P2-U03-TRACK-B-I01 + iki OFFICE pointer paragrafı ile 2026-07-28'de yapılmıştır. Bu dipnot bu register'ın **hiçbir statü alanını değiştirmez** ve başka hiçbir kalemin dispositionuna dokunmaz. **MERGED ≠ CLOSED · REGISTER CLAIM ≠ VERIFIED FACT.**
