# RELEASE21 — İ7 UYGULAMA ONAYI HAZIRLIĞI (R01)

```text
BELGE      : RELEASE21-I7-APPROVAL-PREP-R01
ÜRETEN     : CLIENT hattı (owner GO 2026-09-08 — İ7 hazırlığı)
UYGULAYICI : Office/C33 (cutover tek yürütücüsü)
DURUM      : İ7 UYGULAMA ONAYINA HAZIR — **İ7 TAMAM DEĞİLDİR**
YAPILMADI  : migration · servis değişimi · cutover · production yazımı (mutasyon 0)
```

> Bu belge **yetki üretmez**. Tüm ölçümler salt-okumadır; canlı DB'ye yalnız `SELECT`
> çalıştırılmıştır. Paket üretilmemiş, mühür değiştirilmemiş, Office/C33'ün çalışma alanına
> **yazılmamıştır**.

---

## 1. Kesin paket kimliği (tam hash — kısaltılmış digest hedef DEĞİLDİR)

| Alan | Tam değer |
|---|---|
| Sürüm / kök | `HY_W4_RELEASE21` → `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE21` |
| Kaynak commit | `2187a78b1621f168605920cdffccb17381dc171a` |
| `candidateDigest` | `569DDCE4850F2E07D9A1DA8BBE894D825A498E83946D74955F21D0E19F0CE88F` |
| `manifestDigest` | `D6082E199ACA34964037B44EFD48EAB80E280EF7668B74CC605431E024B41D61` |
| `ledgerHash` | `CF2D8A836EA0B2B8F14B8AEF129F67ACF5693E62AD4AE3F9E3E83DDB2D3FF59A` |
| `packageDigest` | `851C07DFCD2C6FBBA3A705840A401D4E8693A8F75BA62EE964C8763200B84A22` |
| `receiptDigest` | `94BAE5118E232DADFB773264ED9E84D40709820BD9FC761DA5AE16E707D3C990` |
| Paket dosya sayısı | 51 |
| Web BUILD_ID (aday) | `g91HUaBesekB-R2rRawQj` |
| Web BUILD_ID (canlı R20) | `LW4jlJUOMHrvVEqakKB3i` |

**Mühür bağımsız doğrulandı:** makbuz, manifest ve ordinal dosyalarının sha256'sı bu turda
yeniden hesaplandı ve kayıtlı değerlerle **birebir** çıktı. Üç generation kaydı da mühürle
birebirdir (post-seal düzenleme yok).

---

## 2. Ön koşullar — tam koşul, mevcut kanıt, hangi aşamada karşılanır

| # | Tam koşul | Mevcut kanıt (bu turda ölçüldü) | Aşama |
|---|---|---|---|
| **PRE-01** | RELEASE21 içinde `apps/api/.env` bulunmalı — `ConfigModule` `envFilePath` **vermez**, dotenv cwd'den okur | Dosya **YOK** (yalnız varlık kontrolü; içerik okunmadı). Staging kaydı: *"RELEASE21 .env cutover H-fazında RELEASE20 .env baytlarından (25 anahtar, YENİ anahtar YOK) üretilir; bu staging oluşturmaz"* | **H-fazı / ADIM 3 (ENV-COPY-01)** — sır taşıdığı için şimdi yapılamaz |
| **PRE-06** | Writer görevi kayıtlı olmalı | **KARŞILANDI — bu turda ölçüldü.** `HukukPlatform-API` ve `HukukPlatform-Web`: `State=Running`, `User=ulastelli`, `RunLevel=Limited`, `Exec=C:\Ops\hukuk\bin\hukuk-task-host.exe api|web`. Makbuzdaki `NOT_MEASURED` bu ölçümle kapanır | **ŞİMDİ karşılandı** |
| **PRE-07** | RELEASE21 kökü runtime kimliği için salt-okunur olmalı | Makbuz: kök DACL `Authenticated Users` için `0x1301bf` (Modify). Sertleştirme release ağacına yazma demektir → Office/C33 yetkisi | **H-fazı** (release-yerel sertleştirme) |
| **PRE-08** | Başlatıcı RELEASE21'e bağlanmalı | **Ölçüldü:** `start-api.ps1:33` ve `start-web.ps1:26` `ReleaseRoot = HY_W4_RELEASE20`. **Yapı gereği ancak cutover'da karşılanır** | **H-fazı / ADIM 4** |

**Uygulama sırasında ölçülecekler → ilgili kontrole bağlanır:** PRE-01 → ADIM 3 sonrası
`envFileExists` + bayt eşitliği kontrolü; PRE-07 → ADIM 4 öncesi `icacls` doğrulaması;
PRE-08 → ADIM 4 sonrası çalışan sürecin `entry` yolunun RELEASE21 olduğunun içerik kanıtı.

---

## 3. Migration'ın canlı DB durumu (salt-okuma ölçümü, yazma 0)

