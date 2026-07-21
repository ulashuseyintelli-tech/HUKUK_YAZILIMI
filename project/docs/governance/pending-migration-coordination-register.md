# Pending Migration Coordination Register

```text
Belge yolu : project/docs/governance/pending-migration-coordination-register.md
Durum      : LIVING / NON-NORMATIVE COORDINATION SURFACE
Rol        : Gerçek hukuk_db üzerinde `prisma migrate status` ile tespit edilen, henüz
             live-apply edilmemiş migration kuyruğunu cross-workstream görünür kılar.
             Domain governance, semantic authority veya implementation izni ÜRETMEZ;
             yalnız hangi migration'ın hangi workstream'e ait olduğunu ve hangi owner
             yetkisini beklediğini kaydeder.
Kuruluş    : 2026-07-21, OFFICE-AUTH-P02-HARDENING-R01 GO-MIGRATE preflight'inde tespit
             edilen migration-queue collision üzerine owner talimatıyla açıldı.
```

## 1. Neden bu belge var

OFFICE-AUTH-P02-HARDENING-R01 için verilen bir GO-MIGRATE görevi sırasında, gerçek
`hukuk_db` üzerinde `prisma migrate status` çalıştırıldığında **4 pending migration**
tespit edildi — yalnız görevin hedef aldığı migration değil. Prisma'nın canonical
`prisma migrate deploy` komutu pending migration'ları **sıralı ve topluca** uygular;
belirli bir migration'ı atlayıp yalnız birini seçerek uygulayan bir mekanizma yoktur.
Bu nedenle tek bir workstream'in GO-MIGRATE yetkisi, farkında olmadan başka
workstream'lerin migration'larını da canlıya taşıyabilir. Bu belge bu riski görünür
kılmak ve her migration'ın kendi owner yetkisini beklemesini sağlamak için açılmıştır.

## 2. Tespit anındaki durum (2026-07-21, salt-okuma preflight kanıtı)

**DB kimliği:** host `hukuk-postgres` (localhost:5432), database `hukuk_db`, 3 tenant
(read-only `SELECT COUNT(*) FROM "Tenant"` ile doğrulandı).

| # | Migration | Domain | İlişki | Durum |
|---|---|---|---|---|
| 1 | `20260720225814_office_auth_p02_password_reset_token` | OFFICE | Migration #3'ün **zorunlu ön koşulu** (`PasswordResetToken` tablosunu ve `PasswordResetToken_userId_fkey` FK'sini yaratır; #3 bu FK'yi `DROP CONSTRAINT` ile hedefler) | OFFICE-AUTH-P02 baseline'ının kendi migration'ı; koda göre "BASELINE IMPLEMENTED/CANONICAL" ama DB'ye hiç uygulanmamış |
| 2 | `20260721002219_legal_application_writer_evidence` | LEGAL APPLICATION | OFFICE'le ilişkisiz | **Ayrı owner yetkisi gerekli** — bu register'da değerlendirilmedi, o workstream'in kendi sorumluluğu |
| 3 | `20260721010000_office_auth_p02_hardening_r01_composite_fk` | OFFICE | PR #1494 ile merge edilen hardening migration'ı | Bu GO-MIGRATE görevinin doğrudan hedefi |
| 4 | `20260721063256_client_p2_u02_portal_user_token_version` | CLIENT | OFFICE'le ilişkisiz | **Ayrı owner yetkisi gerekli** — BOUNDARY EXIT ile açıkça bu görevin kapsamı dışında bırakılmıştır |

**Ek salt-okuma doğrulaması:** `PasswordResetToken` tablosu DB'de yok
(`to_regclass('public."PasswordResetToken"')` → NULL); `ClientPortalUser.tokenVersion`
kolonu da yok. Her iki bulgu da yukarıdaki "hiç uygulanmamış" tespitiyle tutarlıdır.
Migration dosyalarının içeriği (`git show`/doğrudan okuma ile) doğrulandı: #1 ve #3
yalnız `User`/`PasswordResetToken` şemasına dokunur, #2/#4 ise sırasıyla kendi
domainlerine özgü, birbirinden ve OFFICE'ten bağımsız tek-amaçlı DDL'lerdir. Migration
#3 içinde RCV-COL FK isimlendirme drift'ine dair hiçbir statement YOKTUR.

