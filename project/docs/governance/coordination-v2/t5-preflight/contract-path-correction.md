# T5 Preflight — §1 Immutable Forbidden Path Correction

```text
Task               : GOV-COORD-V2-T5-PREFLIGHT-RECONCILIATION-R01, kapsam 1
Base               : origin/main @ 7fcd3b98
Contract durumu    : PROPOSED / OWNER REVIEW REQUIRED — ratifiye DEĞİL (satır 6)
Nitelik            : PRE-RATIFICATION CORRECTION (amendment DEĞİL — §1 aşağıda)
Authority üretimi  : YOK
```

## 1. Görev brief'inin bir varsayımı yanlış — ve lehte

Brief bu işi *"ratifiye contract amendment'ıdır"* diye niteliyor. Repository
gerçeği başka: `governance-orchestration-contract-v2.md` satır 6 açıkça
`Durum : PROPOSED / OWNER REVIEW REQUIRED — ratifiye DEĞİLDİR` diyor, satır 22
ise `V2 ratifiye edilene kadar V1 tek yürürlükteki koordinasyon contract'ıdır`.

Sonuçlar:

- Bu düzeltme **ratifiye governance'a amendment değildir**; ratifiye edilmemiş
  bir öneri metnine yapılan düzeltmedir. Gereken kapı bir amendment kapısı
  değil, T1'in mevcut owner review'ı.
- Kusurun **bugüne kadar hiçbir fiili etkisi olmamıştır**. V2 yürürlükte
  olmadığı için hiçbir task bu liste karşısında doğrulanmadı. Yani düzeltme
  tam doğru zamanda: yürürlüğe girmeden önce.

Bunu düzeltmiyorum, kaydediyorum: brief'in ratifikasyon varsayımı fazladan bir
kapı öngörüyordu, gerçek kapı daha hafiftir.

## 2. Path varlık doğrulaması (git tracked tree, 7fcd3b98)

| Yol | Tracked dosya | Filesystem |
|---|---|---|
| `project/prisma/` | 0 | YOK |
| `project/deploy/` | 0 | YOK |
| `project/ops/` | 9 | VAR |
| `project/node_modules/` | 0 | YOK (gitignored) |
| `project/apps/api/prisma/` | **134** | **VAR** |

Ağaçtaki `schema.prisma` + `*/prisma/migrations/*` yollarının tamamı — 104
tracked dosya — tek bir kök altındadır: `project/apps/api/prisma/`. İkinci bir
schema/migration yüzeyi yoktur.

`project/apps/api/src/prisma/` iki dosyadır (`prisma.module.ts`,
`prisma.service.ts`) — NestJS modül kodu, schema yüzeyi değil.

## 3. Kusurun gerçek teşhisi

Önceki turda `boundary-review.md` §5 bu kusuru *"liste var olmayan dizinleri
gösteriyor"* diye kaydetmişti. Doğru ama eksik teşhis; asıl mekanizma şu:

V1 `deniedTargetPrefixes` **altı** giriş taşır ve bunlardan `project/apps/` tüm
uygulama yüzeyini — dolayısıyla `project/apps/api/prisma/`'yı da — kapsar. **V1
kusurlu değildir.**

V2 `BOUNDED_CODE_TASK` profilini mümkün kılmak için `project/apps/` ve
`project/packages/` prefix'lerini immutable listeden çıkarmak *zorundadır*:
bounded kod task'ı tanım gereği orada çalışır. Kusur bu çıkarmanın yapılıp
**schema/migration alt-yüzeyinin oyulmamış olmasıdır**.

Ölçülen sonuç (`matchesForbidden` ile, eski liste vs yeni liste):

```text
project/apps/api/prisma/schema.prisma                      ESKI=REACHABLE  YENI=BLOCKED
project/apps/api/prisma/migrations/<...>/migration.sql     ESKI=REACHABLE  YENI=BLOCKED
project/docs/design/probe.md                               ESKI=REACHABLE  YENI=BLOCKED
project/docs/runbooks/probe.md                             ESKI=REACHABLE  YENI=BLOCKED
.agents/skills/probe.md                                    ESKI=REACHABLE  YENI=BLOCKED
project/scripts/governance-coordination.test.cjs           ESKI=REACHABLE  YENI=BLOCKED
project/apps/api/src/prisma/prisma.service.ts              ESKI=REACHABLE  YENI=REACHABLE
```

Son satır kasıtlıdır: Prisma modül kodu erişilebilir kalmalı, aksi hâlde
düzeltme profili gereksiz daraltır.

## 4. Kod tarafında aynı sınıftan daha fazla kayma bulundu

Kusur yalnız contract metninde değildi. `orchestrator.cjs` içindeki
`IMMUTABLE_FORBIDDEN` dizisi kaynak JSON'dan **elle** kopyalanmış ve dört yerde
daha kaymıştı:

| Kaynak grubu | Kaynakta | Kodda eksik olan |
|---|---|---|
| `canonicalSemanticGovernance` | 7 giriş | `project/docs/design/**`, `project/docs/runbooks/**` |
| `coordinationControlPlane` | 10 giriş | `.agents/skills/**`, `governance-coordination.test.cjs` |
| `grandfatheredOwnerWipExactPaths` | 17 giriş | contract §1'de hiç anılmıyordu (kodda `governance/**` ile transitif kapalı) |

