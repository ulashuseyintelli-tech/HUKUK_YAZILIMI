# T5 — Ulaşılabilir Yol ve Kapı Zinciri

```text
Base      : origin/main @ 7fcd3b98
Durum     : SYSTEM_READY / LIVE_PILOT_BLOCKED_NO_AUTHORIZED_TASKS
            (contract §10'un kendi tanımladığı disposition)
AUTHORITY : NONE — bu belge hiçbir kapıyı açmaz
```

Contract §10 bu durumu önceden tanımlamıştır ve şunu ekler: *"Bu bir program
başarısızlığı **değildir** ve yetkisiz iş üretmek için gerekçe
**oluşturmaz**."* Sistem tarafı hazır; eksik olan yetki.

## 1. Bitmiş olan

```text
T1  contract + 6 JSON schema + programs.manifest          PR #1600  1650b57e
T2  safety kernel (lease/boundary/worktree)               PR #1601  344259a8
T3  executor adapters (resolve/spawn)                     PR #1602  665c040c
                                                          + #1607, #1611
T4  orchestration + synthetic dual-executor pilot         PR #1604  36a52b28
                                                          + #1609
CI  orchestration suite'lerinin CI'da koşması             PR #1605  (açık)
    → 108 test hiç koşmuyordu; iki POSIX kusuru bulundu ve düzeltildi
```

## 2. T5'in kendi ön koşulları (§10 `LIVE_TWO_PROGRAM`)

```text
iki farklı program
iki immutable grant
conflict-free positive boundary
forbidden shared path yok
required CI mevcut                       ← asıl darboğaz, bkz. §4
task-specific owner-authorized merge
```

## 3. Üç bloke sınıfı

### G0 — V2 ratifiye değil

```text
contract satır 6   : PROPOSED / OWNER REVIEW REQUIRED — ratifiye DEĞİLDİR
contract satır 22  : V2 ratifiye edilene kadar V1 tek yürürlükteki contract'tır
programs.manifest  : altı programın altısı da liveExecutionEligibility: DENIED
                     (enum yalnız ELIGIBLE | DENIED)
```

T5 V2 altında koşar. Ratifikasyon + iki programın `ELIGIBLE`'a çevrilmesi owner
işlemidir.

### G1 — hiçbir programda yetkili bounded task yok

```text
OFFICE      decision-log.md:30 yalnız SLICE 1'i yetkilendiriyor;
            OFFICE-RISK-REGISTER.md:190 SLICE 3'ü yetkilendirdiğini söylüyor
            → çözülmemiş authority çelişkisi (OPTION A / OPTION B)
COLLECTION  PR #1415 tescili yapılmamış (hard precondition, §15.4)
            → sonra ŞEKİL 1 / ŞEKİL 2, sonra yeni alt-dilim ID'si (§15.5)
```

### G2 — `MECHANICAL_GOVERNANCE` profili kullanılamaz

Bkz. contract §1.2. Profil ilan edilmiş, hedef yüzeyi yok. Bunun T5 için
sonucu: **program authority'si beklemeyen ikinci bir görev bu profilden
alınamaz.** Yani G1 atlanamaz.

## 4. Asıl darboğaz — CI kapsamı control-plane'de

Bu, plan yapılırken gözden kaçarsa T5'i sessizce imkânsız kılan kısıt.

`.github/workflows/ci.yml` içindeki her jest adımı elle küratörlü bir
allowlist'tir: her çağrı `--runTestsByPath <açık liste>` veya
`--testPathPattern <regex>` ile sınırlı. **Catch-all yok.** Listede olmayan bir
spec CI'da hiç koşmaz.

Ve `ci.yml`, `coordinationControlPlane`'in **ilk girişidir** → V2 §1 immutable
global forbidden → **hiçbir task boundary'si onu içeremez.** Bu bu oturumda PR
#1605'te `CONTROL_PLANE_SCOPE_FORBIDDEN` ile fiilen doğrulandı.

