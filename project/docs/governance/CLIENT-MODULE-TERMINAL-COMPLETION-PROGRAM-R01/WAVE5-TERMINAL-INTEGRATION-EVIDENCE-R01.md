# WAVE 5 TERMINAL INTEGRATION — EVIDENCE R01

```text
Belge rolü : CLIENT programının terminal kapanış kanıt defteri (§14)
Yazar hat  : CLAUDE (CLIENT/C3 continuity sahibi — owner GO-COMPLETE 2026-08-07)
Baseline   : fresh origin/main 62199535 (T1 merge sonrası)
Kural      : Bu belge KANIT kaydıdır; yeni yetki üretmez. Secret/credential/token
             hiçbir alanında yer almaz.
PROGRAM LOCK: CLIENT ONLY + iki bounded terminal coupling (invite lifecycle · runtime durability)
```

## T0 — FRESHNESS / PREFLIGHT (PASS)

```text
Fresh main    : 322a4c6f (başlangıç) → 62199535 (T1 sonrası); HEAD == origin/main
Ancestry      : f34c371a (C2-I08) · 322a4c6f (FD ops) · 1898847e (C3 A2) ·
                8b68edcc (WAVE4 evidence) → hepsi ANCESTOR_OK
Açık PR       : yalnız #2260 (codex/gov-exec control-plane) — CLIENT write-path kesişimi YOK
Worktree/branch: CLIENT lane'inde 0 (tarama ile doğrulandı)
Production DB : 121 migration · "Database schema is up to date" · failed/pending ledger = 0
Runtime       : API 8080 + Web 3002 canlı
§14 kriterleri: birebir okundu; kriter İCAT EDİLMEDİ
```

## T1 — INVITE LIFECYCLE BUG REMEDIATION (PASS)

```text
Kök neden (repository-truth): revoke()'un profil unlink'i OWN-01 gereği BİLİNÇLİ ve
  testle korunuyor → çözüm orada DEĞİL. Defekt resend()'te: iptal edilmiş daveti
  diriltiyor fakat kopmuş Lawyer/StaffMember bağını geri kuramıyor (davet kaydı profil
  kimliğini taşımaz) → hesap aktifleşiyor, profil-türevi yetki SESSİZCE kayboluyor.

Patch (şema/migration YOK) — PR #2261 / squash 62199535:
  · resend(): revoked davet → ConflictException (token dirilmez, e-posta gönderilmez)
  · issue(): orphan pending User için DAR koşullu adoption (aynı tenant · isActive=false ·
    passwordHash=null · tüm davetler consume EDİLMEMİŞ · en az biri revoked) → aynı kayıt
    devralınır, profil race-safe yeniden bağlanır, taze token; audit adoptedPendingUser:true
  · AUTH-01 tenant-scoped uniqueness sorgusunun ŞEKLİ değişmedi

Sözleşme karşılama: revoke güvenli+audit'li ✓ · resend sonrası bağ her zaman geçerli ✓ ·
  tenant/user değişmez ✓ · silent eligibility loss YOK ✓ · duplicate/replay/cross-tenant
  relink RED ✓ · atomik + idempotent ✓

Test: user-invite spec 41/41 (9 yeni sözleşme testi) · auth modülü 158 test PASS ·
  değişen dosyalarda tsc 0 hata · CI 9/9 PASS · CLEAN → squash-merge → main sync

Runtime doğrulaması (deploy edilmiş artifact üzerinde; GERÇEK MAİL YOK, sentetik izole):
  RT1 issue linked=true · RT2 revoke unlinked=true · RT3 resend_on_revoked_rejected=true
  RT4 reissue adopted_same_user=true relinked=true · RT5 cleanup=revoked (hard-delete YOK)
```

## T1-DEPLOY — YENİ IMMUTABLE ARTIFACT (PASS, hot patch YOK)