Elle bir kez daha yamamak aynı kaymayı davet ederdi. Bunun yerine liste
tamamlandı **ve kayma mekanik olarak yakalanır hâle getirildi**:

- `orchestrator.test.cjs` — kaynak JSON'un dört grubundaki her giriş için
  temsilî bir concrete path üretip `matchesForbidden` ile kapsandığını doğrular.
  Kapsam string eşitliğiyle değil **semantik** olarak sınanır, çünkü tek bir
  geniş pattern birden çok kaynak girişini meşru biçimde kapsar.
- `orchestrator.test.cjs` — `git ls-files` ile ağaçtaki her `schema.prisma` ve
  her `*/prisma/migrations/*` yolunu sayar ve hepsinin kapsandığını doğrular.
  Böylece **ileride eklenen ikinci bir Prisma yüzeyi sessizce yazılabilir hâle
  gelmez**, testi kırar.
- `safety.test.cjs` — `validate()` seviyesinde `FORBIDDEN_PATH_TOUCHED` için
  **hiç test yoktu**. Kusurun tam senaryosu eklendi: `allowedRoots` =
  `project/apps/api/` iken `project/apps/api/prisma/` altına dokunmak
  reddedilmeli; kardeş uygulama kodu yazılabilir kalmalı.

## 5. Uygulanan tam değişiklik

```text
docs/governance/coordination-v2/governance-orchestration-contract-v2.md
  §1  forbidden listesi: project/apps/api/prisma/ eklendi;
      grandfatheredOwnerWipExactPaths[*] açıkça sayıldı;
      project/prisma/ + project/deploy/ DEFENSIVE olarak işaretlendi
  §1.1 (yeni) gerekçe, kapsam-dışı bırakılan src/prisma/ ve var olmayan
      yolların açık disposition'ı

scripts/orchestration-v2/orchestrator/orchestrator.cjs
  IMMUTABLE_FORBIDDEN tamamlandı + kaynak gruplarına göre bölümlendi

scripts/orchestration-v2/orchestrator/orchestrator.test.cjs   (+2 test)
scripts/orchestration-v2/safety/safety.test.cjs               (+1 test)
```

Deny modeli **gevşetilmedi**; hiçbir giriş kaldırılmadı. Yalnız eklendi ve
gerçek repository yüzeyine bağlandı.

## 6. Var olmayan yolların disposition'ı

`project/prisma/` ve `project/deploy/` normatif listede **KALIR**, açık
`DEFENSIVE` etiketiyle:

- maliyeti sıfır, yanlış-pozitif üretmezler
- ileride bir üst-düzey `project/prisma/` açılırsa kendiliğinden kapsar
- ancak tek başlarına `PRODUCTION_SCHEMA_MIGRATION_RUNTIME` kapsamını
  **KARŞILAMAZLAR** — o kapsamı karşılayan giriş `project/apps/api/prisma/`'dır

Silmek de savunulabilirdi; kalmaları tercih edildi çünkü kusur "fazla giriş"
değil "eksik giriş"ti ve silme deny yüzeyini daraltır.

## 7. Owner dikkatine — düzeltmedim

`project/v28_ops_bundle/` ne V1 `deniedTargetPrefixes` ne V2 §1 tarafından
kapsanıyor. İçeriği: `deploy/PROD_DEPLOY_STRATEGY.md`, `engine_v28/` altında bir
policy-seed management command, ve senaryo fixture'ları. `project/ops/` altında
**değildir**, `project/apps/` altında **değildir**.

Bu V1'den beri var olan bir boşluktur, V2'nin ürettiği bir kusur değil. Bir
production deploy/ops yüzeyinin deny kapsamına girip girmeyeceği bir **politika
kararıdır**, bu görevin kapsamı yalnız Prisma/schema/migration yüzeyidir.
Kendi başıma eklemedim; owner kararına bırakıyorum.

## 8. Doğrulama

```text
Windows  : 113/113 PASS  (110 mevcut + 3 yeni)
Linux    : orchestration-v2 suite'i CI'da koşar — bkz. §9
```

## 9. Bilinen sıralama bağımlılığı

Bu üç yeni test `orchestration-v2` suite'inin parçasıdır ve o suite'i CI'da
koşturan workflow (`.github/workflows/gov-coord-v2-tests.yml`) henüz açık PR
#1605'tedir. #1605 merge edilmeden bu PR'ın CI'ı yeni testleri
**çalıştırmaz** — bu PR'ın branch'i onları içermez, workflow'u içermez.

Bu bir kusur değil, bilinen bir sıra: #1605 önce merge edilir, sonra bu branch
taze main ile senkronlanır ve testler Linux'ta koşar. Aksi hâlde eklenen
güvenceler yalnız yerel çalıştırmayla doğrulanmış olur ve bu açıkça
raporlanmalıdır.

---

**AUTHORITY: NONE.** Bu kayıt hiçbir şeyi ratifiye etmez, hiçbir execution grant
üretmez ve V2'nin PROPOSED durumunu değiştirmez.
