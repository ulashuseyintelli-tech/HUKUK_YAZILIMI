# D6 KVKK Saklama ve İmha Politikası — Policy Scaffold (D6-RETENTION-POLICY-DOC)

## Borçlu Çapraz-Dosya Bildirimi (DebtorCrossCaseNotification) — Resmi Politika İskeleti

**Tarih:** 2026-07-05 · **Statü:** RATIFIED (owner, 2026-07-05 — bkz. Bölüm 0) · **Yetki:** Bu belge, D6-RETENTION-DELETE (gerçek `deleteMany`/cron/wiring) implementasyonundan önce gereken resmi KVKK saklama/imha politika iskeletinin kanonik kaydıdır. `docs/design/d6-legal-semantics-triage.md` (Q2 çerçevesi, FAZ 2) ve `docs/design/d6-final-architecture.md` (FAZ 0) ile birlikte okunmalıdır.

**Bu belge bir POLİTİKA DEĞİL, bir POLİTİKA İSKELETİDİR.** Resmi büro KVKK Saklama ve İmha Politikası ayrı, hukuk danışmanı onaylı bir belge olarak var olmadan bu belgedeki sayısal alanlar (retention gün sayıları, hukuki nitelendirme) NİHAİ sayılmaz.

---

## 0. OWNER KARARI (2026-07-05)

Bu bölüm, owner'ın chat üzerinden verdiği GO-DOCS talimatının birebir kaydıdır.

```text
GO-DOCS: project/docs/design/d6-kvkk-retention-policy.md

Scope:
- Veri envanteri
- Hukuki dayanak taslağı
- Yetki matrisi
- SystemConfig sözleşmesi
- Açık karar noktaları

No code. No migration. No deleteMany. No cron. No admin endpoint. No SystemConfig write.
```

**A) Hukuki dayanak — karar:**
```text
Draft legal basis:
Primary: KVKK m.5/2-e
Secondary/supporting: KVKK m.5/2-f
Final legal qualification: Hukuk danışmanı teyidi zorunlu.
Açık rıza dayanak yapılmasın — büro içi dosya yönetimi/audit uyarısı için yanlış zemin olur.
```

**B) Kesin gün sayıları — karar:**
```text
Bu turda gün sayısı belirlenmeyecek.
resolvedRetentionDays = [TBD]
caseClosureBufferDays = [TBD]
hardCeilingDays = [TBD]
Sebep: Resmi büro KVKK Saklama/İmha Politikası yokken sayı yazmak governance hatası olur.
```

**C) Yetki matrisi — karar:**
```text
ACCEPTED: Policy değerlerini yalnızca LawyerRank.PARTNER veya UserRole.ADMIN değiştirebilir.
Aşağıdakiler değiştiremez: MANAGER, AUTHORIZED, LAWYER, INTERN, normal operasyon kullanıcısı.
Current technical state: SystemConfig write endpoint/UI yok — bu boşluk saklanmaz,
D6-RETENTION-DELETE öncesi ayrıca kapatılacak.
```

**D) `policyReference` alanı — karar:**
```text
YES — eklensin, ama bu docs-only turda kod değişikliği yapılmasın.
Kural: enabled=true olacaksa policyReference zorunlu olmalı.
Format: KVKK-D6-RETENTION-vYYYY-MM-DD (örnek: KVKK-D6-RETENTION-v2026-07-05)
Ayrı küçük iş: D6-RETENTION-POLICY-REF (interface + provider validation + test, no deleteMany, no cron)
```

**E) SystemConfig yazma yolu — karar:**
```text
İlk fazda admin endpoint/UI açılmayacak. İlk faz: audited ops-script/seed.
Sebep: Retention policy nadir değişen, hukuki onay gerektiren bir konfigürasyon;
hemen UI'dan değiştirilebilir yapmak gereksiz risk ve gereksiz scope büyütür.
Admin endpoint daha sonra ayrı açılabilir: D6-RETENTION-CONFIG-ADMIN (BACKLOG).
```

