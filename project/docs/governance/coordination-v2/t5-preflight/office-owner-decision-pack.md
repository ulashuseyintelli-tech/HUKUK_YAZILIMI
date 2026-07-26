# OFFICE — CAP-09A SLICE Sequencing: OWNER DECISION PACK

```text
Task            : GOV-COORD-V2-T5-PREFLIGHT-RECONCILIATION-R01, kapsam 5
Base            : origin/main @ 7fcd3b98
Karar           : OPTION A veya OPTION B — owner'a ait
Planner         : CLAUDE · Gelecek executor : CODEX
Bu belge        : SLICE 2'yi yetkilendirmez · SLICE 3'ü öne almaz
                  task plan üretmez · implementation başlatmaz
```

## 1. Owner kaydının exact hükmü

`decision-log.md:30` (2026-07-22), `OFFICE PHASE 2 / W-P2-α — CAP-09
AUDIT-ATTRIBUTION-STANDARD OWNER GO-DECIDE`:

```text
"... SLICE 1 bu kayıtla yetkilendirilir"

SLICE 1  CAP-09A-GOV            bu kanonikleştirme, runtime/schema/migration YOK
SLICE 2  CAP-09A-FOUNDATION     additive AuditLog/AuditService genişlemesi —
                                ayrı GO-ANALYZE + migration-etki netleştirmesi
                                + GO-IMPLEMENT gerekir
SLICE 3  CAP-09A-CONSUMER-01    yalnız StaffService.remove()'u
                                LawyerService.delete() ile eşdeğer transactional
                                audit güvencesine getirmek — CaseStaff ve diğer
                                tüketiciler OTOMATİK kapsamda DEĞİL
```

Yani kayıt yalnız SLICE 1'i yetkilendirir; SLICE 2 ve SLICE 3 adlandırılmıştır
ama yetkilendirilmemiştir.

## 2. ÇÖZÜLMEMİŞ AUTHORITY ÇELİŞKİSİ — kararı bu belirliyor

İki kanonik kayıt aynı konuda farklı şey diyor:

```text
decision-log.md:30
  "SLICE 1 bu kayıtla yetkilendirilir"
  → SLICE 3 yetkilendirilmemiş

OFFICE-RISK-REGISTER.md:190
  "FINDING VERDICT: OPEN / NOT CLOSED — owner CAP-09A-CONSUMER-01 dilimini
   (yalnız StaffService.remove()'u LawyerService.delete() ile eşdeğer
   transactional audit güvencesine getirmek) SLICE 3 olarak yetkilendirmiştir,
   ancak implementasyon HENÜZ yapılmamıştır."
  → SLICE 3 yetkilendirilmiş, yalnız icra edilmemiş
```

`OFFICE-OWNER-DECISIONS.md:9`'a göre kapanış otoritesi `decision-log.md`'dir,
dolayısıyla salt hiyerarşiyle risk register'ın fazla söylediği sonucuna
varılabilir. Ancak bunu **planner olarak karara bağlamıyorum**: register cümlesi
"SLICE 3 olarak yetkilendirmiştir" diyor ve hemen ardından "implementasyon HENÜZ
yapılmamıştır" ekliyor — bu, yetkinin var olduğu ama kullanılmadığı okumasını
destekler. İki kayıt arasındaki farkı gidermek bir owner işlemidir.

Bu çelişki OPTION A ile OPTION B arasındaki seçimin **asıl konusudur**: eğer
register doğruysa OPTION B zaten kısmen verilmiş bir karardır; eğer
decision-log doğruysa OPTION A varsayılan sıradır.

## 3. SLICE 3'ün kod-gerçeği (7fcd3b98, yeniden doğrulandı)

```text
LawyerService.delete()   lawyer.service.ts:528
  audit yazıcı           :620 ve :638  this.audit.logInTransaction(tx, {...})
  yani delete yolunda    AYNI transaction içinde İKİ audit kaydı

StaffService.remove()    staff.service.ts:196
  audit                  SIFIR — ne auditLog, ne AuditService, ne "audit"
                         kelimesi; AuditService inject bile edilmemiş
```

Düzeltme: önceki turda bunu "`lawyer.service.ts`'te iki `auditLog`" diye
yazmıştım. Mekanizma doğrudan bir `prisma.auditLog` çağrısı değil,
`AuditService.logInTransaction`'dır. Parite boşluğu aynen gerçektir; mekanizma
adı yanlıştı.

