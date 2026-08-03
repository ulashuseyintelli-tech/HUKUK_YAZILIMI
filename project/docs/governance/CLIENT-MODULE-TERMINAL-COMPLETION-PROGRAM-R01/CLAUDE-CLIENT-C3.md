# CLAUDE-CLIENT-C3 — Legal & Data Lifecycle Controls

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CLAUDE-CLIENT-C3
LANE OWNER:               CLAUDE
PREDECESSOR:              İKİ AYRI KAPI — durumları FARKLI:
                          (1) CLAUDE-CLIENT-C2 ENGINEERING_COMPLETE  → ✅ KARŞILANDI
                              (C2 8/8, B01–B08; authority primitive'leri CANONICAL+FROZEN)
                          (2) OWNER LEGAL RATIFICATIONS (§13 / 5-10) → ❌ KARŞILANMADI
                              decision-log'da CLIENT KVKK/retention/POA ratifikasyon kaydı
                              YOK; POL-E-R1 "RECOMMENDED / NOT STARTED ·
                              IMPLEMENTATION AUTHORITY: NONE" (VERIFIED 2026-08-03)
                          → SAYFA AÇILABİLİR, IMPLEMENTATION BAŞLAYAMAZ (§0-A)
                          Blok-seviyesi pre-flight (§2-A) diğer lane'ler için ZORUNLU.
SUCCESSOR:                WAVE 4 (production gates) → WAVE 5 Terminal Integration

ALLOWED PATHS:
  project/apps/api/src/modules/client/                  (POA/capability/retention kodu)
  project/apps/api/src/modules/poa/                     (yalnız client-mandate kesişimi)
  project/apps/api/prisma/                              (YALNIZ gerekçeli, seri migration)
  project/apps/api/ci-manifests/pure/
  project/docs/governance/                              (yalnız bu programın kayıtları)

FORBIDDEN PATHS:
  project/apps/api/src/modules/seed/                    (C1 kapsamı)
  project/apps/api/src/modules/portal/                  (CODEX X1)
  project/apps/api/src/modules/client-notification/     (CODEX X1)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  project/apps/api/src/modules/client-intake-*/         (CODEX X3)
  project/apps/api/src/modules/uyap/                    (UYAP domain-law CLIENT'ın DEĞİL —
                                                         yalnız CLIENT tarafındaki gate yazılır)
  .github/ · ci.yml

SHARED CONTRACTS:
  client-mutation-policy.ts          → C2 tek-writer; C3 TÜKETİR (hukuki gate'leri
                                       mevcut policy üzerinden bağlar, semantiği değiştirmez)
  office-approval.isApproverEligible → READ-ONLY
  ClientPowerOfAttorney modeli       → C3 yazabilir (mandate↔capability binding)

MIGRATION WRITER:         KOŞULLU EVET.
                          Program kuralı: MIGRATION OWNER = CLAUDE LANE; aynı anda TEK
                          aktif migration görevi. C1 kapandıktan sonra C3 GEREKÇELİ
                          migration üretebilir (KVKK dayanak alanı, retention/legal-hold,
                          consent kaydı, POA-capability binding). Migration açıkken başka
                          Claude görevi migration yazmaz.

SHARED CONTRACT FREEZE:   C2'nin dondurduğu mutation/authority primitive'leri DEĞİŞTİRİLMEZ;
                          hukuki gate'ler bu primitive'lerin ÜZERİNE eklenir.

GRANT STATUS:             KISMEN GRANT İÇİ — modules/client/ kapsamdadır.
                          prisma/ migration gerekirse OWNER GRANT EXPANSION REQUIRED.

PRODUCTION GATE:          EVET — C3 kaynaklı migration'ların production APPLY'ı WAVE 4'tedir.

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
  Yeni bulgu mevcut göreve gizlice eklenmez. Master plana disposition için gönderilir.

BLOCK RULE:
  Normal CI, owner tarafından zaten verilmiş karar, başka lane'in bağımsız çalışması
  ve governance biçim eksikliği tek başına blocker değildir.

GO-COMPLETE:
  Acceptance + tests + CI + mergeability sağlanırsa aynı görev içinde squash-merge,
  main sync ve kendi branch/worktree cleanup işlemlerini tamamla.

PROGRAM LOCK:             CLIENT ONLY
```

---

## 0-A. OWNER AUTHORIZATION VE İKİ MODLU AÇILIŞ

```text
OWNER AUTHORIZATION:
GO-COMPLETE — CLAUDE-CLIENT-C3 TAM SAYFA
(owner bu sayfayı AYRI bir sayfada açtığında yürürlüğe girer)

AÇILIŞ MODU — RATİFİKASYON DURUMUNA GÖRE:

MOD A · ANALYSIS_ONLY  (BUGÜN GEÇERLİ OLAN)
  Koşul : §13/5-10 ratifikasyonlarının HİÇBİRİ alınmamış (VERIFIED 2026-08-03)
  İzin   : C3-B00 owner decision pack üretimi · repository ve resmî kaynak analizi ·
           mevcut davranışın characterization testleri
  YASAK  : hukuki kural/eşik/süre içeren ÜRÜN KODU · şema · migration
  Gerekçe: Implementation-layer policy invention YASAKTIR. Madde/kaynağı doğrulanmamış
           veya owner'ca ratifiye edilmemiş hiçbir hukuk kuralı koda gömülmez.

MOD B · IMPLEMENTATION
  Koşul : ilgili bloğun dayandığı §13 kalemi RATİFİYE edilmiş ve decision-log'da kayıtlı
  İzin   : o bloğun implementation'ı

AUTHORIZED WITHOUT FURTHER OWNER APPROVAL (her iki modda):
- Sıralı blok yürütme · izole worktree/branch · commit/push/PR · CI polling ·
  required checks PASS + MERGEABLE ise squash-merge · main sync ·
  KENDİ branch/worktree cleanup · fresh main ile sıradaki bloğa OTOMATİK geçiş ·
  MASTER-PLAN §17 register'da KENDİ satırının güncellenmesi

NO PER-BLOCK OWNER APPROVAL:
Listelenen C3 görevleri için tekrar owner GO İSTENMEZ.
İSTİSNA: MOD A → MOD B geçişi owner ratifikasyonuna bağlıdır (bu bir GO talebi değil,
ratifiye kaydının repository'de görülmesidir).

OWNER RETURN ONLY IF:
- Ratifiye edilmemiş hukuki kararın implementation'ı zorunluysa (→ MOD A'da kal, bloğu
  WAITING_FOR_OWNER_DECISION yap, SIRA ATLAMA)
- Allowed-path dışına çıkmak teknik olarak kaçınılmazsa
- Destructive production data operation koşullu yetkinin dışındaysa
- Acceptance kriterleri arasında GERÇEK çelişki varsa
```

---

## 1-A. BLOK YAPISI VE DEĞİŞTİRİLEMEZ SIRA

Bloklar ratifiye alt görevlerin (v1.0, madde 1–7) **birebir karşılığıdır**; madde 8
(koşullu migration) bağımsız blok değil, **blok-içi koşul + activation borcu** olarak
taşınır. Yeni iş eklenmemiş, sıra değiştirilmemiştir.

```text
C3 BLOCK COUNT:
1 ANALYSIS BLOCK (C3-B00) + 7 ENGINEERING BLOCKS
+ 1 KOŞULLU PRODUCTION ACTIVATION BLOCK

EXECUTION ORDER:
C3-B00 → C3-B01 → C3-B02 → C3-B03 → C3-B04 → C3-B05 → C3-B06 → C3-B07
→ C3-PROD-ACTIVATION (WAVE 4, YALNIZ migration üretilirse)

ORDER MUTATION:
FORBIDDEN
```

| Blok | İş | Dayandığı ratifikasyon |
|---|---|---|
| **C3-B00** | **Owner decision pack** (ANALYSIS_ONLY) — §13/5-10'un altısını da karar verilebilir hale getiren paket | — (bu blok kapıyı AÇAN blok) |
| C3-B01 | KVKK işleme dayanağı modeli (md.5) | §13/5 |
| C3-B02 | Aydınlatma + ilgili kişi başvuru akışı (md.10/11/13) | §13/6 |
| C3-B03 | Saklama/arşivleme/silme + legal hold (POL-E 8 koşulu) | §13/8 |
| C3-B04 | Özel nitelikli veri (md.6/3, md.6/4 Kurul önlemleri) | §13/7 |
| C3-B05 | Vekâletname ↔ capability zinciri | §13/9 |
| C3-B06 | UYAP aktarım gate'i (md.8), fail-closed | §13/10 |
| C3-B07 | Audit bütünlüğü tekleştirme | — (teknik) |

**C3-B00 ÖZEL KONUMU:** Bu sayfa, kendisini bloklayan kararları **hazırlayan** bloğu
içerir. B00 beklemek değil, **kapıyı açmaktır** — ve bugün **hemen başlayabilir**.

### Her blok sonunda ZORUNLU çıktı

```text
CURRENT PAGE:                 CLAUDE-CLIENT-C3
COMPLETED BLOCK:              <exact ID>
BLOCK MODE:                   ANALYSIS_ONLY / IMPLEMENTATION
BLOCK RESULT:                 ENGINEERING_COMPLETE / RUNTIME_VERIFIED /
                              ANALYSIS_DELIVERED / ACTIVATION_PENDING / FAILED_EXACT
MERGED PR / SHA:              <PR ve merge SHA>
C3 BLOCKS TOTAL:              1 ANALYSIS + 7 ENGINEERING
C3 BLOCKS COMPLETED:          <n>
C3 BLOCKS REMAINING:          <n>
REMAINING BLOCKS:             <exact sıralı liste>
RATIFICATION STATUS:          <§13/5-10 hangisi ratifiye, hangisi bekliyor>
PRE-FLIGHT:                   diğer lane aktif blok=<...> · çakışma=<YOK|VAR> · karar=<...>
ACTIVATION DEBT:              <liste veya NONE>
NEXT ELIGIBLE:                <yalnız sıradaki exact blok>
OWNER AUTHORIZATION REQUIRED: NO / yalnız ratifikasyon bekleyen blok
PROGRAM LOCK:                 CLIENT ONLY
```

---

## 2-A. BLOCK-LEVEL PRE-FLIGHT (her blok öncesi — ZORUNLU)

Master plan §12-A kuralı C3 için de geçerlidir. C2 kapandığı için C1↔C2 gerilimi bitti,
fakat **Codex lane'i (X1/X2/X3) paralel yürüyor**.

```text
1. Aktif diğer-lane bloklarının EXACT WRITE MANIFEST'i alınır (repository-truth:
   açık PR `gh pr view <n> --json files` + branch diff). Konuşma iddiası kanıt DEĞİL.