| Ölçüm | Sonuç |
|---|---|
| `_prisma_migrations` toplam | **129 kayıt · 129 başarılı · 0 sorunlu** (rolled_back 0) |
| Hedef `20260908171230_office_a07_approval_execution_binding` | **kayıt YOK → uygulanmamış** |
| `CaseStatusHistory.approvalRequestId` / `approvalAttempt` | **fiili şemada YOK** |
| Hedef indeks | **YOK** |
| `CaseStatusHistory` satır sayısı | **930** |
| Canlı PG | `lock_timeout=0` · `statement_timeout=0` · `idle_in_transaction_session_timeout=0` · `deadlock_timeout=1000` |
| RELEASE21 ağacı ↔ canlı ledger farkı | **pending = 1** → **EXACT-ONE koşulu SAĞLANIYOR** |
| Canlıda olup aday ağacında olmayan | **0** (sürüklenme yok) |

> Ledger **ve** fiili şema ayrı ayrı ölçüldü; ikisi tutarlı. Migration yorumundaki *"canlı PG'de
> sınırsız bekleme vardır"* iddiası bu ölçümle **bağımsız doğrulandı**.
>
> **`migrate status` uygulama uyumluluğu kanıtı DEĞİLDİR** — o yalnız ledger/şema durumunu söyler.
> Uyumluluk dayanağı §5'tedir.

---

## 4. Yedek ve geri yüklenebilirlik

**Araç uygunluğu ölçüldü:** canlı PostgreSQL `hukuk-postgres` konteynerinde
(`postgres:16-alpine`, `127.0.0.1:5432`), `pg_dump 16.14` = sunucu `16.14` → **sürüm sapması
yok**. Hostta `pg_dump` PATH'te yoktur; yedek konteyner üzerinden alınır.

**Usul (RELEASE14 cutover kaydının BACKUP-01 deseni):** dump alınır → boyut + **SHA-256**
kaydedilir → `pg_restore --list` satır sayısı PASS → **disposable ortamda prova restore** ve
ledger sayısı karşılaştırması → ACL daraltılır → retention owner kararına bırakılır.
**Geri yüklenebilirlik, dump'ın varlığıyla değil prova restore ile kanıtlanır.**

**Kod tarafı geri dönüş — bu turda doğrulandı.** Paketteki `cutover-staging/generations/R20/`
kopyaları canlı dosyalarla **birebir**:

| Dosya | SHA-256 (staged = canlı) |
|---|---|
| `start-api.ps1` | `DC4C5AE49B4319F3237CECFED6315923719D234D8C1681BAAB5979BDDEC32489` |
| `start-web.ps1` | `E95EF7D7928CFED007909B191B18C1EDB6BE5A5FBC89F6E391CB128B149B9F5B` |
| `hukuk-task-host.exe` | `B2B11057744A3614A0F291D226BDA0F6A27F0023C3AF95813B857D3F6450A5BA` |

