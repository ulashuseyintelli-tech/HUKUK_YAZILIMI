# PROGRAM-WIDE-RUNTIME-BINDING-GAP-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-RUNTIME-BINDING-GAP-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING — ADDENDUM
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : "Kod var ama bağlı değil" anti-pattern'lerinin deterministik tespiti ve tekrar
             çalıştırılabilir tarama yöntemi.
Baseline   : canonical main `f8b7a912`
Tarih      : 2026-07-27
```

## 1. Tarama yöntemi (tekrar çalıştırılabilir)

Aşağıdaki iki tarama `project/apps/api/src` altında çalıştırılmıştır. Sonuçlar bu register'ın
her yeniden üretiminde birebir tekrarlanabilir olmalıdır.

**Register edilmemiş controller:**

```bash
for f in $(find . -name "*.controller.ts" ! -path "*/__tests__/*"); do
  for cls in $(grep -oE "export class [A-Za-z0-9_]*Controller" "$f" | sed 's/export class //'); do
    n=$(grep -rl "\b$cls\b" --include=*.module.ts . | wc -l)
    [ "$n" -eq 0 ] && echo "UNREGISTERED|$cls|$f"
  done
done
```

**Bağlanmamış servis (module'de yok + tüketici yok):**

```bash
for f in $(find . -name "*.service.ts" ! -path "*/__tests__/*"); do
  for cls in $(grep -oE "export class [A-Za-z0-9_]*Service" "$f" | sed 's/export class //'); do
    nm=$(grep -rl "\b$cls\b" --include=*.module.ts . | wc -l)
    nu=$(grep -rl "\b$cls\b" --include=*.ts . | grep -vF "$f" | grep -v "__tests__\|\.spec\." | wc -l)
    [ "$nm" -eq 0 ] && [ "$nu" -eq 0 ] && echo "ORPHAN|$cls|$f"
  done
done
```

**Yöntem uyarısı:** ilk denemede `grep -oE "export class [A-Za-z0-9_]+" | head -1` kullanıldı ve
aynı dosyadaki DTO sınıflarını yakalayarak **4 yanlış pozitif** üretti
(`ClassifyDocumentDto`, `CheckLimitationDto`, `CheckAvailableLawsuitsDto`,
`GenerateTakipTalebiDto`). Sınıf adı `Controller`/`Service` ile bitecek şekilde daraltıldığında
liste 1 gerçek bulguya indi. Bu register'ı yeniden üreten her tarama aynı daraltmayı yapmalıdır.

## 2. Bulgular

| # | Anti-pattern | Artefakt | Sonuç |
|---|---|---|---|
| B-01 | **route exists but is never registered** | `ManifestAdminController` | 8 endpoint erişilemez — bkz. WRITTEN-BUT-NOT-OPERATIONAL §1.1 |
| B-02 | service exists but is never instantiated | `ManifestRetryMetricsService` | bağlı değil |
| B-03 | service exists but is never instantiated | `EvidenceAggregatorService` | bağlı değil |
| B-04 | service exists but is never instantiated | `HysteresisEscalationService` | bağlı değil |
| B-05 | service exists but is never instantiated | `TraceRetentionService` | bağlı değil |
| B-06 | service exists but is never instantiated | `JtiAnomalyDetectorService` | bağlı değil |
| B-07 | code exists but is never imported (kasıtlı) | `HumanClaimItemFormationAdmissionService` | `O08` — canonical DORMANT |
| B-08 | code exists but is never imported (kasıtlı) | `TransactionalClaimItemFormationFinalizerService` | `O08` — canonical DORMANT |
| B-09 | deprecated implementation still present | `SnapshotCleanupService` | `O13` — kendi `@deprecated` etiketi |

## 3. Taranan ve TEMİZ çıkan yüzeyler

| Yüzey | Yöntem | Sonuç |
|---|---|---|
| Controller registration | yukarıdaki tarama | **1** bulgu (B-01); diğer tüm controller'lar register |
| Scheduler / cron registration | `grep -rn "@Cron(\|@Interval(\|@Timeout("` | 20+ `@Cron` bulundu, hepsi register edilmiş servis sınıflarında (`automation`, `address-task`, `escalation`, `error-log/retention`, `exchange-rate`, `greeting`, `icrabot/scheduler`) — **yetim scheduler YOK** |
| Module import zinciri | orphan-service taraması | test double'lar hariç 6 bulgu (B-02..B-06 + B-09) |
| Route prefix çakışması / kayıp prefix | `grep -rn "admin/manifest"` | B-01 dışında kayıp prefix YOK |
| Governance path referansları | 136 yol varlık testi | **0 ghost** — bkz. `PROGRAM-WIDE-GHOST-REFERENCE-REGISTER-R01.md` |

## 4. Taranamayan yüzeyler — açıkça beyan

Aşağıdaki yüzeyler bu oturumda **doğrulanmamıştır**; "temiz" olarak raporlanmaları yanıltıcı olurdu:

```text
deployment manifests / service definitions   : deployment erişimi yok
production configuration                     : .env veya production credential OKUNMADI
queue consumers (gerçek dispatch var mı)     : çalışan runtime yok, statik analiz consumer'ın
                                               gerçekten mesaj aldığını kanıtlamaz
UI navigation exposure                        : web tarafı statik analizi bu turda yapılmadı
API client bindings (frontend→backend)        : aynı
restart/reload sonrası erişilebilirlik        : servis restart edilmedi
```

Bu boşluklar `PROGRAM-WIDE-OPERATIONAL-VERIFICATION-REGISTER-R01.md` §3'te
`VERIFICATION NOT PERFORMED` olarak kayıtlıdır.

## 5. Hiçbir binding onarılmadı — gerekçe

```text
RUNTIME BINDINGS REPAIRED: 0
```

B-01 (tek gerçek, yüksek etkili binding boşluğu) için otomatik aktivasyon şartları
**sağlanmamaktadır** (ADDENDUM §H):

```text
"security boundary would be weakened"           → 8 admin endpoint'i (DLQ redrive/resolve dahil)
                                                   canlı HTTP yüzeyine eklemek saldırı yüzeyini
                                                   genişletir
"new user-visible behavior choice required"     → admin API'nin açılıp açılmayacağı ürün kararı
"existing canonical authority permits activation" → BU ŞART SAĞLANMIYOR: repository'de bu
                                                   controller'ın register edilmesini yetkilendiren
                                                   hiçbir canonical kayıt bulunamadı
```

B-02..B-06 aynı alt sistemin parçalarıdır ve B-01 kararına bağlıdır.
B-07/B-08 canonical olarak dormant'tır. B-09 emeklidir ve silme yetkisi bu programda yoktur.

`MERGEABLE != MERGE_ELIGIBLE` ilkesinin runtime karşılığı burada uygulanmıştır:
**"kod hazır ve testi geçiyor" bağlama yetkisi üretmez.**