```text
Git SHA                : 6219953576e17cadef780511a8e81016baac70b8 (fresh main, izole worktree)
Lockfile SHA-256       : af0e81e795a958ac28d227fbde3a4af2029bd42e0403dd6c36e7067acb051514
Source-manifest SHA-256: a79cf6e682caa7cbf8c6daf0a434c8d70f28d5411031e673d41f6e94a7540e2f
API dist SHA-256       : 9570994a42225bde7a908d79580c9a2c4fa277343bf6ff72265868429aefb297
WEB .next SHA-256      : a1729731a2481bbd3fddb3ca5d570c36045be3f50e6cdc4a4722dc541e883329
                         (BUILD_ID FvLYG3rGjFtKbCcz0pKWu, cache hariç)
Artifact               : releases/client-wave5-62199535.tar.gz · 6.054.520 B
                         SHA-256 45c11afbd8a0df9b5853365ddc212458ad04c69659393a64f6dc630ffacb64de
Deploy                 : kontrollü stop→start; çalışan dizinin API dist hash'i artifact
                         hash'iyle BİREBİR (RUNTIME_BLOB_PARITY=OK)
Health                 : API /api/auth/login 400 (validation canlı) · Web / 200 ·
                         /auth/accept-invite 200
HY_WT/RUNTIME_W4       : artık deployment kaynağı DEĞİL; dirty RUNTIME (3c73708d)
                         kullanılmadı ve TEMİZLENMEDİ
```

## T2 — RUNTIME DURABILITY (PASS)

```text
Mevcut standart taraması: repo'da ops/ dizini YOK · mevcut uygulamada pm2/nssm/winsw YOK.
  Tek pm2 izi LEGACY envanterdedir (docs/audit/.../runtime-capability-inventory.json
  içindeki `hukuk-api-master/pm2.json` — eski kod tabanı snapshot'ı, mevcut app değil).
Seçim: OS-NATIVE Windows Task Scheduler (yeni üçüncü taraf bağımlılık YOK; admin/UAC
  gerekmedi — kullanıcı bağlamında kayıt).
Görevler: HukukPlatform-API · HukukPlatform-Web
  Tetikleyiciler : AtLogOn(kullanıcı) + 1 dakikalık tekrarlı watchdog
  Ayarlar        : MultipleInstances=IgnoreNew (çalışıyorsa yeni örnek yok sayılır) ·
                   ExecutionTimeLimit=0 (süresiz) · Hidden · StartWhenAvailable
Secret: komut satırına/servis tanımına/loglara YAZILMADI — konfigürasyon .env dosyalarından
  okunur (working directory ile bağlanır).
Doğrulama: kontrollü stop → task ile start → listener + health OK · API süreci force-kill
  edildi → watchdog 1 dk içinde YENİ pid ile ayağa kaldırdı (self-heal kanıtlandı) ·
  bilgisayar REBOOT EDİLMEDİ.
Not: RestartCount/RestartInterval force-kill senaryosunda tetiklenmedi; kalıcılık bilinçli
  olarak tekrarlı-tetikleyici watchdog desenine dayandırıldı (native, bağımlılıksız).
```

## T3 — PRODUCTION CERTIFICATION (17/17 PASS)

