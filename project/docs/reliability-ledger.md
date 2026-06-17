# Reliability Forensic Audit — Ledger

**Mod:** BULGU TOPLAMA (collection). **Fix modu KAPALI** (ulas kararı 2026-06-17).
Risk haritası tamamlanmadan kodlamaya geçilmez. Yalnız A ve B sınıfı bulgular fix'e aday;
C sınıfı önce spot-check ile B'ye terfi etmeli.

## Neden bu ledger var
Tur 1 audit'inde 5 bulgudan 1'i (en öncelikli "PR-A StaffMember guard") YANLIŞ çıktı —
guard zaten PR-S/U3 ile merge edilmişti. Kök sebep: "bayat-ama-bir-zamanlar-doğru" bilginin
audit'te tekrar bulgu gibi raporlanması. Bu ledger üç şeyi ayırır: (1) gerçek kod durumu,
(2) güven seviyesi, (3) bulgunun yaşam-döngüsü durumu.

## Güven sınıfları (A/B/C)
- **A** — Kod okundu **+ canlı doğrulandı** (gerçek istek/gözlem). Çok yüksek güven.
- **B** — Kod okundu, **henüz canlı doğrulanmadı**. Muhtemelen doğru.
- **C** — Agent raporu, **spot-check yok**. Aday bulgu; gerçek bulgu DEĞİL.

## Durum (lifecycle)
- **OPEN** — açık, fix bekliyor (henüz yapılmaz; collection modu)
- **RESOLVED** — düzeltildi/merged (kayıt için tutulur ki tekrar "bulgu" sanılmasın)
- **CANDIDATE** — C sınıfı, doğrulanmadı
- **CONDITIONAL** — gerçek olup olmadığı bir koşula bağlı (canlı kullanım vb.)

---

