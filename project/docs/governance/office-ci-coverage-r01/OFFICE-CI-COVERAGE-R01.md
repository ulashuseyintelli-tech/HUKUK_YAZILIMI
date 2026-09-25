# OFFICE — Dört spec'in resmî CI kapsamı (R01, 2026-09-25)

Owner GO "OFFICE — KALAN CI KAPSAMINI TAMAMLA". Dört spec düzeltmesi yeniden açılmadı; bu belge
yalnız CI seçimi ve gerçek dış bağımlılık çalışmasını ayrı durumlar olarak kaydeder.

## 1. Üç ayrı durum

"Test kusuru kapandı", "CI seçiyor" ve "gerçek dış bağımlılık CI'da çalışıyor" birbirinin yerine
geçmez.

| Spec | Test kusuru | CI seçimi | CI'da çalışan / SKIP | Gerçek dış bağımlılık CI'da | Gerçek bağımlılık kanıtı (CI dışı) |
|---|---|---|---|---|---|
| `playbook.golden.spec.ts` | Kapandı (#2781) | EVET (#2783) | 12 çalışıyor, 0 SKIP | Dış bağımlılık yok | — |
| `poppler-page-renderer.spec.ts` | Kapandı (#2785) | EVET (#2785) | 12 çalışıyor, **1 SKIP** (gerçek render) | **HAYIR** — §4 | Yerel Windows, `RUN_POPPLER_INTEGRATION=1`: 13/13 + negatif kontrol (#2785) |
| `operational.spec.ts` | Kapandı (#2779) | **EVET (bu PR)** | 20 çalışıyor, 0 SKIP | Dış bağımlılık yok | — |
| `object-store.write-once.integration.spec.ts` | Kapandı (#2777) | **EVET (bu PR)** | Bu PR'dan sonra: 7 test **görünür SKIP** | **HAYIR** — `ci.yml` değişikliği gerekiyor (§3) | Resmî runner + CI'daki komutun birebiri olan geçici MinIO: 7/7 PASS (§2) |

Kaynaklar: `2196e911` ve `cd37460f` main CI Test Suite logları (yeni genel test turu başlatılmadı);
bu PR için resmî runner'ın (`apps/api/scripts/run-ci-manifest.sh pure/platform-scripts-shared`)
yerel koşumları.

**CI logundan fark kanıtı (Poppler):** `2196e911 → cd37460f` arasında `platform-scripts-shared`
484→485 spec, `passed` 6525→6537 (+12), `skipped` 1→2 (+1). Bu, Poppler spec'inin 12 testinin
çalıştığını ve 1 gerçek-render testinin CI'da SKIP olduğunu tam olarak gösteriyor. CI logu
`--verbose` olmadığı için test adlarını basmıyor; ayrım, sayı farkı ve kaynaktaki `it.skip` koşuluyla
(`RUN_POPPLER_INTEGRATION` CI'da tanımlı değil) yapıldı.

## 2. Bu PR'ın yerel doğrulaması (resmî runner, bayraklar değişmedi)

| Koşum | Sonuç |
|---|---|
| A — MinIO yok (bu PR merge olunca CI'ın durumu) | `487 spec` · `1 skipped, 486 passed, 486 of 487 total` suite · `9 skipped, 6557 passed, 6566 total` · çıkış 0 |
| B — geçici MinIO, `ci.yml` için önerilen komutun birebiri | `487 passed, 487 total` · `2 skipped, 6564 passed, 6566 total` · object-store entegrasyonu PASS (7.34 s) · çıkış 0 |
| Negatif — `MINIO_TEST_ENDPOINT` verilmiş, MinIO yok | Tek spec, çıkış 1, "zorunlu bağımlılık … sessizce atlanmaz" hatası |

Hesap: A'da 9 SKIP = önceden var olan 2 + object-store'un 7'si. `6557 − 6537 = 20` = `operational.spec.ts`.
B'de `6564 − 6557 = 7` = object-store'un 7 testi gerçekten çalıştı ve SKIP 2'ye döndü.

B'deki MinIO paylaşılan `hukuk-minio` değildi: port 19000'de, digest'le sabitlenmiş imajdan açılan
geçici bir konteynerdi (`ci-minio-verify`). Kova elle oluşturulmadı; spec kendi kovasını kurdu ve
koşum sonunda sildi (koşum sonrası `/data` altında yalnız `.minio.sys` kaldı). Konteyner silindi.
`hukuk-minio` yeniden başlatılmadı.

**Spec değişikliği (yalnız test):** `beforeAll` önce `HeadBucket`, kova yoksa `CreateBucket` yapar.
`afterAll` yalnız bu koşumun oluşturduğu kovayı siler; önceden var olan kovaya dokunmaz. Yeni
bağımlılık yok (`@aws-sdk/client-s3` zaten doğrudan bağımlılık). Bu sayede CI tarafında yalnız
"MinIO'yu başlat + uç noktayı ver" yeterli olur, ayrı kova adımı gerekmez.

## 3. ENGELLİ: CI'da gerçek MinIO — `ci.yml` (CODEX_LOCAL)

`.github/workflows/ci.yml`, `governance-writer-coordination-protected-paths.json` →
`coordinationControlPlane` listesinde; PRIMARY_EXECUTOR `CODEX_LOCAL`. Önceki `ci.yml` istekleri
(#2751, #2761) `codex/*` dallarından açılmış ve kontrol düzlemi dosyası olan
`governance-writer-coordination-register.md`'yi de değiştirmiştir. Bu oturum isteği kendisi açarsa
kendine yetki vermiş olur. **Bu kısım açık bırakıldı.**

`services:` MinIO'nun gerektirdiği `server /data` komutunu veremediği için `docker run` adımı
öneriliyor. **Uygulanmamış önerilen diff** (`test-suite` job'ı):

```diff
+      # Object-store write-once entegrasyonu icin gecici MinIO. services: bloku MinIO'nun
+      # `server /data` komutunu veremedigi icin docker run adimi; imaj digest ile sabit.
+      - name: Start disposable MinIO (object-store integration)
+        run: |
+          docker run -d --name ci-minio -p 9000:9000 \
+            -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
+            minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e server /data
+          for i in $(seq 1 30); do
+            curl -sf http://localhost:9000/minio/health/live >/dev/null && exit 0
+            sleep 2
+          done
+          echo "MinIO did not become healthy"; exit 1
       # Spec listesi: project/apps/api/ci-manifests/pure/platform-scripts-shared.txt
       # (ci.yml control-plane; manifest dosyasi degil — spec eklemek binding istemez)
       - name: pure/platform-scripts-shared
+        env:
+          MINIO_TEST_ENDPOINT: http://localhost:9000
         run: bash apps/api/scripts/run-ci-manifest.sh pure/platform-scripts-shared
         working-directory: project
```

- **Doğrulama:** CI logunda `platform-scripts-shared` için `skipped` 9 → 2 ve `passed` +7 olmalı,
  `Test Suites: 487 passed, 487 total` görünmeli (§2, B koşumunun karşılığı).
- **Hata davranışı:** İmaj çekilemezse veya MinIO sağlıklı olmazsa adım FAIL eder. MinIO açılıp
  sonra erişilemezse spec FAIL eder. Hiçbir durumda sessiz PASS yok.
- **Maliyet:** Yeni Jest süreci yok (CI-8 bütçesi değişmez). Bir imaj çekme + başlatma adımı eklenir;
  B'de object-store spec'i 7.34 s sürdü.
- **Geri alma:** İki hunk geri alınır. Spec görünür SKIP'e döner (A durumu); yanlış PASS mümkün değil.
- **CODEX'e not:** `ci.yml`'yi okuyan statik guard'lar varsa (ör. adım sayısı/adı) bu diff onları
  etkileyebilir; bu oturum `ci.yml`'ye dokunmadığı için o kontrolü yapamaz.

## 4. ENGELLİ: CI'da gerçek Poppler render

- CI platformu `ubuntu-latest`. Üretim renderer'ı `pdf-poppler@0.2.3` kullanıyor; paketin
  `index.js`'i `darwin`/`win32` dışındaki platformda **require anında `process.exit(1)`** veriyor.
  Bu nedenle mevcut CI platformunda mevcut bağımlılıkla gerçek render yolu **yok**. Spec'in
  CI'da güvenli olmasının tek nedeni gerçek render'ın `RUN_POPPLER_INTEGRATION` arkasında olması
  (dosya modül yüklemesinde `pdf-poppler`'ı require etmiyor).
- **Yerel PASS ≠ CI SKIP:** Gerçek render kanıtı yalnız yerel Windows koşumundan geliyor (#2785).
  CI'da bu test SKIP; CI kanıtı değil.
- Seçenekler (hiçbiri uygulanmadı):
  1. `windows-latest` üzerinde yalnız bu spec'i `RUN_POPPLER_INTEGRATION=1` ile koşan küçük bir job.
     `ci.yml` değişikliği (CODEX_LOCAL). Yeni Jest süreci (CI-8 bütçesi) ve Windows runner dakikası
     ekler.
  2. Renderer'ı `pdf-poppler` yerine doğrudan `pdftoppm` çağıracak şekilde değiştirmek ve CI'a
     `poppler-utils` kurmak. Ürün kodu + `ci.yml` değişikliği; ürün kararı gerekir.

## 5. Kayıt düzeltmeleri

- **Object-store "CI'da SKIPPED görünür" ifadesi yanlıştı.** #2777 kapanış raporunda bu oturum,
  spec'in CI'da SKIP görüneceğini söyledi. Spec hiçbir manifestte yoktu; CI'da ne PASS ne SKIP
  olarak koşuyordu. Bu PR'la ilk kez seçiliyor ve CI'da görünür SKIP oluyor. `cd37460f` CI logunda
  görünen `object-store.write-once.spec.ts` başka bir dosyadır (mock'lu birim testi).
- **"Owner kararı" ifadesi yanlıştı.** `product-backlog.md` #9 satırı, DÜZELTME/DÜZELTME 2 ve
  "DÖRT AÇIK KALEM DURUMU" satırlarında object-store ve operational için bağlamanın "ayrı owner
  kararı" olduğu yazıldı. Bu oturumun raporunda da "önceki turlarda kaydedilmiş owner kararları"
  dendi. Kayıtta böyle bir owner kararı **yok**. Bunlar bu oturumun kendi kapsam içinde bıraktığı
  ertelemelerdi; owner tarafından kabul edilmedi.

## 6. Kapsam dışı

Genel OFFICE kapanışı veya hizmet kabulü ilan edilmez. Tam disk temizliği ilan edilmez; önceki
worktree disk artıkları (OBJSTORE, INTOP, PBGOLD, PBBIND, POPPLER) korunur. `ci.yml`, paylaşılan
`hukuk-minio`, üretim verisi ve sistem kurulumlarına dokunulmadı. CLIENT işleri etkilenmedi.


## 7. R02 — Gerçek CI entegrasyonu (2026-09-25)

Bu ek §3–§4'teki uygulanmamış önerinin dar uygulama kaydıdır; tarihsel yerel
kanıtları değiştirmez. Owner GO: CI'da gerçek MinIO + Windows Poppler; ayrı
request/grant/execution/result zinciri OFFICE-CI-REAL altında izlenir.

- Sekiz manifest ve dört spec'in dosya seçimi değişmez. Linux Test Suite içindeki
  platform manifesti koşuma özel MinIO konteyneri, kova ve geçici kimlik bilgileri
  alır. İmaj tam digest'e sabittir; readiness süreli ve başarısızlık terminaldir.
  Cleanup always() ile yalnız koşum kimliği eşleşen konteyneri kaldırır; runner'ın
  zorla sonlandırılması halinde son sınır GitHub-hosted geçici VM'nin imhasıdır.
- Resmî manifest runner'ın isteğe bağlı JSON çıktısı seçim/bayrak/çıkış koşullarını
  değiştirmez. Sonuç okuyucu exact object-store suite'ini ve yedi test adının her
  birini PASS olarak arar; eksik/atlanan test veya yalnız toplam yeşil sonuç yetmez.
- Windows Poppler Integration aynı Node 20, pnpm 8.15.0 ve frozen lockfile ile
  pdf-poppler'ın kendi pdftocairo.exe dosyasını kullanır. Ek dağıtım yoktur.
  Mevcut renderer spec'i RUN_POPPLER_INTEGRATION=1 ile çalışır; 13/13 ve gerçek
  render adının PASS olması zorunludur. Linux'taki platforma bağlı atlama korunur.
- Mevcut zorunlu Architectural Guardrails kontrolü iki işin sonucunu always()
  altında denetler; failed/cancelled/skipped sonuçta FAIL verir. Branch protection
  değiştirilmez veya gevşetilmez. Bedel: bu kontrol iki işin bitmesini bekler.
  Linux'un 20 dakikalık sınırı korunur; Windows işi ayrı 20 dakika ile sınırlıdır.
- Jest çağrı bütçesine yalnız bir Windows süreci eklenir (8 → 9; mevcut sınır 18).
  Renderer, bağımlılık sürümleri, CLIENT canlı/DNS/H5 ve korunmuş disk artıkları
  kapsam dışındadır.

**Kabul kanıtı:** Bu yapılandırma kaydı tek başına CI PASS iddiası değildir.
PR ve merge SHA'sına ait Linux yedi assertion, Windows gerçek render assertion,
ayrı iş süreleri ve CI/CodeQL sonuçları immutable execution result ile kapanış
kanıtında raporlanır. Yerel registry hatası hosted CI erişim sonucu sayılmaz.
OFFICE genel finali veya H1–H8 hizmet kabulü üretilmez.
