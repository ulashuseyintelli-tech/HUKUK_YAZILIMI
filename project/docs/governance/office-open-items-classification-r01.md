# OFFICE — C123 sonrası kalan dört kalemin sınıflandırması (R01, 2026-09-23)

> Bu belge **yeni analiz değildir**. `product-backlog.md` ve `C123-LIVE-RECORD-R01.md` içindeki mevcut kayıtlardan
> derlenmiştir; her satırın kaynağı verilmiştir. Kanıtı olmayan alan **belirsiz** yazılmıştır.
> Bir kalem yalnız bu listede bulunduğu için ne zorunlu teslim işi ne de önemsiz backlog sayılır.

| Kalem | Somut eksik | Ana plan dayanağı (kaynak) | Ürün etkisi | Teslimi engeller mi | Kapanış ölçütü | Sorumlusu |
|---|---|---|---|---|---|---|
| **Dört açık spec** | `apps/api/src` altındaki 1177 spec'ten 4'ü hiçbir CI manifestine bağlı değil, CI'da hiç koşmuyor: `object-store.write-once.integration.spec.ts`, `playbook.golden.spec.ts`, `interest-engine/__tests__/operational.spec.ts`, `ocr/__tests__/poppler-page-renderer.spec.ts` | `product-backlog.md:4348` (envanter 1177 / seçili 1173 / **açık 4**); kök nedenler `:4233`, `:4235`, `:4236`, `:4238` | **Kayıtta yok.** Kayıt "ürün/fixture/mock/beklenti DEĞİŞTİRİLMEDİ" der (`:4222`). CI güvenilirliği riski var: MinIO erişilemezse ilgili spec **vakum PASS** verir (`:4233`) | **Teslim engeli olduğuna dair kanıt yok; ürün etkisi belirsiz.** Kayıtta ürün etkisi ölçülmemiştir | Açık sayısı 0 (`:4219`, `:4249`) ve her satırın kendi dar onarımı: MinIO servisi ya da describe kapısı · `it.todo` tamamla/kaldır · koşullu skip kabulü · sıra bağımlılığında öncül kümesini bul | Adlandırılmış kişi **yok**; bağlama kararı owner'da (`:4222`) |
| **ADR-014 kablolaması** | `src/scripts/adr014-local-shadow-evidence-runner.ts:266` kökü en az üç global modülü (`ErrorLogModule`, `StorageModule`, `ConfigModule`) import etmediği için bu HEAD'de uygulama bağlamını kuramıyor (DI_FAIL); eksik listenin tamamı belirlenmedi | `product-backlog.md:4254` (karşı-hipotez ölçümü), `:4268` ("AYRI AÇIK KAYIT — KORUNUR … ÜRÜN kodu; ayrı GO") | Kayıt sınıfı "ÜRÜN kodu". Ancak etkilenen şey `src/scripts/` altındaki yerel gölge-kanıt koşucusudur; **kullanıcıya ya da çalışan servise etki kanıtı kayıtta yok** ve "canlıda/yerelde son ne zaman koşturulduğu doğrulanamadı" (`:4254`) | **Teslim engeli olduğuna dair kanıt yok; ürün etkisi belirsiz.** Kayıt "ÜRÜN kodu" diyor ama kullanıcı/servis etkisi ölçülmemiş | **Belirsiz.** Kayıtta sayısal ölçüt yok; ima edilen ön koşul eksik global listesinin tamamlanması, sonra ayrı GO | Adlandırılmış kişi **yok**; owner GO'su |
| **forceExit** | `pure/platform-scripts-shared` (481 spec) `--forceExit` verilmeden yerelde koşulduğunda testler PASS ediyor (481/481 suite, 6500 PASS) ama **Jest süreci kapanmıyor**; neden bilinmiyor | `product-backlog.md:4296` | **Kayıtta yok.** "Resmî runner `--forceExit` kullandığı için CI kapanışı bundan etkilenmez"; kayıt yalnız olasılık olarak "bir spec'in kaynak sızdırdığını gösterebilir" der — kanıt yok | **Teslim engeli olduğuna dair kanıt yok; ürün etkisi belirsiz.** Kök neden bilinmiyor, kaynak sızıntısı olasılığı kayıtta açık bırakılmış | **Kısmen belirsiz.** Sayısal ölçüt yok; kayıtlı ön koşul: açık-handle taramasının **tam manifestte** yapılması (tek dosyada 0 çıkmıştı). Geniş tanı owner talimatıyla başlatılmadı | Adlandırılmış kişi **yok**; ayrı GO |
| **Süre riski** — ~~açık~~ **KAPANDI** | CI `test-suite` job'ının süresi 20 dk `timeout-minutes` bütçesine 0,7 dk kalmıştı (main 19,3 dk). S2 sonrası ölçümle giderildi | `product-backlog.md:4336` (risk kaydı), ölçüm `:4335` (PR 16,7 dk · main 19,3 dk; 8 manifest %81), sonraki ölçüm `:4350` (13 dk 29 sn, run `35738482272`) | **Kayıtta yok.** CI bütçesi kalemi, ürün davranışı değil | **Teslim engeli olduğuna dair kanıt yok**; ürün etkisi kayıtta yok. Bütçe aşılırsa CI kapanışını bloke eder | **KARŞILANDI — kalem KAPANDI (2026-09-23, #2769).** Kapanış ölçütünün üç şartı da ölçüldü: `ci.yml` sha256 = hedef `E248BF02…`; fazla satır 11 → 1 (CI run `35792192750`, 1174 PASS satırı, benzersiz 1173); **S2 sonrası Test Suite süresi 14 dk 22 sn**, 20 dk bütçesine **5 dk 38 sn** pay. Ölçüm main `9214597b`'ye aittir; yeni CI koşusu yapılmadı. Kaynak: `product-backlog.md` "#2737 S2 TAMAMLANDI + SURE RISKI KAPANDI" paragrafı | Adlandırılmış kişi **yok**; owner kararı, zincir yürütücüsü Codex |