## 3. Owner kararı (2026-07-21) — MIGRATION QUEUE COLLISION

Owner, bu tespit üzerine OFFICE-AUTH-P02-HARDENING-R01 GO-MIGRATE görevini durdurdu:

```text
CURRENT GO-MIGRATE:
SUSPENDED / BLOCKED AT PREFLIGHT
```

**Bağlayıcı DO-NOT listesi** (owner talimatından birebir):
- `prisma migrate deploy` çalıştırılmaz.
- Dört migration OFFICE yetkisi altında topluca uygulanmaz.
- `migrate resolve` kullanılmaz.
- Manuel DDL veya seçici schema mutation yapılmaz.
- Pending migration klasörleri silinmez, taşınmaz veya yeniden adlandırılmaz.
- Migration geçmişi rewrite edilmez.

Bu belgenin kendisi de canlı DB mutation'ı İÇERMEZ; yalnızca preflight kanıtını
canonical olarak kaydeder.

## 4. Workstream bazlı disposition

| Workstream | Migration(lar) | Disposition | Sonraki adım |
|---|---|---|---|
| **OFFICE** (AUTH-P02 baseline + HARDENING-R01) | #1 + #3 | SUSPENDED / BLOCKED AT PREFLIGHT | Bu register'daki queue collision çözülmeden OFFICE'in kendi GO-MIGRATE'i devam edemez. IMPLEMENTATION AUTHORITY: NONE (migration'lar merge edilmiş/CI-geçmiş ama canlıya hiç uygulanmamış). |
| **LEGAL APPLICATION** | #2 | **Bu register'da değerlendirilmedi** | Kendi workstream owner'ından ayrı GO-MIGRATE yetkisi gerekir. |
| **CLIENT** (P2-U02) | #4 | **Bu register'da değerlendirilmedi** | Kendi workstream owner'ından ayrı GO-MIGRATE yetkisi gerekir; bu görevin BOUNDARY EXIT'i CLIENT kapsamına girmeyi açıkça yasaklamıştır. |

## 5. Çözüm için olası yönler (owner kararı gerektirir — bu belge SEÇMEZ)

Bu register hiçbir yönü seçmez veya önermez; yalnız aşağıdaki seçeneklerin var
olduğunu ve her birinin ayrı bir owner kararı gerektirdiğini kaydeder:
- Her workstream owner'ı kendi migration'ı için ayrı GO-MIGRATE yetkisi verir; migration'lar
  `prisma migrate deploy`'un doğal sıralı-toplu davranışıyla tek bir apply penceresinde
  ama TÜM ilgili owner'ların açık onayıyla birlikte uygulanır.
  - **Şema/veri riski analizi:** #2 ve #4 saf additive/tek-kolon DDL'lerdir (owner
    onaylarından bağımsız olarak dosya içeriği doğrulandı); #1+#3 zinciri de additive
    (yeni tablo + composite FK + partial index). Şu ana kadarki kanıt hiçbirinin
    diğerini veri/şema seviyesinde bozacağına dair bir işaret taşımıyor — ama bu,
    ilgili owner'ların KENDİ migration'ları için ayrı GO-MIGRATE yetkisi vermesinin
    yerine geçmez.
- Migration dosyalarının kendisi (sıra/adlandırma) korunarak, yalnız hangi migration
  setinin uygulanacağına dair owner'lar arası bir zamanlama/sıra mutabakatı sağlanır.
