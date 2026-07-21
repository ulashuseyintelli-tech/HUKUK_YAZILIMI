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