2. Bu C3 bloğunun exact write manifest'i yazılır (gerçek dosya adları;
   `__tests__/*` wildcard YETERSİZ).
3. SHARED-CONTRACT karşılaştırması — dosya adı YETMEZ.
4. Çakışma YOK → blok yürür. VAR → YALNIZ o blok WAITING_FOR_OTHER_SESSION;
   sıra ATLANMAZ, diğer lane'e DOKUNULMAZ.
5. Çıktıya PRE-FLIGHT satırı eklenir.
```

**C3 İÇİN ÖZEL ÇAPRAZ-LANE UYARILARI (master plan §12-A-2):**

- **XL-2 · C3 → X1:** `client.service.ts:21` `AuditActor` ve `client-audit.util` export'ları
  X1'in `portal.service.ts:10-11`'i tarafından tüketilir. C3 audit bütünlüğü işinde
  (B07) bu export'ları **DARALTAMAZ** — genişletme serbest.
- **C2 primitive freeze:** `client-mutation-policy.ts` ve C2'nin dondurduğu authority
  primitive'leri C3 tarafından **TÜKETİLİR, DEĞİŞTİRİLMEZ**. Hukuki gate'ler bu
  primitive'lerin **ÜZERİNE** eklenir.
- **`client.service.ts`:** C1 lane-owned'dı; C1 ENGINEERING_COMPLETE olduğu için artık
  aktif yazar yok. C3 dokunacaksa yine de pre-flight'ta C1'in WAVE 4 activation bloğunun
  açık olup olmadığı kontrol edilir.

---

## 3-A. ÜÇ DURUM AYRIMI

```text
CODE_PRESENT != ENGINEERING_COMPLETE != PRODUCTION_ACTIVE
MERGED != ENGINEERING_COMPLETE
```

B07 bittiğinde: migration ÜRETİLMEDİYSE sayfa `ENGINEERING_COMPLETE` olur.
Migration ÜRETİLDİYSE `SUSPENDED_FOR_ACTIVATION` olur (TERMINAL CLOSED DEĞİL) ve borç
WAVE 4'te **AYNI C3 sayfası** tarafından kapatılır.

**C3-PROD-ACTIVATION KOŞULLU YETKİSİ: NOT YET GRANTED — OWNER DECISION REQUIRED.**
Owner ratifikasyonu `C1-PROD-ACTIVATION` içindi. Bu sayfa kendine production yetkisi
ÜRETEMEZ (`noSelfAuthorizationChange`).

---

## 4-A. BLOCKER DISCIPLINE

```text
Claude bu sayfada:
- Governance/orchestra/control-plane onarımı BAŞLATMAZ · yeni SA/EG/grant/binding ÜRETMEZ ·
  gh-guard -Repair ÇALIŞTIRMAZ · branch protection/ruleset DEĞİŞTİRMEZ · admin/bypass
  KULLANMAZ · başka PR'ın CI/merge sorununu SAHİPLENMEZ · register biçim eksikliğini
  product blocker SAYMAZ · normal CI beklemesini BLOCKED SAYMAZ · exact path kanıtı
  olmadan competing writer İLAN ETMEZ.

