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
```

T5 V2 altında koşar, dolayısıyla ratifikasyon bir ön koşuldur.

**ELIGIBLE bir owner işlemi DEĞİLDİR — bu belgenin önceki sürümü yanlıştı.**
`programs.manifest.json` kendi üst düzey alanında `authority: "DERIVED /
NON-AUTHORITATIVE"` der; `program.schema.json` aynı ifadeyi taşır; §9'un ilan
ettiği alan listesinde `liveExecutionEligibility` **hiç yer almaz** ve §9 satır
415 onu yalnız authorization belirsizliğinin *fail-closed sonucu* olarak anar.
`ELIGIBLE` ise §3'te bir lifecycle state'tir ve satır 161'e göre writer'ı
**orchestrator**'dır.

Doğru nedensellik (§3 satır 181):

```text
owner workstream seçimi
→ immutable task plan
→ adversarial review
→ owner plan ratifikasyonu
→ execution grant
→ orchestrator eligibility'yi HESAPLAR (predecessor CLOSED + boundary conflict yok)
→ manifest/state ELIGIBLE olur
```

Yani eligibility **sonuçtur, yetki kaynağı değildir**. Altı programın hepsinin
`DENIED` görünmesi kapatılacak bir anahtar değil, henüz yetkili task
bulunmamasının kaydıdır.

### G1 — hiçbir programda yetkili bounded task yok

```text
OFFICE      decision-log.md:30 yalnız SLICE 1'i yetkilendiriyor;
            OFFICE-RISK-REGISTER.md:190 SLICE 3'ü yetkilendirdiğini söylüyor
            → çözülmemiş authority çelişkisi (OPTION A / OPTION B)
COLLECTION  PR #1415 tescili yapılmamış (hard precondition, §15.4)
            → sonra ŞEKİL 1 / ŞEKİL 2, sonra yeni alt-dilim ID'si (§15.5)
```

## 3b. `MECHANICAL_GOVERNANCE` açığı — T5 blocker'ı DEĞİL

Bu belgenin önceki sürümü bunu `G2` diye üçüncü bir bloke sınıfı sayıyordu.
**Yanlış sınıflandırma.** Açık gerçektir (contract §1.2: profil ilan edilmiş,
ulaşılabilir hedef yüzeyi yok) ama T5'i bloke etmez, çünkü T5'in amacı iki
canlı **`BOUNDED_CODE_TASK`** koşturmaktır. Pilot yuvası governance işiyle
doldurulmaz — doldurulsa pilotun kanıt değeri düşerdi.

Governance kaydı yazılması gerekiyorsa yürürlükteki **V1 mekanizması** zaten
ratifiyedir ve kullanılabilir (`level2Operations`, `queueExceptions`); V2'nin
mechanical profili buna gerek bırakmaz.

```text
MECHANICAL_GOVERNANCE açığı : AYRI pre-ratification contract düzeltmesi
T5 ile ilişkisi             : YOK — T5 iki BOUNDED_CODE_TASK ister
Aciliyet                    : contract PROPOSED iken ucuz; ratifikasyondan
                              sonra amendment olur
```

Yani bloke eden yalnız **G0** ve **G1**'dir.

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
0  PR #1615 CI PASS → owner GO-COMPLETE → merge / canonical closure

1  V2 contract statüsünü kesinleştir
      PROPOSED ise mechanical-profile açığı (§1.2) kapatılmadan RATİFİYE ETME
      NOT: manifest elle ELIGIBLE yapılmaz — eligibility 5. adımın SONUCUDUR

2  COLLECTION'ı aç
      a. PR #1415 / 80a11c2a tescili          (hard precondition)
      b. ŞEKİL 1 seç                          (payment-mapper — CI'da VAR)
      c. alt-dilim ID'si ver                  (owner decomposition, §15.5)

3  OFFICE'i aç
      a. decision-log:30 ↔ risk-register:190 çelişkisini gider
      b. OPTION B: SLICE 3'ü öne al ve yetkilendir
         (SLICE 2 ilan edilmiş ama TEKNİK predecessor değil — doğrulandı)
      c. required test yuvasını onayla — CI-kapsamlı olan seçilmeli

4  Claude iki ayrı plan.draft.json üretir
      → ayrı ajanlar adversarial review yapar (planner ≠ reviewer, §15.2)

5  Owner iki plan hash'ini ratifiye eder + iki immutable execution grant verir
      (SHA-bound, expiring)

6  Codex T5 LIVE_TWO_PROGRAM pilotunu yürütür
      → orchestrator eligibility'yi burada HESAPLAR; manifest/state ELIGIBLE olur
```

Adım 1-3 ve 5 owner işlemidir; **hiçbiri Claude tarafından üretilemez**. Adım 4
Claude'un işidir ama 2 ve 3 tamamlanmadan başlayamaz: yetkilendirilmemiş bir
dilim için plan yazmak ya var olmayan bir yetkiyi kodlar ya owner'ın ilan
ettiği sırayı sessizce değiştirir. Adım 6'daki eligibility hesabı bir kapı
değil, zincirin çıktısıdır.

## 6. §5'i genişletmeyen, ama T5'i kolaylaştıran iki ayrı iş

Bunlar **T5 yolu değildir** ve T5'i bloke etmezler; bağımsız işlerdir.

```text
A. ci.yml'e ayrı bir owner control-plane işlemiyle jest adımı ekle
   → ŞEKİL 2 ve OFFICE'in doğal test yuvası kullanılabilir hâle gelir
   → hiçbir task boundary'sine giremez, ayrı iş olmak ZORUNDA
   → §5 bu işi gerektirmez: seçilen iki yuva zaten allowlist'te

B. MECHANICAL_GOVERNANCE açığını kapat (contract §1.2)
   → V1 level2Operations + queueExceptions mekanizmasının V2'ye taşınması
   → T5 ile İLGİSİ YOK; ratifikasyon ön koşulu olarak yapılmalı
```

Öneri: **§5'teki yol**. Contract değişikliği gerektirmez, her iki görev de
semantik karar içermez ve her ikisinin required test'i zaten CI allowlist'inde.

`LIVE_TWO_PROGRAM`'ın tek programa indirilmesi bir seçenek olarak **sunulmuyor**:
pilotun kanıt değeri iki bağımsız program üzerinde eşzamanlı koşmasından gelir.

---

**AUTHORITY: NONE.** Bu belge hiçbir slice yetkilendirmez, hiçbir plan ratifiye
etmez, hiçbir grant üretmez ve hiçbir eligibility state'i yazmaz — eligibility
orchestrator tarafından hesaplanır.
