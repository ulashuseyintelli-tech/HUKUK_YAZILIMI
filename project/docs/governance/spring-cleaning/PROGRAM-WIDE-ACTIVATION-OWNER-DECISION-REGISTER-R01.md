# PROGRAM-WIDE-ACTIVATION-OWNER-DECISION-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-ACTIVATION-OWNER-DECISION-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING — ADDENDUM
Durum      : OPEN ACTIVATION DECISION PACK
Rol        : Yalnız GERÇEKTEN owner kararı gerektiren aktivasyonlar.
Baseline   : canonical main `f8b7a912`
Tarih      : 2026-07-27
```

Her kalemin varsayılanı: **karar verilmezse AKTİVASYON YOK.**

---

## ITEM-A01 — `ManifestAdminController` runtime binding (P1)

**CURRENT TRUTH**

```text
kod            : modules/calc-preview/diagnostics/object-store/manifest-retry/
                 manifest-admin.controller.ts   @Controller('admin/manifest')
endpoint       : 8 adet — retry · retry-queue · dlq · retry/dlq · retry/jobs
                 · dlq/:dlqId/redrive · dlq/:dlqId/resolve · bundles/:bundleId/retry
barrel export  : manifest-retry/index.ts:79 — VAR
module kaydı   : YOK  (calc-preview.module.ts → controllers: [CalcPreviewController])
guard'lar      : ManifestAdminAuthGuard + ManifestAdminRateLimiter + ManifestAdminRateLimitGuard
                 calc-preview.module.ts:60-61'de REGISTER EDİLMİŞ — ama koruyacak route yok
test           : __tests__ mevcut (unit) → runtime kanıtı değil
canonical kayıt: bu controller'ın register edilmesini yetkilendiren kayıt BULUNAMADI
sonuç          : 8 admin endpoint fiilen ERİŞİLEMEZ
```

**WHY OWNER DECISION IS REQUIRED**
Bağlamak, çalışan HTTP yüzeyine 8 yeni admin endpoint eklemektir; ikisi (`redrive`, `resolve`)
dead-letter kuyruğunu **mutasyona uğratır**. Bu bir güvenlik yüzeyi genişletmesidir ve hiçbir
canonical kayıt bunu yetkilendirmemektedir. Ajanın "kod hazır, guard'ı da var, bağlayayım"
demesi tam olarak `MERGEABLE != MERGE_ELIGIBLE` ilkesinin runtime ihlali olurdu.

**OPTION A — BAĞLA (bounded activation)**
`ManifestAdminController` `calc-preview.module.ts` `controllers:` dizisine eklenir; guard'lar
zaten hazır olduğundan ek yetkilendirme kodu gerekmez; `ManifestRetryMetricsService` ve
kardeş servisler de provider olarak bağlanır. Etki: manifest retry/DLQ operasyonu **kullanılabilir
hale gelir** — Phase 10'un amaçladığı operasyonel yetenek kazanılır. Risk: yeni admin yüzeyi.

**OPTION B — KASITLI DORMANT İLAN ET**
Controller ve kardeş servisler `INTENTIONALLY_DORMANT` olarak canonical kayda alınır; guard'ların
neden register edildiği açıklanır; ileride gerekirse ayrı bir GO ile bağlanır. Etki: mevcut
runtime yüzeyi değişmez; belirsizlik ortadan kalkar.

**OPTION C — OBSOLETE İLAN ET VE KALDIR**
Phase 10 retry/DLQ yönetimi başka bir yolla çözüldüyse controller + 5 kardeş servis silinir.
**Bu seçenek için kanıt bulunamadı** — `admin/manifest` prefix'i başka hiçbir yerde
tanımlanmıyor, yani yerine geçen bir yüzey yok.

**RECOMMENDATION: B**, ardından ayrı bir bounded GO ile A. Gerekçe: bugün bağlamak yetkisiz bir
güvenlik yüzeyi genişletmesidir; fakat kalıcı olarak sessiz bırakmak da "8 endpoint yazıldı,
test edildi, hiç çalışmadı" durumunu gizler. Önce durumu canonical kayda almak, sonra
operasyonel ihtiyaç doğrulanınca bağlamak doğru sıradır.

**DEFAULT IF NO DECISION: NO ACTIVATION** — controller bağlanmadı, kod değişmedi.

---

## ITEM-A02 — OFFICE Password Recovery: runtime AÇIK, canonical kayıt "false" diyor (P1)

**CURRENT TRUTH**

```text
kod default          : KAPALI  (password-reset.service.ts:40)
canonical kayıt      : "OFFICE_PASSWORD_RECOVERY_ENABLED code-level false kalır;
                        OFFICE-AUTH-P02 runtime aktivasyonu ... ayrı owner GO bekler"
                        (decision-log.md + pending-migration-coordination-register.md §9.4)
repo'da aktivasyon
closure kaydı        : YOK  (repo geneli arama → 0 sonuç)
gerçek runtime       : owner'ın HY_WT/RUNTIME worktree'sindeki untracked .env'inde AÇIK;
                        tam E2E zincir 2026-07-22'de owner tanıklığında doğrulanmış
                        (forgot-password → gerçek SMTP → e-posta teslimi → owner'ın
                         tarayıcısından reset → tokenVersion 2→3 → yeni parola ile login)