**Net sonuç:**
```text
Onay: YES
Path: docs-only
D6-RETENTION-DELETE: hâlâ BLOCKED
Gün sayıları: TBD
Hukuki dayanak: draft only, counsel confirmation required
Yetki: PARTNER + ADMIN
policyReference: YES, separate mini scope
SystemConfig write path: first phase ops-script/seed, no endpoint/UI now
```

**Zorunlu ilkeler (bu belgenin ve her türevinin uyması gereken):**
```text
No hardcoded retention days.
No deletion without enabled=true.
No deletion without official policy.
No deletion without final SystemConfig values.
No anonymization-first design.
Hard-delete is the intended disposal method, subject to final policy approval.
```

---

## 1. Scope

Bu belge yalnız **D6A-2 (`DebtorCrossCaseNotification`)** kayıtlarının saklama/imha rejimini kapsar. AuditLog, Case, Task ve diğer komşu tablolar bu belgenin kapsamı DIŞINDADIR — her biri kendi ayrı retention politikasına tabidir (bkz Bölüm 3).

Kapsam beş başlıkla sınırlıdır: veri envanteri, hukuki dayanak taslağı, yetki matrisi, `SystemConfig` sözleşmesi, açık karar noktaları. Bu belge KOD YAZMAZ, migration İÇERMEZ, `deleteMany` ÜRETMEZ, cron TANIMLAMAZ, admin endpoint AÇMAZ, `SystemConfig` kaydına YAZMAZ.

---

## 2. Current Implementation Evidence

Repo'da bugün var olan, bu belgeden ÖNCE implement edilmiş ve MERGED durumdaki altyapı:

- **`D6RetentionDecisionProvider`** — `apps/api/src/modules/debtor/d6-retention-decision.provider.ts`. PR #935, commit `c3e7d1e7` (MERGED, `git log origin/main` ile doğrulandı). Kapsamı: yalnız *policy okuma* + *saf eligibility kararı*. `deleteMany`/`delete`, cron, scheduler wiring, migration, schema değişikliği, AuditLog değişikliği, UI — HİÇBİRİ bu sınıfta YOK (dosyanın kendi docblock'unda da açıkça yazılı).
- **`D6RetentionPolicy` arayüzü** (mevcut, bugünkü hâli):
  ```ts
  interface D6RetentionPolicy {
    enabled: boolean;
    resolvedRetentionDays: number | null;
    caseClosureBufferDays: number | null;
    hardCeilingDays: number | null;
  }
  ```
  `policyReference` alanı BUGÜN YOK (bkz Bölüm 6, D-kararı).