STATUS SINIFLARI:
WAITING_FOR_CI · WAITING_FOR_PREDECESSOR · WAITING_FOR_OTHER_SESSION ·
WAITING_FOR_CONTROL_PLANE · WAITING_FOR_OWNER_DECISION · ACTIVATION_PENDING_WAVE_4 ·
BLOCKED_EXACT

BLOCKED_EXACT yalnız DÖRDÜ BİRDEN sağlanırsa:
(1) bloğun acceptance'ı teknik olarak ilerleyemiyor, (2) engel granted scope içinde
çözülemiyor, (3) engel repository/current-main kanıtıyla doğrulanmış, (4) devam etmek
veri kaybı veya yetki ihlali yaratacak.
DİKKAT: ratifikasyon beklemek BLOCKED_EXACT DEĞİLDİR → WAITING_FOR_OWNER_DECISION.
```

**CI MANIFEST RULE:** `ci-manifests/pure/client-portal.txt` — program boyu **tek manifest
writer = C1**. C3 kendi satırlarını append-only ekler; çakışırsa sonra gelen rebase eder
(blocker DEĞİL). `__tests__/*` wildcard exact manifest sayılmaz.

**NO SIDE QUEST:** Yeni bulgu mevcut göreve gizlice eklenmez ve **blok sayacını
değiştirmez**; master plana disposition için gönderilir.

**ÇÖZÜM DAYATMASI YASAK:** Hiçbir bloğun teknik çözümü peşinen belirlenmemiştir
(kayıt alanı mı ayrı tablo mu · retention'ın cron mu talep-anı mı işleyeceği ·
POA binding'in servis mi şema seviyesinde mi olacağı). Her biri **kanıta dayanarak**
ve **ratifiye owner kararına uygun** seçilir.

---

## AMAÇ

Hukuki yükümlülükleri **fail-closed teknik kontrole** dönüştürmek.

**TEMEL AYRIM (ihlal edilemez):** Hukuki değerlendirme ile repository'de uygulanmış teknik
kontrol **birbirine karıştırılmaz**. Maddesi ve resmî kaynağı doğrulanamayan hiçbir hukuk
iddiası koda gömülmez. **Implementation-layer policy invention YASAKTIR** — eşik, süre veya
yetki kuralı **owner (Av.) ratifikasyonu olmadan** koda yazılmaz.

## ÖN KOŞUL — OWNER LEGAL RATIFICATIONS

Bu sayfa **implementation'a**, aşağıdakiler ratifiye edilmeden **başlamaz**:
KVKK işleme dayanağı (md.5) · aydınlatma/rıza (md.10/11) · özel nitelikli veri (md.6/4) ·
saklama süreleri + legal hold (POL-E-R1) · vekâletname↔capability binding ·
UYAP aktarım yetkisi (md.8).

Ratifikasyon öncesi yalnız **ANALYSIS_ONLY** çalışma yapılabilir (karar paketi hazırlama).

## KANIT TABANI — DOĞRULANMIŞ BOŞLUKLAR (reconstruction R01)

| Konu | Resmî kaynak | Mevcut kontrol | Durum |
|---|---|---|---|
| İşleme dayanağı / rıza | KVKK md.5 | **NONE** — `grep aydınlatma\|rıza\|consent\|kvkk project/apps/**` → **0 eşleşme** | LEGAL_OWNER_RATIFICATION_REQUIRED |
| Aydınlatma + ilgili kişi hakları | KVKK md.10/11/13 | NONE; charter §24.11 OPEN | ABSENT |
| Özel nitelikli veri | KVKK md.6/3, md.6/4 (2024/7499) | `gender`/`nationality` düz kolon; `notes` 5000 serbest metin | ABSENT |
| Saklama / imha / legal hold | KVKK md.4/2-d, md.7 | POL-E baseline; sabit süre SEÇİLMEDİ; §24.15 "formal retention NOT ESTABLISHED" | PARTIAL |
| Vekâlet ↔ capability | Avukatlık K. md.36 + KVKK md.5 | `Client.canCollect` **vekaletname olmadan default `true`**; POA ile bağ kuran invariant YOK | ABSENT |
| UYAP aktarımı | KVKK md.8 | `UyapOperation.representedPartyId` var, geçerli POA'ya bağlı DEĞİL | ABSENT |
| Audit bütünlüğü | KVKK md.12/3 | in-tx + maskeli, ama coverage FRAGMENTED; uniform contract NOT SELECTED | PARTIAL |
| Meslek sırrı / object-scope | Avukatlık K. md.36 | POL-J object-scope enforcement PARTIAL | PARTIAL |

Kaynaklar (tam metin doğrulandı): KVKK 6698 — `mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf` ·
Avukatlık Kanunu 1136 md.36 — `mevzuat.gov.tr/MevzuatMetin/1.5.1136.pdf`.

## SIRALI ALT GÖREVLER

1. **KVKK işleme dayanağı modeli** (md.5) — hangi işleme faaliyeti hangi bende dayanıyor;
   kayıt alanı + fail-closed kullanım.
2. **Aydınlatma + ilgili kişi başvuru akışı** (md.10/11, md.13 30 gün).
3. **Saklama / arşivleme / silme + legal hold** (POL-E 8 koşulu; `BUSINESS LIFECYCLE ≠
   DATA LIFECYCLE`; soft-deactivation ≠ archive ≠ KVKK erasure).
4. **Özel nitelikli veri** sınıflandırması ve md.6/4 ek önlemleri.
5. **Vekâletname ↔ capability zinciri** — `canCollect/canSettle/canWaive/canRelease`
   yalnız geçerli ve kapsam-uyumlu `ClientPowerOfAttorney` varsa etkili olur.
   **KRİTİK: "müvekkil kaydı var" ≠ "vekaletname/işlem yetkisi var".**
6. **UYAP aktarım gate'i** (md.8) — aktarım öncesi temsil + dayanak doğrulaması,
   **fail-closed**. (UYAP domain-law'a dokunulmaz; yalnız CLIENT tarafındaki kapı.)
7. **Audit bütünlüğü** tekleştirme (uniform contract kararı).
8. Gerekiyorsa **tek, gerekçeli, seri migration** (§MIGRATION WRITER kuralıyla).

## EXACT WRITE MANIFEST (başlangıç)

```text
project/apps/api/src/modules/client/**            (legal gate'ler, retention, POA binding)
project/apps/api/src/modules/poa/**               (yalnız client-mandate kesişimi)
project/apps/api/prisma/schema.prisma             (KOŞULLU — ratifiye kararlar gerektirirse)
project/apps/api/prisma/migrations/<yeni>/        (KOŞULLU, seri)
project/apps/api/src/modules/client/__tests__/*
```

## SHARED CONTRACT MANIFEST

```text
OKUNUR (yazılmaz): client-mutation-policy.ts (C2 dondurdu) · office-approval eligibility
YAZILIR:           ClientPowerOfAttorney ↔ Client capability binding · retention alanları
ÇAKIŞMA RİSKİ:     C2 aynı client/ dizinine dokundu → C2 kapanmadan BAŞLAMAZ
                   Codex X3 client-intake-* içinde → ayrık (PARALLEL_SAFE, manifest ile teyit)
```

## MERGE ORDER

```text
1. C2 canonical kapalı + merge edilmiş
2. Owner legal ratifications alınmış
3. fresh main
4. C3 alt görevleri 1..8
5. C3 kapanışı → WAVE 4 production gate'leri
Codex X3 paralel yürür (C2-R5 primitive'i canonical olduktan sonra)
```

## ACCEPTANCE KRİTERLERİ

- [ ] Her hukuki kontrol **ratifiye bir owner kararına** dayanıyor (icat edilmiş eşik YOK)
- [ ] İşleme dayanağı kaydı mevcut ve fail-closed kullanılıyor
- [ ] Aydınlatma + ilgili kişi başvuru akışı uçtan uca çalışıyor
- [ ] Saklama/legal-hold: POL-E 8 koşulu çözülmeden fiziksel silme İMKANSIZ (test ile)
- [ ] `canCollect/canSettle/canWaive/canRelease` geçerli POA olmadan **etkisiz** (test ile)
- [ ] UYAP aktarım gate'i vekaletnamesiz **fail-closed** (test ile)
- [ ] Audit: hukuki işlemler izlenebilir, ham PII sızmıyor
- [ ] Migration (varsa) yazıldı + CI doğrulandı (**apply WAVE 4**)
- [ ] CI required checks yeşil · mergeability CLEAN

## EXIT CRITERIA

Hukuki kontroller **audited, fail-closed teknik gate** olarak çalışıyor; ratifiye edilmemiş
hiçbir hukuk kuralı koda gömülmemiş; NOT_PROVEN kalan hukuk iddiaları **açıkça NOT_PROVEN**
olarak kayıtlı. CLAUDE lane ENGINEERING tarafı kapanır → **WAVE 4**.
