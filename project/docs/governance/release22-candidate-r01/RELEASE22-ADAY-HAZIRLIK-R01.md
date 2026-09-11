# RELEASE22 — BİRLEŞİK YAYIN ADAYI HAZIRLIĞI (R01)

```text
BELGE        : RELEASE22-ADAY-HAZIRLIK-R01
YETKİ        : owner GO 2026-09-11 "BİRLEŞİK YAYIN ADAYI HAZIRLIĞI / DEPLOY YOK"
DURUM        : HAZIRLIK TAMAM — CANLIDA DEĞİL — cutover yetkisi YOK (production authority NONE)
ADAY (SABİT) : 137406701248858221d12be94a941f8837a2a245   (#2612 squash; "fresh main" KULLANILMAZ)
CANLI        : RELEASE21 2187a78b1621f168605920cdffccb17381dc171a · web BUILD_ID g91HUaBesekB-R2rRawQj
GERİ DÖNÜŞ   : RELEASE21 (canlı sürüm) — kök içeriği mühürlü manifestiyle birebir (§5)
GİRDİ        : TEK-YAYIN-HAZIRLIK-TABLOSU-R01 (#2613 @ db307a26) — kapsam bu belgede BAĞIMSIZ ölçüldü, birebir
YAPILMAYAN   : cutover · deploy · restart · bayrak açma · migration · A-07 tekrarı · canlı DB yazma · KATMAN 2 / mühür
```

Bu belge incelemeye sunulan **tek adaydır**. Kanıt etiketleri: **ÖLÇÜLDÜ** = bu oturumda komutla ölçüldü ·
**ÇIKARIM** = ölçülenden türetildi · **BİLİNMİYOR** = kanıtlayan kayıt yok. Tüm canlı ölçümler salt-okumadır.

## 1. Aday kimliği

