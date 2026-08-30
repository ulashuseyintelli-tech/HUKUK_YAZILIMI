# C35 — SMOKE IDENTITY SELECTION, PROVISIONING AND SECRET-SAFE VERIFICATION R01

**Durum:** `BLOCKED_MINIMUM_PRIVILEGE_AND_QUARANTINE_CONTRACT / PRESERVED / NO_PRODUCTION_MUTATION`

Bu kayit C35'in Stage 0 ve Stage A calismasini, uretilen bulgularini, owner
adjudication'ini, `C35-BLK-01` blocker'ini ve owner'in bagli mimari kararini
kanoniklestirir. C35 Stage B/C/D **hic yetkilendirilmemistir**; production'a hicbir
mutation uygulanmamistir.

Kayit **secret, credential digest'i veya hassas response degeri icermez.**

---

## §A Kapsam ve yetki

C35'in acilis yetkisi yalniz **Stage 0 ve Stage A** idi. Stage B (production
provisioning) ayri, hash-bound ve tek kullanimlik bir owner mesajina baglanmisti;
bu mesaj **verilmedi**. Stage C/D dolayisiyla hic acilmadi.

```text
Stage 0 (fresh salt-okuma preflight)  = TAMAMLANDI
Stage A (secim, uygulanabilirlik, GO-REQUEST paketi) = TAMAMLANDI
Stage B / C / D                       = NOT AUTHORIZED
PRODUCTION MUTATION                   = 0
```

---

## §B Stage 0 — fresh preflight olcumleri

```text
main == origin/main == ba2c5c8f49dedb251becfe0ea427ad192ee8d478
acik PR                                    = 0
C34 zinciri 6a96e187 / fdf9894f / ba2c5c8f = 3/3 ANCESTOR
tracked-dirty                              = TEMIZ (untracked 10, oturum basiyla ayni)

CANLI API = HY_W4_RELEASE13   pid 7476   port 8080
CANLI WEB = HY_W4_RELEASE11   pid 24872  port 3002
  -> API/Web SPLIT-VERSION durumdadir; C33 bunu kapatmayi hedefler.

task HukukPlatform-API  Running/Enabled/Limited  action: hukuk-task-host.exe api
task HukukPlatform-Web  Running/Enabled/Limited  action: hukuk-task-host.exe web

production stable-core = 277A6E46E4E7B11F04D5D6F0C57F6E9CE1DB110FC2B6568CE21BC6BB89BCFAF6
R05 canonical package  = HY_OPS_DURABILITY_R05_CANONICAL_1a5c982c-5837-450c-b624-20997b8d9198
  payload manifest     = F8B27F873047A8EC01D91F460D6A42EB53B095DD804926BB8915658DAC16FB4E
  package receipt      = 8E4DC10F108F51106938AE3BC4C11BA2940E58ECAC929ACCC6DCE314609010C3
  exact-set            = PASS
```

Canli API salt-okuma probe: `/` 404 · `/api/auth/me` 401 · `/api/cases` 401 ·
`/api/auth/capabilities` 200 (`{"passwordRecoveryEnabled":false}`).

