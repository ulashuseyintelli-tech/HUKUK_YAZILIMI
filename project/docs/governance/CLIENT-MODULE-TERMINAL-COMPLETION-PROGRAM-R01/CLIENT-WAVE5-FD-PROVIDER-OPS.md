# CLIENT-WAVE5-FD-PROVIDER-OPS — Dış Yayın Provider Operasyon Gate'i

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
THIS PAGE:                CLIENT-WAVE5-FD-PROVIDER-OPS
LANE OWNER:               CLAUDE (WAVE 4 operatörü devamı)
KURULUŞ:                  Owner GO 2026-08-06 ("WAVE 5 FD PROVIDER OPS GATE'i başlat")
GATE ÖN KOŞULU:           #2243 / f34c371a MERGED + ancestor VERIFIED (C2-I08 FINAL:
                          CLOSED/PRODUCTION_VERIFIED, freeze OFF — birinci Wave-5
                          residual KAPALI; C2-I08 YENİDEN AÇILMAZ)
KURAL:                    Üretim gönderimi ve publication flag değişikliği YALNIZ bu
                          sayfanın acceptance kapıları sırayla PASS olursa (GO-COMPLETE
                          kapsamı). Provider secret'ı repo/log/PR/sohbete YAZILMAZ.
PROGRAM LOCK:             CLIENT ONLY
```

## 1. KANONİK PROVIDER SÖZLEŞMESİ (repository-truth: notification/email-provider.service.ts)

```text
EMAIL_PROVIDER = smtp | sendgrid | ses      (yokken 'mock' — gerçek gönderim YAPMAZ)
ORTAK        : EMAIL_FROM · EMAIL_FROM_NAME
smtp         : SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASS
sendgrid     : SENDGRID_API_KEY
ses          : AWS_REGION · AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY
Publication  : CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED (bugün: false ×2 env)
```

## 2. GATE SIRASI (değiştirilemez; her kapı fail-closed)

```text
P1 CREDENTIAL VARLIĞI (değer gösterilmeden): seçilen provider'ın TÜM değişkenleri
   iki hedef env'de PRESENT + EMAIL_FROM tanımlı.
P2 HAZIRLIK DOĞRULAMASI: API restart → derlenmiş guard/servis provider'ı 'mock'
   DIŞI okuyor; publication hâlâ OFF (henüz açılmaz); staging/local kanıt güncel
   (notification 36/36 + FD e2e 6/6 — 2026-08-06 koşumu, izole gerçek-Postgres).
P3 CANARY: publication flag ON → TEK tenant + TEK müvekkil + TEK disclosure
   publish. Repo'da e-posta canary ALLOWLIST mekanizması YOKTUR (ölçüldü) →
   canary PROSEDÜRELDİR: tek kayıtla sınırlı yürütme; kanıt = audit kaydı +
   provider yanıt kodu (alıcı/içerik maskeli). İstenirse bounded allowlist-guard
   dilimi AYRI owner yetkisiyle açılır (isim owner'dan — İCAT EDİLMEZ).
P4 ROLLBACK HAZIR: flag'i false yap + API restart (< 1 dk, 2026-08-06'da fiilen
   kanıtlanmış yöntem). Tetik: provider hatası · yanlış alıcı · yetkisiz erişim ·
   projection sapması → ANINDA OFF + STOP + owner raporu.
P5 PUBLICATION GATE (genel açılış): canary PASS + runtime verification
   (FD e2e + audit denetimi + provider hata-sanitizasyon davranışı) → flag
   kalıcı ON; sonuç bu sayfaya + decision-log'a docs-only işlenir.
```

## 3. DURUM (2026-08-06)

```text
GATE:                     STARTED
P1 CREDENTIAL VARLIĞI:    FAIL — 11 provider değişkeninin TAMAMI iki env'de ABSENT
                          (EMAIL_PROVIDER dahil; ölçüm değersiz/adla yapıldı)
SONUÇ:                    P2-P5 AÇILAMAZ (fail-closed). Publication flag OFF kaldı;
                          hiçbir gerçek gönderim yapılmadı; flag değiştirilmedi.
