# CLIENT İ15 — H8 F04 KABULÜ: İ5(b) UYGULAMASI + KABUL-5 CANLI PAKETİ (R01)

**Kanonik bağ:** R02 §3.3 İ15 ve owner kararı İ5 = (b) (#2711 @ `3d927a55`).
- **İ15'in kapsamı:** "H8 F04 kabulü: KABUL-5 canlı koşum (iki sentetik tenant; çapraz post reddi + hedefte iz 0) + İ5 kararının uygulanması".
- **Kapanış koşulu:** "KABUL-5 PASS; kalan yedi için seçilen kanıt yöntemi kayıtlı ve uygulanmış".
- **Sınır:** KABUL-A2 yeniden koşulmaz; #2549 kabulü korunur. İ5a açılmaz.

Bu belgede üç kanıt **ayrı** tutulur. Hiçbiri "canlı yarış testi PASS" olarak sunulmaz.

| # | Kanıt | Durum |
|---|---|---|
| **1** | Yedi senaryonun testi. Canlı R24'ün doğrulanmış kaynak SHA'sında, ayrı PostgreSQL'de koşuldu. | **TAMAM** · 10/10 |
| **2** | Canlıda salt-okuma tutarlılık taraması | **TAMAM** · ihlal izi yok (atıflı 4 bulgu, §2.3) |
| **3** | KABUL-5 canlı koşum | **HAZIR PAKET.** Ayrı owner GO ister (§3). |

---

## 1. İ5(b) — TEST KANITI (canlı R24 kaynak SHA'sında)

| Öğe | Değer |
|---|---|
| Kaynak | `006c4dd2928f6c719669cc17b3b61f6ce3e2bc89`. R24 kaydında (#2704 @ `fe55fb41`) bu kaynaktan canlı dist `87712E0E…5453` üretildiği yazılıdır. Eski RELEASE20 (`08ce8e25`) PASS'ı **kullanılmadı**. |
| Ortam | detached worktree `HY_WT_I15_R24` · **gerçek** `pnpm install --frozen-lockfile` (node_modules junction DEĞİL, reparse=False) · `prisma generate` |
| DB | ayrı disposable PostgreSQL `postgres:16-alpine` · `127.0.0.1:5443/hukuk_i15_f04_test` · 130 migration `006c4dd2`'nin kendi CLI'siyle uygulandı · 210 tablo |
| Spec | `apps/api/src/modules/client-settlement/__tests__/f04-posting-reversal-race.db-gated.integration.spec.ts` · sha256 `28E81DCB0F616B1E50C3B73E5E7F0A5FA6A4C9DA7A80F3F0D39849CED0EC81E0` |
| Komut | `TEST_DATABASE_URL=<disposable> CI=true pnpm exec jest --runInBand` (CI=true ⇒ DB yoksa spec **atlanamaz**, hata verir) |
| Sonuç | **10/10 PASS**, jest rc=0. Yedi senaryo PASS: KABUL-1 · 2 · 3 · 4 · A · B · D. Aynı spec'teki KABUL-A2 · C · 5 de PASS. |

**Kanıt sınırı (lafız korunur):**
- Spec sıralamayı `jest.spyOn` bariyeriyle **belirlenimci** kurar. **Serbest yarış üretmez.**
- KABUL-A ve KABUL-D gerçek kilit beklemesi ölçer.
- KABUL-1, 2, 3, 4 ve B sıralı ya da hata enjeksiyonludur.
- Test TS kaynağını koşar. Dist'in bu kaynaktan üretildiğinin dayanağı R24 kaydıdır.

## 2. İ5(b) — CANLI SALT-OKUMA TUTARLILIK TARAMASI

**Betik:** `scripts/i15-f04-consistency-scan.js`.
- `SET TRANSACTION READ ONLY` içinde çalışır ve yalnız sayım döner. PII, tutar ya da kimlik yazdırmaz.
- Sorgu hatası ÖLÇÜLEMEYEN sayılır, 0 olarak yorumlanmaz.

### 2.1 Tarama kör değil — disposable doğrulama
F04 spec'inin bıraktığı disposable veride (12 dağıtım) tarama **ihlal 0** verdi. Ardından kasıtlı bozma denendi:
- POSTED dağıtım stornosuz REVERSED yapıldı → `SCAN-2/4=2` yakalandı.
- Journal satırı dengesizleştirildi → `SCAN-B1=1` yakalandı.
- İkisi de geri alındı → tarama yeniden temiz çıktı.

### 2.2 Canlı sonuç (2026-09-18T20:26Z · tenant'lar arası tüm veri · 16 dağıtım)

| Denetim | Senaryo | İhlal |
|---|---|---|
| SCAN-A: iptal edilmiş tahsilatta terslenmemiş posted journal | KABUL-A | 0 |
| SCAN-1: iptalden sonra post edilen dağıtım | KABUL-1 | 0 |
| SCAN-2/4: REVERSED/CANCELLED dağıtımda terslenmemiş posted journal | KABUL-2 · 4 | 0 |
| SCAN-3a/3b: REVERSAL > APPLY · çift REVERSAL | KABUL-3 | 0 · 0 |
| SCAN-B1/B2: dengesiz journal · post edilmemiş dağıtımda öksüz iz | KABUL-B | 0 · 0 |
| SCAN-B3: POSTED dağıtımda posted journal'ı olmayan satır | KABUL-B | **4 (atıflı, §2.3)** |
| SCAN-D1/D2: satır başına çift ledger · çift posted journal | KABUL-D | 0 · 0 |

`pg_stat_database.deadlocks` = 0. Bu kümülatif bir sayaçtır, kaynağa atfedilemez; yalnız bilgi amaçlıdır.

### 2.3 SCAN-B3 bulgularının atfı (salt-okuma)
Bu bulgular KABUL-B'nin tanımladığı **transaction içi yarım yazım** değildir:
- **3 satır — gerçek tenant, `postedAt` 2026-06-29.** Canlıdaki ilk `COLLECTION_DISPOSITION_LINE` journal'ı **2026-08-07** tarihlidir. Bu satırlar journal mekanizmasından **önce** post edilmiş eski kayıtlardır.
  - **Ayrı bir veri bütünlüğü gözlemi olarak kaydedilir.** Kapsamı genişletmez (R02 §9); geriye dönük doldurma yapılıp yapılmayacağı owner kararıdır. **Hiçbir yazma yapılmadı.**
- **1 satır — sentetik `ah-` tenant.** İ12 canlı kurulumunun G7 için doğrudan DB'ye yazdığı POSTED fixture'dır (`postedAt` 2026-08-15, `postedById` boş). Tenant kapalıdır.

**Kanıt sınırı (lafız korunur):** "İhlal izi bulunmadı" sonucu **canlı eşzamanlılık ispatı DEĞİLDİR.** Tarama yalnız kalıcı sonuç durumunun tutarlı olduğunu gösterir. Yarışın canlıda hiç yaşanmamış olmasından ayırt edilemez.

**KABUL-C dolaylı kanıttır:**
- Spec PostgreSQL'in kilit semantiğini ham SQL ile ölçer, posting servisini ölçmez.
- Canlıda kilit modu davranışı **ölçülmez**. Üretim kodundaki mod `FOR NO KEY UPDATE`'tir (`disposition-posting.service.ts`).
- A2 kabulü (#2549) bu davranışı yalnız dolaylı olarak kapsar.

Kanıt dizini `Documents\CLIENT-EVIDENCE-20260911\i15-f04-i5b-20260918T202635Z\` altındadır. İçeriği: canlı tarama JSON'u, B3 atfı ve spec koşum günlüğü.

## 3. KABUL-5 — CANLI KOŞUM PAKETİ (ayrı owner GO)

**Betik:** `scripts/i15-kabul5-run.js`. Mevcut F04 paketini kullanır:
- `f04-01-setup.js`: İ5b onarımlı kurulum.
- `f04-09-close-access.js`: runId ile nihai kapanış.

**Sıkılaştırma:** `f04-05` çapraz tenant reddini `status >= 400` ile kabul ediyordu; bu 500'ü de PASS sayardı. Burada **yalnız 403 ya da 404** kabul edilir; İ3 dersi.

**Koşum sırası:**
1. İki `f04-acc-<runId>` tenant kurulur, her biri 11 satır.
2. A aktörüyle B'nin dağıtımına `POST /collection-dispositions/:id/post` denenir.
3. Beklenen: 403 ya da 404. B'de durum, postedAt, journal, APPLY, ledger ve audit **değişmez**.
4. `finally` her iki tenant için kapanış yapar: `f04-09` (kullanıcı pasif + tokenVersion++) ve Case CLOSED.
5. Kapanış doğrulanır: login 401, eski token 401.
6. Sentetik olmayan tenant'ların client/user/dağılım-durum parmak izinin değişmediği doğrulanır.

**Posting yapılmaz.** Hiçbir dağıtım post edilmez, bu yüzden finansal yazma yoktur.

**Canlı yazma envanteri:**
- 2 × 11 kurulum satırı (Tenant · User ADMIN · Lawyer PARTNER · Client · Case · CaseClient · Collection 100 TRY CONFIRMED · ExpenseRequest · OfficeApprovalRequest APPROVED · CollectionDisposition DISTRIBUTION_APPROVED · 1 satır).
- Kapanış: iki tenant'ta User `isActive`/`tokenVersion` ve Case CLOSED.
- DELETE yok. Geri alınamaz kayıt yok (timeline yazılmaz).

**Disposable prova** (canlı R24 dist, `:8113`, API yalnız disposable DB'ye bağlı):

| Senaryo | Sonuç |
|---|---|
| **N** normal akış | **5/5 PASS**: K5-0 ön koşul · **K5-1 HTTP 404** "Dağıtım kaydı bulunamadı" · K5-2 B'de iz 0 (journal/apps/ledger/audit 0→0) · K5-CLOSE login 401, me 401 · K5-ISO eşit |
| NC1a–c kapılar | onay yok → 3 · İ14 biçimli GO ref → 3 · API beyanı farklı → 4 · tenant sayısı değişmedi (27→27) |
| NC2 kurulumdan sonra çöküş (API'ye ulaşılamaz) | çıkış 1 · `finally` iki tenant'ı da kapattı (aktif kullanıcı 0, ACTIVE case 0) |

**Paket digest:** `E80EBD3C90849E1169D57E7F10A140FD341DEE09D785DE799FD20A8CDFF3C907`

| Dosya | sha256 |
|---|---|
| `i15-kabul5-run.js` | `85B9A691…2DBC` |
| `f04-lib.js` | `1D354295…5CA8` |
| `f04-01-setup.js` | `AB3FF27C…C25A` |
| `f04-09-close-access.js` | `4148FFAB…D712` |

**Owner eylemi:**
- Yeni GO ref: `OWNER-GO-CLIENT-I15-YYYYMMDD-RNN`.
- `scripts/i15-owner-live-block.ps1` bloğunu **normal** PowerShell'de çalıştırın; yönetici gerekmez.
- Blok şu kapıları doğrular: main, paket digest, dist `87712E0E…5453`, tek API, açık pencere yok, DB kimliği. Ardından GO ref yerel girilir, koşum yapılır, GO ref tüketimi sha256 olarak kaydedilir ve manifest yazılır.

**İ15 KAPANIŞ ÖLÇÜTÜ:**
- KABUL-5 canlı koşumu **5/5 PASS**: FAIL 0, ÖLÇÜLEMEYEN 0.
- CLIENT bağımsız doğrulama PASS.
- §1 ve §2 kayıtlı (İ5(b) uygulandı).
- Kayıt PR'ı → CI → merge → post-merge CI SUCCESS.

**Hizmet kabulü (H8) owner kabulü olmadan değişmez.**
