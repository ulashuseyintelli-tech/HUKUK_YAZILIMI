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
  project/apps/api/src/modules/portal/                  (CODEX X1)
  project/apps/api/src/modules/client-notification/     (CODEX X1)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  project/apps/api/src/modules/client-intake-*/         (CODEX X3)
  .github/  ·  ci.yml                                   (control-plane)
  project/docs/governance/coordination-v2/activation/   (grant self-authorization)
  project/docs/governance/coordination-v2/schemas/ · project/scripts/orchestration-v2/

SHARED CONTRACTS:
  client-mutation-policy.ts        → C2 tek-writer; C1 TÜKETİR, semantiğini DEĞİŞTİRMEZ
  office-approval.isApproverEligible → READ-ONLY (3 farklı eligibility var; birleştirme YASAK)
  ClientService.create / bulk predicate → C1 yazabilir (kendi kapsamında), C2 devralır
  ci-manifests/pure/client-portal.txt → PAYLAŞIMLI (X1 ile) — §CI MANIFEST RULE

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
- [ ] **B02** characterization önce KIRMIZI, fix sonrası YEŞİL; standart-only ve
      lifecycle-only update `displayName`'i **korur**
- [ ] **B03** atomiklik modeli **kanıtla seçildi** (kör tek-transaction YOK); sınırsız
      yazım kalmadı; failure davranışı test edildi
- [ ] **B04** `tckn` ve `vkn` bağımsız probe; dedup davranışı ve yarış profili çıkarıldı
- [ ] **B05** design gate'in 7 maddesi kanıtlandı; çözüm **seçildi ve gerekçelendirildi**;
      migration yazıldı + CI'da doğrulandı (**apply WAVE 4**)
- [ ] **B06** seed modülü testli; B01–B05 regresyonla kilitli
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