STATUS:                   WAITING_FOR_OPS_INPUT
OWNER/OPS'TAN BEKLENEN:   (1) provider seçimi (smtp|sendgrid|ses)
                          (2) seçilen provider'ın credential'larının İKİ hedef
                              env'e OPS eliyle girilmesi (bu oturum credential
                              GİREMEZ ve DEĞER GÖREMEZ — güvenlik kuralı)
                          (3) EMAIL_FROM / EMAIL_FROM_NAME değerleri
                          (4) canary hedefi (tenant + müvekkil) onayı
GİRDİ GELİNCE:            P1 yeniden ölçülür → PASS ise P2-P5 aynı GO-COMPLETE
                          kapsamında, yeni owner GO istenmeden sırayla yürür.
```

## 4. GATE YÜRÜTME KAYDI — P1..P5 (2026-08-07, owner GO-COMPLETE)

```text
P1 CREDENTIAL GATE ....... PASS
   Fresh main + #2244/01c173db ancestry VERIFIED. İki hedef env'de 7/7 SMTP
   değişkeni PRESENT_NONEMPTY (değer GÖSTERİLMEDEN ölçüldü); non-secret config
   kanonikle birebir (provider=smtp · srvc182.trwww.com · 465 · bilgi@tellihukuk.com).
   NOT: ilk denemede EAUTH/535 alındı; owner credential'ı yeniledi (ürün değişikliği YOK).

P2 PROVIDER PREPARATION .. PASS
   Port 465 → mevcut implementasyon secure:true seçiyor (email-provider.service.ts:136);
   mimari DEĞİŞTİRİLMEDİ. Gönderimsiz `transporter.verify()` → SMTP_VERIFY=PASS
   (bağlantı + TLS + auth). API kontrollü restart; guard write=true / publication=false.

P2-EK  DAVET LİNKİ REMEDIATION (owner talimatı)
   Kök neden: link builder WEB_BASE_URL (fallback APP_BASE_URL) okuyor, ikisi de env'de
   YOKTU → relative `/auth/accept-invite?...`. ÜRÜN KODU DEĞİŞTİRİLMEDİ; iki env'e
   WEB_BASE_URL=http://localhost:3002 girildi. Characterization (gönderimsiz):
   absolute=true · startsOk=true · noBackslash=true. Ekran görüntüsünde token görünen
   davetler kanonik revoke+resend ile döndürüldü.

P3 TEK KONTROLLÜ CANARY ... PASS
   Fixture (bounded grant, kanonik servisler; manuel SQL YOK):
     Case cmsj0bp83… (w5-canary-918752) + create-time CaseClient (I08 Canary, ALACAKLI)
     Collection cmsj0bp9g… CONFIRMED 100,00 TRY
     Disposition cmsj0bpag… HELD → recommend(ap2) → approve(ap1) → post() → POSTED+postedAt
     Lines: CLIENT_PAYABLE 70,00 + CONTRACTUAL_FEE_WITHHELD 30,00 · parity 100=100 ✓
     Disclosure version cmsj0e6z · office approval=ap1 · content approval=ap2 (FARKLI aktörler)
     approvedRecipientEmail = ulastelli@limagroup.com.tr
   GÖNDERİM (owner Option A — tek-gönderimlik publication penceresi):
     SEND_COUNT = 1 (2. gönderim makine ile bloklu: DUPLICATE_SEND_BLOCKED)
     provider=smtp · success=true · errorCode=null
     Message-ID: <13681e44-e30c-0005-ee49-878988a09d85@tellihukuk.com>
     UTC: 2026-08-07T14:02:33.932Z · version SEND_PENDING → PUBLISHED
     Audit: CLIENT_FINANCIAL_DISCLOSURE_SENT → CLIENT_FINANCIAL_DISCLOSURE_PUBLISHED
   TESLİM TEYİDİ: owner gelen kutusunda doğruladı (2026-08-07 ~17:07 yerel).

