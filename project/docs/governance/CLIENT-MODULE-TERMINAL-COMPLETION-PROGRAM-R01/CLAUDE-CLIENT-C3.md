# CLAUDE-CLIENT-C3 — Legal & Data Lifecycle Controls

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CLAUDE-CLIENT-C3
LANE OWNER:               CLAUDE
PREDECESSOR:              CLAUDE-CLIENT-C2 (canonical kapalı olmalı)
                          + OWNER LEGAL RATIFICATIONS (master plan §13 / 5-10)
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