> `C:\Ops\hukuk\rollback-r02-launchers\` **geri dönüş yolu DEĞİLDİR**: içeriği R02 dönemine ait
> statik kopyalardır ve `start-api.ps1` **RELEASE13**'ü, `start-web.ps1` **RELEASE11**'i işaret
> eder. C30-F01 tasarımı da bu dizini *"yalnız statik R02 yedek kopyaları (writer değil)"* diye
> kaydeder. Geri dönüş kaynağı **`cutover-staging/generations/R20/`**'dir.

---

## 5. RELEASE20'nin migration sonrası şemayla uyumluluk dayanağı

İddia değil, ölçüm:

1. RELEASE20 `schema.prisma` → `model CaseStatusHistory` alanları: `id, caseId, case, fromStatus,
   toStatus, reason, changedById, changedBy, automationWasEnabled, createdAt`. **İki yeni alan
   yok.**
2. `approvalAttempt` RELEASE20'nin **kaynağında da derlenmiş `dist`'inde de hiç geçmiyor.**
3. Migration iki kolonu **nullable** ve **DEFAULT'suz** ekler; Prisma `INSERT`'leri kolonları
   açıkça sıralar, dolayısıyla bilmediği kolonları yazmaz ve `NOT NULL` ihlali oluşmaz;
   `SELECT`'lerde de kolon listesi açıktır, fazladan kolon **görünmez**.

**Sonuç:** migration uygulandıktan sonra RELEASE20'ye dönülürse iki kolon şemada kalır ama
**atıl**dır. Prisma'da down-migration yoktur; geri alma **kod tarafındadır**, şema tarafında
değildir. Bu, DDL'i kalıcı kabul eden bilinçli bir seçimdir ve ADIM 2b post-validation'da
"business-row mutasyonu 0" ile ayrıca sınanmalıdır.

---

## 6. Hash-pin engeli — tasarımla çözülmüş, doğrulandı

RELEASE14 cutover'ı `SCRIPT_HASH_MISMATCH exit 104` ile **API DOWN** ile sonuçlanmıştı: host
launcher script'lerini **compile-time sabit** ile hash-pinler; pointer = launcher içindeki dört
sabittir, dolayısıyla *pointer değişimi ≡ dosya değişimi ≡ hash değişimi → pin'e çarpar*.

Aday bunu **koordineli nesil** ile çözer ve bu turda **iç tutarlılığı doğrulandı**:

| Bağ | Değer | Eşleşme |
|---|---|---|
| Forward host `pins.SHA_PAPI` | `4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1` | = staged `R21/start-api.ps1` sha256 ✔ |
| Forward host `pins.SHA_PWEB` | `DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531` | = staged `R21/start-web.ps1` sha256 ✔ |
| Forward host binary | `6A1EB401D703A4FB2BDBB00C35F45EBAFEDBBE0536E09D69180D8BFECB9F9AFE` | diskteki staged dosyayla birebir ✔ |
| `MANIFEST_SHA` | `84E530B1A90F5A069C7C87B68B73948F574752650DB607DDFB29A959B9F0307A` | pwsh klon manifesti ✔ |

Değişen satırlar: API `33,34,35,40` (`ReleaseRoot`/`WorkDir`/`EntryJs`/`EnvFile`), Web `26,27,28`
— tasarımın öngördüğü **yalnız pointer sabitleri**.

**Şart:** host binary ile launcher'lar **aynı işlemde** değiştirilmelidir. Yalnız launcher
düzenlenirse mevcut host (`B2B11057…`) eski pin'i arar ve **exit 104 fail-closed** olur.

---

## 7. AÇIK ENGEL — mühürlü kayıtta yanlış rollback BUILD_ID

| | |
|---|---|
| **Beklenen** | `WEB-LAUNCHER-GENERATION.json` → `rollbackGeneration.buildId = LW4jlJUOMHrvVEqakKB3i` (RELEASE20) |
| **Gerçek** | `lt2ag97od6jT4jHG2NX7N` — bu değer **RELEASE18'in** BUILD_ID'sidir (ölçüldü: R18 `lt2ag97od6jT4jHG2NX7N` · R19 `xFgJAoTFqlTjW89Zf2CYS` · R20 `LW4jlJUOMHrvVEqakKB3i` · R21 `g91HUaBesekB-R2rRawQj`) |
| **Kapsam** | Kayıt alanıdır; hiçbir yola veya hash'e girmez. Geri dönüş **mekanizması etkilenmez** — staged R20 launcher/host kopyaları canlıyla birebirdir (§4) |
| **Risk** | Cutover sonrası veya rollback sonrası doğrulama bu değere göre yapılırsa **yanlış FAIL** üretir; daha kötüsü, "düzeltme" adına RELEASE18'e yönelme riski doğar |
| **Gereken işlem** | Dosya **mühürlü paketin içindedir** (51 dosyadan biri, `7118447D…`) ve diskteki hâli mühürle birebirdir → düzeltme **yeniden mühürleme** ister. Office/C33 ya alanı düzeltip paketi yeniden mühürler (yeni `packageDigest` + makbuz), ya da owner onaylı bir **erratum** kaydeder ve rollback doğrulaması `LW4jlJUOMHrvVEqakKB3i` ile yapılır. **CLIENT hattı pakete yazmaz.** |

---

## 8. Eksik kalem — cutover yürütme paketi

Mevcut paket bir **aday hazırlık** paketidir (producer · gate'ler · staging · binding);
**cutover yürütme paketi değildir**. Paketin 51 dosyası içinde kesinti planı, owner komutu,
nonce/zarf veya adım runbook'u **yoktur** (`productionAuthority: NONE`).

İ7 onayı öncesi Office/C33'ten beklenen: **kesinti penceresi + owner komutu + nonce/zarf +
adım runbook'u**. Bu belge bunları **üretmez**.

### Kesinti bütçesi — ölçülmüş temele dayalı TAHMİN (resmî değer cutover paketinden gelir)

| Bileşen | Ölçülmüş dayanak | Süre |
|---|---|---|
| Migration | 930 satır · 2 × nullable `ADD COLUMN` (PG11+ tablo yeniden yazmaz) + küçük indeks; kendi `lock_timeout=3s` + `statement_timeout=30s` sınırları | **üst sınır ≤ 33 s**, beklenen < 1 s |
| Servis değişimi | Stop-Task → drain → Start-Task (RELEASE19 kaydında drain 858 ms ölçülmüştü) | saniyeler |
| Doğrulama | ADIM 2b + smoke | dakikalar (kesintisiz) |

Kilit riski migration'ın kendi timeout'larıyla sınırlıdır: canlı PG'de `lock_timeout=0`
(sınırsız) olduğu için `SET LOCAL lock_timeout='3s'` **kritik korumadır** — kilit alınamazsa
migration hızlı düşer, canlıyı kuyruğa sokmaz.

---

## 9. Adım sırası, durma ve geri dönüş koşulları

| Adım | İşlem | Durma koşulu (STOP) | Geri dönüş |
|---|---|---|---|
| **0** | Action-time revalidation: paket hash'leri + staged R20 kopyaları = canlı | herhangi bir hash uyuşmazlığı | — (henüz mutasyon yok) |
| **1** | `BACKUP-01`: `docker exec hukuk-postgres pg_dump` → SHA-256 → `pg_restore --list` → **disposable prova restore** | dump exit≠0 · restore provası FAIL | — |
| **2** | Pre-status **pending EXACT 1** doğrula → `prisma migrate deploy` (**tek çağrı**) | pending ≠ 1 · deploy exit≠0 | DDL kalır (nullable, atıl); kod R20'de |
| **2b** | Post-validation: ledger 129→130, iki kolon + indeks MEVCUT, **business-row mutasyonu 0**, PRE/POST fingerprint beklenen delta | kolon/indeks yok · satır mutasyonu >0 | ADIM 5 |
| **3** | `ENV-COPY-01`: RELEASE21 `.env` atomik üretilir (tmp→verify→rename), bayt eşitliği, plaintext 0 → **PRE-01 kapanır** | bayt farkı · plaintext sızıntısı | dosya kaldırılır |
| **3b** | RELEASE21 kökü salt-okunur → **PRE-07 kapanır** | ACL uygulanamaz | ACL geri alınır |
| **4** | **ATOMİK**: host `6A1EB401…` + launcher `4ACA26CD…`/`DA62DD2D…` birlikte → Stop-Task → drain → Start-Task → **PRE-08 kapanır** | `exit 104` · süreç ayağa kalkmaz · entry yolu RELEASE21 değil | **ADIM 5** |
| **5** | **ROLLBACK**: staged `R20/` üçlüsü byte-exact restore → Start-Task | — | canlı RELEASE20 `08ce8e25` |
| **6** | Smoke + cutover doğrulaması + rollback hedefi kaydı → **İ7 ölçütü** | — | — |

**Geri dönüş hedefi: RELEASE20 / `08ce8e2559b4d1d67fcee245413de510209507f3`**, web BUILD_ID
`LW4jlJUOMHrvVEqakKB3i`, launcher/host üçlüsü §4'teki hash'ler. Makbuzda `supersedes` altında
sabittir ve cutover sonrası **deploy edilmez**, çalışır durumda korunur.

---

## 10. TEK ONAY METNİ (owner kararı — son adım)

```text
PAKET      : HY_W4_RELEASE21
             kaynak      2187a78b1621f168605920cdffccb17381dc171a
             packageDigest 851C07DFCD2C6FBBA3A705840A401D4E8693A8F75BA62EE964C8763200B84A22
             receiptDigest 94BAE5118E232DADFB773264ED9E84D40709820BD9FC761DA5AE16E707D3C990
             web BUILD_ID  g91HUaBesekB-R2rRawQj