- OFFICE kendi payını (#1+#3) beklemeye devam eder; #2/#4 başka bir GO-MIGRATE
  penceresinde (bu register'daki tespitten bağımsız olarak) kendi owner'larınca
  ele alınır — ama unutulmamalı: `prisma migrate deploy` DAİMA TÜM pending
  migration'ları uygular, dolayısıyla #2/#4'ü uygulayan biri istemeden #1/#3'ü de
  uygulamış olur (ve tersi).

## 6. İlgili kayıtlar

- `decision-log.md` — bu register'ın kuruluş kaydı (2026-07-21,
  `OFFICE-AUTH-P02-HARDENING-R01-GOMIGRATE-SUSPEND-01`).
- `GOVERNANCE-INDEX.md` — bu register'ın harita girişi.
- PR #1494 (`b9916f5bfe9a27e483d779e5c98d31828552f92e`) — HARDENING-R01'in kod tarafı,
  MERGED/CANONICAL; bu register yalnız DB-apply tarafını kapsar.

---

## 7. CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01 — GO-ANALYZE + GO-DOCS sonucu (2026-07-21)

**Mode:** READ-ONLY MIGRATION COORDINATION. Gerçek `hukuk_db`'de HİÇBİR mutation
yapılmadı; bu bölüm yalnız salt-okuma `prisma migrate status`, salt-okuma SQL
sorguları ve **disposable** (izole, tek-kullanımlık, bu görevle birlikte imha
edilen) Postgres konteynerleri üzerindeki rehearsal/backup-restore-doğrulama
kanıtını kaydeder.

### 7.1 Owner/PR/SHA tablosu

| Gate | Migration | Domain | PR | Squash/Merge SHA | Merged At (UTC) |
|---|---|---|---|---|---|
| M1 | `20260720225814_office_auth_p02_password_reset_token` | OFFICE | #1481 | `7676d8514292f03914f1f46c0c67041f04489194` | 2026-07-20T23:45:06Z |
| M2 | `20260721002219_legal_application_writer_evidence` | LEGAL APPLICATION | #1470 | `9dabe8dbddecafad49dbe58958ef2c3642d14a01` | 2026-07-20T22:03:18Z |
| M3 | `20260721010000_office_auth_p02_hardening_r01_composite_fk` | OFFICE | #1494 | `b9916f5bfe9a27e483d779e5c98d31828552f92e` | 2026-07-21T07:49:30Z |
| M4 | `20260721063256_client_p2_u02_portal_user_token_version` | CLIENT | #1493 | `289068f17319c58400d3ce80770f23612b50eaa3` | 2026-07-21T14:11:28Z |

Tüm 4 SHA `git merge-base --is-ancestor <sha> origin/main` ile fresh `origin/main`
ata zinciri içinde doğrulandı. Dördü de gerçek PR merge'i (state: MERGED); hiçbiri
cherry-pick, doğrudan push veya rewrite değildir.

### 7.2 KRİTİK BULGU — gerçek kronolojik merge sırası owner'ın numaralandırma sırasından FARKLI

Owner'ın brief'i migration'ları "M1→M2→M3→M4" olarak numaralandırdı (muhtemelen
migration klasör adlarındaki timestamp'e göre — bu timestamp `prisma migrate dev`
ile migration'ın YAZILDIĞI anı yansıtır, PR'ın gerçekten merge edildiği anı DEĞİL).
`git merge-base --is-ancestor 9dabe8db 7676d851` → **YES**: **M2, M1'den ÖNCE
merge edilmiştir** (22:03 vs 23:45, aynı gün). Gerçek kronolojik merge sırası:

```text
M2 (2026-07-20T22:03:18Z) → M1 (2026-07-20T23:45:06Z) → M3 (2026-07-21T07:49:30Z) → M4 (2026-07-21T14:11:28Z)
```