Sonuç: T5'in *"required CI mevcut"* koşulu, yalnız **verification'ı zaten
allowlist'te olan** görevlerle sağlanabilir. Aksi hâlde "yeni spec + onu CI'a
bağlayan adım" tek bir bounded task olarak paketlenemez.

Ölçülen durum:

| Aday görev yuvası | Spec | CI allowlist |
|---|---|---|
| COLLECTION ŞEKİL 1 | `calc-prep/__tests__/payment-mapper.spec.ts` | **VAR** — ci.yml:549 |
| COLLECTION ŞEKİL 2 | `common/__tests__/collection-confirmed.util.spec.ts` | YOK — 8 testi hiç koşmuyor |
| OFFICE SLICE 3 doğal yuva | `staff/__tests__/staff-deactivate-lifecycle.spec.ts` | YOK — hiçbir staff spec'i yok |
| OFFICE audit-attribution yuvası | `audit/__tests__/audit.service.attribution.spec.ts` | **VAR** — ci.yml:1844 |

Son satır önemli: o spec `logInTransaction`'a zaten iki yerde atıf yapıyor,
yani CAP-09 audit-attribution iddiası için CI-kapsamlı bir yuva mevcut. Ancak
`StaffService.remove()` paritesinin doğru yuvası orası mı, bu bir **owner
şekillendirme kararıdır** — planner belirlemez.

## 5. Ulaşılabilir yol (en kısa, contract değişikliği gerektirmeyen)

```text
1  V2'yi ratifiye et (T1 kapanışı)
      + programs.manifest'te OFFICE ve COLLECTION → ELIGIBLE

2  COLLECTION'ı aç
      a. PR #1415 / 80a11c2a tescili          (hard precondition)
      b. ŞEKİL 1 seç                          (payment-mapper — CI'da VAR)
      c. alt-dilim ID'si ver                  (owner decomposition, §15.5)

3  OFFICE'i aç
      a. decision-log:30 ↔ risk-register:190 çelişkisini gider
      b. OPTION B: SLICE 3'ü öne al ve yetkilendir
         (SLICE 2 ilan edilmiş ama TEKNİK predecessor değil — doğrulandı)
      c. required test yuvasını onayla — CI-kapsamlı olan seçilmeli

4  Claude iki plan.draft.json üretir → owner iki plan hash'ini ratifiye eder

5  Owner iki immutable execution grant verir (SHA-bound, expiring)

6  T5 LIVE_TWO_PROGRAM koşar — executor CODEX, planner Claude yürütmez
```

Adım 1-3 owner işlemidir ve **hiçbiri Claude tarafından üretilemez**. Adım 4
Claude'un işidir ama 2 ve 3 tamamlanmadan başlayamaz: yetkilendirilmemiş bir
dilim için plan yazmak ya var olmayan bir yetkiyi kodlar ya owner'ın ilan
ettiği sırayı sessizce değiştirir.

## 6. Alternatif yollar — hepsi contract değişikliği ister

```text
A. G2'yi kapat: V1 level2Operations + queueExceptions mekanizmasını V2'ye taşı
   → ikinci program governance görevi olabilir, program authority'si beklenmez
   → PROPOSED penceresi açıkken ucuz; ratifikasyondan sonra amendment olur

B. ci.yml'e ayrı bir owner control-plane işlemiyle jest adımı ekle
   → ŞEKİL 2 ve OFFICE'in doğal yuvası kullanılabilir hâle gelir
   → task boundary'sine giremez, ayrı iş olmak zorunda

C. §10 pilot contract'ını tek programa indir
   → LIVE_TWO_PROGRAM tanımı değişir; T5'in kanıt değeri düşer
```

Öneri: **§5'teki yol**, çünkü contract değişikliği gerektirmez ve her iki
görev de semantik karar içermez. (A) ratifikasyondan önce ayrıca yapılmalı —
yapılmazsa ölü bir profil sabitlenir.

---

**AUTHORITY: NONE.** Bu belge hiçbir programı `ELIGIBLE` yapmaz, hiçbir slice
yetkilendirmez, hiçbir plan ratifiye etmez ve hiçbir grant üretmez.
