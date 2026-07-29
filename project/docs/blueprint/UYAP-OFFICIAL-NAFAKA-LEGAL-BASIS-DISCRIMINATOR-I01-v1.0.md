# UYAP-OFFICIAL-NAFAKA-LEGAL-BASIS-DISCRIMINATOR-I01 — v1.0

| Alan | Değer |
| --- | --- |
| Canonical task | `UYAP-OFFICIAL-NAFAKA-LEGAL-BASIS-DISCRIMINATOR-I01` |
| Program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Mode | ANALYZE → (model yeterliyse implement) → VALIDATE → PR → CLOSE |
| Predecessor | `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-IMPLEMENTATION-I01` — CLOSED/PARTIAL, PR #1853, `14a1b3c5` |
| Owner-approved M-01 | `CaseSubCategory.NAFAKA` + resmî takipTuru `1` → `9009` (Nafaka — Örnek 7), **koşullu** |
| Tarih | 2026-07-29 |

## 0. Hüküm

```text
M-01 MODEL:        PARTIAL
IMPLEMENTATION:    NOT ELIGIBLE
M-01:              MODEL_RESIDUAL / NOT IMPLEMENTED — EXACT RESIDUAL CANONICALIZED
```

Asıl soruya kanıtla cevap: *"Repository'de ilamsız nafaka alacağını, yalnız kategori
adından bağımsız biçimde kanıtlayan canonical ve production-reachable domain
discriminator var mı?"* → **HAYIR.** Schema/migration EKLENMEDİ, tahmin YAPILMADI.

## 1. Domain envanteri

