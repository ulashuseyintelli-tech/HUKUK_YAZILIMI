# C36 — SMOKE PRINCIPAL FAIL-CLOSED AUTH ENGINEERING + CROSS-VERSION QUALIFICATION R01

**Terminal verdict:** `PENDING_OWNER`

Bu kayit C36'nin implementasyonunu ve iki bagimsiz disposable cross-version
qualification kosumunu kanoniklestirir. **Production mutation = 0.** Production
provisioning, credential olusturma ve C33 resume bu sayfanin KAPSAMI DISINDADIR.

---

## §A Owner architecture decision (dayanak)

C35-BLK-01 olcumu, RELEASE13'te rol tabanli daraltmanin bir yetki siniri OLMADIGINI
kanitladi: 588 mutating route'un 494'u kimlik-dogrulamali fakat rol kapisiz; VIEWER
dahi 466 write route'a (253'u finansal/hukuki) erisiyordu. Owner bunun uzerine
**OPTION 1 — minimum-authority smoke principal** mimarisini ratifiye etti:

1. Dedicated principal; ADMIN/VIEWER yetkisine guvenilmez; principal kalici `isActive=false`.
2. Legacy-runtime fail-closed: R13 standart login reddeder · R13'te `/auth/smoke/*` yok ·
   yeni-runtime smoke token'i R13'e karsi kullanilamaz · rollback sonrasi erisim yok.
3. Yeni runtime'a ozgu smoke auth: `authPurpose=SMOKE`, kisa TTL, ayri audience/claim seti.
4. Global deny-by-default; exact allowlist; metadata'siz route otomatik DENY.
5. Provisioning: public `register()` YOK, ADMIN bootstrap YOK, R05 envelope + loopback +
   exact nonce/window + tek mutation.
6. Data model: business tenant/personel/lawyer DEGIL; Office/Lawyer/Staff/Client/Case yok.
7. Revocation zorunlu fakat **guvenlik siniri degildir**.
8. Rollback compatibility alti crash noktasinda test edilir.
9. `/auth/me` exact 9 allowlisted field name.

```text
REVOKE = CLEANUP
REVOKE != ROLLBACK SECURITY BOUNDARY
```

---

## §B Implementation — PR / SHA

```text
PR1 (C35 governance materialization)  #2498   squash 8340dd1b867b1e3a1306296ffc314e0a275974fe
PR2 (implementation)                  #2499   squash c0d986b320de5d6d84c130af2f2be2bcbb308cff
  final head                                  b11e5d4e0d8a053b118b5ed934f04c5a0b526afb
  final head tree                             9d01c076254138cff5ebfc22fe26c7223416842e
  squash tree                                 9d01c076254138cff5ebfc22fe26c7223416842e   (EXACT PARITY PASS)
  CI                                          9/9 PASS · mergeable=MERGEABLE · mergeStateStatus=CLEAN
  degisen dosya                               19
```

---

## §C Schema — SALT ADDITIVE

Yeni: `SmokePrincipalPurpose` / `SmokePrincipalStatus` enum'lari + `SmokePrincipal` tablosu.
`User` tarafinda yalniz **geri-iliski** alani eklendi; `User` tablosuna kolon EKLENMEDI.

`prisma migrate diff` ciktisi **hicbir ALTER/DROP icermez**:

```text
CREATE TYPE "SmokePrincipalPurpose" · CREATE TYPE "SmokePrincipalStatus"
CREATE TABLE "SmokePrincipal" (id, userId, purpose, status, credentialHash,
             authGeneration, provisionNonce, provisionReceipt, createdAt,
             updatedAt, expiresAt, revokedAt)
CREATE UNIQUE INDEX SmokePrincipal_userId_key · SmokePrincipal_provisionNonce_key
CREATE INDEX SmokePrincipal_status_idx · SmokePrincipal_expiresAt_idx
ADD FOREIGN KEY SmokePrincipal_userId_fkey -> "User"("id") ON DELETE CASCADE
```

Migration `20260830120000_c36_smoke_principal_foundation`. **Production'a deploy EDILMEDI.**

---

## §D Auth tasarimi — uc bagimsiz legacy fail-closed katmani

| # | Katman | Etki |
|---|---|---|
| L1 | Ayri imza secret'i (`JWT_SMOKE_SECRET`) | R13 `secretOrKey: JWT_SECRET` ile dogrular → smoke token'in IMZASINI cozemez |
| L2 | Bagli `User` kalici `isActive=false` | R13 `validateUser()` HER JWT dogrulamasinda 401 atar; `login()` de reddeder |
| L3 | R13'te `/auth/smoke/*` route'u YOK | rollback sonrasi 404 |