| Konu | Değer | Kanıt |
|---|---|---|
| Aday SHA | `137406701248858221d12be94a941f8837a2a245` | ÖLÇÜLDÜ — main'e #2612 ile girdi |
| Aday üzerindeki CI | 8/8 kontrol + 3/3 iş akışı (`CI`, `GOV-COORD-V2 Orchestration Tests`, `Push on main`) **SUCCESS** | ÖLÇÜLDÜ |
| Adaydan sonra main | `db307a26` (#2613) — yalnız docs (bir belge + `product-backlog.md` 1 satır) | ÖLÇÜLDÜ; adayı değiştirmez |
| Canlı API / Web | `:8080` PID 50716 · `:3002` PID 22440 — ikisi de `HY_W4_RELEASE21` kökünden | ÖLÇÜLDÜ (dokunulmadı) |
| Canlı başlatıcılar | `start-api.ps1` `4ACA26CD…` · `start-web.ps1` `DA62DD2D…` · host `1397C54C…` | ÖLÇÜLDÜ |
| Canlı API → DB | PID 50716: 5432'ye 17 ESTABLISHED, 5439'a 0 | ÖLÇÜLDÜ |

**#2612'nin dahil edilmesi (GO şartı: kendi yürütücüsünde tamamlanma + required CI + kapanış kanıtı):**
PR başı `6000c442` 9/9 SUCCESS · kendi yürütücüsü 2026-09-10T21:12:49Z'de birleştirdi · birleşme commit'i
`13740670` üzerinde CI yeşil · kayıt satırı (CLF-O0-01) squash SHA ile sabitli (#2613) · uzak dal silindi.
Üç şart da ÖLÇÜLDÜ → **dahil**.

## 2. Kapsam eşlemesi — RELEASE21 → aday

### 2.1 Kaynak düzeyi (42 commit)

Çalışma zamanını etkileyen **7 commit / 11 dosya**; hepsi GO kapsamındaki kalemlerdir:

| Dosya (`project/apps/api/src/modules/…`) | PR |
|---|---|
| `case/case.service.ts` | #2599 (AK-2) · #2604 (AK-1a) |
| `lawyer/dto/create-lawyer.dto.ts` | #2599 |
| `lawyer/lawyer.service.ts` | #2599 · #2602 (AK-2) · #2604 |
| `seed/seed.controller.ts` | #2599 · #2604 |
| `seed/seed.service.ts` | #2599 |
| `office-approval/office-f01-authorization.guard.ts` | #2604 |
| `office-approval/office-write-role.policy.ts` (yeni) | #2604 · #2606 (AK-1a eki) |
| `office-approval/office-approval.service.ts` | #2604 · #2606 · #2608 (CLF-O0-01) · #2612 (FD iptal) |
| `client-financial-disclosure/client-financial-disclosure-approval-eligibility.ts` | #2606 |
| `client-financial-disclosure/client-financial-disclosure-approval.service.ts` | #2606 |
| `client/client.service.ts` | #2609 (CLIENT B-1) |

**Runtime dışı:** test/CI manifest 3 commit (#2594 · #2607 · #2610) · docs/governance 32 commit.

**Değişmeyenler (ÖLÇÜLDÜ):**
- Prisma şeması ve migration dizini: fark **0**, yani migration adımı yok.
- `pnpm-lock.yaml` ve `package.json`: fark **0**.
- Çalışma zamanı farkında yeni ya da silinen `process.env`/config anahtarı: **0**.
- `apps/web/src`: fark **0** (tek değişen dosya bir test dosyası).

### 2.2 Derleme çıktısı — API `dist`

Dosya dosya SHA-256 karşılaştırması (RELEASE21 3.916 ↔ aday 3.919 dosya): **26 değişen + 3 yeni, silinen 0.**

- **Yeni 3 dosya:** `office-write-role.policy` (`.js` / `.d.ts` / `.map`).
- **Değişen 26 dosya:** 11 kaynak dosyanın derlenmiş karşılıkları (`.js` / `.d.ts` / `.map`) ve `tsconfig.dev.tsbuildinfo` (derleme meta verisi).
- `create-lawyer.dto` için yalnız `.map` değişmiş; derlenmiş `.js` birebir aynı.
- `main.js` birebir aynı (`28D84796…`).
- **Kapsam dışı derleme farkı: 0.**

### 2.3 Derleme çıktısı — Web `.next`

Web kaynak farkı yok, ama taze derleme dosya hash'lerini değiştiriyor:

- **Değişen 320 dosya, yeniden adlandırılan 64/64 dosya.** Kök yolu çıktıya gömülü (`HY_W4_RELEASE21` → `22`) ve chunk hash'leri yeni.
- **Rota yüzeyi birebir:**
  - `app-path-routes-manifest` 55/55;
  - `routes-manifest` 11/11 anahtar ve değerler aynı;
  - prerender 42/42 rota.
- **Yeni BUILD_ID:** `xJZ1G1TsbOnHoWUzMD8CQ`.

### 2.4 Bağımlılıklar — `node_modules` (DEPS katmanı)

76.680 kayıt; eklenen ya da silinen paket **0**. Değişen **877** kaydın sınıflaması (ÖLÇÜLDÜ):

| Sınıf | Adet | Neden |
|---|---|---|
| `.bin` betiği — fark yalnız gömülü kök yolu | 843 | pnpm betikleri kurulum yolunu taşır |
| paket dosyası — fark yalnız kök yolu | 2 | aynı neden |
| iç içe `.bin` betiği — NODE_PATH / kaldırma farkı | 30 | pnpm'in her kurulumda seçtiği kaldırma yolu |
| `node_modules/.modules.yaml` | 1 | pnpm kurulum meta verisi |
| gizli kaldırma bağlantısı `.pnpm/node_modules/vitest` | 1 | R21'de `vitest@1.6.1`, adayda `vitest@4.0.15` |

**Çalışma zamanına erişim: 0.**
- API derlemesinde `vitest` ve `playwright` referansı yok.
- Web sunucu çıktısında `vitest` referansı yok.
- `vitest` API'nin bağımlılığı değil; web'de yalnız geliştirme bağımlılığı.

Sonuç (ÇIKARIM): DEPS farkları kurulum eseridir, kütüphane içeriği değişmedi.

### 2.5 Aday paketinin SOURCE katmanı

Paket, RELEASE21'deki sözleşmeyle aynı biçimde **git-izlenen ağacın tamamını** mühürler: docs ve testler dahil, çalıştırılmazlar.
- Yeni 43 + değişen 48 = 91 izlenen dosya farkı.
- Bunlardan çalışma zamanı kaynağı olanlar yalnız §2.1'deki 11 dosya.

**Hüküm: araya giren başka çalışma zamanı değişikliği YOK.** Her runtime baytı bir kapsam kalemine ya da kurulum eserine eşlendi.

## 3. Derleme — `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22`

- **Kök:** detached git worktree, HEAD `13740670`.
- **Komutlar** (RELEASE21 prosedürü): `pnpm install --frozen-lockfile` → `pnpm db:generate` → `pnpm build` (turbo: api, web, calc-preview-sdk).
- **Sonuç:** üçü de **exit 0**, toplam 147 sn.
- **Kök temizliği:** izlenen değişiklik 0. `apps/api/.env` **yok** (PRE-01: `.env` cutover H-fazında RELEASE21'inkinden üretilir; RELEASE21 `.env`'i 25 anahtar ve aday yeni anahtar gerektirmiyor).

Derlenmiş kodda kapsam işaretleri (ÖLÇÜLDÜ; canlı dist'te cutover sonrası **aynı sayım** beklenir):

| İşaret (derlenmiş dosya) | RELEASE21 | Aday |
|---|---|---|
| B-1 `pureNoOpDetected` (`client.service.js`) | 0 | **3** |
| AK-1a `OFFICE_WRITE_DENIED_VIEWER` (`office-write-role.policy.js`) | dosya yok | **3** |
| AK-1a `isF01WriteActorAuthorized` (`office-f01-authorization.guard.js`) | 0 | **1** |
| AK-1a eki `OFFICE_APPROVAL_DECISION_DENIED_VIEWER` (`office-write-role.policy.js`) | dosya yok | **3** |
| AK-1a eki `assertApprovalDecisionRoleAllowed` (`office-approval.service.js`) | 0 | **2** |
| AK-1a eki `isDisclosureDecisionRoleDenied` (FD `approval.service.js`) | 0 | **1** |
| PR-1.3 kapısı `assertGenericDecisionAllowed` (`office-approval.service.js`) | 3 | **5** (+`requestRevision`, +`cancel`) |
| AK-2 `LAWYER_REACTIVATE` / `assertCreateAuthorized` (`lawyer.service.js`) | 0 / 0 | **1 / 1** |

## 4. C33 aday paketi (KATMAN 1) — `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CANDIDATE`

### 4.1 Araç forku — `tooling/fork-r21-to-r22.js`

- **Kaynak:** RELEASE21 aday paketinin araçları.
- **Mekanizma değiştirilmedi.** İleri jetonlar önce, geri jetonlar sonra, kimlik ve supersede metinleri en son (nihai biçim).
- **Sonuç:** 45/45 kural eşleşti, eski jeton kalıntısı **0**.
- **RELEASE21 araç ağacı** fork öncesi ve sonrası aynı hash'i taşıyor; kaynak paket değişmedi.
- **A-01 dersine göre sertleştirme:**
  - Eşleşme kontrolü artık kural indeksiyle yapılıyor. 44 karakterlik önek anahtarı iki kuralı aynı sayabiliyordu.
  - Dosya listesi verilmiş her kural, listedeki her dosyada eşleşmek zorunda.
- **ERRATUM §4 uygulandı** (`OFFICE-ROLLBACK-BUILDID-ERRATUM-R01`). Web üreticisinin geri dönüş `buildId`'si artık sabit metin değil; RELEASE21 kökünün `.next/BUILD_ID` dosyasından okunuyor. Dosya yoksa üretici hata verir (fail-closed). R21 paketine dokunulmadı.
- **`Build-R22Host.ps1` başlık düzeltmesi:** R21 kopyasındaki geri dönüş nesli yorumu kodla çelişiyordu. Kod, pinleri ileri launcher'lardan hesaplıyor; yorum buna göre düzeltildi.

### 4.2 Nesiller (`cutover-staging/generations`)

| Nesil | API launcher | Web launcher | Host | Not |
|---|---|---|---|---|
| **R21 — geri dönüş** | `4ACA26CD…` | `DA62DD2D…` | `1397C54C…` | canlı `C:\Ops\hukuk\bin` ile **bayt-eşit** kopya |
| **R22 — ileri** | `77B6FBCD…` (yalnız 4 yol satırı) | `1B7654F6…` (yalnız 3 yol satırı) | `E744A74B…` (26.112 B) | host `byteExact=false / semantic=true`; profil `PRF-421d8ced-df88-4912-b78f-dd5c608e607e` |

**Web nesil kaydı:**
- geri dönüş `buildId` = `g91HUaBesekB-R2rRawQj` (RELEASE21 dosyasından; ERRATUM §4'ün kanıtı);
- ileri `buildId` = `xJZ1G1TsbOnHoWUzMD8CQ`.

Canlı `C:\Ops\hukuk\bin` dosyaları işlem öncesi ve sonrası aynı; yalnız okundu.

### 4.3 Aday zinciri (`run-chain.ps1`) — **11/11 exit 0** (449 sn)

| Kapı | Sonuç |
|---|---|
| ADIM1 üretici + defter | manifest 21,6 MB · 88.178 satır |
| Doğrulayıcı #1 (Node) | 38/38 `RELEASE22_MANIFEST_VALID` — tam disk yeniden-hash'i ve birebir küme kontrolü dahil |
| Doğrulayıcı #2 (PowerShell) | 28/28 `RELEASE22_MANIFEST_VALID` |
| ADIM2 dış depolama | 39/39 |
| ADIM2b yazma yüzeyi | erişilebilir yazıcı 5 · sınıflandırılamayan 0 |
| ADIM4 gerçek dotenv | 22/22 |
| ENV anahtar gereksinimi | exit 0 (canlı `.env` anahtar ADLARI; değer okunmadı) |
| ADIM3 R09 bağlama profili / doğrulama | profil `7D57CCCF…` · 37/37 ölçülen kapı · 1 NOT_EXECUTED (B-072b yükseltilmiş ölçüm ister — R21'de de aynı) |
| Makbuz mühürü | exit 0 |

### 4.4 Makbuz — `RELEASE22-CANDIDATE-RECEIPT.json`

| Alan | Değer |
|---|---|
| packageDigest | `F0156AC1D4C40EFC4F604EC279903B4513BE6C4F4AA200B0837AEE001F401DCE` (50 dosya) |
| makbuz SHA-256 | `8D78B1765EFA345CCAFB74FB8A4E3AF58638F4A045B5ABDDB39CDD88F823E6CD` |
| candidateDigest | `454F447303B6D145B99EF2F3155282D02079AF2AAF0699101C20E5C6A7764C02` (RELEASE21 `569DDCE4…`'den **farklı**; farklı kök için beklenen) |
| manifestDigest / ledgerHash | `26B31B69…` / `6957F993…` |
| katmanlar SOURCE / BUILD / DEPS | 7.069 / 4.429 / 71.887 dosya + 4.793 bağlantı |
| supersedes | `HY_W4_RELEASE21 @ 2187a78b` — canlı ve geri dönüş hedefi |
| durum | `CANDIDATE_BUILT_AND_VERIFIED / CUTOVER_NOT_AUTHORIZED (RELEASE21 rollback pinned)` · production authority NONE |

- **Karşılanmayan ön koşullar:**
  - PRE-01 `.env`;
  - PRE-07 kökün salt-okunur olması;
  - PRE-08 başlatıcının adaya bağlanması.

  Üçü de cutover H-fazının işi; RELEASE21 makbuzunda aynı üç kalem vardı.
- **Ölçülemeyen:** PRE-06 yazıcı görevi (yükseltilmiş ölçüm gerekir).

**Bağımsız mühür doğrulaması** (makbuz algoritmasıyla yeniden hesap):
- RELEASE22 packageDigest ve makbuz SHA'sı **eşit**.
- RELEASE21 aday paketi `851C07DF…` **eşit**. Bu, KATMAN 2'nin bağladığı değer; R21 paketi bu işte değişmedi.

### 4.5 KATMAN 2 (cutover paketi) ve mühür — ÜRETİLMEDİ (owner kapısı)

KATMAN 2 = **R27** cutover paketi `HY_C33_RELEASE22_CUTOVER_R27`; paket ve mühürü owner'ın **RatificationRef**'ine bağlı.
> **Düzeltme (2026-09-11, owner kararı "TEK YAYIN HATTI: RELEASE22"):** bu satırın ilk sürümü "R26 cutover paketi" diyordu — **bayattı**.
> R26 numarası `HY_C33_RELEASE21B1_CUTOVER_R26`'da (yalnız B-1 adayı) kullanıldı; o paket tarihsel/hazır olarak korunur ve kullanılmaz.
> Numara C33 envanterinden (R20..R26 dolu) R27 olarak belirlendi. Ratifikasyon revizyonu (`-Rnn`) paket numarası **değildir**.
> Paket kaydı: `RELEASE22-R27-CUTOVER-PAKETI-R01.md`.
- **Biçim:** `^OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-[0-9]{8}-R[0-9]{2}(-…)?$`.
- **Ek şart:** yeni, tek-kullanımlık authority ve nonce.

Fork girdileri R25 desenine göre hazır:
- **İleri pinler:** `E744A74B…` / `77B6FBCD…` / `1B7654F6…`.
- **Geri dönüş pinleri** (canlı R21): `1397C54C…` / `4ACA26CD…` / `DA62DD2D…`.
- **Paket kimlikleri:** makbuz SHA, candidateDigest, manifestDigest, packageDigest, profileId ve BUILD_ID.

Mühürden önce yapılacaklar:
- `Seal-Package.ps1` sürüm metninin RELEASE22'ye çekildiği ve S-00'ın ref'i kabul ettiği kanıtlanır.
- FORBIDDEN listesi bir sürüm ileri kaydırılır.
- **Host SHA'sı mühür anında kayda geçer** (ERRATUM §5'in kapanış yolu).

## 5. Geri dönüş

| Konu | Değer / kanıt |
|---|---|
| Hedef | **RELEASE21** `2187a78b` · kök `HY_W4_RELEASE21` (sahibi SYSTEM, kalıtım kapalı — IMMUTABLE) |
| Kimlik | `main.js` `28D84796…` · BUILD_ID `g91HUaBesekB-R2rRawQj` · `client.service.js` `5D3DF71C…` · launcher ve host pinleri §4.2 |
| Kök bütünlüğü | RELEASE21 PowerShell doğrulayıcısı mühürlü manifeste karşı: **P-031 88.132 dosyanın SHA-256'sı ve boyutu birebir** (uyuşmaz 0, okunamayan 0) · P-041/042/043 · P-050…053 katman digest'leri ve candidateDigest `569DDCE4…` yeniden türetildi |
| Düşen 4 kapı | 3 git kapısı (HEAD / temizlik / izlenen sayı): git SYSTEM sahipli kökte `dubious ownership` ile çalışmıyor; HEAD worktree kaydından `2187a78b` okundu · P-040: kökte **`apps/api/.env`** var — cutover H-fazının yerleştirdiği dosya (RELEASE21 makbuzunda PRE-01) · Node doğrulayıcısı aynı git reddinde durdu |
| Mühürlü R21 paketi | doğrulama öncesi ve sonrası hash aynı; packageDigest `851C07DF…` yeniden hesapla eşit |
| Aday paketinde hazır geri dönüş nesli | R21 launcher ve host kopyaları, canlıyla bayt-eşit (§4.2) |
| Veritabanı | migration yok → geri dönüşte DB adımı **yok**. Yeni sürümün yazdığı veriler kalır: kod geri alınır, veri alınmaz |
| İkinci derece | RELEASE20 kökü diskte (`08ce8e25`) |

## 6. FD kurtarma — dar karar incelemesi (GO madde 2)

İncelenen yol: `POST /client-financial-disclosures/:disclosureVersionId/reconcile-consumed-office-approval`,
yani `ClientFinancialDisclosureApprovalService.reconcileConsumedOfficeApproval`.

### 6.1 Kurtarmayı kim çağırabilir?

- JWT'li her kullanıcı; F01 kapısı yok.
- `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED` birebir `'true'` olmalı. Canlı `.env` dosyasında değer `'true'` (ÖLÇÜLDÜ, yalnız bu iki bayrak okundu). Dosyanın son yazımı 10:05:47Z; API 10:05:56Z'de başladı. Bu yüzden bayrak çalışan süreçte etkin (ÇIKARIM). Yayın bayrağı da `'true'`.
- Çağıran, kayıttaki karar vericinin kendisi olmalı (`request.approverUserId === actorUserId`); değilse 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE`.
- Kayıttaki karar verici **bugün** rütbe/delege yüklemini geçmeli (`isDisclosureApproverEligible`: aktif, aynı tenant, bağlı avukat PARTNER/MANAGER ya da delege). **Rol bakılmaz.**

### 6.2 Hangi kayıtlı kararı uygular?

- Yalnız düz **APPROVED** `OfficeApprovalRequest`. APPROVED_WITH_CHANGES, REJECTED, REVISION_REQUESTED ve CANCELLED kanıt sayılmaz.
- Kararda `approverUserId` ve `decidedAt` dolu olmalı.
- Talep bu sürüme bağlı olmalı: `actionCode`, `targetType` ve `targetRef` eşleşmeli.
- Niyetin snapshot hash'i ve `payloadHash` birebir olmalı.
- Sürüm hâlâ `OFFICE_APPROVAL_PENDING` durumunda ve onaysız olmalı.

Kurtarma kayıttaki `approverUserId` ile `decidedAt`'ı **aynen** sürüme taşır. Talep yeniden mutate edilmez, yeni kayıt üretilmez; ikinci çağrı idempotent tekrardır.

### 6.3 Nerede, ne denetleniyor?

| Denetim | Yer | Durum |
|---|---|---|
| Çağıranın **güncel rolü** | — | **Denetlenmiyor.** #2606'nın karar anı rol kapısı yalnız YENİ karar yollarında (`completeOfficeApproval`, `completeContentApproval`); kurtarma bilerek dışında bırakıldı (yürütme bağlamı) |
| İlk kararın **aktörü** | `request.approverUserId === actorUserId` | Kimlik bağı var |
| Karar vericinin **güncel rütbesi / delegasyonu** | `assertApproverEligible` (aynı transaction) | Var — "karar anındaki kayda değil, bugünkü kurala göre" |
| **Karar anındaki yetki** (rol / rütbe) | — | **Hiçbir yerde kayıtlı değil:** talep satırında rol/rütbe anlık görüntüsü yok · genel kutunun `OFFICE_APPROVAL_*` audit metadata'sında rol alanı yok · FD domain karar yolu hiç audit yazmıyor · şemada rol geçmişi yok, kodda rol değişikliği audit'i yok |

### 6.4 Canlı ölçüm — 2026-09-11, `hukuk_db@5432`, PG 16.14, 9 tenant

Tek transaction içinde `SET TRANSACTION READ ONLY` ve `transaction_read_only = on` doğrulandı; **yazma 0**.

| Ölçüm | Sonuç |
|---|---|
| FD sürüm durumları | `PUBLISHED` 2 |
| FD onay talepleri | `APPROVED` 2 |
| `OFFICE_APPROVAL_PENDING` sürüm | **0** → kurtarma adayı 0 · tüketilmiş/kilitli kayıt 0 |
| Bugün VIEWER olan kullanıcının FD ofis / içerik onayı | 0 / 0 |
| Bugün VIEWER olan kullanıcının FD talebi kararı · her türden talep kararı | 0 · 0 |
| VIEWER kullanıcı sayısı · bunlardan uygun avukata bağlı olan | 1 · **0** |
| FD talepleri için `OFFICE_APPROVAL_APPROVED` audit | 1 satır (2 onaylı talebe karşılık); rol alanı **yok** |
| Rol değişikliği audit'i | **0** |

**Karar anındaki rol:** iki geçmiş FD onayı için **BİLİNMİYOR**. Bugünkü rolden geçmiş yetki çıkarılmadı. Ölçülen tek şey, iki onayı veren kullanıcının bugün VIEWER olmadığı.

### 6.5 Somut etki

**Bugün sıfır.** Kurtarmanın uygulayabileceği kayıt yok ve bugün hiçbir VIEWER kurtarmayı kötüye kullanacak konumda değil.

Yeni aday oluşması da yapısal olarak kapalı:
- Genel kutu FD talebini artık hiçbir yoldan tüketemiyor: #2608 dört karar rotası, #2612 iptal; ikisi de adayda.
- `completeOfficeApproval` sürümü ve talebi tek transaction içinde birlikte ilerletiyor.

Açık yalnız iki kaynağa karşı gizil kalıyor: geçmiş veya elle DB'ye girilmiş kayıtlar. Bu tür kayıt canlıda ölçülen 0.

### 6.6 Önerilen dar politika (UYGULANMADI — owner kararı; RELEASE22 kapsamında DEĞİL)

- **P1 — önerilen.** Kurtarma, kayıtlı kararı yazan bir uygulama adımıdır. Çağırana #2606'daki karar anı rol kapısı aynen uygulansın:
  - Aynı transaction içinde, DB'deki güncel rol VIEWER ise yazmadan önce 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE` dönülsün.
  - Mevcut denetimler korunsun: çağıran = kayıtlı karar verici, bugünkü rütbe, snapshot, yalnız APPROVED.
  - Uygulama biçimi: dar kod değişikliği ve RED→GREEN testleri.
- **P2 — karar anı yetkisi.** Kanıtlanamadığı için çıkarılmasın. Kurtarma yalnız bugün uygun ve VIEWER olmayan bir karar vericinin kararını taşısın. Daha katı seçenek: kararın audit'i yoksa ya da karar PR-1.3 öncesi genel kutuda verildiyse kurtarma kapatılsın; taze bir domain kararı (`completeOfficeApproval`) istensin.
- **P3 — gelecek için kanıt.** FD domain karar yolu ve genel kutu audit'i, karar anındaki rol ve rütbenin anlık görüntüsünü yazsın (ayrı kalem). Bu yapılmazsa "karar anındaki yetki" sorusu gelecekte de yanıtlanamaz.

Ölçülen etki 0 olduğu için bu açık **yayını engellemez**.

## 7. Hedefli kabul planı

### 7.1 Teknik yayın kabulü (cutover sonrası, C33 makbuzu altında)

1. Cutover makbuzu 31/31 ve `dbMutations 0`.
2. Canlı API ve Web PID'lerinin komut satırları `HY_W4_RELEASE22` kökünü göstermeli.
3. Başlatıcı pin günlüğünde `77B6FBCD…` / `1B7654F6…` görülmeli.
4. Canlı host SHA'sı `E744A74B…` olmalı ve mühürde kayıtlı olmalı.
5. Web BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` olmalı.
6. §3'teki işaret tablosu **canlı dist'te** yeniden sayılmalı.
7. Migration ledger 130/130 ve değişmemiş olmalı.
8. Süreç→DB bağı (5432 ESTABLISHED) ölçülmeli.
9. DB'ye dokunan bir sağlık sınaması yapılmalı: `/auth/me` 401 DB'yi görmez.

### 7.2 Düzeltme kabulleri

| Kalem | Cutover ÖNCESİ (yerel; canlı yazma 0) | Cutover SONRASI (canlı) |
|---|---|---|
| **CLIENT B-1** #2609 | ✅ yapıldı: yamalı derlemede İ9 provası PASS 14/0/0 (#2609/#2611) | işaret `pureNoOpDetected` = 3 → İ9 canlı koşumu (§7.3) |
| **AK-2** #2599/#2602 | aday dist + disposable 5439, sentetik tenant: ayrıcalıklı alanla yetkisiz create → 403 ve yazma 0; pasif ayrıcalıklı mükerrer kaydı yetkisiz yeniden etkinleştirme → 403; ADMIN / bağlı PARTNER → 201 ve aynı transaction'da audit | canlı dist işaretleri; işlevsel denetim yalnız owner GO + sentetik tenant ile |
| **AK-1a** #2604 | disposable: bağlı VIEWER F01 yazma → 403 `OFFICE_WRITE_DENIED_VIEWER`; okuma 200 | owner GO ile sentetik tenant (ret yazma üretmez; kurulum yazar ve kapatılır) |
| **AK-1a eki** #2606 | disposable: VIEWER genel kutu kararı → 403 · FD ofis/içerik onayı → 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE` | yalnız dist işaretleri. **FD senaryoları canlıda KOŞULMAZ:** canlıda FD yayını açık ve gerçek müvekkil e-postası riski var |
| **CLF-O0-01** #2608/#2612 | disposable: FD talebinde genel kutu `request-revision` ve `cancel` → 409 `DOMAIN_ACTION_REQUIRED`, yazma 0 | dist işareti `assertGenericDecisionAllowed` ×5; canlıda FD talebi **üretilmez** (aynı neden) |
| CI #2607/#2610 | runtime etkisi yok; aday CI yeşil | — |

**Yetki sınırı:** her canlı adım ayrı owner GO ister; bu belge hiçbir koşum başlatmaz. Disposable adımlar aday dist ile yapılır ("derlenmiş dist + disposable DB" yöntemi).

### 7.3 CLIENT İ9 bağımlılığı

**Sıra:**
1. RELEASE22 cutover ve teknik kabul (§7.1).
2. Canlı dist'te `pureNoOpDetected = 3`. İşaret yoksa **DUR**: yama canlıda değil demektir.
3. İ9 canlı koşumu, owner GO ile (`CL_OWNER_GO_REF = OWNER-GO-CLIENT-I9-YYYYMMDD-Rnn`, `CL_API_BASE_URL = http://127.0.0.1:8080/api`).

İ9 paketi `d6c51ca0`'da sabit (`client-live-acceptance-i9-r01`); betiklerde değişiklik gerekmiyor.

**Sayaçlar:** 8/17'den 9/17'ye geçiş yalnız İ9 canlı PASS'ten sonra olur. Hizmet kabulü 0/8 tam kalır; otomatik tam kabul çıkarılmaz.

### 7.4 Geçmiş geçerli OFFICE kabulünün korunması

Adayın OFFICE'e getirdiği fark yalnız **yeni retlerdir**:
- VIEWER yazma ve karar retleri;
- ayrıcalıklı avukat create ve yeniden etkinleştirme sınırı;
- FD talebinde genel kutu 409'u.

Kabul edilmiş aktörlerin ve senaryoların davranışı değişmez.

| Hizmet | Adaydaki fark | Devralınan kabul |
|---|---|---|
| S-01…S-08 ayarlar | yalnız VIEWER yazma reddi (F01) | O-1…O-10 ve A-03…A-06 geçerli |
| S-09 avukat | AK-2 (yalnız ayrıcalıklı alan veya pasif ayrıcalıklı mükerrer) + VIEWER yazma reddi | A-04 kabulü (Lawyer +1, StaffMember +1) ayrıcalıklı alan taşımıyor → etkilenmez (ÇIKARIM, kabul kaydından) |
| S-10 personel | yalnız VIEWER yazma reddi | geçerli |
| S-11 raporlama hattı | fark yok | geçerli |
| S-12 onay akışı | VIEWER karar reddi · FD talebinde genel kutu 409 | **A-07 geçerli** (PARTNER onaylayıcı, `CHANGE_STATUS`, ADMIN kontrollü yürütme — hiçbiri değişmedi); **yeniden koşulmaz** (fixture tüketildi) |

Yeni davranışların kabulü §7.2'dir; eski kabullerin tekrarı değildir.

## 8. Engeller ve takip

- **Hazırlığı engelleyen bulgu: YOK.** Aday, kök, derleme, KATMAN 1 paketi ve geri dönüş kanıtı tamam.
- **Cutover'ı engelleyen (bu fazın dışında, owner kapıları):**
  - RatificationRef ile KATMAN 2 ve mühür;
  - yeni authority ve nonce;
  - host SHA'sının mühür anında kaydı;
  - PRE-01/07/08 (cutover H-fazı);
  - PRE-06'nın yükseltilmiş ölçümü.
- **Açık kalan — değişmedi, kapatılmış gösterilmez:**
  - AK-1b, AK-1c;
  - FD kurtarma VIEWER politikası (§6.6);
  - VIEWER yürütme yolları: payout finalize, dağıtım post, FD yayın;
  - karar düğmeleri UX'i;
  - diğer domain kapıları;
  - ayrıcalıksız pasif avukatın yeniden etkinleştirilmesi;
  - CASE düzeyi VIEWER denetimi;
  - B-2;
  - `/cases` ön kontrol yarışı;
  - ofis oto-oluşturmanın transaction dışında kalması;
  - seed'in OFFICE dışı uçları;
  - junction kalıntısı;
  - host denetlenebilirlik açığı (ERRATUM §5; kapanış yolu §4.5).

## 9. Sınır beyanları

```text
CANLI GEÇİŞ = YAPILMADI · DEPLOY / RESTART = YOK · BAYRAK = DEĞİŞMEDİ · MIGRATION = YOK · A-07 TEKRARI = YOK
CANLI DB = YALNIZ SALT-OKUMA (FD ölçümü; yazma 0) · CANLI C:\Ops = YALNIZ OKUNDU (önce/sonra hash aynı)
MÜHÜRLÜ R21 PAKETLERİ = DEĞİŞMEDİ (851C07DF… yeniden hesapla eşit) · KATMAN 2 / MÜHÜR / AUTHORITY = ÜRETİLMEDİ
NEW EXECUTION AUTHORITY = NONE
```
