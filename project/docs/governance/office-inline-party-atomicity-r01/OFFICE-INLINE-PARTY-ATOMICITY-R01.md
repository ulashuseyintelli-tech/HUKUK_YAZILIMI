# OFFICE — `POST /cases` DAR ATOMİKLİK YAMASI R01

**Owner GO:** 2026-09-12 "GO — OFFICE DAR ATOMİKLİK YAMASI / MAIN'E KADAR".
**Taban:** main `d199c8dc`. Önceki adım: `#2641 @ b9fd97a1` (sıra düzeltmesi + ofis oto-oluşturmanın tx içine alınması).
**Durum:** **CANLIDA DEĞİL.** Değişiklik main'de kalır; canlı yayın (RELEASE23) owner kararıyla BEKLETİLMİŞTİR.
Deploy / migration / restart / `.env` değişikliği YOK, canlı veritabanına yazma YOK, kabul tekrarı YOK.

Satır numaraları `project/apps/api/src/` altındandır.

---

## 1. İnceleme kaydı — ölçülen durum (yama ÖNCESİ)

### 1.1 Çağrı zinciri

```
POST /cases → CaseController.create (case.controller.ts:232) → CaseService.create (case.service.ts)
  ├ tx ÖNCESİ salt-okuma kapıları: caseStatus/subCategory · sorumluPersonel · responsible seçimi
  │                                 · fileNumber ön-benzersizlik · FK sahiplik (creditor/court/icra dairesi)
  ├ resolveInlinePartiesBeforeTx     ← ESKİ AD; gerçekten transaction ÖNCESİ çağrılıyordu
  │    ├ adım 0  AK-1a assertOfficeWriteRole + AK-2 assertCreateAuthorized   (YAZMA YOK)
  │    ├ adım 1  LawyerService.create   → KENDİ $transaction'ı
  │    ├ adım 2  ClientService.create   → KENDİ $transaction'ı
  │    └ adım 3  DebtorService.create   → transaction YOK (tek create + standalone audit)
  ├ validateDebtorOwnershipBeforeCreate (salt okuma)
  ├ ANA TRANSACTION (case + caseClient + caseLawyer + caseDebtor + due + staff + 2 domain event)
  └ tx SONRASI: audit log'lar · POA okumaları · bildirim · masraf/e-posta (fire-and-forget)
```

### 1.2 Transaction sınırları — **4 + N bağımsız transaction**