`JWT_SMOKE_SECRET` yoksa **veya `JWT_SECRET` ile ayniysa** smoke ozelligi tamamen kapalidir
(fail-closed). Smoke token: `authPurpose=SMOKE` · audience `hukuk-smoke` · issuer
`hukuk-api-smoke-v1` · TTL 600 sn · `gen` (authGeneration) claim'i her istekte DB ile
yeniden karsilastirilir.

### Global deny-by-default

`SmokeAuthorizationGuard`, `APP_GUARD` olarak kaydolur ve bearer token'i **kendisi** cozer;
`request.user`'a HIC bakmaz. Bu yuzden controller-level guard SIRASINA fail-open bagimlilik
yoktur ve mumkun olan en erken noktada calisir:

```text
global guard -> controller/route guard -> interceptor -> PIPE -> handler
^^^^^^^^^^^^
```

> C15-PR2'nin `TenantLifecycleInterceptor`'i `request.user` gerektirdigi icin bilincli olarak
> interceptor'dir. C36'da o kisit YOKTUR (token kendi cozulur), bu yuzden daha erken ve daha
> guclu bir nokta kullanilabildi.

### Exact allowlist

```text
POST /api/auth/smoke/login     (smoke login)
POST /api/auth/smoke/revoke    (session invalidation)
GET  /api/auth/me              (9 alanli public projeksiyon)
```

`POST /api/auth/smoke/provision` **allowlist'te DEGILDIR**: imzali envelope ile cagrilir,
smoke token ile cagrilirsa global guard reddeder. Self-credential rotation
**UYGULANMADI** (zorunlulugu kanitlanmadigi icin yuzey dar tutuldu).

---

## §E Fresh route sayimi ve N/N denial — denklem tam kapali

```text
kanonik main mutating route                                 588
+ PR2'nin EKLEDIGI (exact kimlik)                             3
    POST /api/auth/smoke/login · POST /api/auth/smoke/provision · POST /api/auth/smoke/revoke
= PR2 mutating toplami                                      591
− probe dedup kaybi (ayni method + ayni SOMUT path)           4
    POST /api/debtors/{id}/addresses    (address.controller + debtor.controller)
    DELETE /api/groups/{id}             (:id ve :groupId ayni controller'da)
    POST /api/icrabot/v28/events        (iki kez bildirilmis)
    POST /api/icrabot/v28/events/{id}   (:engineName ve :caseId)
= benzersiz mutating probe                                  587
− allowlisted mutating                                        2
= sweep paydasi                                             585
    = 470 SMOKE DENIED (403)  +  115 runtime-KAYITSIZ (anonim de 404)

ACIKLANAMAYAN ROUTE = 0
```

Read yuzeyi: **438/438 kayitli read route SMOKE DENIED**, 97 runtime-kayitsiz haric.

Siniflandirma runtime'da dogrulandi (varsayilmadi):

```text
POST /api/auth/smoke/provision                    anonim -> 400  KAYITLI  (470 denied icinde)
POST /api/auth/smoke/login                        anonim -> 400  KAYITLI  (allowlisted)
POST /api/auth/smoke/revoke                       anonim -> 401  KAYITLI  (allowlisted)
POST /api/api/v1/internal-ops/break-glass/request anonim -> 404  KAYITSIZ (115 icinde)
POST /api/cases (kontrol)                         anonim -> 401  KAYITLI
```

Kayitsiz 115/97, `AppModule`'e bagli OLMAYAN controller'lardir (`break-glass`,
`cross-tenant-access`); calisan uygulamada route yoktur. Sessiz kirpma DEGILDIR —
sayilari acikca raporlanir.

### Mekanik yaptirim

`smoke-allowlist-architecture.spec.ts`, `@SmokeAllowed()` tasiyan route kumesinin izin
verilen uc yuzeye BIREBIR esit oldugunu zorlar. **Negatif kontrol yapildi:**
`case.controller.ts`'teki bir POST'a dekorator eklendiginde tam 2 test oldu; mutasyon
geri alindi. Test tautoloji degildir.

---

## §F RUN-A / RUN-B matrisi (FINAL HEAD uzerinde)