Salt-okuma DB sekil olcumu (secret-safe probe; `SET SESSION CHARACTERISTICS AS
TRANSACTION READ ONLY`, yalniz sabit SELECT'ler, `DATABASE_URL` asla basilmaz):

```text
tenants 3 · users 34 · offices 3 · lawyers 31 · cases 30 · clients 18 · tasks 42
lookup 23/36/18/6/18 · auditlogs 942 · escalation_events 1281
migrations 128/128 finished · unfinished 0
aday slug'lar (c35-smoke-identity / c35-smoke / smoke-identity) = 3/3 BOS
Tenant lifecycle kolonlari DB'de MEVCUT (5 adet)
```

---

## §C Stage A — materyal bulgular F-01..F-04

### F-01 — `/auth/me` sozlesmesi 9 alan adidir, 23 degil

Canli RELEASE13 `user-public-projection.ts`:

```text
PUBLIC_AUTH_USER_FIELDS   = id · tenantId · email · name · surname · role   (6)
PUBLIC_AUTH_TENANT_FIELDS = id · name · slug                               (3)
TOPLAM ALLOWLISTED ALAN ADI                                                = 9
```

"23" rakami AUTHPUB T+24 kayitindaki **test sayisidir** (23/23 PASS), runtime response
alan sayisi degildir.

### F-02 — R01A eligibility kapisi C35'e uygulanamaz

R01A/R1B kapisi (`r1b-principal-availability.cjs`) dort sayac olcer ve bir bileske
verdict uretir: `activeUsers`, `loginableUsers`, `activeLawyers`, `f01CapablePrincipals`,
`usable = f01Capable > 0 && loginableUsers > 0`.

Kapi *"bu tenant bir B02 canary'si kosabilir mi"* sorusunu yanitlar; PASS almak icin
kimligin **F01-capable (office-onay yetkili)** olmasi gerekir. Bu, C35'in
minimum-privilege sozlesmesiyle **ters yondedir**: kapiyi lafzen uygulamak kimligi
daha yetkili yapmayi gerektirirdi.

### F-03 — rol secilemez; `register()` ADMIN'i hard-code eder

`auth.service.ts register()` govdesinde `role: "ADMIN"` sabittir; route uzerinden rol
parametresi yoktur. `VIEWER` uretebilecek tek yol `auth/invite`'tir ve o da **mevcut
aktif bir ADMIN** gerektirir (tavuk-yumurta).

### F-04 — tenant lifecycle RELEASE13'te etkisizdir

Bes lifecycle kolonu (`lifecycle`, `lifecycleChangedAt`, `lifecycleReason`,
`lifecycleTarget`, `quiesceToken`) DB'de mevcuttur; ancak **canli RELEASE13
schema/kaynaginda bunlara 0 referans** vardir (kanonik main'de 27). Lifecycle ile
fencing RELEASE13 uzerinde etkisizdir.

---

## §D Stage A — onerilen topoloji ve exact plan (TARIHSEL)

Onerilen topoloji: dedicated smoke tenant + tek user, **Office ve Lawyer
yaratilmadan**. Bu, C15-R1C emsalinden yapisal olarak daha guclu bir izolasyondur:

```text
greeting.service.ts               @Cron EVERY_MINUTE  ->  if (!office) continue;
operational-escalation.service.ts @Cron EVERY_HOUR    ->  if (!office) continue;
```

C15-R1C bir Office yaratip `autoGreetingEnabled=false` ile bastirmisti (config-temelli);
Office hic yaratilmadiginda dongu govdesine **hic girilmez** (veri-temelli + yapisal).

Exact mutation butcesi (`register()` tek `prisma.$transaction`; kismi durum yapisal
olarak imkansiz):

| Tablo | Satir | Key | Unique |
|---|---|---|---|
| `Tenant` | 1 | `slug` | `slug` |
| `User` | 1 | `email` | `(tenantId, email)` |
| `LookupTakipTuru` | 11 | `code` | `(tenantId, code)` |
| `LookupMahiyetTipi` | 18 | `code` | `(tenantId, code)` |
| `LookupAsama` | 9 | `code` | `(tenantId, code)` |
| `LookupRisk` | 3 | `code` | `(tenantId, code)` |
| `LookupDurumEtiketi` | 9 | `code` | `(tenantId, code)` |
| **TOPLAM** | **52 satir / 7 tablo** | | |

Kaynak yorumundaki "~53 upsert" bir yaklasimdir; kesin sayim katalog dizi
uzunluklarindan alinmis (11+18+9+3+9=50) ve production'da ampirik dogrulanmistir
(2 seed'li tenant icin lookup sayaclari tam 2x).

> **Bu plan tarihsel kanittir.** Owner karari geregi production authorization temeli
> DEGILDIR ve yeni mimariye gore yeniden turetilecektir (bkz. §H md.10).

---

## §E Secret-safe helper qualification (§3.6) — 2 bagimsiz kosum

```text
RUN-A 15/15 PASS · RUN-B 15/15 PASS  (farkli kok · farkli port · farkli beklenen slug)
sonuc vektoru SHA-256 = 3121DDD6BD87B34DB8D80789AE3859D12CB6A9FF6F2A2023B499E84EA6C982BB
SEMANTIK DENKLIK      = IDENTICAL
```

Kapilar: raw secret stdout/stderr 0 · raw HTTP body/token persistence 0 · command-line
secret 0 · environment secret 0 · log/evidence secret pattern 0 · lost-response
reconcile (uygulanmadan / uygulandiktan sonra) · precondition read kopuk -> mutation
BASLAMAZ · ikinci PROVISION'da duplicate 0 · credential yok -> fail-closed ·
broad-SID ACL -> FAIL raporlanir · credential predicate PASS (deger ve digest YOK) ·
`/auth/me` exact allowlist · toplam sunucu-tarafi register cagrisi sinirli.

### Qualification'in yakaladigi gercek helper hatalari (duzeltildi)

1. `Fail()` fail-closed exit kodunu yutuyordu: `Write-Error` + `$ErrorActionPreference='Stop'`
   terminating hata firlatiyor, evidence emit'ine hic ulasilmiyor, surec **exit 1**
   donuyordu. Fail-closed red, cagirana jenerik crash olarak gorunuyordu.
2. Okunamayan precondition read `ALREADY_PRESENT` sayiliyordu. Mutation yine
   baslamiyordu (fail-closed dogruydu) fakat **beyan yanlisti**.
3. Lost-response sonrasi belirsiz reconcile `APPLIED_CONFIRMED_BY_READ` olabiliyordu —
   dogrudan bir **yanlis pozitif uygulama iddiasi**.

Her uc durum artik `PRECONDITION_UNREADABLE` / `INDETERMINATE` + fail-closed exit
uretir ve ikinci mutation gondermez.

---

## §F Owner adjudication (Stage-A checkpoint)

Owner Stage B'yi onaylamamis; F-01, F-02, F-04'u APPROVED, F-03'u
`VERIFIED / MATERIAL_CONTRACT_CONFLICT` olarak hukme baglamistir. Bagli hukumler:

```text
PARTIAL-PROVISION POLICY:
QUARANTINE_AND_PRESERVE = REJECTED_AS_NOT_ENFORCEABLE.
CANONICAL DISABLE/REVOKE/DELETE VEYA ESDEGER FAIL-CLOSED KARANTINA MEKANIZMASI
KANITLANMADAN BU IFADE KULLANILAMAZ.

CREDENTIAL STATUS:
NOT_READY — credentialArtifactPresent=FALSE / credentialReceiptId YOK.

UTC WINDOW:
REJECTED — SECRET VE TUM KAPILAR HAZIR OLMADAN PENCERE ACILMAZ.
YENI PENCERE YURUTME ANINDA EN FAZLA 30 DAKIKALIK OLARAK URETILIR.
```

---

## §G C35-BLK-01 — alti zorunlu alan

**blockerCode**

```text
C35-BLK-01
```

**blockingLayer**

```text
PRODUCTION IDENTITY AUTHORIZATION / MINIMUM PRIVILEGE / FAIL-CLOSED DEACTIVATION
```

**evidence**

RELEASE13 canli kaynagi uzerinde olculmustur (kanonik main'den DEGIL).

*Yetki modeli envanteri* (statik analiz; 132/132 controller parse edildi, cozulemeyen 0):

```text
mutating route (POST/PUT/PATCH/DELETE)     588
  rol kapili                                67   (%11.4)
  kimlik-dogrulamali, rol kapisi YOK       494   (%84.0)
  JWT ve rol guard'i YOK                    27   (public uclar)
                                67+494+27 = 588
```

`JwtAuthGuard` / `AuthGuard('jwt')` kasitli olarak rol guard'i sayilmamistir: kimligi
dogrular, yetkiyi sinirlamaz.

*Rol tabanli mutation reddi kapsami* (exhaustive tarama): yalniz `modules/client/`
altinda uygulanir (`client-mutation-policy.ts`, `client.service.ts`,
`client-address.service.ts`, `client-consent.service.ts`,
`client-workspace-command-authority.ts`). Baska hicbir modulde `UserRole` tabanli
mutation reddi yoktur.

```text
VIEWER'in cagirabilecegi write route        466
  bunlardan finansal/hukuki agirlikli       253
```

Ornekler: `DELETE /cases/:id` · `POST /accounting-journal/entries/manual-adjustments` ·
`POST /accounting-journal/entries/:entryId/reverse` · `POST /bank/settlement-evidence` ·
`POST|PATCH|DELETE /cases/:id/dues/...` · `PATCH /cases/:id/legal-responsible-lawyer`.

*Deaktivasyon yuzeyi:*

```text
user.controller.ts TAM route listesi:
  GET   /users
  PATCH /users/me/password
  -> deactivate / delete / role-change route'u YOK
```

Kanonik ve fail-closed bir deaktivasyon **vardir**, fakat yalniz bagli kullanicilar icin:

```text
DELETE /lawyers/:id -> LawyerService.remove   (lawyer.service.ts)
DELETE /staff/:id   -> StaffService.remove    (staff.service.ts)
  tx.user.updateMany({ where:{ id: existing.userId, tenantId }, data:{ isActive:false } })
  if (count !== 1) throw ConflictException -> TUM transaction rollback ("best-effort" YASAK)
```

`Lawyer.userId` / `StaffMember.userId` yazan tum kod yollari exhaustive tarandi:
kanonik HTTP'de tek yazan `user-invite.service.ts`'tir ve yalniz **davet aninda, YENI
kullanici icin** baglar. Mevcut bir kullaniciyi sonradan baglayan kanonik route yoktur.
`register()` ile dogan ADMIN dolayisiyla **kalici olarak aktif kalir**.

**whyNotRevision**

ADMIN hesabini "smoke-only" olarak adlandirmak gercek yetki yuzeyini daraltmaz. Bos
tenant blast radius'i azaltir ancak write authority'yi ortadan kaldirmaz. VIEWER'a
inmek de cozmez: 466 write route acik kalir. Uygulanamayan bir quarantine politikasiyla
production mutation yetkilendirilemez. Eksiklik paket revizyonuyla kapanabilir bir
kusur degildir; **API yetki modelinin kendisinden** kaynaklanir.

**requiredAction**

Owner tarafindan bes maddede tanimlanmistir (fail-closed yetki modeli; kanonik
disable/revoke yolu; exact tablo/key listesi; owner secret'i out-of-band; tum kapilar
hazir olunca yeni UUID + en fazla 30 dakikalik pencere). Salt-okuma olan 1-3
yurutulmustur:

```text
requiredAction #1 = KARSILANAMIYOR  (RELEASE13'te deny-by-default yetki modeli YOK)
requiredAction #2 = KISMI           (invite-bound icin VAR, bootstrap ADMIN icin YOK)
requiredAction #3 = TESLIM EDILDI   (7 tablo, 52 satir, literal key sinifi — bkz. §D)
requiredAction #4 = OWNER ISLEMI
requiredAction #5 = BLOKLU          (#1'e bagimli)
```

**preservedWip**

```text
C35 Stage-A evidence paketi (owner-local, repo DISI)
qualified helper RUN-A/RUN-B 15/15 ve kosum kokleri
request-plan / helper hash'leri
credential broker dizini — BOS, ACL PASS (inheritance kapali, 3 ACE, yabanci kimlik 0)
production runtime/control-plane unchanged · production DB delta 0
main ba2c5c8f · acik PR 0
```

---

## §H Owner architectural decision — OPTION 1

Owner, C35-BLK-01'in cozumu icin **RELEASE14 minimum-authority smoke principal
implementation**'i secmis ve yalniz **ayri bir engineering sayfasi** icin
yetkilendirmistir. Bagli mimari (ozet; tam metin owner-local kayittadir):

1. **Dedicated principal** — acikca SMOKE amacli yeni kimlik sinifi; ADMIN/VIEWER
   yetkisine guvenilmez; role-based daraltma tek basina guvenlik siniri sayilamaz;
   principal kalici olarak `isActive=false` tutulur.
2. **Legacy-runtime fail-closed** — RELEASE13 standart `/auth/login` bu principal'i
   reddetmeli; RELEASE13'te `/auth/smoke/*` bulunmamali; yeni-runtime smoke token'i
   RELEASE13'e karsi kullanilamamali; rollback sonrasi principal hicbir route'a
   erisememeli. Dordu de disposable cross-version testlerle kanitlanmadan QUALIFIED
   yazilamaz.
3. **Yeni-runtime'a ozgu smoke auth** — ayri ve acik isimli dar yuzey; owner-controlled
   broker secret'i; `authPurpose=SMOKE`, kisa TTL, smoke-only audience, ayrisan claim
   seti; secret/token sizintisi 0.
4. **Global deny-by-default** — SMOKE principal icin uygulama genelinde varsayilan
   DENY; exact allowlist en fazla smoke login, `/auth/me`, logout/session invalidation
   ve (zorunlulugu kanitlanirsa) self-credential rotation; metadata'siz veya yeni
   eklenen her route otomatik reddedilir; controller'larin tek tek dogru guard
   kullanmasina guvenilmez.
5. **Provisioning** — normal public `register()` kullanilmaz; hard-coded ADMIN
   bootstrap yolu kullanilmaz; yalniz R05 transaction envelope + loopback/host-bound
   cagri + exact package/baseline/nonce/window + tek kullanimlik operation
   bilesimiyle; public smoke-registration endpoint'i yasaktir.
6. **Data model** — principal normal business tenant/personel/lawyer degildir; Office,
   Lawyer, StaffMember, Client, Case ve gercek recipient yaratilmaz; business
   tablolarina gorunurluk ve write authority 0.
7. **Revocation** — kanonik revoke zorunlu, idempotent ve lost-response-aware; ancak
   guvenlik yalniz revoke'un basariyla calismasina dayanamaz.
8. **Rollback compatibility** — alti crash noktasinin tamami test edilir; her durumda
   RELEASE13 uzerinde authenticated access = 0.
9. **`/auth/me` contract** — exact 9 allowlisted field name; eksik/fazla = FAIL;
   response degerleri evidence'a yazilmaz.
10. **C35 iliskisi** — C35-BLK-01 acik kalir; ADMIN tabanli topoloji kullanilmaz;
    52-row/7-table plani production authorization temeli degildir; credential
    olusturulmaz; eski UUID/window/request-plan authorization uretmez.

```text
REVOKE = CLEANUP
REVOKE != ROLLBACK SECURITY BOUNDARY
```

---

## §I Successor pointer

```text
NEXT PAGE:
C36 — RELEASE SMOKE PRINCIPAL FAIL-CLOSED AUTH ENGINEERING
      + CROSS-VERSION QUALIFICATION

C36 TERMINAL CEILING:
SMOKE_PRINCIPAL_IMPLEMENTED_AND_CROSS_VERSION_QUALIFIED / PRODUCTION_NOT_AUTHORIZED
```

C36 mevcut RELEASE14 candidate'ini veya R05 canonical paketini **degistirmez**;
production release kimligi C36 sonrasindaki ayri production sayfasinda fresh uretilir.

---

## §J Mutasyon beyani

```text
PRODUCTION MUTATION                 = 0
RUNTIME/CONTROL-PLANE before==after = EVET (277A6E46...FAF6 degismedi)
PRODUCTION DB DELTA                 = 0/14 sayac (yetkili additive delta 0 ile eslesiyor)
SECRET / TOKEN EXPOSURE             = 0
CREDENTIAL OLUSTURULDU              = HAYIR (broker dizini BOS, ACL PASS)
SECRET DIGEST KAYDI                 = YOK (offline oracle riski nedeniyle yasak)
CANLI TASK / PROCESS / CONFIG       = DOKUNULMADI
R05 / R04 CANONICAL PAKET           = DOKUNULMADI
RELEASE11 / RELEASE13 / RELEASE14   = DOKUNULMADI
PERSISTENT SESSION-MEMORY YAZIMI    = 0
SILINEN VARLIK                      = YOK
```

---

## §K C35 terminal durumu

```text
C35 =
BLOCKED_MINIMUM_PRIVILEGE_AND_QUARANTINE_CONTRACT /
PRESERVED / NO_PRODUCTION_MUTATION

C36 = AUTHORIZED_FOR_ENGINEERING_ONLY
C33 = NOT_STARTED
PRODUCTION AUTHORITY = NONE
```