## RESOLVED (kayıt için — tekrar "bulgu" sanılmasın)
| ID | Bulgu | Kanıt | Güven | Durum |
|----|-------|-------|-------|-------|
| RFA-001 | Lawyer create+update duplicate guard | lawyer.service.ts:152-168 (create), 277-293 (update) | A (canlı: image-1 mükerrer gözlendi+temizlendi) | RESOLVED (PR-U1 #135) |
| RFA-002 | Staff create+update duplicate guard | staff.service.ts:42-101, 111-146 | A (canlı: Fatih duplicate) | RESOLVED (PR-S #134 / PR-U3 #137) |
| RFA-003 | Debtor create+update+liste-edit duplicate guard | debtor.service.ts:423 (create), 565 (update); debtors/page.tsx (PR-U5) | A (canlı API e2e PASS) | RESOLVED (PR-U2 #136 / PR-U5 #139) |
| RFA-004 | Client create+update kimlik-block | client.service (PR-1), client update (PR-U4 #138) | B | RESOLVED |

> ⚠️ Bu satırlar AÇIK BULGU DEĞİL. Bir audit turu bunları tekrar "guard yok" diye raporlarsa
> = bayat-bilgi tuzağı (Tur 1'deki PR-A hatası). Önce buraya bak.

---

## OPEN bulgular (fix'e aday — ama collection modu, henüz dokunulmaz)
| ID | Bulgu | Kanıt (file:line) | Güven | Risk | Fix yaklaşımı | Migration |
|----|-------|-------------------|-------|------|---------------|-----------|
| **RFA-005** ✅ **RESOLVED** | Lookup create reactivate-on-code yok → silinen kodu yeniden ekleyince P2002 → ham **500** | lookup.service.ts create (eski düz create); schema 6× `@@unique([tenantId,code])` | **A (canlı DB e2e PASS)** | MED→kapandı | **MERGED PR-RFA005**: generic create()'te (tenantId,code) inactive dahil ara → active=409 ConflictException (500→409 iyileştirme), soft-deleted=aynı id reactivate + editable alan güncelle (code/tenantId sabit), yok=düz create. Tek-kaynak (6 model birden). Test: 4 unit + canlı e2e (reactivate aynı id/count=1/409). Migration yok | Hayır |
| **RFA-006** ✅ **RESOLVED** | DebtorAddress dedup yok → mükerrer adres yığılır (DEAD-1 addressHash hiç hesaplanmıyordu) | 6 write yolu: addAddress, address.service, debtor.create inline, cross-file/institution/uyap discovery | **A (canlı DB e2e PASS)** | MED/yüksek değer→kapandı | **MERGED PR-RFA006**: ortak `address-hash.util` (normalizeAddress+computeAddressHash+findOrCreateDebtorAddress, race-safe P2002 retry). 6 yol bu helper'ı kullanır (tek-kaynak); discovery'lerin zayıf dedup'u normalized-hash'e yükseltildi; inline array-içi dedup. Test: 9 util unit + canlı e2e (case/boşluk varyant→count=1, hash dolu, farklı borçlu serbest). **Backfill AYRI op** (9 eski null-hash satır, PR sonrası). Migration yok | Hayır (kolon var) |
| RFA-007 | EnforcementAction idempotency yok → cron(5dk)+manuel çift-tetik → mükerrer kayıt | workflow-engine.service.ts:293-307 (düz create); ScheduleModule app.module:130 AKTİF + @Cron EVERY_5_MINUTES (automation.service:25) → processCase → createEnforcementAction:233 | B (wiring canlı doğrulandı) | MED bugün / **HIGH otomasyon açılınca** — yalnız `isAutoMode+isAutomationEnabled` dosyalar işlenir; gerçek veri yok → pratikte dormant ama wiring CANLI | **status-bazlı guard** (PENDING/SENT varsa atla) — `@@unique([caseId,type])` veya `[caseId,type,status]` YANLIŞ (meşru tekrar var) | Hayır |
| RFA-008 | ThirdParty.create duplicate guard yok | third-party.service.ts:42-52 | B | MED | tckn/vkn + caseDebtorId bazlı guard | Hayır |
| RFA-009 | Debtor.delete HARD delete → kapalı dosyada DebtorAddress/Intelligence cascade kaybı | debtor.service.ts:623-642 (aktif-dosya guard var; sonunda `prisma.debtor.delete`) | B | MED | Debtor'a soft-delete | **Evet** (isActive/deletedAt) |
| RFA-010 | Ghost-relations: case detayında/listesinde soft-deleted personel/avukat/müvekkil filtresiz görünür | case.service.ts:403-421 (findOne lawyers), 423-435 (staff), 437-465 (caseClients), 262-264 (findAll lawyers) — hiçbirinde `where isActive` yok | B | MED (görüntü; veri kaybı değil) | **tasarım kararı önce** (gizle vs "pasif" etiket). **DÜZELTME:** lawyer da artık LOW değil — cleanup turu-2 ile isActive=false avukatlar ÜRETTİK (lawyer soft-delete fiilen var), include'lar onları gösterebilir | Hayır |
| RFA-011 | Legacy debtor-create bypass: `dto.debtors` yolu checkDuplicateInternal'ı atlar | case.service.ts:812-832 | B (çözüldü) | LOW **CONDITIONAL** | **UI TETİKLENEBİLİR: NO** — sihirbaz DebtorStep→`caseDebtors` (debtorId, guard'lı modal) kullanıyor; legacy `debtors` state (cases/new:245/849) render EDİLMİYOR → backend'e boş gider, 820 yolu UI'dan hit edilmez. Yalnız API/backward-compat riski → düşük öncelik | Hayır |
| RFA-012 | getDebtorsForCase `_count` döndürmez (case-detay alt-listesi) | debtor.service.ts ~1260 (ana findAll:348-354 _count VAR) | B | LOW (frontend `||0` graceful) | nested include'a `_count` ekle | Hayır |
| **RFA-016** ✅ **RESOLVED** | case.service.create() inline guard BYPASS (Şükrü-deseninin dış-kapı hali) — inline-yeni client/lawyer/debtor `tx.X.create` ile guard'sız açılıyordu | case.service.ts:624/739/820 (eski); fix: `resolveInlinePartiesBeforeTx` tx ÖNCESİ guard'lı ClientService/LawyerService/DebtorService.create çağırır, tx içinde tx.X.create KALDIRILDI | **A (canlı DB-count e2e PASS)** | HIGH→kapandı | **MERGED PR-RFA016**: Tasarım A; client/lawyer reuse, debtor DUPLICATE_IDENTITY→reuse / SIMILAR_NAME_REVIEW→forceCreate; legacy debtor de guard'a çevrildi. Test: 7 unit (case-create-rfa016-guard.spec) + canlı e2e (2 case aynı inline taraf → client=1/lawyer=1). DI boot OK. Migration yok | Hayır |
| **RFA-017** ✅ **RESOLVED** | Excel client import direct create — `ClientService.create` atlanıyordu (guard+reactivate yok). DÜZELTME: Client'ta tckn/vkn UNIQUE yok → re-import = **sessiz duplicate** (P2002/500 değil) | export-import.service.ts:407 (eski `prisma.client.create`) | **A (canlı DB e2e PASS)** | MED/HIGH→kapandı | **MERGED PR-RFA017**: import → guard'lı ClientService.create (tek-kaynak); ClientService.create additive 6 kolon map'i (isForeigner/nationality/companyType/mersisNo/ticaretSicilNo/postalCode — latent drop'u da düzeltti). Test: 3 unit (delegasyon+alan) + canlı e2e (re-import→client=1, alan persist, soft-delete→reactivate). Migration yok | Hayır |

## SPOT-CHECK EDİLDİ — C→B terfi (2026-06-17)
| ID | Bulgu | Kanıt (doğrulandı) | Güven | Risk | UI tetiklenebilir |
|----|-------|--------------------|-------|------|-------------------|
| RFA-013 | ClientPortalUser reactivate yok → disable sonra yeniden enable **400 "zaten mevcut"** | portal.service.ts:31 findUnique(clientId)→36 throw; :293/304 disable isActive=false; schema `clientId @unique` + isActive; reactivate YOK | **B** (kendim okudum) | MED | YES (portal aç/kapat toggle); doğrula |
| RFA-014 | GroupDefinition reactivate yok → **sessiz duplicate** (name'de unique YOK → 500 değil, çift satır) | group.service.ts:44-56 create reactivate yok, soft-delete; schema name @unique YOK | **B** (kendim okudum) | LOW-MED | YES (grup oluştur); ama düşük etki |
| RFA-015 | DebtorIntelligence idempotency yok → çift-submit/timeout-retry 2 kayıt (adres update idempotent) | debtor.service.ts:819-887 createIntelligence, @unique yok | B (agent kanıtı, satır doğrulandı) | LOW-MED | YES (saha sonucu submit retry) |

---

## DEAD RELIABILITY INFRASTRUCTURE (yarım kalmış — "çözüldü sanılan ama çalışmayan")
> En tehlikeli desen: geliştirici "dedup/guard çözüldü" sanır, runtime'da fiilen çalışmaz.
| ID | Ölü altyapı | Kanıt | Etki |
|----|-------------|-------|------|
| DEAD-1 ✅ **CANLANDIRILDI (RFA-006)** | `DebtorAddress.addressHash` + `@@unique([debtorId, addressHash])` constraint vardı ama kodda hiç hesaplanmıyordu → unique fiilen ölüydü | RFA-006 (#PR) ile 6 write yolu hash üretir → constraint artık CANLI. **Kalan:** 9 eski null-hash satır için backfill AYRI op (PR sonrası) | yeni write'larda dedup çalışıyor; eski satırlar backfill bekliyor |
| DEAD-2 | `Asset` modeli var ama servis/controller YOK (`prisma.asset.create` = 0 hit) — kullanılmıyor | schema 1299-1312 | ileride doldurulursa guard yok; şu an LOW |

---

## CLEAN (doğrulandı, fix GEREKMEZ — false-positive önleme)
| Alan | Kanıt | Güven |
|------|-------|-------|
| Notification SENT/FAILED dürüstlüğü (try-catch) | client-notification.service.ts:162-203, 253-300 | B (agent) |
| Escalation çift-gönderim guard (lastNotifiedLevel; SENT ilerler, FAILED/SKIPPED retry) | operational-escalation.service.ts:128-175 + test | B (agent+test) |
| Outbox idempotencyKey duplicate-check | icrabot/v28-engine/outbox.service.ts:67-101 | B (agent) |
| Contact-followup retry-safety + dedupeKey tek-task | client.service.ts:326-405 + test | B (agent+test, #92/#93) |
| AssetQuery idempotencyKey @unique + rate-limit | asset-query.service.ts:16-91; schema 5072 | B (agent) |
| **OCR scan endpoint'leri DB'ye YAZMAZ** (extract-only, veri döndürür; kullanıcı sonra normal create'ten kaydeder) → bypass riski yok | ocr.controller.ts:243/300/356 | B (agent, Tur3) |
| POA idempotency: (clientId + normalizeNotaryName + dateIssued) natural key → mükerrer POA açmaz | poa.service.ts:161-184 + test | B (agent, Tur3) |
| UYAP XML import STUB (success:false, DB yazmaz) → dormant, gelince guard gerekir | uyap.controller.ts:355-363 | B (agent, Tur3) |
| CaseDebtor bulk add guarded (debtorId+caseId+role çakışma → 409; idempotent değil ama guard'lı) | case-debtor.service.ts:42-110, 211-232 | B (agent, Tur3) |

---

## TARANDI (Tur 3 — 2026-06-17)
- ✅ OCR kayıt-açma: scan endpoint'leri DB'ye yazmaz (extract-only) → güvenli; POA idempotent. Tek risk case.service inline create (RFA-016).
- ✅ Import: Excel client import bypass (RFA-017); Excel debtor import endpoint'i YOK; CaseDebtor bulk guarded.
- ✅ UYAP: XML import STUB (dormant); diğer UYAP metodları stub/gate (DB yazmaz).
- ✅ Automation engine: CANLI wiring (cron 5dk) ama yalnız auto-enabled dosyalar → RFA-007 güncellendi.
- ✅ Visibility sweep: RFA-010 (ghost-relations, lawyer dahil) + RFA-012 (_count). Lookup/Client/Lawyer/Staff findAll filtreleri OK.

## ÖNERİLEN FIX SIRASI (collection sonrası — ONAY BEKLER, henüz uygulanmaz)
UI-tetiklenebilirlik + güven + değer sırası. Gerçek kullanıcı riski > salt kod riski:
1. **RFA-016 (HIGH, UI=YES client+lawyer)** — case.service inline create guard → en yüksek gerçek risk.
2. **RFA-017 (MED/HIGH, UI=YES)** — Excel client import guard.
3. **RFA-005 (MED, UI=YES)** — Lookup reactivate-on-code (500 hatası).
4. **RFA-006 (MED, yüksek değer)** — DebtorAddress dedup (DEAD-1 addressHash'i bağla).
5. **RFA-008 (MED)** — ThirdParty guard.
6. **RFA-013 (MED, UI=YES?)** — ClientPortalUser reactivate.
7. **RFA-007** — EnforcementAction status-guard (otomasyon açılmadan düşük aciliyet).
8. Düşük/tasarım-gated: RFA-010 (tasarım kararı), RFA-009 (Debtor soft-delete, migration, IR/Party ile), RFA-014/015 (LOW), RFA-011 (API-only), RFA-012 (LOW).

## HENÜZ TARANMADI (sonraki turlar)
- **DebtorAddress/EstateHeir inline dedup** (case/debtor create içinde; RFA-006 ile bağlantılı)
- **Henüz okunmamış soft-delete eden modeller** (başka var mı tam taranmadı)
- **Calc/faiz/TBK100 para hesapları** (ayrı uzman alan; bu audit kapsamı dışında, ayrı tur)

---

## SÜREÇ KURALI
1. Yalnız **A/B** sınıfı fix'e aday. **C** önce spot-check → B'ye terfi.
2. Fix'ten önce ilgili bulgu mümkünse **canlı doğrula** (B→A).
3. Bir bulgu RESOLVED ise tekrar "bulgu" olarak raporlama (bayat-bilgi tuzağı).
4. Risk haritası (HENÜZ TARANMADI listesi) bitmeden toplu fix planı kilitlenmez.

_Son güncelleme: 2026-06-17 — Tur 1+2+3 + (b) spot-check. RFA-016 UI-tetiklenebilir doğrulandı (client+lawyer=YES, debtor=NO) → #1 fix adayı. RFA-011 UI=NO (API-only). C sınıfı RFA-013/014/015 → B'ye terfi. Risk haritası büyük ölçüde tamam; fix sırası önerildi (onay bekler)._