```

**WHY OWNER DECISION IS REQUIRED**
Canonical kayıt ile fiili runtime **çelişmektedir**. Kaydı gerçeğe hizalamak (yani "aktif ve
E2E doğrulandı" yazmak) bir governance closure işlemidir ve owner'ın kendi notu bunun **ayrı,
dar bir `GO-DOCS` görevi** gerektirdiğini, mevcut bir yetkiyle yapılamayacağını belirtir.
Ayrıca kayıt, local `.env` ve SMTP konfigürasyonuna atıf yapmadan yazılmalıdır.

**OPTION A — GO-DOCS ile canonical closure yaz**
`OFFICE-PASSWORD-RECOVERY-ACTIVATION-R01` kaydı açılır; runtime'ın aktif ve owner-doğrulanmış
olduğu, fakat bunun **local single-PC runtime** olduğu ve production deployment iddiası
taşımadığı açıkça yazılır. Etki: kayıt–gerçeklik boşluğu kapanır.

**OPTION B — MEVCUT HALDE BIRAK**
Kayıt "code-level false" demeye devam eder; runtime durumu yalnız owner'ın bilgisinde kalır.
Etki: gelecekteki her oturum kaydı okuyup özelliği kapalı sanar.

**RECOMMENDATION: A.** Bu, `PASS` kelimesinin operasyonel gerçeği maskelemesinin tersi bir
risktir: kayıt gerçeğin **gerisinde** kalmıştır ve bu da yanlış karar ürettirir.

**DEFAULT IF NO DECISION: NO MUTATION** — bu program kaydı yazmadı.

---

## ITEM-A03 — 17 flag'in gerçek deploy edilmiş değeri bilinmiyor (P2)

**CURRENT TRUTH**

```text
kod-seviyesi default : 17 flag KAPALI, 1 flag (SIMULATION_API_ENABLED) AÇIK
deploy edilmiş değer : HİÇBİRİ İÇİN BİLİNMİYOR
neden                : bu oturum .env / production konfigürasyonu / çalışan runtime OKUMADI
                       (secret okuma yasağı + deployment erişimi yok)
kanıtlanmış istisna  : F-10 kod default'u KAPALI iken runtime'da AÇIK çıktı (ITEM-A02)
                       → "kod default'u = gerçek değer" varsayımı bu repoda YANLIŞTIR
```

**WHY OWNER DECISION IS REQUIRED**
Operasyonel gerçeği yalnız deploy edilmiş ortama erişimi olan taraf belirleyebilir. Ajanın
tahmin yürütmesi, F-10 örneğinin gösterdiği gibi, doğrudan yanlış sonuç üretir.

**OPTION A — OWNER TEK SEFERLİK FLAG ENVANTERİ VERİR**
Owner, 18 flag'in her biri için deploy edilmiş değeri bildirir (secret değil, yalnız
`true/false`). Ardından ayrı bir GO ile her biri `O03..O14` sınıfına kesin olarak atanır.

**OPTION B — UNKNOWN OLARAK KALSIN**
Register `O15 UNKNOWN_OPERATIONAL_STATE` ile kapanır; her flag kararı ihtiyaç anında tek tek
sorulur.

**RECOMMENDATION: A** — 18 satırlık bir `true/false` listesi, program genelindeki operasyonel
belirsizliğin büyük kısmını tek hamlede kapatır.

**DEFAULT IF NO DECISION: NO MUTATION** — flag'ler `O15` olarak kayıtlı kalır.

---

## ITEM-A04 — `SnapshotCleanupService` emekli implementasyonun kaldırılması (P3)

**CURRENT TRUTH**

```text
dosya   : modules/calc-preview/diagnostics/evidence/snapshot-cleanup.service.ts
kanıt   : kendi JSDoc'u — "@deprecated Phase 11 - Use SnapshotCleanupOrchestratorService instead."
binding : YOK (module'de yok, tüketici yok)
sınıf   : O13 OBSOLETE_IMPLEMENTATION
```

**WHY OWNER DECISION IS REQUIRED**
Kod silme bu programın kapsamı (docs/governance-only) dışındadır ve halefinin
(`SnapshotCleanupOrchestratorService`) tüm sorumluluğu gerçekten devraldığı doğrulanmamıştır.

**OPTION A — AYRI BOUNDED GO İLE SİL** · **OPTION B — DEPRECATED HALDE BIRAK**

**RECOMMENDATION: B** (düşük öncelik) — dormant deprecated kod aktif zarar üretmiyor;
temizlik ayrı bir tech-debt turunda yapılabilir.

**DEFAULT IF NO DECISION: NO MUTATION**

---

## Bu register'a ALINMAYANLAR

```text
B-02..B-06 (5 bağlanmamış servis)  → ITEM-A01 kararına bağlı, ayrı karar üretmez
B-07/B-08 (claim-item formation)   → canonical DORMANT, karar gerekmez
P-01..P-07 (6 DENIED program + DORMANT_WRITE) → ratifiye politika, karar gerekmez
```

## Sayım

```text
OPERATIONAL ITEMS STILL REQUIRING OWNER DECISION: 4  (A01, A02, A03, A04)
FEATURES ENABLED BY THIS PROGRAM                : 0
RUNTIME BINDINGS REPAIRED BY THIS PROGRAM       : 0
DEPLOYMENTS COMPLETED BY THIS PROGRAM           : 0
```