KOMUT      : ADIM 1 BACKUP-01 (docker exec hukuk-postgres pg_dump + SHA-256 +
             pg_restore --list + disposable prova restore)
             ADIM 2 prisma migrate deploy — TEK çağrı, pending EXACT 1 ön koşuluyla
                    (20260908171230_office_a07_approval_execution_binding)
             ADIM 3 ENV-COPY-01 (RELEASE21 .env, atomik)
             ADIM 3b RELEASE21 kökü salt-okunur
             ADIM 4 ATOMİK host+launcher değişimi → Stop/drain/Start

CANLI ETKİ : DDL: CaseStatusHistory'ye iki NULLABLE kolon + bir indeks (kalıcı).
             İş verisi mutasyonu: 0 (ADIM 2b ile ölçülür).
             Servis: API ve Web yeniden başlar; kod RELEASE20 → RELEASE21.

KESİNTİ    : migration üst sınır ≤ 33 s (kendi timeout'ları) + servis stop/drain/start
             (saniyeler). RESMÎ PENCERE Office/C33 cutover paketinden gelir — bu belge
             pencere ÜRETMEZ.

YEDEK      : BACKUP-01 dump (SHA-256 + prova restore ile kanıtlı)
ROLLBACK   : RELEASE20 / 08ce8e25 · web BUILD_ID LW4jlJUOMHrvVEqakKB3i ·
             staged R20 üçlüsü byte-exact restore (DC4C5AE4… / E95EF7D7… / B2B11057…)

BAŞARISIZLIK DAVRANIŞI:
  · migration kilit alamazsa → 3 s'de düşer, TAM geri alma, canlı kuyruğa girmez
  · migration hata verirse   → atomik DDL, kısmi durum YOK
  · ADIM 4'te exit 104       → API DOWN; ADIM 5 byte-exact restore ile RELEASE20 döner
  · her adım fail-closed     → ölçülemeyen sonuç "başarılı" SAYILMAZ

ÖN ŞART (onaydan önce kapatılmalı):
  · §7 yanlış rollback BUILD_ID düzeltilsin (yeniden mühür) VEYA erratum kaydedilsin
  · cutover yürütme paketi (kesinti penceresi + owner komutu + nonce/zarf + runbook) üretilsin
```

---

## 11. Bu belgeye dahil OLMAYAN kararlar

**İ4** (H7 portal kapsamı), **İ5** (F04 kanıt yöntemi) ve **İ1b** (canlı sentetik tenant)
bu yayın onayına **dahil değildir** ve verilmiş sayılmaz. İ8'in öncülü İ1b'dir; ayrı owner
onayı ister.

## 12. Bu turda yapılmayanlar

Migration · servis değişimi · cutover başlatma · production yazımı · `.env` üretimi · ACL
değişikliği · paket/mühür değişikliği · Office/C33 çalışma alanına yazma. **Canlı mutasyon: 0.**
Yalnız `SELECT` ve dosya okuması yapılmıştır.


---

# 13. UZLAŞTIRMA — CUTOVER UYGULANDI (2026-09-09, append-only)

> §1–§12 **cutover öncesi** hazırlıktır ve olduğu gibi korunur. Bu bölüm, cutover
> uygulandıktan sonra CLIENT hattının **bağımsız** salt-okuma ölçümüdür. Canlı mutasyon **0**.

## 13.1 OFFICE/C33'ün sonuç raporu — bulundu ve okundu

`HY_C33_RELEASE21_CUTOVER_R25_VERIFY_REPAIR_CANDIDATE_20260909T105432Z/cutover-receipts/`
**`CUTOVER-CUT-20260909-143723-0b9bc330.json`**

| Alan | Değer |
|---|---|
| `runId` | `CUT-20260909-143723-0b9bc330` |
| `startedUtc` → `finishedUtc` | `2026-09-09T11:37:23Z` → `2026-09-09T11:39:04Z` — **101 sn** |
| `phase` / `verdict` | `COMMITTED` / **`C33_RELEASE21_CUTOVER_APPLIED_AND_VERIFIED`** |
| Kapılar | **31/31 PASS · 0 FAIL** |
| `cutover.*` | `hostReplaced` · `apiLauncherReplaced` · `webLauncherReplaced` · `apiStarted` · `webStarted` · `committed` = hepsi `true` |
| `rollback.performed` | `false` (gerekmedi) |
| `dbMutations` · `provisioningCalls` · `forceKills` | **0 · 0 · 0** |
| `dbPre` / `dbPost` | `130\|130\|0\|0\|…` / **aynı** |
| `secrets.valuesWritten` / `envCopiedByteExact` | `0` / `true` |
| **V-03** | **PRE-01/06/07/08 yeniden doğrulandı** |

`dbPre == dbPost` olduğu için **migration bu koşumda uygulanmamıştır** — ledger cutover'dan
önce zaten 130'du. Bu, §8.10.6'daki *"MIGRATION C33 cutover motorunda KOŞAMAZ"* kaydıyla
tutarlıdır: migration ayrı bir işlemle uygulanmıştır.

## 13.2 Ölçülen zaman çizgisi (hepsi 2026-09-09 UTC)

```text
09:23:24Z  MIGRATION uygulandi (_prisma_migrations.finished_at) — ledger 129 -> 130
           ~2 sa 14 dk boyunca CANLI hala RELEASE20, migrate edilmis semaya karsi kostu
11:37:23Z  CUTOVER basladi (makbuz startedUtc)
11:37:55Z  host + launcher takasi (dosya mtime)
11:39:04Z  CUTOVER bitti — COMMITTED, 31/31
15:15:03Z  Web sureci yeniden basladi (PID 22440)
15:30:03Z  API sureci yeniden basladi (PID 27312)
```

**Migration ÖNCE, cutover SONRA** — §9'daki adım sırasının güvenli hâli. Aradaki ~2 sa 14 dk,
§5'te kurulan **uyumluluk dayanağının fiilen taşıdığı penceredir**: RELEASE20 iki yeni
nullable kolonu tanımaz, `INSERT`/`SELECT` kolonları açıkça sıralar, dolayısıyla kolonlar
atıl kalır. Bu pencerede kusur bildirilmemiştir.

> §8.10.8'de **elenen** "cutover sonrası migration" seçeneği (RELEASE21 istemcisinin kolonsuz
> şemaya karşı `GET /case-status/:caseId/history` 500'ü) **gerçekleşmemiştir**; uygulanan sıra
> tam tersidir.

## 13.3 CLIENT hattının bağımsız ölçümü (salt-okuma, yazma 0)

| Ölçüm | Sonuç |
|---|---|
| Canlı dinleyiciler | API `:8080` **pid 27312** · Web `:3002` **pid 22440** (İ7 öncesi taban 61532/47868 **değişti**) |
| Süreçlerin kökü | **ikisi de `HY_W4_RELEASE21`** |
| Launcher pointer | `start-api.ps1:33` ve `start-web.ps1:26` → **`HY_W4_RELEASE21`** → **PRE-08 karşılandı** |
| Canlı launcher sha256 | api **`4ACA26CD…`** · web **`DA62DD2D…`** — forward host'un `SHA_PAPI`/`SHA_PWEB` pinleriyle **birebir** |
| `_prisma_migrations` | **130 kayıt · 130 başarılı · 0 sorunlu** |
| Hedef migration | `20260908171230_office_a07_approval_execution_binding` — `finished=EVET`, `rolled_back=hayır` |
| Fiili şema | `approvalRequestId text NULL` · `approvalAttempt integer NULL` · hedef indeks **VAR** |
| `CaseStatusHistory` satır | **930** — cutover öncesi ölçümümle **aynı** → o tabloda iş-satırı mutasyonu **0** |

## 13.4 İ7 ölçütünün üç ayağı

R02 ölçütü: *"Cutover uygulandı ve doğrulandı; rollback hedefi kayıtlı."*

| Ayak | Durum | Dayanak |
|---|---|---|
| **Cutover uygulandı** | ✅ | Makbuz `COMMITTED` + CLIENT hattının bağımsız ölçümü (§13.3) |
| **Doğrulandı** | ✅ | 31/31 kapı PASS (V-03 ile PRE-01/06/07/08 yeniden doğrulandı; C-03/C-04 servisler ayakta; V-01 DB değişmedi; V-02 görevler Running) + ana yürütücünün bağımsız doğrulaması (OFFICE §8.12.2) + §13.3 |
| **Rollback hedefi kayıtlı** | ⚠ **KUSURLU** | §13.5 |

## 13.5 AÇIK KUSUR — rollback kaydındaki BUILD_ID düzeltilmedi

§7'de cutover **öncesi** bildirdiğim kusur **giderilmeden** cutover uygulandı:

| | |
|---|---|
| Kayıt | `cutover-staging/generations/WEB-LAUNCHER-GENERATION.json` → `rollbackGeneration` |
| Etiket | `generationId: R20` · `releaseRoot: …\HY_W4_RELEASE20` |
| `buildId` (gerçek) | **`lt2ag97od6jT4jHG2NX7N`** — bu **RELEASE18**'in BUILD_ID'sidir |
| Olması gereken | **`LW4jlJUOMHrvVEqakKB3i`** (RELEASE20) |
| Yeniden mühür | **YOK** — `packageDigest` hâlâ `851C07DFCD2C6FBBA3A705840A401D4E8693A8F75BA62EE964C8763200B84A22` |

**Ölçülen BUILD_ID'ler:** R18 `lt2ag97od6jT4jHG2NX7N` · R19 `xFgJAoTFqlTjW89Zf2CYS` ·
R20 `LW4jlJUOMHrvVEqakKB3i` · R21 (canlı) `g91HUaBesekB-R2rRawQj`.

**Geri dönüş MALZEMESİ sağlamdır** (bu turda doğrulandı) — kusur yalnız kayıttadır:

| Kalem | Ölçüm |
|---|---|
| staged `R20/start-api.ps1` | `DC4C5AE49B4319F3237CECFED6315923719D234D8C1681BAAB5979BDDEC32489` · `ReleaseRoot = HY_W4_RELEASE20` |
| staged `R20/start-web.ps1` | `E95EF7D7928CFED007909B191B18C1EDB6BE5A5FBC89F6E391CB128B149B9F5B` |
| staged `R20/hukuk-task-host.exe` | `B2B11057744A3614A0F291D226BDA0F6A27F0023C3AF95813B857D3F6450A5BA` |
| RELEASE20 kökü · api `dist` · web `.next` | **mevcut** |

**Risk:** geri dönüş sonrası doğrulama bu `buildId` alanına göre yapılırsa **yanlış FAIL**
üretir; "düzeltme" adına RELEASE18'e yönelme riski doğar.

## 13.6 İkinci kayıt açığı — cutover makbuzu depoda değil

`CUTOVER-CUT-20260909-143723-0b9bc330.json` yalnız **çalışma dizinindedir**; `origin/main`'de
RELEASE21 cutover sonuç kaydı **yoktur**. Ayrıca OFFICE teslim planının başlığı hâlâ
*"Canlı: RELEASE20 @ `08ce8e25` · BUILD_ID `LW4jlJUOMHrvVEqakKB3i`"* demektedir — cutover'a
göre **bayattır**. (Bu iki kalem OFFICE hattınındır; CLIENT hattı o belgeye yazmaz.)

## 13.7 Şerh — canlı host binary'si mühürlü kayıtta yok

Canlı `hukuk-task-host.exe` = **`1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22`**;
staged forward host `6A1EB401…` ve rollback host `B2B11057…` ile **eşleşmez**. Bu,
`HOST-GENERATION.json`'daki `byteExactReproducible: false` / `semanticIdentity: true`
kaydıyla **tutarlıdır** (host yerel derlenir; kimlik bağı exe hash'i değil `pins`'tir) ve
cutover kapısı C-02 `hostReplaced` ile geçmiştir. Yine de **fiilen çalışan host'un sha256'sı
hiçbir mühürlü kayıtta bulunmamaktadır** — denetlenebilirlik açığı olarak kaydedilir.

## 13.8 SONUÇ

**İ7 KAPANMADI — sayaç 5/17'de korunur.** İlk iki ayak karşılandı ve bağımsız doğrulandı;
üçüncü ayak (**rollback hedefi kayıtlı**) *maddeten* sağlanmış ama *kaydı kusurludur*.

İ7'nin kapanması için gereken iki işlem (**ikisi de OFFICE/C33 hattında**):

1. `WEB-LAUNCHER-GENERATION.json` → `rollbackGeneration.buildId` **`LW4jlJUOMHrvVEqakKB3i`**
   olarak düzeltilip paket yeniden mühürlensin **veya** owner onaylı bir **erratum** kaydedilsin
   (geri dönüş doğrulaması bu değerle yapılacak şekilde).
2. Cutover makbuzu (`CUT-20260909-143723-0b9bc330`, verdict + 31/31) **depoya** alınsın ve
   OFFICE planının "Canlı" başlığı RELEASE21'e güncellensin.

Bu ikisi kapandığında İ7 ölçütü tam karşılanır ve sayaç **6/17** olur. Hizmet kabulü bu
işlemlerden **etkilenmez**: **0/8 tam** kalır — cutover kod sürümünü değiştirir, hizmet
kabulü üretmez.


---

# 14. KAPANIŞ UZLAŞTIRMASI — OFFICE §8.14 SONRASI (2026-09-10, append-only)

> §13, OFFICE §8.14 (#2586, squash `28f41b68`) **birleşmeden önce** yazılmıştı ve yalnız
> **aday paketini** (`HY_C33_RELEASE21_CANDIDATE`) taramıştı. Bu bölüm, cutover'ın **fiilen
> koşulduğu** R25 paketini de kapsayan salt-okuma uzlaştırmadır. Yeni koşum, migration, cutover,
> yeniden mühürleme veya canlı kabul tekrarı **yapılmadı**. Canlı mutasyon **0**.

## 14.1 OFFICE düzeltmesi — §8.14 ne yaptı, ne yapmadı

| Kalem | §8.14 | Bu turda bağımsız doğrulama |
|---|---|---|
| Canlı başlık | güncel satır eklendi (`RELEASE21 @ 2187a78b… · g91HUaBesekB-R2rRawQj`), 2026-09-08 değeri **BAYAT** işaretli, §8.2 tarihsel metne dokunulmadı | `origin/main` satır 8-9'da mevcut ✔ |
| Cutover makbuzu | depoya alındı: `CUTOVER-CUT-20260909-143723-0b9bc330.json` sha256 `7DEED4E7…`, `COMMITTED`, 31/31, `dbMutations 0` | dosyanın diskteki sha256'sı **birebir** `7DEED4E7F1A9AE543A9676DE706ACAD9AA92DD0CA45DB04E1D2B91AC4564C856` ✔ |
| Rollback `buildId` kusuru | **açık kalem** olarak kaydedildi; iki seçenek (A: düzelt + yeniden mühür · B: owner onaylı erratum); ana yürütücü kendi kusurunu kayda geçirdi; karar owner'ın | aday paketi `packageDigest 851C07DF…` **değişmedi** → tarihsel mühür korunmuş ✔ |
| Host hash şerhi | §13.7'den **devralındı, kapatılmadı** | **§14.3'te kapanıyor** — şerh eksik taramaya dayanıyordu |

## 14.2 Bağ zinciri — makbuz ↔ canlı başlık ↔ rollback kaydı

Cutover'ın **fiilen koşulduğu** paket: `HY_C33_RELEASE21_CUTOVER_R25_VERIFY_REPAIR_CANDIDATE_20260909T105432Z`.

```text
OWNER-RATIFICATION-C33-RELEASE21-CUTOVER-20260908-R02
  └─ authority/CUTOVER-AUTHORITY.json   nonce c8c655b0…  singleUse  engine E991C78D…
        boundIdentities: mainSha 2187a8b… · candidateDigest 569DDCE4… ·
        manifestDigest D6082E19… · packageDigest 851C07DF… · ledger 130|130|0|0
      └─ claims/CLAIM-c8c655b0….json    consumedUtc 2026-09-09T11:37:38Z  runId CUT-20260909-143723-0b9bc330
            └─ cutover-receipts/CUTOVER-CUT-…json   P-02 MANIFEST 67 sapma=0 · P-03 engine=E991C78D…
                  P-04 refParam=MATCH · P-05 buildId=g91HUaBesekB-R2rRawQj · COMMITTED · 31/31
```

**Etkin mühür = `MANIFEST.json` `payloadDigest 38CB70C74F0DFD1BC5D9D934AF59964D931C9502EAF3F034D1F740BD659AF98E`**
(67 dosya). P-02 kapısı cutover anında "sapma=0" ölçtü; **bu turda 67 dosyanın tamamı diskle
yeniden karşılaştırıldı: sapma 0.** Canlı başlık (§8.14.1) ile makbuz (§8.14.2) aynı kimliği
taşır: kaynak `2187a78b…`, BUILD_ID `g91HUaBesekB-R2rRawQj`.

**Rollback kaydı — yetkili olan doğrudur.** Mühürlü `docs/ROLLBACK-PINS.md` (MANIFEST'te, diskle
birebir; orijinal R25 kopyasıyla **özdeş**):

| Alan | Değer |
|---|---|
| Rollback hedefi | `HY_W4_RELEASE20` @ `08ce8e2559b4d1d67fcee245413de510209507f3` |
| Rollback web BUILD_ID | **`LW4jlJUOMHrvVEqakKB3i`** ✔ (doğru) |
| R20 üçlüsü | host `B2B11057…` · api `DC4C5AE4…` · web `E95EF7D7…` |
| R20 kökü / `dist` / `.next` | diskte mevcut (§13.5'te doğrulandı) |

Yanlış `buildId` (`lt2ag97od6jT4jHG2NX7N`) **yalnız aday paketinin staging dosyasında**
(`cutover-staging/generations/WEB-LAUNCHER-GENERATION.json`) kalmıştır; bu dosya cutover
motorunun rollback kararında **kullanılmaz** (OP-03b/P-13 kapıları `ROLLBACK-PINS.md` ve
`.env` sha-pin'ini okur). Sınıf: **ikincil kayıt kusuru**, OFFICE §8.14.3'te owner kararına açık.

## 14.3 Canlı host — tam hash ↔ üretim kaynağı ↔ yetkili uygulama kaydı

§13.7'deki *"hiçbir mühürlü kayıtta yok"* şerhi **yanlıştı** — tarama yalnız aday paketinde
yapılmıştı. R25 paketinde bağ **mühürlüdür**:

| Bağ | Kayıt (MANIFEST'te, diskle birebir) | İçerik |
|---|---|---|
| **Tam hash** | `evidence/host-build-R21.txt` | `HOST R21 sha=1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22 bytes=26112 byteExact=False semantic=True pre!=post True api=True web=True` |
| **Üretim kaynağı** | aynı dosya | `profileId=PRF-383c29db-…` · `SHA_PAPI=4ACA26CD…` · `SHA_PWEB=DA62DD2D…` · `MANIFEST=84E530B1…` — canlı launcher sha256'larıyla **birebir** (§13.3) |
| **Yeniden üretim izi** | `docs/ROLLBACK-PINS.md` satır 37/47 · `FORK-PROVENANCE.json` `pins[0].to` / `rules[40].to` | *"host yeniden üretildi ve `FC686167…` → `1397C54C…` değişti; katman 2 forku yeniden koşuldu"* |
| **Yetkili uygulama** | makbuz C-02 `host=True` (preimage→post) · P-03 `engine=E991C78D…` · authority/claim zinciri (§14.2) | host takası bu runId altında, tüketilmiş tek-kullanımlık nonce ile yapıldı |

Canlı `hukuk-task-host.exe` bu turda yeniden ölçüldü: **`1397C54C…`** — kayıtla **birebir**.
`byteExactReproducible:false` açıklaması bu bağın **yerine konmamıştır**; bağ, hash'in kendisi
üzerinden kurulmuştur.

## 14.4 Tarihsel paket/mühür korunmuş mu

| Mühür | Değer | Durum |
|---|---|---|
| Aday `packageDigest` | `851C07DF…` | değişmedi ✔ (authority `boundIdentities` ile aynı) |
| Aday `receiptDigest` | `94BAE511…` | değişmedi ✔ |
| R25 immutable base `unsealedDigest` | `CC94722D…` | 55 dosya listesinden **yeniden hesaplandı, birebir** ✔ |
| R25 etkin `payloadDigest` | `38CB70C7…` | 67 dosya diskle sapma 0 ✔ |

APPROVED-IDENTITY (09:58Z) listesine göre sonradan değişen 5 dosya (`FORK-PROVENANCE.json`,
`fork/fork-r24-to-r25.js`, `fork/templates/…forked.ps1`, `qualification/REAL-PRIMITIVES-RESULTS.json`,
`qualification/Verify-Package.node.js`) VERIFY_REPAIR adayının **kayıtlı onarım deltasıdır**
(`PACKAGE-IDENTITY.json` `repairScope`), mühür ihlali değildir; MANIFEST bu son hâli mühürler.

## 14.5 İ7 ölçütü — tek kapanış sonucu

R02: *"Cutover uygulandı ve doğrulandı; rollback hedefi kayıtlı."*

| Ayak | Sonuç | Dayanak |
|---|---|---|
| Cutover uygulandı | ✅ | makbuz `COMMITTED` (depoda, sha `7DEED4E7…`) + §13.3 bağımsız ölçüm |
| Doğrulandı | ✅ | 31/31 kapı (V-03: PRE-01/06/07/08) + OFFICE §8.12.2 + §13.3 + §14.2 zincir |
| Rollback hedefi kayıtlı | ✅ | mühürlü `ROLLBACK-PINS.md`: RELEASE20 `08ce8e25…`, BUILD_ID `LW4jlJUO…`, üçlü hash; malzeme diskte |

**İ7 KAPANDI → 6/17 tamam, 11 kalan.** §13.8'deki *"kapanmadı"* hükmü **düzeltilmiştir**:
o hüküm rollback kaydını yalnız aday paketinin staging dosyasında aramıştı; cutover'ın
kullandığı mühürlü kayıt doğrudur.

**Taşınan açık kalem (kapanışı engellemez):** staging `buildId` kusuru — OFFICE §8.14.3, owner
kararı (A/B). PR birleşmesi teknik kanıt sayılmadı; her bağ dosya hash'iyle ölçüldü.

**Hizmet kabulü 0/8 tam kalır** — cutover kod sürümünü değiştirdi, hizmet kabulü üretmedi.

## 14.6 Bu turda yapılmayanlar

Migration · cutover · yeniden mühürleme · canlı kabul tekrarı · yeni koşum · OFFICE belgesine
yazma · #2586'ya müdahale. Yalnız `SELECT`, dosya okuması ve hash hesabı.
