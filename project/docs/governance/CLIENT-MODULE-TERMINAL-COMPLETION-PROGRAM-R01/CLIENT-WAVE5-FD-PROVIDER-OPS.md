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
