# CLAUDE-CLIENT-C1 — Core Write Integrity & Seed/Bulk Boundary

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CLAUDE-CLIENT-C1
LANE OWNER:               CLAUDE
PREDECESSOR:              R0 — Reconciliation (master plan §10)
SUCCESSOR:                CLAUDE-CLIENT-C2
                          (C2, C1 ENGINEERING_COMPLETE olduğunda başlar;
                           C1'in ACTIVATION borcu açık kalsa bile)

ALLOWED PATHS:
  project/apps/api/src/modules/client/
  project/apps/api/src/modules/seed/
  project/apps/api/src/app.module.ts
  project/apps/api/prisma/                    (yalnız C1 migration paketi, §MIGRATION)
  project/apps/api/ci-manifests/pure/client-portal.txt   (§CI MANIFEST RULE ile)

FORBIDDEN PATHS:
  project/apps/api/src/modules/client/client-mutation-policy.ts
                                                        (C2 LANE-OWNED — owner kararı
                                                         2026-08-02; C1 KOŞULSUZ YAZMAZ)
  <C2'NİN AKTİF ADDRESS/AUTHORITY DOSYALARI>            (C2 aktif bloğunun manifest'i;
                                                         client-address*.ts dahil)
  project/apps/api/src/modules/portal/                  (CODEX X1)
  project/apps/api/src/modules/client-notification/     (CODEX X1)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  project/apps/api/src/modules/client-intake-*/         (CODEX X3)
  .github/  ·  ci.yml                                   (control-plane)
  project/docs/governance/coordination-v2/activation/   (grant self-authorization)
  project/docs/governance/coordination-v2/schemas/ · project/scripts/orchestration-v2/

INTRA-LANE CONCURRENCY (owner kararı 2026-08-02):
  C2 artık C1 DEVAM EDERKEN paralel yürür (global predecessor KALDIRILDI).
  C1 kendi bloğuna başlamadan önce, C2'nin aktif blok manifest'i ile çakışma kontrolü
  yapar; çakışma varsa YALNIZ o C1 bloğu WAITING_FOR_OTHER_SESSION olur, sıra atlanmaz.
  C1 lane-owned: client.service.ts · seed/ · prisma/ · app.module.ts
  C2 lane-owned: client-mutation-policy.ts · aktif address/authority dosyaları