```text
PASS FD_FLAGS ................. write=true · publication=true · LEVEL_2
PASS FD_PROVIDER .............. ClientFinancialDisclosureEmailDispatcher / smtp
PASS FD_SENDER_CONFIG ......... from=bilgi@tellihukuk.com · provider=smtp (secret gösterilmedi)
PASS CANARY_AUDIT ............. SENT=1 · PUBLISHED=1 · duplicate=0
PASS NO_NEW_REAL_SEND ......... tek version, PUBLISHED, yalnız Demo tenant
PASS K7_KEY_PRESENT ........... CLIENT_SPECIAL_CATEGORY_DATA_KEY mevcut (değer gösterilmedi)
PASS K7_ACCESS_GATE ........... yetkisiz aktör → Forbidden (fail-closed)
PASS K9_NO_POA_INERT .......... POA'sız müvekkilde dört capability de etkisiz (NO_VALID_POA)
PASS K10_UYAP_FAIL_CLOSED ..... vekaletnamesiz UYAP aktarımı RED
PASS TENANT_ISOLATION ......... cross-tenant erişim NotFound
PASS MUTATION_AUTHORITY ....... VIEWER update → Forbidden (yazma YAPILMADI)
PASS K8_DELETION_GATE ......... yetkisiz silme değerlendirmesi RED
PASS SYNTHETIC_APPROVERS_INERT  iki hesap: isActive=false · canApprove=false
PASS SYNTHETIC_SCOPE .......... w5-canary case 3/3 yalnız Demo tenant (gerçek tenant=0)
PASS C1_ACTIVATION ............ identity partial unique index 2/2 canlı
PASS C3_ACTIVATION ............ C3 tabloları 6/6 · fail-closed default 4/4
PASS C2_ARC07_LIVE ............ ClientAddress isCurrent şeması canlı (I06 uygulanmış)

Gerçek müvekkile YENİ GÖNDERİM YOK; sertifikasyon salt-okuma + fail-closed probe'larla
yapıldı (hiçbir mutation üretilmedi).
```

## T4 — AÇIK BORÇ MUHASEBESİ

```text
C1 ACTIVATION DEBT : KAPANDI (2026-08-05, identity migration APPLIED)
C2 ACTIVATION DEBT : KAPANDI (I05→I06 EXECUTED; I08 CLOSED/PRODUCTION_VERIFIED
                     #2243/f34c371a — postalCode residual INTENTIONALLY_RETAINED)
C3 ACTIVATION DEBT : KAPANDI (5 migration APPLIED; K9.5 readiness; K7.3 anahtar;
                     K7.4 read-only tarama)
X1                 : ENGINEERING_COMPLETE / MERGED / CANONICAL · residual YOK
X2                 : FD write+publication ON · provider smtp · canary VERIFIED
X3                 : TERMINAL CLOSED · activation debt NONE
WAVE 5 RESIDUALS   : (1) C2-I08 ✓  (2) FD provider ops gate ✓  → İKİSİ DE KAPALI
AÇIK CLIENT MIGRATION / ACTIVATION / RESIDUAL BORCU: 0
```

## KALAN İŞLER (borç DEĞİL — kayıt)

```text
1. Sentetik canary artıkları (Demo tenant, hard-delete YASAK, audit iziyle korunur):
   Case cmsj0b2dp… · cmsj0cgsf…  (+ canary'de kullanılan cmsj0bp83…)
   Collection cmsj0b2ft… · cmsj0cgu0…  (+ cmsj0bp9g…)
   Disposition cmsj0cgvb… (HELD, artık) · cmsj0bpag… (POSTED, kullanılan)
   T1 runtime probe kayıtları: lawyer cmsj2qgu… · user cmsj2qgv… (pending, davet revoked)
   Sınıflandırma: SYNTHETIC / NON-PRODUCTION / NOT USED FOR DISCLOSURE
2. İki sentetik approver hesabı pasif (isActive=false · canApprove=false) — silinmedi.
3. Runtime kalıcılığı kullanıcı-bağlamlı scheduled task ile sağlandı; makine-seviyesi
   (AtStartup/SYSTEM) servis istenirse admin yetkisiyle ayrıca kurulabilir — ops tercihi.
4. FIND-C4 (version/CAS) — C1 engineering follow-up; activation borcu DEĞİL (kayıtlı).
```

## STATUS

```text
CLIENT PROGRAM STATUS : TERMINAL_CLOSED / PRODUCTION_VERIFIED / CANONICAL
Baseline              : origin/main 62199535 (kapanış PR'ı ile ilerletilir)
§14 kriterleri        : PASS (T3 17/17 + T0/T1/T2 kanıtları)
Açık borç             : 0 (activation / migration / residual)
Owner authorization   : bu kapanış için EK GO GEREKMEZ (2026-08-07 GO-COMPLETE kapsamı)
```