**Neden önemli:** owner'ın REQUIRED EXECUTION MODEL'i "her migration'ı ilk kez
içeren canonical merge SHA'ya anchor'la, o checkout'ta `prisma migrate deploy`
yalnız sıradaki pending migration'ı uygulasın" diyor. Bu mekanizma yalnız anchor
SHA'lar GERÇEK kronolojik sırayla ziyaret edilirse çalışır — çünkü M2, M1'den önce
var olduğu için, M1'i içeren HERHANGİ bir commit (M1'in kendi merge SHA'sı dahil)
zaten M2'yi de İÇERİR. Eğer gate'ler owner'ın numaralandırdığı sırayla (M1 önce)
ziyaret edilirse, GATE M1'in `migrate deploy`'u M2'yi de sessizce uygular —
**LEGAL APPLICATION'ın kendi owner yetkisi olmadan.** Bu, tam da owner'ın
PROHIBITED listesinde yasakladığı "dört migration'ı tek bir domain yetkisi altında
topluca uygulama" durumunun sessizce gerçekleşmesi anlamına gelir.

**Bu register hiçbir gate sırasını SEÇMEZ** (owner kararı); yalnız iki seçeneği
ve sonuçlarını kaydeder:

- **Seçenek A (önerilir):** Gate'ler GERÇEK kronolojik sırayla icra edilir:
  **GATE M2 önce, sonra GATE M1, sonra GATE M3, sonra GATE M4.** Gate NUMARALARI
  (M1/M2/M3/M4 etiketleri, owner'ın brief'indeki isimlendirme) DEĞİŞMEZ; yalnız
  icra SIRASI gerçek tarihe uyar. Bu, "her adım yalnız bir sonraki migration'ı
  uygular" gereksinimini harfiyen sağlayan TEK yoldur (aşağıda §7.4'te empirik
  kanıtlanmıştır).
- **Seçenek B:** Owner GATE M1'in GATE M2'den önce icra edilmesinde ısrar eder.
  Bu durumda GATE M1'in `migrate deploy`'u teknik olarak M2'yi de uygular (M2
  bağımsız/additive olduğu için ZARARSIZDIR — ama LEGAL APPLICATION'ın kendi ayrı
  GO-MIGRATE yetkisi bu adımdan ÖNCE alınmalıdır, aksi halde M2 kendi owner'ının
  açık onayı olmadan canlıya gitmiş olur).

### 7.3 Migration'lar arası teknik bağımlılıklar

- **M3 → M1 (ZORUNLU):** M3, M1'in yarattığı `PasswordResetToken_userId_fkey`
  FK constraint'ini `DROP CONSTRAINT` ile hedefler; M1 uygulanmadan M3 migration.sql
  satır 6'da başarısız olur.
- **M2, M4:** Diğer hiçbir migration'a bağımlı DEĞİLDİR (kendi domain'lerine özgü
  tablolara dokunur: `LegalApplicationBatch`/`LegalApplication`/`ApplicationAttribution`
  ve `ClientPortalUser`). M1/M3 ile hiçbir ortak tablo/constraint/trigger paylaşmazlar.