Onceki kosum (final head'den ONCE) **final qualification olarak KULLANILMAMISTIR**;
owner hukmu geregi tam yeniden kosum yapildi.

```text
RUN-A  26/26 PASS · 0 FAIL   pg 5433/c36_runa_test · port 18081/18082 · kok C36_QUAL_A_FINAL_*
RUN-B  26/26 PASS · 0 FAIL   pg 5434/c36_runb_test · port 18091/18092 · kok C36_QUAL_B_FINAL_*
       (farkli DB · port · WorkRoot · CWD · UUID/nonce · credential · secret)

SEMANTIK VERDICT VEKTORU (SHA-256)
  RUN-A = 52A8062EF48943D1CCE7FFAF58E1451CED1943BEBDA60DFDD83BBB01779C1E86
  RUN-B = 52A8062EF48943D1CCE7FFAF58E1451CED1943BEBDA60DFDD83BBB01779C1E86
  DENKLIK = IDENTICAL
```

| Kapi | Ne kanitlar |
|---|---|
| G-25 / G-26 | migration fresh apply PASS · ikinci apply no-op |
| G-00a / G-00b | yeni runtime VE RELEASE13 AYNI disposable DB'ye bagli (marker ile kanit) |
| G-01 | provisioning: loopback + ed25519 imzali envelope |
| G-19 | ayni nonce tekrar → `ALREADY_PRESENT_NO_MUTATION`, ikinci INSERT yok |
| G-24 | bozuk imza → DENY |
| G-02 / G-03 | smoke login dogru credential PASS · yanlis credential DENY |
| G-01b | yeni runtime NORMAL `/auth/login` smoke principal'i REDDEDER |
| G-05 | `/auth/me` EXACT 9 allowlisted alan adi (eksik 0 / fazla 0) |
| G-07 | N/N kayitli mutating route SMOKE DENIED (470/470) |
| G-08 | TUM kayitli read route SMOKE DENIED (438/438) |
| **G-13** | **RELEASE13 standart login, smoke principal → DENY** |
| **G-14** | **RELEASE13 `/auth/smoke/login` → 404 (route YOK)** |
| **G-15** | **yeni-runtime smoke token → RELEASE13 `/auth/me` DENY** |
| **G-16** | **yeni-runtime smoke token → RELEASE13 mutating route DENY** |
| **G-17** | **principal olusturuldu + REVOKE YAPILMADI → RELEASE13 authenticated access = 0/3** |
| G-20 | token uretildi, `/auth/me` yapilmadan once de gecerli (bounded TTL) |
| G-22a / G-09 / G-04 | revoke PASS · onceden uretilmis token DENY · sonraki login DENY |
| G-27 | RELEASE13 post-migration NORMAL kullanici login PASS (backward-compatible) |
| G-28 | RELEASE13 smoke principal login DENY |
| G-29 / G-30 | is tablosu delta 0 (Office/Lawyer/Staff/Case/Client/Task) · SmokePrincipal tam 1 |

**G-17 belirleyicidir:** revoke hic cagrilmadan legacy runtime uzerinde erisim sifirdir.
Rollback guvenligi revoke'un basarisina BAGLI DEGILDIR.

### Unit / integration testler (PR2 icinde)

```text
smoke-deny-by-default-http            12/12   gercek Nest pipeline; APP_GUARD controller
                                              guard'larindan VE ValidationPipe'tan ONCE;
                                              guard'i HIC olmayan route da reddedilir;
                                              gecersiz govdeyle bile 403 (400 DEGIL)
smoke-allowlist-architecture           5/5    N/N mekanik sinir (negatif kontrol dogrulandi)
smoke-principal-lifecycle.db-gated    12/12   gercek Postgres: provisioning EXACT 3 satir
                                              (Tenant+User+SmokePrincipal), lookup/Office/
                                              Lawyer/Staff/Client/Case/Task = 0
regresyon                            474      modules/auth 260 · tenant 202 · user 12
```

---

## §G Migration / backward compatibility

```text
fresh apply                    PASS
ikinci apply                   no-op
schema <-> DB drift            0
RELEASE13 post-migration boot  PASS (ayni DB semasi)
RELEASE13 normal kullanici     login PASS
RELEASE13 smoke principal      login DENY
is tablosu delta               0
```

Migration rollback iddiasi KURULMAMISTIR. Production'a deploy EDILMEMISTIR.

---

## §H Qualification package kimlikleri

```text
paket kok      C36_QUALIFICATION_PACKAGE_df25a5a6-b81b-44b3-a378-470aeecf21ce   (repo DISI)
payload dosya  18
payload manifest SHA-256
               07C6B9A40B4B3637BC7266D3A3512E6F437A314ECA750E309A177DA2465C1B7D
package receipt SHA-256
               8CC6738C31E989AA75B30CD680FCF69D3BF57498E7FCC302B66FA9AFE6F364EC
exact-set dogrulama  V1 EXACT_SET_PASS · V2 EXACT_SET_PASS  (iki BAGIMSIZ surec)
               missing 0 · extra 0 · hashMismatch 0 · sizeMismatch 0 · reparse 0
```

Manifest payload'in DISINDA durur (asiklik); receipt manifest hash'ini tasir fakat kendi
hash'ini tasimaz. Disposable ed25519 ozel anahtarlari ve envelope dosyalari **kasitli olarak
paket DISINDADIR**.

Secret tarama: paket icindeki 6 eslesme yalniz harness'in `-not-production` diye
adlandirilmis disposable sabitleri ve endpoint URL referanslaridir; gercek secret,
ozel anahtar veya imza degeri YOKTUR.

**Production candidate URETILMEDI. Mevcut RELEASE14 candidate DEGISTIRILMEDI.**
Yeni production release adi/kimligi C36'da BELIRLENMEZ.

---

## §I Production before == after

```text
preflight  stable-core = 277A6E46E4E7B11F04D5D6F0C57F6E9CE1DB110FC2B6568CE21BC6BB89BCFAF6
postrun    stable-core = 277A6E46E4E7B11F04D5D6F0C57F6E9CE1DB110FC2B6568CE21BC6BB89BCFAF6
BEFORE == AFTER = EVET

production DB          DOKUNULMADI (disposable 5433/5434; production 5432'ye baglanti YOK)
canli task/PID/listener DOKUNULMADI (API pid 7476:8080 · Web pid 24872:3002)
RELEASE11/13/14        DOKUNULMADI
R05 canonical package  DOKUNULMADI (manifest F8B27F87...FB4E · receipt 8E4DC10F...10C3)
```

RELEASE13 yalniz **disposable** bir surec olarak, disposable DB'ye baglanarak ve
production portlari DISINDA calistirildi; dosyalari degistirilmedi.

---

## §J C36-DEV-01

```text
C36-DEV-01:
- transient untracked empty-file artifact;
- unauthorized exact self-cleanup;
- stop-condition continuation;
- owner adjudication;
- merged-tree/production effect 0;
- corrective action: final-head RUN-A/RUN-B full rerun.
```

Ayrinti: artefakt `project/docs/governance/runtime-reconciliation-r01/c35-smoke-identity-provisioning-r01.md`
yolunda 0 bayt olarak olustu (git object `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`,
SHA-256 `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`), untracked
kaldi, hicbir commit'e girmedi, exact literal path ile silindi (glob/recurse/parent
cleanup 0) ve dirty set 10 → 11 → 10 exact parity ile geri dondu. Owner
`RATIFIED_TRANSIENT_UNTRACKED_ARTIFACT` + `RATIFIED_STOP_CONDITION_CONTINUATION /
EXACT_SELF_CLEANUP_ACCEPTED / PROCESS_DEVIATION_RECORDED` olarak adjudicate etti;
duzeltici islem olarak final head uzerinde RUN-A/RUN-B TAM yeniden kosuldu.