**Bu, SLICE 2'nin teknik zorunluluğu hakkında belirleyici bir bulgudur:**
`logInTransaction` **mevcut AuditLog şemasıyla** çalışıyor. Dolayısıyla
`StaffService.remove()`'u paritesine getirmek için `AuditLog`/`AuditService`
genişlemesine (SLICE 2) **teknik olarak ihtiyaç yoktur** — kopyalanacak desen
zaten bugünkü şemayla çalışıyor.

SLICE 2 bir **ilan edilmiş** predecessor'dır, **teknik** bir predecessor değil.

## 4. OPTION A

```text
SLICE 2 (CAP-09A-FOUNDATION) önce yetkilendirilir ve kapanır;
ardından SLICE 3 planlanır.
```

| | |
|---|---|
| Uyum | `decision-log.md:30`'un ilan ettiği sıraya birebir uyar; §15.5 decomposition kararı gerekmez |
| Contract | §3 `ELIGIBLE` doğal yolla sağlanır (her ilan edilmiş predecessor `CLOSED`) |
| Maliyet | SLICE 2'nin kendi metni "ayrı GO-ANALYZE + **migration-etki netleştirmesi** + GO-IMPLEMENT" der. Yani schema/migration ihtimali taşır |
| T5 açısından | `PRODUCTION_SCHEMA_MIGRATION_RUNTIME` V1 §3'te `DENIED` ve V2 §1'de immutable forbidden'dır. SLICE 2 migration gerektirirse **T5 pilotunun bounded code task'ı olamaz**; ayrı owner-gated migration hattı gerekir |
| Sonuç | Doğru sıra, ama T5 için muhtemelen kullanılamaz bir birim |

## 5. OPTION B

```text
Owner açık decomposition kararıyla SLICE 3'ü öne alır ve ayrıca yetkilendirir.
```

| | |
|---|---|
| Uyum | İlan edilmiş sırayı değiştirir → **açık** bir owner decomposition kararı gerekir (§15.5). Planner bunu öneremez |
| Teknik dayanak | §3'te gösterildi: SLICE 3 mevcut şemayla yapılabilir; SLICE 2'ye teknik bağımlılığı yok |
| Contract | SLICE 3'ün `predecessorTaskIds[]`'i owner kararıyla yeniden tanımlanır; aksi hâlde §3 `ELIGIBLE` ulaşılamaz kalır |
| T5 açısından | **En uygun aday.** Tek dosya (`staff.service.ts`), schema yok, migration yok, semantik karar yok, owner-authored `outOfScope` zaten var |
| Risk | Register/decision-log çelişkisi (§2) önce giderilmezse, hangi kaydın esas alındığı belirsiz kalır |

## 6. İki seçenekte de değişmeyenler

```text
CAP-09 lane/decomposition kararı bu belgeyle DEĞİŞMEDİ.
SLICE 1 (CAP-09A-GOV) tek yetkili slice olarak kalır.
CaseStaff add/remove ve diğer tüketiciler owner metnine göre OTOMATİK kapsamda
  DEĞİLDİR — hangi seçenek seçilirse seçilsin outOfScope'ta kalır.
CAP-09B / CAP-09C bu belgenin konusu değildir.
STF-PRD-AUDIT-001 bulgusu OPEN / NOT MITIGATED kalır.
```

## 7. Owner'ın karar vermesi gerekenler

```text
1. decision-log.md:30 ile OFFICE-RISK-REGISTER.md:190 arasındaki authority
   çelişkisi hangi yönde giderilecek? (§2 — diğer her şeyi bu belirliyor)
2. OPTION A mı OPTION B mi?
3. OPTION B seçilirse: SLICE 3'ün predecessor listesi açıkça yeniden
   tanımlanmalı, aksi hâlde §3 ELIGIBLE ulaşılamaz kalır.
4. OPTION A seçilirse: SLICE 2 migration gerektiriyor mu? Gerektiriyorsa T5
   pilot adayı olamaz ve ayrı bir migration hattı gerekir.
```

---

**AUTHORITY: NONE.** Bu belge hiçbir slice'ı yetkilendirmez, hiçbir sırayı
değiştirmez, hiçbir predecessor ilişkisini yeniden tanımlamaz ve hiçbir
execution grant üretmez.