- M2'nin kendi İÇ güvencesi: migration'ın kendisi `LOCK TABLE ... ACCESS EXCLUSIVE`
  + `RAISE EXCEPTION` ile üç hedef tablodan herhangi biri BOŞ değilse fail-closed
  durur (bkz. §7.6, gerçek `hukuk_db`'de üçü de 0 satır).

### 7.4 Disposable full-chain rehearsal sonucu — EMPIRİK KANIT

Fresh disposable Postgres (`postgres:16-alpine`, geçici konteyner, iş bitince
imha edildi) üzerinde, `git archive <sha> -- project/apps/api/prisma` ile her
anchor SHA'daki `prisma/` snapshot'ı ayrı scratch dizinlerine çıkarıldı, ardından
GERÇEK kronolojik sırayla (§7.2 Seçenek A) sıfırdan sırayla deploy edildi:

| Adım | Anchor SHA | `migrate deploy` sonucu |
|---|---|---|
| 1 | `9dabe8db` (M2) | 89 migration bulundu, **89'u da uygulandı** (sıfırdan boş DB — tam geçmiş + M2) |
| 2 | `7676d851` (M1) | 90 migration bulundu, **yalnız 1 yeni** (`office_auth_p02_password_reset_token`) uygulandı |
| 3 | `b9916f5b` (M3) | 91 migration bulundu, **yalnız 1 yeni** (`office_auth_p02_hardening_r01_composite_fk`) uygulandı |
| 4 | `289068f1` (M4) | 92 migration bulundu, **yalnız 1 yeni** (`client_p2_u02_portal_user_token_version`) uygulandı |

Son `prisma migrate status`: **"Database schema is up to date!"** (92/92, sıfır
pending). Hiçbir adımda `migrate resolve`, manuel DDL veya migration dosyası
değişikliği KULLANILMADI — yalnız plain `prisma migrate deploy`, gerçek geçmiş
SHA'lara anchor'lanmış checkout'lardan. Bu, owner'ın Mandatory Analysis #4 ve #10
maddelerini empirik olarak doğrular: yöntem güvenli ve canonical'dır, TEK koşulu
anchor'ların gerçek kronolojik sırayla ziyaret edilmesidir (§7.2).

**Şema parmak izi (rehearsal DB, tüm 4 migration sonrası):**
- `PasswordResetToken_tenantId_userId_fkey` FOREIGN KEY `("tenantId","userId")` → `User("tenantId","id")` ✓
- `PasswordResetToken_one_unresolved_per_user` UNIQUE `("tenantId","userId") WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL` ✓
- `ClientPortalUser.tokenVersion` `integer NOT NULL DEFAULT 0` ✓
- `LegalApplicationBatch.snapshotHash`/`.minorUnit` + CHECK constraints (`snapshot_hash_check`, `minor_unit_check`, ...) ✓
- `User_tenantId_id_key` UNIQUE `("tenantId","id")` ✓

### 7.5 Backup + restore-test kanıtı

Gerçek `hukuk_db`'nin fresh `pg_dump -Fc` yedeği alındı (host'a kopyalandı,
container-içi geçici dosya silindi), SHA-256 hesaplandı, ardından **disposable**
bir Postgres'e (`postgres:16-alpine`, geçici, iş bitince imha edildi) `pg_restore`
ile geri yüklendi:

- Yedek boyutu: ~900 KB (custom-format, `-Fc`).
- SHA-256: `985da5bf0f39c158c123f4cbbc824d0fc469766ec5aaf328e955ed3eb47439b3`
- Restore sonrası doğrulama — **kaynakla birebir eşleşme:** `Tenant` 3, `User` 7,
  `ClientPortalUser` 3, en son uygulanmış migration
  `20260720184418_office_auth_p01_token_version` (kaynakla aynı).

Bu, gerçek GO-MIGRATE gate'lerinden HERHANGİ biri ateşlendiğinde kullanılacak
backup+restore mekanizmasının çalıştığını kanıtlar. Her gate kendi anındaki fresh
bir yedek almalıdır (bu yedek yalnız mekanizma kanıtıdır, gate'lerin kendi
yedeklerinin yerine GEÇMEZ).

### 7.6 Gerçek `hukuk_db` salt-okuma precheck sonuçları

| Kontrol | Sonuç |
|---|---|
| `LegalApplicationBatch` satır sayısı | 0 (M2'nin fail-closed guard'ı TETİKLENMEZ) |
| `LegalApplication` satır sayısı | 0 |
| `ApplicationAttribution` satır sayısı | 0 |
| `PasswordResetToken` tablosu | YOK (M1 hiç uygulanmamış) |
| `ClientPortalUser.tokenVersion` kolonu | YOK (M4 hiç uygulanmamış) |
| `User` satır sayısı | 7 |
| `ClientPortalUser` satır sayısı | 3 |
| En son uygulanmış migration | `20260720184418_office_auth_p01_token_version` |

### 7.7 Post-migration schema-fingerprint + domain-smoke planı (her gate kendi icrasında çalıştırır)

- **GATE M2:** `\d "LegalApplicationBatch"` + `\d "LegalApplication"` ile yeni
  kolon/CHECK/trigger'ların varlığı doğrulanır; üç hedef tablonun HÂLÂ boş
  olduğu (migration veri yazmaz) teyit edilir; API sağlıklı başlar (şema
  uyuşmazlığı nedeniyle crash YOK).