| # | Kaynak | Alan | Yazan | Production reachable | Tenant scope | M-01 fitness |
| --- | --- | --- | --- | --- | --- | --- |
| C-1 | `Case` | `subCategory = NAFAKA` | case DTO (caller) | EVET | Case üzerinden | **owner tarafından tek başına DIŞLANDI** |
| C-2 | `Case` | `nafakaStartDate` / `monthlyNafakaAmount` | aynı DTO (caller) | EVET | Case üzerinden | RED — `validateSubCategoryRules` Kural 4: **"zorunlu değil"** (uyarı seviyesi); subCategory ile AYNI çağrıda caller-supplied; bağımsız hukuki-dayanak kanıtı değil |
| C-3 | `CaseJudgment` | `nafakaType` (`NafakaType` enum) | `case-judgment.service` | EVET | tenantId+caseId | RED (M-01 için) — schema beyanı: **"Mahkeme ilamı bilgileri - İlamlı takipler için"**; ilamsız kolda kullanmak modelin beyan edilmiş kapsamını aşar. (M-02'de kullanımına devam — orada ilamlı koşuluyla uyumlu.) |
| C-4 | `Due` | `type = NAFAKA` (`DueType`) | 3 yazar (aşağıda) | EVET | **Due'da tenantId YOK** (yalnız caseId) | RED — aşağıda |
| C-5 | `ClaimItem` | `itemType` (`ClaimItemType`) | claim-item writer router | EVET | tenantId+caseId | **NAFAKA değeri YOK** — aşağıda |
| C-6 | `LookupMahiyetTipi` | `code='NAFAKA'` + `uyapCode` | tenant admin | EVET | tenant-mutable | RED — `uyapCode` **caller-controlled resmî kod** (yasak sınıf) |
| C-7 | `LookupTakipTuru` | `code='NAFAKA'` | tenant admin | EVET | tenant-mutable | RED — aynı sınıf |
| C-8 | RCV legal-subtype registry v1 | `receivable-legal-subtype-registry-v1.json` | governance artefaktı | formation zinciri | — | RED — **7 girdi, tümü COST/ACCRUED_INTEREST/ANCILLARY; NAFAKA girdisi YOK** |
| C-9 | `ClaimItemFormationIntent.legalBasisCode` | RCV formation zinciri | admission/finalizer | EVET | tenantId | RED — değer uzayı C-8 registry'sine bağlı; nafaka kodu yok |

## 2. `Due` / `ClaimItem` ownership reconciliation

Repository'de **zaten kayıtlı bir owner kararı** bu soruyu çözüyor
(`due-to-claim-item.mapper.ts`, G1 köprüsü):

```text
Kanonik alacak modeli = ClaimItem   (legal-kernel B kararı, 2026-06-13)
Due                   = scheduled installment / taksit takvimi + legacy geçiş
                        (.kiro/specs/legal-kernel/06-aggregate-boundaries.md:
                         "Due = scheduled installment (örn aylık nafaka, dönemsel kira)")

tbk100-legal-decisions-ledger R1/R2:
  DueType.NAFAKA → null
  "NAFAKA: alacak muhasebesi otoritesi değil → yalnız Due (taksit takvimi) kalır."
```

| Soru | Cevap (kanıtlı) |
| --- | --- |
| `Due` neyin sahibi? | Taksit/talep takvimi (scheduled installment). Alacak muhasebesi DEĞİL. |
| `ClaimItem` neyin sahibi? | Kanonik alacak muhasebesi (legal-kernel B). |
| `Due.type=NAFAKA` neyi ifade eder? | Tahakkuk/taksit sınıfı — alacağın hukuki mahiyeti DEĞİL (ledger kararı). |
| `ClaimItem`↔`Due` canonical relation? | G1 köprüsü `metadata` marker'ı ile — ANCAK **NAFAKA için köprü BİLİNÇLİ OLARAK KAPALI** (`NAFAKA → null`; nafaka Due'su hiçbir ClaimItem üretmez). |
| Aynı Case'te birden fazla Due/ClaimItem? | EVET (her ikisi de liste). |
| `Due.type` caller-controlled mı? | **EVET** — 2 yazar DTO'dan (`dueDto.type`, `data.type as any`); 3. yazar scheduler. |
| Scheduler yazarı bağımsız kanıt mı? | **HAYIR** — `subCategory: 'NAFAKA'` filtresinden TÜRETİLİR (dairesel: owner'ın dışladığı kategori adına geri döner) ve tutarı serbest-metin `description.includes('Aylık')` heuristiği ile bulur. |
| Tenant ownership DB'de? | `Due`'da `tenantId` alanı YOK (yalnız `caseId`); `ClaimItem`'da VAR. |

**Engellenen hata** (owner §4): "Case'te herhangi bir `Due.type=NAFAKA` var → bütün
ClaimItem'lar nafaka kabul edilir" — bu zincir zaten yapısal olarak imkânsız çünkü
NAFAKA Due'su ClaimItem üretmez; guard NB-02 bunu kilitler.

## 3. Kabul kriterlerine karşı değerlendirme (10 kriter)

En güçlü aday (`Due.type=NAFAKA`) için:

| Kriter | Sonuç |
| --- | --- |
| 1. Canonical domain modelde | KISMEN — model var ama taksit takvimi sahipliğinde |
| 2. Production writer | EVET |
| 3. Tenant+case ownership | **HAYIR** — `Due`'da tenantId yok |
| 4. ClaimItem/alacakla deterministic ilişki | **HAYIR** — `NAFAKA → null` (ledger kararıyla köprü kapalı) |
| 5. Hukuki anlamı nafaka alacağı | **HAYIR** — ledger: "alacak muhasebesi otoritesi değil" |
| 6. İlamlı/ilamsız'dan bağımsız nafaka semantiği | KISMEN |
| 7. Caller serbest metin/ham kodla belirlenmiyor | **HAYIR** — 2/3 yazar caller-supplied; 3. dairesel + serbest-metin heuristik |
| 8. Başka alacakları yanlış sınıflandırmıyor | yapısal olarak evet (köprü kapalı) ama bu aynı zamanda 4'ü bozar |
| 9. Tahmin gerektirmiyor | HAYIR |
| 10. Test edilebilir fail-closed | guard'larla evet |

**10 kriterin 5'i başarısız → authority OLAMAZ.** Diğer adaylar §1'de tek tek RED.

## 4. Exact residual (canonicalized)

```text
M-01 EXACT RESIDUAL — üç yapısal gerçek:

R-M01-A  Kanonik alacak modeli (ClaimItem) nafakayı BİLİNÇLİ dışlar:
         ClaimItemType'ta NAFAKA yok; tbk100 ledger R1/R2 → DueType.NAFAKA → null.
         M-01'in bağlanabileceği claim-level nafaka varlığı YOKTUR.

R-M01-B  Due.type=NAFAKA bağımsız kanıt değildir: caller-supplied veya
         subCategory-türevi (dairesel) + serbest-metin heuristik.

R-M01-C  CaseJudgment ilamlı için deklare edilmiştir; ilamsız kolda kullanmak
         modelin beyan edilmiş kapsamını aşar.
```

### Required future model (semantik ihtiyaç — çözüm tasarımı DEĞİL)

İlamsız nafaka alacağının 9009 ile emit edilebilmesi için gereken semantik:
*claim seviyesinde, kategori adından bağımsız, caller'ın serbest metniyle
belirlenmeyen, nafakanın hukuki dayanağını (kaynak karar/anlaşma ve türü) taşıyan
canonical bir kayıt*. Bunun `ClaimItem` mi, ayrı bir model mi, yoksa tbk100
ledger'ının `NAFAKA → null` kararının revizyonu mu olacağı **owner/LDO kararıdır**
— bu görevde tasarlanmadı.

## 5. Uygulanan değişiklikler (bounded, davranış sınıfı değişmedi)

| Dosya | Değişiklik |
| --- | --- |
| `official-codelist-registry.ts` | M-01 dalının `MODEL_RESIDUAL` reason'ı belirsiz ifadeden **exact residual**'a güncellendi (R-M01-A/B/C); davranış sınıfı aynı (`MODEL_RESIDUAL`, fail-closed) |
| `__tests__/official-nafaka-legal-basis-discriminator.spec.ts` **(YENİ)** | NB-01…NB-12 model-evidence guard'ları, **12 test** — kanıtlardan biri değişirse (ör. `ClaimItemType`'a NAFAKA eklenirse) guard kırılır ve yeniden değerlendirme tetiklenir |
| `ci-manifests/pure/uyap-icrabot-tebligat.txt` | Cerrahi ekleme; yeni ci.yml adımı açılmadı |