- **`getPolicy(tenantId)`** — `prisma.systemConfig.findFirst({ where: { tenantId, key: "d6_retention_policy" } })` okur; kayıt yoksa veya `value.enabled !== true` ise `null` döner (**fail-closed** — resmi politika girilmeden hiçbir kayıt "silinebilir" sayılmaz, kod okunarak doğrulandı).
- **`isEligibleForDeletion()`** — saf fonksiyon, DB erişimi yok, silme yapmıyor. Kural: `hardCeilingDays` her şeyden bağımsız üst sınır; `caseClosureBufferDays` yapılandırılmış ama ilgili dosya kapanmamışsa bu boyut BLOKE eder; birden fazla boyut yapılandırılmışsa "hangisi UZUNSA" ilkesi (en geç tarih) uygulanır.
- **Henüz YOK (bu belge de eklemez):** gerçek `deleteMany`/silme çağrısı, cron/scheduler kaydı, `DebtorModule`'e provider wiring'i, `SystemConfig` kaydını yazan herhangi bir endpoint/UI/seed script.
- **Önceki çerçeve kararı (FAZ 2, `d6-legal-semantics-triage.md` Q2):** "önce anonymize" ilkesi RATIFIED edilmişti; ancak D6-RETENTION-POLICY-INFRA GO-ANALYZE'inde şema doğrudan okunduğunda `DebtorCrossCaseNotification.debtorId/affectedCaseId/affectedCaseDebtorId/recipientUserId` alanlarının HEPSİNİN non-nullable + gerçek FK olduğu görüldü — yani gerçek anonimleştirme (bu alanları null'a çevirmek) kendisi bir migration (4 kolonun nullable'a çevrilmesi) gerektiriyordu. Owner bu bulguyu kabul edip hard-delete'e (migration'sız) resmen geçti — bkz Bölüm 8.

---

## 3. Data Inventory

| Alan | Kişisel veri | Özel nitelikli | Doğrudan/Dolaylı | Not |
|---|---|---|---|---|
| `id`, `dedupeKey` | Hayır | — | — | teknik anahtar |
| `tenantId` | Hayır | — | — | kurumsal kimlik |
| `debtorId` | Evet | Hayır | Dolaylı (FK) | ham TCKN/isim bu tabloda yok, `Debtor` tablosunda |
| `sourceCaseId` / `affectedCaseId` / `affectedCaseDebtorId` | Evet | Hayır | Dolaylı (FK) | dosya bağlantısı |
| `fieldGroup`, `severity` | Hayır | — | — | ADDRESS/KEP_ADDRESS/IDENTITY/NAME sabit kategori kodu |
| `changeSummary` | Hayır (tasarım gereği) | Hayır | — | sabit Türkçe etiket, ham eski/yeni değer YOK (ADR-011) |
| `recipientUserId` | Evet | Hayır | Doğrudan | personel (çalışan) kişisel verisi; scalar, Prisma relation DEĞİL |
| `recipientSource`, `status`, `acknowledgedAt`, `expiresAt`, `expiredAt`, `createdAt`, `updatedAt` | Hayır | — | — | işlem meta verisi |

**Sonuç:** Özel nitelikli kişisel veri (KVKK m.6) YOK. Kişisel veri var (borçlu kimliği + personel kimliği, ikisi de dolaylı/doğrudan FK üzerinden) ama genel nitelikli — bu, saklama süresi değerlendirmesinde m.6 sujesine göre daha esnek bir bant sağlar.

**Kapsam dışı komşu tablolar (ayrı politika, bu belge onları KAPSAMAZ):**

| Veri | Kişisel veri | Özel nitelikli | Silinebilir | Audit gerekli |
|---|---|---|---|---|
| `DebtorCrossCaseNotification` (bu belgenin konusu) | Evet | Hayır | Evet (bu belge kapsamında) | Hayır (kendi CREATED/ACKNOWLEDGED/EXPIRED action'ları zaten `AuditLog`'a yazılıyor, doğrudan FK yok) |
| `AuditLog` | Dolaylı | Hayır | Ayrı politika | Evet |
| `Case` | Evet | Hayır | Ayrı politika | Evet |
| `Task` | Evet | Hayır | Ayrı politika | Evet |

Not: bu tablo AŞAĞIDAKİ yasak ifadeyi ihlal ETMEMEK için bilinçli olarak "tüm ilgili tablolar aynı retention politikasını paylaşır" DEMİYOR — her satır kendi ayrı rejimine tabidir, burada yalnız karşılaştırma amaçlı listelenmiştir.

---

## 4. Legal Basis Draft

```text
Bu işleme faaliyeti için önerilen hukuki dayanak, bir hakkın tesisi/kullanılması/korunması
amacıyla KVKK m.5/2-e; tamamlayıcı değerlendirme olarak, temel hak ve özgürlüklere zarar
vermemek kaydıyla veri sorumlusunun meşru menfaati kapsamında KVKK m.5/2-f'dir.

Bu nitelendirme, D6-RETENTION-DELETE enable edilmeden önce hukuk danışmanı tarafından
teyit edilmelidir.
```

**Gerekçe notu (owner, 2026-07-05):** KVKK m.5'te işleme şartları arasında "bir hakkın tesisi, kullanılması veya korunması" ve "ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla meşru menfaat" açıkça sayılıdır; bu şartlar genişletilemez. Avukatlık Kanunu m.34, avukatın görevini özen/doğruluk/onur/mesleğin gerektirdiği güvene uygun yürütme yükümlülüğü verir — bu, D6'nın iş amacı için güçlü mesleki gerekçe sağlar ama TEK BAŞINA bir KVKK işleme şartı olarak yazılmaz (m.34 amaç/gerekçe katmanıdır, m.5 hukuki dayanak katmanıdır — ikisi karıştırılmaz).

**Açıkça reddedilen dayanak:** Açık rıza (KVKK m.5/1). Büro içi dosya yönetimi/çapraz-dosya audit uyarısı gibi operasyonel bir iç kontrol mekanizması için rıza yanlış zemindir (rıza her an geri alınabilir bir dayanaktır; D6'nın işlevi bundan bağımsız sürmesi gereken bir özen-borcu/audit mekanizmasıdır).

**Durum:** DRAFT. Final nitelendirme hukuk danışmanı teyidi bekliyor — bu belge o teyidi VERMEZ.

---

## 5. Retention Decision Model

Mevcut, MERGED, kod-doğrulanmış model (`D6RetentionDecisionProvider.isEligibleForDeletion()`):

1. `policy.enabled !== true` → HER ZAMAN `false` (fail-closed).
2. `hardCeilingDays` yapılandırılmışsa VE `createdAt + hardCeilingDays` geçilmişse → diğer her şeyden BAĞIMSIZ `true` (mutlak tavan — dosya durumundan bağımsız sonsuz saklamayı önler).
3. `resolvedAt` (status=ACKNOWLEDGED ise `acknowledgedAt`, EXPIRED ise `expiredAt`) yoksa → `false`.
4. `caseClosureBufferDays` yapılandırılmış AMA ilgili (`affectedCase`) dosya henüz kapanmamışsa → bu boyut BLOKE eder.
5. `resolvedRetentionDays` ve/veya `caseClosureBufferDays` yapılandırılmışsa → **hangisi daha UZUNSA** (en geç tarih) o uygulanır; ikisi de yapılandırılmamışsa (ve hard ceiling da geçilmediyse) → `false`.

**Gün sayıları — bu belgede BELİRLENMEZ:**
```text
resolvedRetentionDays = [TBD]
caseClosureBufferDays = [TBD]
hardCeilingDays = [TBD]
```

```text
D6-RETENTION-DELETE BLOCKER:
Resolved retention, case closure buffer ve hard ceiling gün sayıları
owner + hukuk danışmanı tarafından yazılı olarak onaylanmadan
enabled=true yapılamaz ve deleteMany/cron/wiring implement edilemez.
```

**Bilinen basitleştirme (devralınan, PR #935'ten):** `Case.closedAt` şemada yok; case-kapanış tamponu şimdilik notification'ın kendi `resolvedAt` alanından sayılıyor. Bu belge bu basitleştirmeyi DEĞİŞTİRMEZ, yalnız kaydeder.

---

## 6. SystemConfig Contract

**Bugünkü sözleşme (mevcut, kod-doğrulanmış):**
```ts
{
  enabled: boolean;
  resolvedRetentionDays: number | null;
  caseClosureBufferDays: number | null;
  hardCeilingDays: number | null;
}
```
`key = "d6_retention_policy"`, tenant-scoped (`SystemConfig.@@unique([tenantId, key])`), üretilen kayıt READ ONLY bu belge tarafından değiştirilmez.

**Hedef sözleşme (owner-approved, henüz İMPLEMENT EDİLMEDİ):**
```ts
{
  enabled: boolean;
  resolvedRetentionDays: number | null;
  caseClosureBufferDays: number | null;
  hardCeilingDays: number | null;
  policyReference?: string | null;
}
```
**Kural:** `enabled=true` olacaksa `policyReference` ZORUNLU olmalı (validation kuralı, henüz kod yok).
**Format:** `KVKK-D6-RETENTION-vYYYY-MM-DD` — örnek: `KVKK-D6-RETENTION-v2026-07-05`.

**Ayrı, küçük implementasyon işi (bu belgeyle AÇILIR, bu belgeyle İMPLEMENT EDİLMEZ):**
```text
D6-RETENTION-POLICY-REF
Scope:
- D6RetentionPolicy interface (policyReference?: string | null eklenmesi)
- provider validation (enabled=true + policyReference boş/null ise reddet)
- tests
- no deleteMany
- no cron
Status: BACKLOG
```

**SystemConfig yazma yolu — ilk faz kararı:**
```text
İlk fazda admin endpoint/UI açılmayacak. İlk faz: audited ops-script/seed.
```
İlk faz sözleşmesi:
```text
- SystemConfig yalnız ops-script/seed ile yazılır.
- Script policyReference ister.
- Script tenantId ister.
- Script before/after JSON çıktısı üretir.
- Çalıştırma decision-log veya governance kaydına işlenir.
- enabled=true yalnız resmi politika ve gün sayıları netleşince girilir.
```
İkinci faz (bu belgeyle AÇILIR, İMPLEMENT EDİLMEZ):
```text
D6-RETENTION-CONFIG-ADMIN
Status: BACKLOG
Depends on:
- official retention policy
- policyReference support
- PARTNER/ADMIN authorization decision
```

---

## 7. Authorization Matrix

```text
ACCEPTED:
Policy değerlerini yalnızca:
- LawyerRank.PARTNER (schema.prisma:2123, "Ortak Avukat — Tüm yetkiler, yetki yönetimi")
veya
- UserRole.ADMIN (schema.prisma:2847)
değiştirebilir.
```

Aşağıdakiler değiştiremez: `MANAGER`, `AUTHORIZED`, `LAWYER`, `INTERN` (LawyerRank), normal operasyon kullanıcısı (`UserRole.USER`/`VIEWER`).

```text
Current technical state:
SystemConfig write endpoint/UI yok.
Bu yüzden fiili değişiklik bugün yalnız DB/seed/ops erişimiyle yapılabilir.
```
Bu boşluk saklanmaz — Bölüm 10'da açık blocker olarak listelenmiştir; D6-RETENTION-DELETE öncesi ayrıca kapatılacaktır (bkz D6-RETENTION-CONFIG-ADMIN, Bölüm 6).

---

## 8. Deletion Method

**Hard-delete, nihai politika onayına tabi olmak üzere, öngörülen imha yöntemidir.**

Gerekçe: FAZ 2'de (`d6-legal-semantics-triage.md` Q2) "önce anonymize" çerçeve kararı RATIFIED edilmişti. D6-RETENTION-POLICY-INFRA GO-ANALYZE'inde şema doğrudan okunduğunda `debtorId`/`affectedCaseId`/`affectedCaseDebtorId`/`recipientUserId` alanlarının HEPSİNİN non-nullable + gerçek FK olduğu görüldü — gerçek anonimleştirme (bu alanları null'a çevirmek) kendisi bir migration (4 kolonun nullable'a çevrilmesi) gerektiriyordu. Repo'nun kendi emsali (`calc-preview/break-glass`, `buildDeletableWhere`) de anonymize değil gerçek silme yapıyor. Owner bu bulguyu kabul edip hard-delete'e (migration'sız) resmen geçti — FAZ 2'deki "önce anonymize" LOCK'u bu şekilde, sessizce değil owner onayıyla revize edilmiştir.

Bu belge `deleteMany` ÇAĞRISI ÜRETMEZ, cron TANIMLAMAZ. İmha yöntemi kararı kayıt altına alınmıştır; fiili implementasyon D6-RETENTION-DELETE'in kapsamıdır ve BLOKE durumdadır (Bölüm 10).

---

## 9. Open Decisions

1. **Hukuki nitelendirmenin nihai teyidi** — KVKK m.5/2-e (birincil) + m.5/2-f (tamamlayıcı) taslağının hukuk danışmanı tarafından yazılı onayı.
2. **Kesin gün sayıları** — `resolvedRetentionDays` / `caseClosureBufferDays` / `hardCeilingDays`; resmi büro KVKK Saklama/İmha Politikası belgesinden gelecek.
3. **`policyReference` implementasyon zamanlaması** — D6-RETENTION-POLICY-REF ne zaman GO-IMPLEMENT alır (bağımsız, D6-RETENTION-DELETE'ten önce de yapılabilir).
4. **SystemConfig yazma yolunun fiilen kurulması** — ops-script/seed'in kim tarafından, ne zaman yazılıp çalıştırılacağı (D6-RETENTION-CONFIG-ADMIN'e geçiş koşulları: resmi politika + policyReference desteği + yetki kararının çalışır hale gelmesi).
5. **Resmi büro KVKK Saklama/İmha Politikası belgesinin kendisi** — bu scaffold'un girdisi; bu belgenin ürünü DEĞİLDİR, ayrı bir kurumsal/hukuki süreçtir.

---

## 10. Delete Phase Blockers

```text
D6-RETENTION-POLICY-INFRA: CLOSED
PR #935 / c3e7d1e7

D6-RETENTION-POLICY-DOC: DONE (bu belge)
Purpose: Create official design/policy scaffold for DebtorCrossCaseNotification retention.

D6-RETENTION-DELETE: BLOCKED
Blocked by:
1. Official KVKK Saklama/İmha policy approval
2. Final resolvedRetentionDays / caseClosureBufferDays / hardCeilingDays
3. policyReference implementation decision
4. SystemConfig write path decision executed
```

D6-RETENTION-DELETE için (deleteMany + cron + module wiring) hiçbir GO-ANALYZE dahi önerilmeyecek ta ki yukarıdaki 4 blocker owner tarafından tek tek kapatılana kadar.

---

## 11. References

- `docs/design/d6-final-architecture.md` — D6 domain kanonik mimari kaydı (FAZ 0).
- `docs/design/d6-legal-semantics-triage.md` — Q2 retention çerçeve kararı (FAZ 2), Q3-Q6 diğer hukuki kararlar.
- `docs/governance/product-backlog.md` — D6-RETENTION ailesi backlog kayıtları (D6-RETENTION, D6-RETENTION-POLICY-INFRA, D6-RETENTION-POLICY-DOC, D6-RETENTION-POLICY-REF, D6-RETENTION-CONFIG-ADMIN, D6-RETENTION-DELETE).
- `apps/api/src/modules/debtor/d6-retention-decision.provider.ts` — mevcut policy-okuma + eligibility kararı implementasyonu (PR #935).
- `apps/api/prisma/schema.prisma` — `DebtorCrossCaseNotification` (satır ~1391), `SystemConfig` (satır ~6767), `LawyerRank`/`UserRole` enumları.
- KVKK m.5 (Kişisel Verilerin İşlenme Şartları).
- Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hâle Getirilmesi Hakkında Yönetmelik — https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK
- Avukatlık Kanunu m.34 (özen borcu — hukuki dayanak değil, mesleki gerekçe katmanı; bkz Bölüm 4).

---

**GOVERNANCE NOTU:** Bu belge D6-RETENTION-DELETE'e implementasyon yetkisi VERMEZ. Bölüm 10'daki 4 blocker kapanmadan `enabled=true` yapılamaz, `deleteMany`/cron/wiring implement edilemez. Bu belge `product-backlog.md`'deki D6-RETENTION ailesi kayıtlarıyla (bu commit'te güncellenmiştir) birlikte okunmalıdır.