## Belirsiz bırakılanlar

- `C123-LIVE-RECORD-R01.md:5` satırındaki "ADR-014 kablolaması" ifadesinin `product-backlog.md:4268` DI kaydını mı,
  yoksa `:4352`'deki "ci.yml'de manifestte de bulunan 25 doğrudan yol" gözlemini mi işaret ettiği kayıtta yazmıyor.
  Daha güçlü aday `:4268`'dir, çünkü orası "AYRI AÇIK KAYIT — KORUNUR" diye işaretlenmiştir.
- ADR-014 DI boşluğunun hangi karar kaydına dayandığı; kayıt yalnız runner'ın kökenini #1159 (2026-07-17) olarak verir.
- ADR-014 ve forceExit kalemlerinin sayısal kapanış ölçütü.
- Dört kalemin hiçbirinde adlandırılmış sorumlu yoktur; hepsi owner kararına bağlıdır.

## Sonuç

**Güncelleme (2026-09-23): süre riski kalemi KAPANDI** (#2769; ayrıntı tabloda). Kalan üçünde **teslim engeli
olduğuna dair kanıt yoktur; ürün etkileri belirsizdir** — hiçbirinde kullanıcıya ya da
çalışan servise etki ÖLÇÜLMEMİŞTİR. "Etki ölçülmedi" ile "etki yok" aynı şey değildir ve bu kayıt ikincisini iddia
etmez. Hiçbiri "önemsiz backlog" da sayılmaz: dört spec CI kapsam açığıdır ve biri sahte yeşil üretebilir; süre riski
**bu turda kapandı** (#2769; S2 sonrası 14 dk 22 sn, 5 dk 38 sn pay); ADR-014 runner'ı bu HEAD'de hiç çalışmamaktadır.

Bu kayıt bir sınıflandırma düzeltmesidir; yeni analiz açmaz ve personel daveti işine bağımlılık getirmez.