P4 ROLLBACK + KAPANIŞ ..... PASS
   Gönderimden hemen sonra publication OFF (iki env) + API restart →
   dispatcher UnconfiguredDisclosureNotificationDispatcher · FAIL_CLOSED_OK=true
   (gönderimsiz doğrulama). Duplicate/izinsiz yayın YOK (sent=1, published=1).
   İki sentetik approver kanonik `lawyers.delete` ile pasifleştirildi:
     userActive=false · lawyerActive=false · canApproveOfficeActions=false · ELIGIBLE=false
   Hard-delete YOK; approval audit izi korundu. Provisioning flag hiçbir kalıcı env'e
   yazılmadı (script-ömürlü).

P5 PUBLICATION ACTIVATION . PASS
   Teslim teyidinden sonra publication ON (iki env) + kontrollü restart.
   RUNTIME: write=true · publication=true · activation level LEVEL_2 ·
   dispatcher ClientFinancialDisclosureEmailDispatcher (provider=smtp) · API health OK.
   Audit: sent=1 / published=1 (tek gönderim; duplicate yok).
```

## 5. DİSPOZİSYONLAR VE AÇIK KALEMLER

```text
SENTETİK ARTIKLAR (hard-delete YASAK — audit iziyle bırakıldı):
  SYNTHETIC / NON-PRODUCTION / NOT USED FOR DISCLOSURE
    Case        cmsj0b2dp0002uz4vmv3jyisv (w5-canary-889154, ACTIVE)
    Case        cmsj0cgsf0002t48xc54w0aou (w5-canary-954487, ACTIVE)
    Collection  cmsj0b2ft000cuz4v8ypd0mi6 (CONFIRMED, 100,00)
    Collection  cmsj0cgu0000ct48xafpz084j (CONFIRMED, 100,00)
    Disposition cmsj0cgvb0017t48x8dzbr80u (HELD_PENDING_DISTRIBUTION)
  CANARY'DE KULLANILAN (kayıt bütünlüğü için korunur):
    Case cmsj0bp830002obeo87yki3j8 · Collection cmsj0bp9g000cobeokc06gvog ·
    Disposition cmsj0bpag0017obeob9i92fc6 (POSTED) · Version cmsj0e6z (PUBLISHED)
  Kanonik cancel/archive yüzeyi ARANDI: Case/Collection için "abandoned attempt"
  semantiği taşıyan kanonik iptal yüzeyi bulunamadı → yeni SQL/engineering YAPILMADI;
  disposition bu evidence kaydıdır.

ÜRÜN BUG'I (ayrı dilim — bu canary yeniden engineering'e SOKULMADI):
  user-invite.service.revoke() Lawyer/StaffMember bağını koparır (userId:null) fakat
  resend() bağı GERİ KURMAZ → rotate edilen davet kabul edilse bile profil bağı kaybolur
  ve approver eligibility SESSİZCE düşer. Bu canary'de owner-onaylı bounded relink ile
  onarıldı (audit: USER_INVITE_RELINKED). Kalıcı çözüm ayrı ürün dilimidir.

MİMARİ KAYIT (bilinçli tasarım, değişiklik önerilmiyor):
  client-financial-disclosure.module.ts composition factory: publication flag OFF iken
  dispatcher HER ZAMAN fail-closed fallback'tir. Dolayısıyla "publication OFF iken canary
  gönderimi" MİMARİ OLARAK İMKANSIZDIR; owner bu nedenle tek-gönderimlik ON penceresi
  (Option A) ratifiye etti.

OPS KALEMİ: runtime (API 8080 / Web 3002) şu an detached süreçlerle çalışıyor; kalıcı
  servis (Windows service / PM2 vb.) kurulumu ayrı ops işidir.
```

## 6. STATUS

```text
FD PROVIDER OPS GATE: CLOSED / PRODUCTION_VERIFIED (2026-08-07)
PUBLICATION:          ON (kalıcı) · write ON · provider smtp · LEVEL_2
CANARY:               1 gönderim, teslim teyitli, duplicate YOK
WAVE 5 RESIDUALS:     (1) C2-I08 CLOSED/PRODUCTION_VERIFIED (#2243/f34c371a) ✓
                      (2) EMAIL_PROVIDER + external publication canary ✓ (bu kayıt)
                      → İKİSİ DE KAPANDI
NEXT ELIGIBLE:        WAVE 5 TERMINAL INTEGRATION (master plan §14 — fresh main,
                      gerçek DB sertifikasyonu, register senkronizasyonu, cleanup)
```