- **GATE M1:** `\d "PasswordResetToken"` ile tablo + tekli FK doğrulanır; API
  sağlıklı başlar; mevcut login akışı (tokenVersion revocation dahil) değişmeden
  çalışır. Reset-token/SMTP fonksiyonel testi bu gate'te YAPILMAZ (flag zaten
  code-level false).
- **GATE M3:** composite FK + partial unique index §7.4'teki tam şekilde
  doğrulanır (bu repo'daki HARDENING-R01 PR'ının kendi post-migration
  validation'ıyla birebir).
- **GATE M4:** `\d "ClientPortalUser"` ile `tokenVersion` kolonu + `DEFAULT 0`
  doğrulanır; mevcut 3 portal kullanıcısının `tokenVersion=0` ile göründüğü
  teyit edilir; API sağlıklı başlar.

Hiçbir gate'te feature flag açma, SMTP/canlı reset-token testi veya governance
closure YOKTUR (owner PROHIBITED listesiyle tutarlı).

### 7.8 STOP / partial-success recovery prosedürü

Prisma her migration.sql'i KENDİ transaction'ında uygular (varsayılan davranış;
M2'nin kendi içindeki `BEGIN;...COMMIT;` de bu davranışla tutarlıdır). Bu nedenle
4-gate zincirinde KISMİ başarı DAİMA güvenli bir ara durumdur — önceki gate'lerin
DDL'si geri alınmaz, başarısız gate'in DDL'si de KENDİ transaction'ı içinde tam
geri alınır (yarım kalan DDL yoktur):

- Herhangi bir gate başarısız olursa: **DUR.** `migrate resolve`, manuel DDL veya
  dosya değişikliği YAPMA (owner PROHIBITED). Prisma'nın hata çıktısını ve
  `prisma migrate status`'u kaydet, owner'a raporla.
- Önceki (başarılı) gate'lerin hiçbiri geri alınmaz veya dokunulmaz — her biri
  bağımsız/additive olduğu için (M3→M1 dışında hiçbir cross-dependency yok)
  kısmi tamamlanmış zincir kendi başına tutarlı bir durumdur.
- Yeniden deneme, yalnız başarısız olan SPESİFİK gate için, kök neden giderildikten
  sonra ve yalnız o gate'in kendi owner'ının onayıyla yapılır.

### 7.9 BLOCKER / READY verdict

```text
CROSS-WORKSTREAM-LIVE-MIGRATION-TRAIN-R01:
GO-ANALYZE + GO-DOCS COMPLETE / COORDINATION REPORT DELIVERED

LIVE DB MUTATION PERFORMED: 0

READY FOR OWNER GATE AUTHORIZATION (her biri AYRI, sırayla):
GATE M2 (LEGAL APPLICATION) — READY, önerilen ilk icra (gerçek kronolojik sıra)
GATE M1 (OFFICE baseline)   — READY, GATE M2'den SONRA icra edilmeli (Seçenek A)
GATE M3 (OFFICE hardening)  — READY, yalnız GATE M1 sonrası icra edilebilir (zorunlu bağımlılık)
GATE M4 (CLIENT P2-U02)     — READY, bağımsız, herhangi bir noktada icra edilebilir

IMPLEMENTATION AUTHORITY: NONE — hiçbir gate bu raporla yetkilendirilmemiştir.
Her gate kendi ayrı OWNER GO-MIGRATE brief'ini bekler (bkz. §7.10).
```

### 7.10 Kopyala-yapıştır GO-MIGRATE brief şablonları (her biri ayrı owner yetkisi bekler)

Aşağıdaki 4 şablon, ilgili owner tarafından AYNEN veya düzenlenerek geri
gönderildiğinde ilgili gate'in canlı icrasını başlatabilir. Hiçbiri bu raporla
kendiliğinden yetkilendirilmiş DEĞİLDİR.

**GATE M2 — OWNER GO-MIGRATE — LEGAL-APPLICATION-WRITER-EVIDENCE**
```text
OWNER GO-MIGRATE — LEGAL-APPLICATION-WRITER-EVIDENCE
AUTHORITY BASIS: PR #1470, merge SHA 9dabe8dbddecafad49dbe58958ef2c3642d14a01
TARGET MIGRATION: 20260721002219_legal_application_writer_evidence
ANCHOR: isolated worktree pinned to 9dabe8dbddecafad49dbe58958ef2c3642d14a01
PREFLIGHT: fresh backup + restore-verify; confirm LegalApplicationBatch/
  LegalApplication/ApplicationAttribution row counts (must be 0 or migration
  fail-closes by design); disposable rehearsal from this exact anchor.
EXECUTION: prisma migrate deploy only (no resolve, no manual DDL).
POST-VALIDATION: schema fingerprint per §7.7; API health smoke.
PROHIBITED: feature flag changes, live writer wiring, data backfill.
```

**GATE M1 — OWNER GO-MIGRATE — OFFICE-AUTH-P02 BASELINE MIGRATION**
```text
OWNER GO-MIGRATE — OFFICE-AUTH-P02 BASELINE MIGRATION
AUTHORITY BASIS: PR #1481, merge SHA 7676d8514292f03914f1f46c0c67041f04489194
TARGET MIGRATION: 20260720225814_office_auth_p02_password_reset_token
PRECONDITION: GATE M2 already applied (see §7.2 Option A) — otherwise this
  gate's deploy will also silently apply M2.
ANCHOR: isolated worktree pinned to 7676d8514292f03914f1f46c0c67041f04489194
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor
  (on top of a disposable DB that already has M2 applied).
EXECUTION: prisma migrate deploy only.
POST-VALIDATION: PasswordResetToken table + single FK exist; API health +
  login-flow smoke. NO reset-token/SMTP functional test (flag remains false).
PROHIBITED: OFFICE_PASSWORD_RECOVERY_ENABLED=true, SMTP/live reset-token test.
```

**GATE M3 — OWNER GO-MIGRATE — OFFICE-AUTH-P02-HARDENING-R01**
```text
OWNER GO-MIGRATE — OFFICE-AUTH-P02-HARDENING-R01
AUTHORITY BASIS: PR #1494, merge SHA b9916f5bfe9a27e483d779e5c98d31828552f92e
TARGET MIGRATION: 20260721010000_office_auth_p02_hardening_r01_composite_fk
PRECONDITION: GATE M1 already applied (hard technical dependency).
ANCHOR: isolated worktree pinned to b9916f5bfe9a27e483d779e5c98d31828552f92e
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor
  (on top of a disposable DB that already has M2+M1 applied).
EXECUTION: prisma migrate deploy only.
POST-VALIDATION: composite FK + partial unique index per §7.4; API health smoke.
PROHIBITED: OFFICE_PASSWORD_RECOVERY_ENABLED=true, SMTP/live reset-token test,
  GO-OPERATE, governance closure.
```

**GATE M4 — OWNER GO-MIGRATE — CLIENT-P2-U02 PORTAL USER TOKEN VERSION**
```text
OWNER GO-MIGRATE — CLIENT-P2-U02 PORTAL USER TOKEN VERSION
AUTHORITY BASIS: PR #1493, merge SHA 289068f17319c58400d3ce80770f23612b50eaa3
TARGET MIGRATION: 20260721063256_client_p2_u02_portal_user_token_version
ANCHOR: isolated worktree pinned to 289068f17319c58400d3ce80770f23612b50eaa3
PREFLIGHT: fresh backup + restore-verify; disposable rehearsal from this anchor.
EXECUTION: prisma migrate deploy only.
POST-VALIDATION: ClientPortalUser.tokenVersion column + default per §7.7;
  API health smoke; existing 3 portal users show tokenVersion=0.
PROHIBITED: portal session-revocation functional/live testing, governance closure.
```