SHARED CONTRACTS:
  client-mutation-policy.ts        → C2 tek-writer; C1 TÜKETİR, semantiğini DEĞİŞTİRMEZ
  office-approval.isApproverEligible → READ-ONLY (3 farklı eligibility var; birleştirme YASAK)
  ClientService.create / bulk predicate → C1 yazabilir (kendi kapsamında), C2 devralır
  ci-manifests/pure/client-portal.txt → ORTAK APPEND-ONLY yüzey (owner düzeltmesi
                                        2026-08-03; "tek manifest writer = C1" ifadesi
                                        SUPERSEDE EDİLDİ). Her lane YALNIZ kendi
                                        satırlarını ekler, mevcut satırları DEĞİŞTİRMEZ;
                                        çakışmada SONRA GELEN REBASE EDER.

  ⚠ XL-1 · C1 → X1 DERLEME/DI BAĞIMLILIĞI (master plan §12-A-2, VERIFIED 2026-08-02):
  client.service.ts:6 · :320 · :2562 · :2574 · :2611 ve client.module.ts:12 · :16
  X1'in sahip olduğu notification-dispatcher.service.ts'e bağımlıdır
  (NotificationDispatcherService provider + DispatchResult/DispatchStatus tipleri).
  X1 o shape'i dondurmakla yükümlüdür; C1 de bu import'u KALDIRMAZ/yeniden yönlendirmez.
  Kırılma jest'te GÖRÜNMEZ (diagnostics:false) — yalnız Type check yakalar.

  ⚠ XL-2 · C1'İN EXPORT ETTİĞİ VE X1'İN TÜKETTİĞİ TİPLER — DARALTILAMAZ:
  client.service.ts:21 `AuditActor` ← portal.service.ts:11 tüketiyor
  client-audit.util.ts export'ları  ← portal.service.ts:10 tüketiyor
  Genişletme serbest; daraltma/yeniden adlandırma X1'i Type check'te KIRAR →
  owner kararı + X1 ile koordineli TEK değişiklik gerekir.

  ⚠ XL-3 · C1 İMZASINA BAĞLI C2-LANE SPEC'İ:
  client/__tests__/client-address-mutation-authorization-r2.spec.ts:402-403
  C1'in create/update imzasını regex ile assert eder ve AYNI jest process'inde koşar.
  C1 imzayı değiştirecekse bu shared-contract çakışmasıdır (pre-flight'ta bildirilir).

MIGRATION WRITER:         EVET — bu sayfa migration yazabilir.
                          Program kuralı: MIGRATION OWNER = CLAUDE LANE; aynı anda TEK
                          aktif migration görevi. C1 açıkken başka Claude görevi
                          migration YAZMAZ.

SHARED CONTRACT FREEZE:   client-mutation-policy.ts semantiği C2'de dondurulur; C1 yalnız
                          çağırır. office-approval eligibility READ-ONLY.

GRANT STATUS:             OWNER GRANT EXPANSION REQUIRED
                          Gerekçe: seed/, app.module.ts, prisma/ mevcut
                          STANDING-GRANT-CLIENT-LIVE-R01 kapsamı DIŞINDA
                          (prisma/ açıkça prohibitedPathRoots).
                          Bu alınmadan CANLI implementation başlamaz.

PRODUCTION GATE:          EVET — C1-PROD-ACTIVATION bloğu WAVE 4'tedir ve §5 koşullu
                          yetkiye tabidir. C1 sayfası bu blok tamamlanmadan
                          TERMINAL CLOSED ilan EDİLEMEZ.

TASK ORDER:
  Master planda yazılı sıra değiştirilemez.

CONTEXT RULE:
  Konuşma hafızası canonical kaynak değildir.
  Current main, master plan ve ratifiye kararlar canonical kaynaktır.

CROSS-LANE RULE:
  Diğer lane'in dosyasına, PR'ına, branch'ine, worktree'sine veya görevine dokunma.

CROSS-MODULE RULE:
  CLIENT dışındaki bulguları dependency olarak kaydet; implementation başlatma.

NEW FINDING RULE:
  Yeni bulgu mevcut göreve gizlice eklenmez ve BLOK SAYACINI DEĞİŞTİRMEZ.
  Master plana disposition için gönderilir.

PROGRAM LOCK:             CLIENT ONLY
```

---

## 0. OWNER AUTHORIZATION (tek seferlik — blok başına onay YOK)

```text
OWNER AUTHORIZATION:
GO-COMPLETE — CLAUDE-CLIENT-C1 TAM SAYFA

AUTHORIZED WITHOUT FURTHER OWNER APPROVAL:
- C1-B01..C1-B06 sıralı engineering execution
- İzole worktree ve branch
- Test ve bounded production-code değişikliği
- Yetkili path'lerde migration HAZIRLANMASI
- Commit, push, PR
- CI polling
- Required checks PASS + MERGEABLE ise normal squash-merge
- main sync
- Kendi branch/worktree cleanup
- Fresh main ile sıradaki C1 bloğuna OTOMATİK geçiş
- Master status/count güncellemesi

NO PER-BLOCK OWNER APPROVAL:
Listelenen C1 görevleri için tekrar owner GO İSTENMEYECEK.

OWNER RETURN ONLY IF:
- Ratifiye edilmemiş hukuki/ürün kararı zorunluysa
- Allowed-path dışına çıkmak teknik olarak kaçınılmazsa
- Destructive production data operation koşullu yetkinin dışındaysa
- Acceptance kriterleri arasında GERÇEK çelişki varsa
```

---

## 1. BLOK YAPISI VE DEĞİŞTİRİLEMEZ SIRA

```text
C1 BLOCK COUNT:
6 ENGINEERING BLOCKS
+ 1 DEFERRED PRODUCTION ACTIVATION BLOCK

EXECUTION ORDER:
C1-B01 → C1-B02 → C1-B03 → C1-B04 → C1-B05 → C1-B06
→ C1-PROD-ACTIVATION (WAVE 4)

ORDER MUTATION:
FORBIDDEN
```

Her blok **ayrı branch/worktree/PR** ile tamamlanabilir; fakat **aynı sayfa** bütün C1
programını sonuna kadar yönetir. Yeni bulgu blok sayacını değiştiremez.

### Her blok sonunda ZORUNLU çıktı

```text
CURRENT PAGE:                 CLAUDE-CLIENT-C1
COMPLETED BLOCK:              <exact ID>
BLOCK RESULT:                 ENGINEERING_COMPLETE / RUNTIME_VERIFIED /
                              ACTIVATION_PENDING / FAILED_EXACT
MERGED PR / SHA:              <PR ve merge SHA>
C1 BLOCKS TOTAL:              6
C1 BLOCKS COMPLETED:          <n>
C1 BLOCKS REMAINING:          <n>
REMAINING BLOCKS:             <exact sıralı liste>
ACTIVATION DEBT:              <liste veya NONE>
NEXT ELIGIBLE:                <yalnız sıradaki exact blok>
OWNER AUTHORIZATION REQUIRED: NO / yalnız gerçek istisna
PROGRAM LOCK:                 CLIENT ONLY
```

---

## 2. ÜÇ DURUM AYRIMI (MERGED ile kapanış YASAK)

```text
CODE_PRESENT:          Kod main'de.
ENGINEERING_COMPLETE:  Kod + test + CI + merge + cleanup + local/controlled runtime
                       verification.
PRODUCTION_ACTIVE:     İlgili migration/flag/runtime değişikliği GERÇEK hedef ortamda
                       uygulanmış ve doğrulanmış.

KURAL:
MERGED ≠ ENGINEERING_COMPLETE
ENGINEERING_COMPLETE ≠ PRODUCTION_ACTIVE
```

Migration gerektirmeyen bloklarda (B01–B04, B06) **runtime davranışı doğrulanır** →
`RUNTIME_VERIFIED`. Migration taşıyan **B05** Wave 4'e kadar `ACTIVATION_PENDING` kalır.

B06 bittiğinde sayfa durumu:

```text
C1 ENGINEERING:            COMPLETE
C1 PRODUCTION ACTIVATION:  PENDING_WAVE_4
C1 PAGE:                   SUSPENDED_FOR_ACTIVATION
                           NOT TERMINALLY CLOSED
```

**C2 başlayabilir**; C1'in production borcu master planda **açık kalır**.
Wave 4 geldiğinde **yeni sahip oluşturulmaz** — aynı C1 sayfası tekrar açılır ve kendi
migration'ını devreye alır.

---

## 3. BLOCKER DISCIPLINE

```text
Claude bu sayfada:
- Governance/orchestra/control-plane onarımı BAŞLATMAZ.
- Yeni SA/EG/grant/binding ÜRETMEZ.
- gh-guard -Repair ÇALIŞTIRMAZ.
- Branch protection/ruleset DEĞİŞTİRMEZ.
- Admin/bypass KULLANMAZ.
- Başka PR'ın CI veya merge sorununu SAHİPLENMEZ.
- decision-log/register biçim eksikliğini product blocker SAYMAZ.
- Normal CI beklemesini BLOCKED SAYMAZ.
- Başka lane'in ayrık çalışmasını competing writer SAYMAZ.
- Exact path kanıtı olmadan competing writer İLAN ETMEZ.

STATUS SINIFLARI:
- WAITING_FOR_CI
- WAITING_FOR_PREDECESSOR
- WAITING_FOR_OTHER_SESSION
- WAITING_FOR_CONTROL_PLANE
- ACTIVATION_PENDING_WAVE_4
- BLOCKED_EXACT

BLOCKED_EXACT yalnız DÖRDÜ BİRDEN sağlanırsa:
1. Mevcut exact C1 bloğunun acceptance'ı teknik olarak ilerleyemiyorsa,
2. Engel granted scope içinde çözülemiyorsa,
3. Engel repository/current-main kanıtıyla doğrulanmışsa,
4. Devam etmek veri kaybı veya yetki ihlali yaratacaksa.

CONTROL-PLANE KAYNAKLI MERGE SORUNU ÇIKARSA:
- Product kapsamını GENİŞLETME.
- Control-plane onarımı YAPMA.
- Tek kısa dependency handoff ver.
- Mevcut bloğu WAITING_FOR_CONTROL_PLANE olarak bırak.
- Sırayı ATLAYIP sonraki C1 işine GEÇME.
```

---

## 4. CI MANIFEST RULE

`ci-manifests/pure/client-portal.txt` **tek fiziksel dosyadır** ve hem client hem portal
speclerini taşır → **C1 ile CODEX X1 arasında gerçek ortak writer yüzeyi** (OBSERVED).

```text
- C1 yalnız KENDİ testlerini bağlayan exact satırları yazar.
- C1, X1'in portal manifest satırlarına DOKUNMAZ.
- WAVE 1 MANIFEST WRITER = CLAUDE C1.
  X1'in manifest ihtiyacı, C1'in açık blok PR'ı merge olduktan SONRA serialize edilir
  (append-only satır; X1 rebase eder). İki taraf aynı anda bu dosyayı YAZMAZ.
- `__tests__/*` wildcard EXACT WRITE MANIFEST DEĞİLDİR.
  Her blok başlamadan GERÇEK dosya adları listelenir.
```

---

## 5. CONDITIONAL PRODUCTION AUTHORIZATION (C1-PROD-ACTIVATION)

```text
CONDITIONAL PRODUCTION AUTHORIZATION:
GRANTED FOR C1-PROD-ACTIVATION

EXECUTE IN WAVE 4 ONLY IF (hepsi):
- Fresh production backup/restore yolu doğrulandı
- Duplicate inventory çıkarıldı
- Veri ön-temizliği deterministik ve audit edilebilir
- Migration staging/temiz DB/existing DB üzerinde PASS
- Rollback veya forward-repair planı mevcut
- Required CI PASS
- C1/C2 write freeze uygulanmış
- Dry-run sonucu kabul kriterleri içinde
- Veri kaybı veya çözümsüz duplicate YOK

IF ALL PASS:
Ayrı owner GO İSTEMEDEN: apply → verify → evidence → close.

IF ANY FAIL:
Production mutation YAPMA; BLOCKED_EXACT kanıtını getir.
```

---

## 6. #2107 DISPOSITION (koşullu — R0 kanıtıyla çözüldü)

```text
IF #2107 MERGED:          Fresh main'den residual doğrula ve REUSE ET.
IF #2107 CLOSED UNMERGED: CANONICAL_EARLY_DELIVERABLE SAYMA. Branch/WIP'i salt-okunur
                          incele. Kayıpsız disposition sonrası kalan işi C1 scope'unda
                          tamamla.
IF #2107 OPEN:            Sahip session'a DOKUNMA. WAITING_FOR_PREDECESSOR kullan.
                          Duplicate R3/seed implementation BAŞLATMA.
```

**ÇÖZÜLEN DAL (VERIFIED):** #2107 **MERGED** — `mergedAt 2026-08-02T14:24:01Z`,
merge SHA `789cf8f622a71aad9e4b4f642e9525811f65dfbd`, `git merge-base --is-ancestor
789cf8f6 origin/main` = **ANCESTOR_OK**. → **Fresh main'den residual doğrula ve reuse et.**

#2107 kapsamı (17 dosya, +881/−52) şunları teslim etti — **duplicate implementation
AÇILMAZ**:

| Bulgu | #2107'de |
|---|---|
| F-SEED-01 anonim `/seed/public-institutions` | `@UseGuards(JwtAuthGuard)` + regresyon testi |
| F-SEED-02 env gate yok | YENİ `seed-runtime-gate.ts` — production **koşulsuz kapalı** |
| F-SEED-03 seed `ClientService` baypası | `seedClients` → `ClientService.create`, raw prisma YOK |
| F-SEED-04 `fix-clients` | tenant-scoped `updateMany`+count + checksum + authz |
| FIND-C2 (backfill kısmı) | merkezi `assertCanRunElevatedClientBulkOperation` |

---

## 7. BLOKLAR

### C1-B01 — #2107 residual doğrulama (reuse)
Fresh main'de yukarıdaki beş kalemin **gerçekten** kapandığını koddan yeniden kanıtla
(PR açıklaması kanıt değildir). Kapanmayan kalem varsa **tamamla** — yeniden yazma.
**Sonuç:** `RUNTIME_VERIFIED` (davranış doğrulaması) veya kalan iş varsa tamamlanmış hâli.

### C1-B02 — FIND-C1: partial-update `displayName`/`name` veri kaybı (HIGH)
`client.service.ts:1671-1673` (recompute) → `:1696-1697` (koşulsuz yazım).
Standart-only update (ör. `{phone}`) `data.type`'ı undefined bırakır → `displayName=""`
yazılır; **SENSITIVE sınıfındaki alan elevated yetki olmadan ezilir**. Partial-sensitive
yasak olduğu için kullanıcılar tam bu yola itilir → normal edit yolu, köşe vaka değil.
**Önce characterization testi (KIRMIZI), sonra fix (YEŞİL).**
**Sonuç:** `RUNTIME_VERIFIED`.

### C1-B03 — Bulk atomiklik ve failure davranışı (F-SEED-05/06)
```text
F-SEED-05/06 OUTCOME:
Bulk işlemin atomiklik modeli KANITLA belirlenecek:
  - all-or-nothing transaction,
  - bounded transactional batches,
  - resumable/idempotent stages
seçeneklerinden mevcut ClientService transaction yapısı, hacim ve rollback
gereksinimine uygun olan seçilecek.

Kör biçimde tek büyük transaction KURULMAYACAK.
```
Kapsam: `seedAll` çok-adımlı zinciri + per-row döngüler +
`seedPublicInstitutionDebtors` sınırsız ("limit yok") yazımı.
**Sonuç:** `RUNTIME_VERIFIED`.

### C1-B04 — Duplicate identity ve dedup doğruluğu (FIND-C5 + servis tarafı)
`client.service.ts:1425-1434`: dedupe `tckn || vkn` **tek probe'a çöküyor**; `vkn`
bağımsız sorgulanmıyor; 10-hane `vkn` başka kaydın `identityNo`/`vkn` değeriyle
çapraz eşleşebiliyor. Servis-seviyesi dedup davranışı ve yarış penceresinin **profili**
burada çıkarılır (DB çözümü B05'in design gate'ine girdi olur).
**Sonuç:** `RUNTIME_VERIFIED`.

### C1-B05 — FIND-C3/C4 DESIGN GATE + migration paketi
```text
FIND-C3/C4 DESIGN GATE:
Önce KANITLANACAK:
  - mevcut duplicate data profili,
  - null/empty normalization,
  - PostgreSQL unique davranışı,
  - mevcut foreign-key ilişkileri,
  - API backward compatibility,
  - lost-update senaryoları,
  - bütün write path'lerin version taşıyabilmesi.

Sonra SEÇİLECEK:
  - unique constraint/index biçimi,
  - dedup migration,
  - CAS/version yaklaşımı.

Partial unique index veya version kolonu PEŞİNEN ZORUNLU ÇÖZÜM DEĞİLDİR.
C3 ve C4 aynı migration'a YALNIZ atomik olarak birlikte deploy edilmeleri
kanıtlanırsa alınır; aksi hâlde aynı migration owner altında SERİ paketlenir.
```
Bağlam (OBSERVED, çözüm değil kanıt): DB'de kimlik tekilliği YOK — `tckn`/`vkn` yalnız
non-unique index; tek unique `(id,tenantId)` composite-FK hedefi. Optimistic-lock kolonu
yok (`@updatedAt` CAS değildir).
**Sonuç:** `ACTIVATION_PENDING` — migration yazılır + CI'da doğrulanır; **APPLY WAVE 4**.

### C1-B06 — Bu yüzeyin test ve regresyon sertifikasyonu
Seed modülünün testleri (#2107 ile başlayan) tamamlanır; B01–B05 davranışları regresyonla
kilitlenir; core write-path karakterizasyonu bütünlenir.
**Sonuç:** `ENGINEERING_COMPLETE` (sayfa → `SUSPENDED_FOR_ACTIVATION`).

### C1-PROD-ACTIVATION — WAVE 4 (aynı sayfa tarafından)
B05 migration'ının §5 koşullu yetkisiyle uygulanması, doğrulanması, kanıtlanması ve
kapatılması. Bu blok bitmeden C1 **TERMINAL CLOSED değildir**.
**Sonuç:** `PRODUCTION_ACTIVE`.

---

## 8. EXACT WRITE MANIFEST

**KURAL:** Aşağıdaki liste sayfa-seviyesi kapsamdır; **her blok başlamadan o bloğun
gerçek dosya adları listelenir** (`__tests__/*` wildcard exact manifest sayılmaz).

```text
project/apps/api/src/modules/client/client.service.ts
project/apps/api/src/modules/client/__tests__/<blok başına exact spec adları>
project/apps/api/src/modules/seed/seed.service.ts
project/apps/api/src/modules/seed/__tests__/<blok başına exact spec adları>
project/apps/api/prisma/schema.prisma                    (yalnız B05)
project/apps/api/prisma/migrations/<yeni>/migration.sql  (yalnız B05)
project/apps/api/ci-manifests/pure/client-portal.txt     (§4 kuralıyla)
```

## 9. SHARED CONTRACT MANIFEST

```text
OKUNUR (yazılmaz): client-mutation-policy.ts · office-approval.isApproverEligible
YAZILIR:           ClientService.create / bulk predicate (C1 kapsamı) · schema.prisma (B05)
PAYLAŞIMLI:        ci-manifests/pure/client-portal.txt  → §4 tek-writer + serialize
ÇAKIŞMA RİSKİ:     #2107 aynı dosyalara dokundu (MERGED) → her blok fresh main ile başlar
```

## 10. MERGE ORDER

```text
1. #2107 MERGED (789cf8f6, ANCESTOR_OK) — çözüldü
2. Grant expansion (seed/, app.module.ts, prisma/) alınmış
3. fresh main → C1-B01 → merge → fresh main → C1-B02 → ... → C1-B06
4. C1 ENGINEERING_COMPLETE → C2 başlar (C1 activation borcu açık kalır)
5. WAVE 4 → aynı sayfa C1-PROD-ACTIVATION → C1 TERMINAL CLOSED
Codex X1 paralel yürür; ortak yüzey yalnız client-portal.txt (§4 ile serialize)
```

## 11. ACCEPTANCE KRİTERLERİ (blok bazlı)

- [x] **B01** #2107 residualleri fresh main'de doğrulandı; kapanmayan kalem yok/tamamlandı
      *(2026-08-02, main `a92a5a44`: F-SEED-01..04 + FIND-C2 backfill 5/5 koddan kanıtlandı;
      seed-runtime-gate + seed-controller-guards + seed-client-authority +
      client-bulk-mutation-authorization-r3 = 47/47 PASS; ürün kodu diff'i SIFIR →
      RUNTIME_VERIFIED, reuse #2107 merge SHA `789cf8f6`)*
- [x] **B02** characterization önce KIRMIZI, fix sonrası YEŞİL; standart-only ve
      lifecycle-only update `displayName`'i **korur**
      *(2026-08-02: `client-partial-update-displayname-preservation.spec.ts` önce 5 FAIL /
      2 PASS (KIRMIZI kanıt), fix sonrası 7/7 PASS; update-yolu regresyonu 140/140 PASS;
      kısmi kimlik payload'unda eksik bileşenler mevcut kayıttan tamamlanır)*
- [x] **B03** atomiklik modeli **kanıtla seçildi** (kör tek-transaction YOK); sınırsız
      yazım kalmadı; failure davranışı test edildi
      *(2026-08-02: model = seedAll resumable/idempotent stages (kanıt: adım-idempotency +
      D07 satır-bazlı devam ratifikasyonu all-or-nothing'i dışlar + adımlar arası veri
      bağımlılığı) · seedCases satır-seviyesi dar tx (3 yazım/satır önceden transactionsızdı) ·
      seedPublicInstitutionDebtors bounded batch (tek existing okuması + 100'lük chunk).
      `seed-bulk-atomicity.spec.ts` 10 test + seed regresyonu = 56/56 PASS)*
- [x] **B04** `tckn` ve `vkn` bağımsız probe; dedup davranışı ve yarış profili çıkarıldı
      *(2026-08-02: `client-create-dedup-independent-probe.spec.ts` önce 4 FAIL / 3 PASS
      (KIRMIZI: iki alan birlikteyken vkn atlanıyor + çapraz kolon araması), fix sonrası
      7/7 PASS; create-yolu regresyonu 84/84 PASS. Yarış profili KANITLANDI: DB tekilliği
      olmadan eşzamanlı iki create ikisi de yazar — servis katmanı pencereyi kapatamaz;
      kapanış B05 design gate'in DB-seviyesi çıktısına aittir)*
- [x] **B05** design gate'in 7 maddesi kanıtlandı; çözüm **seçildi ve gerekçelendirildi**;
      migration yazıldı + CI'da doğrulandı (**apply WAVE 4**)
      *(2026-08-02: (1) duplicate profili — canlı değer UNKNOWN_AT_ENGINEERING_TIME, envanter
      SQL'i migration'a gömülü, WAVE-4 gate şartı; (2) null/empty — `''` değerdir → index
      `IS NOT NULL AND <> ''`; (3) PG16 NULLS DISTINCT + repo'da partial-unique emsali
      (office_auth_p02 :20); (4) FK — Client ~15 ilişkinin hedefi → migration satır
      SİLMEZ/birleştirmez, fail-closed; (5) API — P2002 → mevcut DUPLICATE_IDENTITY
      sözleşmesi, imza değişmedi (XL-3); (6-7) lost-update/CAS — `version` payload alanı
      C2-owned policy allowlist değişikliği ister → atomik birlikte deploy KANITLANAMADI,
      C4 aynı migration owner altında SERİ paketlenir. ÇÖZÜM: aktif satırda
      (tenantId,tckn)+(tenantId,vkn) partial unique — `20260802190000_client_identity_
      active_partial_unique`; conflict-mapping spec + regresyon 124/124 + XL-3 41/41 PASS)*
- [x] **B06** seed modülü testli; B01–B05 regresyonla kilitli
      *(2026-08-02: `seed-surface-idempotency-certification.spec.ts` 9/9 PASS — kalan seed
      yüzeylerinin idempotency/ön-koşul sözleşmeleri karakterize edildi; tam manifest
      sertifikasyonu `run-ci-manifest.sh pure/client-portal` = 705/705 PASS (B05 tepesinde)
      + bu PR'ın CI'ında yenilendi. ENGINEERING EXIT sağlandı → C1 PAGE:
      SUSPENDED_FOR_ACTIVATION. WAVE-4 ACTIVATION BORCU: yalnız identity migration
      APPLY. FIND-C4 CAS = AYRI engineering follow-up (C2 koordinasyonlu, SERİ) —
      activation/WAVE-4 borcu DEĞİL)*
- [ ] Her blok: CI required checks yeşil · mergeability CLEAN · squash-merge · main sync ·
      kendi branch/worktree cleanup · zorunlu blok çıktısı yayımlandı

## 12. EXIT CRITERIA

```text
ENGINEERING EXIT (B06 sonrası):
Client tablosuna giden her yazım yolu (controller, service, seed, import, case-inline)
fail-closed yetkili + audited + checksum'lı; atomiklik ve dedup davranışı kanıtlanmış;
migration hazır ve CI-doğrulanmış.
→ C1 PAGE: SUSPENDED_FOR_ACTIVATION (TERMINAL CLOSED DEĞİL) → C2 başlar.

TERMINAL EXIT (WAVE 4 sonrası):
C1-PROD-ACTIVATION uygulandı, doğrulandı, kanıtlandı.
→ C1 PAGE: TERMINAL CLOSED / PRODUCTION_ACTIVE.
```