| # | Transaction | Yazmalar | Bağımsız commit |
|---|---|---|---|
| T1 | `LawyerService.create` | ofis al/oluştur · `lawyer.create` · `LAWYER_CREATE` audit | EVET (inline avukat başına) |
| T1′ | aynı servis, reaktivasyon dalı | koşullu `updateMany` · `LAWYER_REACTIVATE` audit | EVET |
| T2 | `ClientService.create` | `client.create` · `clientContact.createMany` ×2 · `clientAddress.createMany` · audit | EVET |
| T2′ | aynı servis, reaktivasyon dalı | koşullu `updateMany` · `CLIENT_REACTIVATE` audit | EVET |
| T3 | `DebtorService.create` | `debtor.create` (+ adres/mirasçı iç içe) · standalone `DEBTOR_CREATE` audit | EVET (tx'siz) |
| T4 | `CaseService.create` ana tx | dosya + bağ + vade + personel + 2 domain event | EVET |

**Süre sınırı (ölçüldü):** `prisma/prisma.service.ts` içinde `transactionOptions` eşleşmesi **0**; T4 çağrısı da seçenek geçmiyordu → Prisma varsayılanı **`maxWait 2000 ms` / `timeout 5000 ms`**.

### 1.3 Orphan envanteri (sonraki hatalarda kalan satırlar)

| Hata noktası | Kalıcılaşan satırlar |
|---|---|
| adım 0 yetki reddi | yok (fail-fast, `#2641`) |
| adım 1 sonrası, adım 2'de hata | `Lawyer` + (yeniyse) `Office` + `LAWYER_CREATE` audit |
| adım 2 sonrası, adım 3'te hata | yukarıdakiler + `Client` + `ClientContact`×N + `ClientAddress`×N + audit |
| borçlu/adres sahiplik reddi (404) | tüm taraf satırları |
| **ana tx'te hata** (P2002 TOCTOU, FK, domain event, **5 sn timeout**) | **tüm taraf satırları; dosya yok** |
| reaktivasyon dalı | pasif kayıt **AKTİF** kalır, geri alınmaz |

Kalan `Office` satırı canlı zamanlayıcıların tenant seçim kapısıdır (GreetingService, OperationalEscalationService);
kalan `Client` satırı D01 yetkisine tabi bir CLIENT mutasyonudur.

---

## 2. Uygulanan yama (4 servis + 1 ortak yardımcı)

### 2.1 Ortak sözleşme — `src/common/party-write-tx.ts` (YENİ)

`PartyWriteTxContext { tx, afterCommit }` · `partyDb(prisma, ctx)` · `runPartyWrite(prisma, ctx, fn)` ·
`createPartyWriteTxContext(tx)` · `runAfterCommitJobs(deferred, onError)`.

- `tx` **verildiğinde** servis kendi `$transaction`'ını **AÇMAZ** (Prisma iç içe interactive transaction desteklemez).
- `tx` **verilmediğinde** davranış **birebir eskisi gibidir** — `POST /lawyers`, `POST /clients`, `POST /debtors`, seed.
- Yazma yolundaki **ilgili okumalar** da aynı client'tan yapılır: aksi hâlde (a) henüz commit edilmemiş satır görülmez,
  (b) transaction sürerken havuzdan ikinci bağlantı istenir.
- `afterCommit` yalnız **mevcut commit-sonrası** işleri (görev senkronizasyonu) kuyruğa alır; bunlar transaction'a
  taşınmaz, dış transaction commit edilmezse **hiç çalışmaz**.

Desen repo-yerlidir: `tx ?? this.prisma` (client modülünde 5 yer), `Prisma.TransactionClient` parametresi 120 yer.

### 2.2 Servisler

| Dosya | Değişiklik |
|---|---|
| `modules/lawyer/lawyer.service.ts` | `create(..., txCtx?)`; iki `$transaction` → `runPartyWrite`; `findDuplicateLawyer` / `lawyer.aggregate` / reaktivasyon sonrası `findFirst` / yetki okumaları `db` üzerinden; `assertCreateAuthorized(..., txCtx?)` |
| `modules/client/client.service.ts` | `create(..., txCtx?)`; iki `$transaction` → `runPartyWrite`; rıza kapısı + dedup probe + `findOne` `db` üzerinden; görev senkronizasyonu `afterCommit`'e |
| `modules/debtor/debtor.service.ts` | `create(..., txCtx?)`; `debtor.create` + dedup `db` üzerinden; audit `txCtx` varsa `logInTransaction` (hata yutmaz), yoksa eski `log()`; görev senkronizasyonu `afterCommit`'e |
| `modules/case/case.service.ts` | `resolveInlinePartiesBeforeTx` → **`resolveInlinePartiesInTx`** (+`txCtx`), çağrısı ana `$transaction`'ın **ilk adımı**; `CASE_CREATE_TRANSACTION_OPTIONS`; commit sonrası `runAfterCommitJobs` |

**Borçlu/adres sahiplik guard'ı transaction DIŞINDA, resolve'dan ÖNCEye alındı.** Gerekçe ölçümle: `checkDuplicateInternal`
tenant-kapsamlıdır (`where: { tenantId, OR }`) ve resolve yalnız tenant-scoped create yapar → resolve SONRASI doğrulamanın
güvenlik katkısı yoktur. Böylece fail-fast korunur (mevcut `case-create-debtor-ownership.spec.ts` değişmeden geçer) ve
cross-tenant borçlu 404'ü artık **hiçbir taraf satırı yaratılmadan** verilir.

**Transaction'a TAŞINMAYANLAR (owner kısıtı):** `sendAutoRequestOnCaseCreate` (bildirim) · `createOpeningExpenseSet` +
`sendExpenseEmail` (e-posta) · POA okumaları · commit-sonrası 4 `auditService.log()` çağrısı · personel atama audit'i.
Ölçüm: üç taraf servisinde `mail|sendMail|nodemailer|http|axios|fetch(|fs.|writeFile` eşleşmesi **0/0/0**.

### 2.3 `maxWait` / `timeout` gerekçesi — **doğruluk çözümü DEĞİLDİR**

`CASE_CREATE_TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 20_000 }`.

- **Neden açık yazılıyor:** yamayla taraf yazmaları transaction'ın içine girdi (taraf başına ~5–9 ek gidiş-dönüş).
  Prisma varsayılanı 5 sn'dir ve aşılırsa transaction ROLLBACK olur — yani meşru bir dosya hiç açılmaz.
- **Atomikliği sağlayan şey ortak transaction'dır, süre sınırı değil.** Sınır yalnız meşru işin kesilmemesini sağlar;
  yarış ya da orphan sorununu çözmez.
- **Kilit davranışı:** kilitlenen satırlar bu dosya açılışına özgü YENİ satırlar (Case/CaseClient/CaseLawyer/Due/
  Lawyer/Client/Debtor) ve reaktivasyonda ilgili taraf satırıdır; sıcak paylaşımlı satır değildir. Tenant başına TEK olan
  `Office` satırı istisnadır: aynı tenant'ta iki dosya ilk kez ofis yaratmaya çalışırsa biri diğerini bekler (bu yeni
  değil — ofis yazması `#2641`'den beri transaction içindeydi), fakat bekleme artık dosya transaction'ı boyunca sürebilir.
- **Ölçülen gerçek süre:** gerçek PostgreSQL üzerinde başarılı dosya oluşturma **71 ms** (db-gated spec konsol çıktısı).
  Seçilen 20 sn sınırı bunun ~280 katıdır; sonsuz beklemeye izin vermez. Değer repodaki iki üretim örneğiyle aynıdır
  (`external-case-status-transition.service.ts`, `office-work-pool.mutation.service.ts`).

---

## 3. Doğrulama

### 3.1 Yeni testler

| Spec | Test | Kapsam |
|---|---|---|
| `case/__tests__/case-create-inline-party-atomicity.spec.ts` | 7 | ortak tx client'ı · iç içe tx YOK · açık süre sınırları · hatada commit-sonrası iş çalışmaz · başarı yolunda sıralama (taraf → case → tx döndü → afterCommit → audit → bildirim) · AK-1a/AK-2 reddi ilk adımda · sahiplik guard'ı tx açılmadan reddeder |
| `common/__tests__/party-write-tx-participation.spec.ts` | 8 | üç servis × {(A) txCtx verilince kendi tx'ini açmaz + okumalar ortak client'tan + commit-sonrası iş ertelenir, (B) txCtx yokken birebir eski davranış} + avukat reaktivasyon dalı |
| `case/__tests__/case-create-inline-party-atomicity.db-gated.integration.spec.ts` | 4 | **gerçek PostgreSQL** |

### 3.2 Gerçek geri alma (disposable PostgreSQL, `postgres:16-alpine`, ayrı konteyner/port 5439)

Hata enjeksiyonu: `domainEventIngest.appendInTransaction` (tx adım 8.5) — tüm taraf yazmalarından ve `case.create`'ten
SONRA gelen gerçek bir transaction-içi hata noktası.

| Test | Sonuç |
|---|---|
| Sonraki hata → yeni avukat/ofis/müvekkil/iletişim/adres/audit satırı | **hepsi 0** (sayaçlar hata öncesiyle birebir) |
| Sonraki hata → reaktive edilmiş avukat | **pasife DÖNDÜ**, `LAWYER_REACTIVATE` audit'i **yok** |
| Başarı yolu | dosya 1 · avukat 1 · müvekkil 1 · ofis 1 · audit > 0; süre **71 ms** |
| Bağımsız `LawyerService.create` (txCtx YOK) | kendi transaction'ında **kalıcı** yazar (ofis + audit dahil) |

**RED koşusu (testin diş taşıdığının kanıtı):** aynı spec yamasız kodda koşuldu → **iki geri alma testi DÜŞTÜ**
(orphan satırlar kaldı; reaktive avukat `isActive: true` kaldı), **korunan davranış iki testi ise GEÇTİ** — yani yama
davranışı yalnız hedeflenen yerde değiştiriyor.

### 3.3 Regresyon ve tip

- `lawyer + client + case + office + debtor` modülleri: **279 suite / 3972 test PASS**.
  Tek kalan hata `debtor-scoring.module-registration.spec.ts` (Nest DI) — **yamasız main'de de düşüyor**, bu yamayla ilgisiz.
- `tsc --noEmit`: aynı worktree'de yama öncesi **529** → yama sonrası **529**; yeni hata **0**
  (tek fark tsc'nin union üye sıralaması — bilinen gürültü).
- Mevcut spec güncellemeleri:
  - `client-service-boundary-actor-threading-r1` ve `client-address-mutation-authorization-r2` **statik sözleşme guard'ları**:
    `actor` artık son parametre olmadığı için kalıp `\s*[,)]` ile biter. **Korunan şart aynı**: `actor` ZORUNLU
    (`actor?:` yasağı yerinde) ve **yeni iddia eklendi** — `txCtx?: PartyWriteTxContext` aktörden SONRA gelir ve opsiyoneldir.
  - `resolveInlinePartiesBeforeTx` → `resolveInlinePartiesInTx` yeniden adlandırması 19 dosyada 33 geçiş (mekanik).
- **Tenant enumeration envanteri guard'ı (C15-S1-MODIFIED PR-2) — tavan YÜKSELTİLMEDİ.** İlk denemede
  `partyDb()` `any` döndürüyordu; `any` üzerinden yapılan `findMany` çağrıları TypeChecker'da çözülemediği
  için guard'ın "çözülemeyen çağrı" sayısı 213 → 219'a çıktı ve CI'da düştü. Doğru çözüm tavanı büyütmek
  değil, çağrıları **çözülebilir kılmaktı**: `partyDb()` ve altı yardımcı imzası `Prisma.TransactionClient`
  ile tiplendi (`PrismaService extends PrismaClient` olduğu için servis client'ı bu tipe atanabilir).
  Guard yeniden **14/14 PASS**; envanter tavanı dokunulmadan korundu.

### 3.4 CI manifest bağlama

- `pure/office-auth-user.txt` → 2 yeni birim spec'i.
- `db/core-lifecycle.txt` → gerçek geri alma spec'i.
- Manifest dosya varlık doğrulaması: **134/134**.

---

## 4. Kapsam sınırı — AÇIK kalanlar (kapanmış GÖSTERİLMEZ)

- Commit-sonrası `auditService.log()` çağrılarının transaction'a alınması (genel refactor; bu turun kapsamı dışı).
- `assertCanReactivateViaCreate` → `officeApproval.isApproverEligible` ve F01 yanıt projeksiyonu, ortak transaction
  açıkken kendi client'larından okur. Satır içi yol bu okumaları tetiklemez (AK-2 gereği `actor` GEÇİLMEZ), ama
  başka bir çağıran hem `txCtx` hem `actor` verirse kısa bir ikinci okuma oluşur. Ölçülmüş, kabul edilmiştir.
- Eşzamanlı yük altında bağlantı havuzu davranışı canlıda ölçülmedi (canlı koşum yapılmadı).
- `POST /lawyers` / `POST /clients` / `POST /debtors` uçlarının transaction davranışı DEĞİŞMEDİ.

## 5. Geri alma

Squash revert yeterlidir: şema/migration değişikliği yok, veri dönüşümü yok, canlı etki yok.

## 6. Canlı durum

**CANLIDA DEĞİL.** RELEASE22 / R27 canlıdadır ve dokunulmamıştır; İ11 mevcut RELEASE22 pinleriyle ilerler.
Bu kod bir sonraki yayın adayına girer; canlı kabulü AYRI owner GO ister. OFFICE AK-2/AK-1a ve CLIENT İ10 kapanışları korunur.