---

## §K Acik residual'lar

| # | Residual | Durum |
|---|---|---|
| R-01 | `HY_C36_PR2` worktree DIZINI diskte kaldi | git kaydi PRUNE EDILDI (worktree list 0, branch silindi); dizin `node_modules\...\client-s3` erisim reddi nedeniyle silinemedi. **ORPHANED / zararsiz.** Git durumu temiz. |
| R-02 | Disposable Postgres container'lari `c36-runa-pg` / `c36-runb-pg` calisiyor | qualification varligi; production 5432'den bagimsiz. Owner karariyla kaldirilabilir. |
| R-03 | Self-credential rotation allowlist'e EKLENMEDI | zorunlulugu kanitlanmadi; yuzey bilincli olarak dar tutuldu. |
| R-04 | Production signing key URETILMEDI | C36 kapsami disi; production sayfasinda uretilecek. |
| R-05 | `tsconfig.prod.json` disindaki spec-kapsamli `tsc` baseline'i 529 hata tasir | ONCEDEN VAR; C36 bunlara dokunmadi. CI kapisi (`tsconfig.prod.json`) 0 hata. |

---

## §L Terminal durum

```text
C36 =
SMOKE_PRINCIPAL_IMPLEMENTED_AND_CROSS_VERSION_QUALIFIED /
PRODUCTION_NOT_AUTHORIZED
TERMINAL VERDICT = PENDING_OWNER

PR1 #2498  8340dd1b  MERGED
PR2 #2499  c0d986b3  MERGED  (tree parity PASS)
PR3        bu kayit

PRODUCTION MUTATION        = 0
PRODUCTION AUTHORITY       = NONE
SECRET / TOKEN EXPOSURE    = 0
CREDENTIAL OLUSTURULDU     = HAYIR
PERSISTENT MEMORY MUTATION = 0
C33                        = NOT STARTED
NEXT PHASE                 = OTOMATIK BASLAMAZ
```

C36 sonrasinda production sayfasi ayri olarak gerekir: fresh main'den yeni immutable
release candidate · fresh R05/package/baseline binding · owner-controlled credential ve
signing material · hash-bound provisioning/cutover plani · kisa UTC window + fresh nonce ·
ayri production owner GO.