Runtime implementasyonu YOK. Schema/migration YOK. Yeni typed reason code
EKLENMEDİ (implementasyon yapılmadığı için ölü kod olurdu; mevcut
`OFFICIAL_MAHIYET_MODEL_RESIDUAL` ailesi yeterli).

## 6. Test ve CI kanıtı

| Kapsam | Sonuç |
| --- | --- |
| `official-nafaka-legal-basis-discriminator.spec.ts` (NB-01…NB-12) | **12/12 PASS** |
| `modules/uyap/official/**` (13 suite) | **293/293 PASS** |
| `tsc -p tsconfig.prod.json --noEmit` | **EXIT 0** |
| `run-ci-manifest.sh pure/uyap-icrabot-tebligat` | **66 suite / 1175 test PASS** |

DB gerektiren yeni test yok (analiz + model-evidence guard'ları saf).

## 7. Korunanlar

```text
M-02 (1045):     UNCHANGED — NB-09 makine ile doğrular
5045:            EXCLUDED — NB-10
RUNTIME WIRING:  NOT PERFORMED — NB-11
STRICT DTD:      BLOCKED BY D1 — NB-12
CANARY R02:      NOT ELIGIBLE
```

## 8. Sıradaki

Owner sırasına göre bir sonraki iş `UYAP-OFFICIAL-ALACAKKALEMI-STRUCTURED-EMISSION-I01`
— ANCAK owner'ın kendi kuralı gereği ("uygulanamazsa önce exact domain model
residual'ı ele alınmalıdır") M-01 residual'ının owner/LDO dispozisyonu
(`R-M01-A/B/C` → future model kararı) alacakKalemi emisyonundan ÖNCE
değerlendirilmelidir. Bu kayıt hiçbirini başlatmaz.
