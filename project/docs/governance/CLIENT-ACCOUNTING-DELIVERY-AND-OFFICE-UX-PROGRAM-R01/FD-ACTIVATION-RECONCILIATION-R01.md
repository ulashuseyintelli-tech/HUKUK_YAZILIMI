# FD PUBLICATION ACTIVATION — RECONCILIATION R01

```text
PROGRAM:        CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:      FD-ACTIVATION-RECONCILIATION-R01      LANE OWNER: CLAUDE (kontrol)
OWNER GO:       FD PUBLICATION ACTIVATION + SINGLE CONTROLLED FD CANARY + TERMINAL RECONCILIATION
TARİH:          2026-08-10
CANONICAL BASE: 9c772022f36d4e2c39d3ae05a427392e88ca3c6b (#2334)

SONUÇ:          ACTIVATION = ZATEN AKTİF (yeni aktivasyon YAPILMADI)
                FD CANARY  = YAPILMADI — HARD STOP (güvenli substrat yok)
                FLAG       = DEĞİŞTİRİLMEDİ (ne açıldı ne kapatıldı)
BU DOSYA:       secret/env DEĞERİ içermez.
```

---

## 1. PROVENANCE (ADIM 1 — PASS)

```text
origin/main == local main == 9c772022f36d4e2c39d3ae05a427392e88ca3c6b
açık PR                     = 0
kanonik kök worktree        = CLEAN (tracked değişiklik yok)
9c772022 ANCESTOR_OK        ✓
452f79e7 ANCESTOR_OK        ✓
452f79e7 → 9c772022 arası   = TAM 1 commit (#2334'ün kendisi)
```

### `452f79e7` çelişkisinin kesin açıklaması

`452f79e7` bir **ölçüm tabanıdır** — TERMINAL CONSOLIDATION R01'in altı hattı okuduğu
andaki `origin/main`. `#2334` bu tabanın üstüne yazıldı ve squash sonucu `9c772022`
oldu. Yani `452f79e7`, `9c772022`'nin **doğrudan ebeveynidir**. Çelişki yoktur;
ölçüm-tabanı ile kayıt-commit'i arasındaki normal bir commit farkıdır.
**Kanonik frontier = `9c772022`.**

---

## 2. GERÇEK PUBLICATION FLAG'LERİ (ADIM 2 — koddan ve sayfadan, tahmin YOK)

```text
CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED
CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED
```

Kanonik guard (`client-financial-disclosure-activation.ts`):
`isCanonicalActivationTrue(v) => v === 'true'` · merdiven `LEVEL_0 → LEVEL_1 → LEVEL_2`.
X2 sayfası: *"yalnız exact `true` ile açılır ve default-off kalır"*.
X1'in ayrı bir flag'i **yoktur**; aynı zincirin ofis yüzeyidir.

**Rollback yöntemi (X2/W4 deseni):** flag satırını kaldır → API task restart → flag-OFF doğrula.

---

## 3. ⚠ BULGU-1 — PRODUCTION ZATEN AKTİF (governance kaydı YANLIŞTI)

Ölçüm (salt-okuma; env'den yalnız üç feature-flag değeri, credential OKUNMADI):

```text
RELEASE            : HY_W4_RELEASE5 @ ecf32001 (task: node dist/apps/api/src/main.js)
.env son değişiklik: 2026-08-10 10:12:49
API süreç başlangıcı: 2026-08-10 10:13:08   ← env'den 19 sn SONRA
⇒ çalışan süreç bu env'i YÜKLEDİ

dotenv@16.4.5 parse (release'in kendi dotenv'i):
  CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED        => "true"  (=== 'true' → TRUE)
  CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED  => "true"  (=== 'true' → TRUE)

DERLENMİŞ GUARD VERDİCT (release'in kendi dist'i):
  isDisclosureWriteEnabled         : true
  isDisclosurePublicationEnabled   : true
  resolveDisclosureActivationLevel : LEVEL_2
```

`.env` içinde değerler **çift tırnaklıdır** (`"true"`); dotenv çevreleyen tırnağı
sıyırdığı için guard `'true'` görür ve **açılır**. Tırnak bir güvenlik marjı DEĞİLDİR.

**Sonuç:** FD publication **canlıda AÇIK ve LEVEL_2**. Bu durum bu oturumdan önce
mevcuttu; flag satırları 10:12:49 düzenlemesinden de **önce** oradaydı.

### Yanlış olduğu kanıtlanan kayıtlar

```text
CODEX-X1-FD-OFFICE-WORKSPACE.md   "PRODUCTION: NOT ACTIVE"                → YANLIŞ
                                   "PERSISTENT ACTIVATION: NOT PERFORMED" → YANLIŞ
CODEX-X2-FD-DETERMINISTIC-RENDERER.md
                                   "FLAGS DEFAULT-OFF · NOT ACTIVE"       → YANLIŞ
                                   "ACTIVATION: OWNER-GATED / NOT PERFORMED" → YANLIŞ
MASTER-PLAN §11 (#2334, bu kontrol sayfasının kendi kaydı)
                                   "X1/X2 PRODUCTION: NOT ACTIVE"         → YANLIŞ
```

Bu, sayfa iddiasının runtime ölçümü yerine geçirilmesinden doğan bir **drift**'tir.
`#2334` kaydı bu hatayı devraldı; burada düzeltilir.

**Yapılmayan:** flag'lere DOKUNULMADI. Bu oturum hiçbir aktivasyon gerçekleştirmedi;
dolayısıyla owner talimatı §7'deki "post-activation rollback" **uygulanabilir değildir**.
Zaten canlı olan bir yüzeyi kapatmak owner'ın istemediği bir production değişikliği olurdu.

---

## 4. ⚠ BULGU-2 — MEVCUT FD KAYDI YENİ RENDERER'DAN ÖNCEDİR

```text
FD ROOTS                 : 1   (tenant = Demo Firma, createdAt 2026-08-07T13:57:15)
FD VERSION STATUS        : PUBLISHED × 1
FD PROVIDER SENDS        : 1   (providerMessageId DOLU → gerçek provider teslimi olmuş)

Deterministik renderer indi: 2026-08-08  (#2277 `4e741675`, #2279 `3cbcd592`)
Mevcut FD yayınlandı       : 2026-08-07  ← renderer'dan ÖNCE
```

Yani canlıdaki tek FD, **eski serbest-metin** içerikli Wave-5 canary'sidir
(owner gözlemi: *"Müvekkil bilgilendirme — w5 canary (sentetik test kaydı)"*).
**Yeni deterministik renderer zinciri için hiçbir canary kanıtı yoktur.**

---

## 5. PREFLIGHT ÖLÇÜMLERİ (ADIM 3)

```text
MIGRATION FRONTIER   : total=125 · unfinished=0 · rolled_back=0     PASS
C3 MONTHLY DELIVERY  : CLIENT_STATEMENT_MONTHLY_DELIVERY = true     KORUNDU (dokunulmadı)
STATEMENT LEDGER     : SENT × 1                                     KORUNDU (regresyon yok)
NOTIFICATIONS        : CLIENT_TIMELINE_SMOKE=1 · STATEMENT_READY=1 · TEST=1
DOĞRULANMIŞ CANARY ALICISI : ula***@limagroup.com.tr
                             (C1-B04 R02'de owner kabulüyle kullanıldı; TURHOST
                              `srvc182.trwww.com:465` SSL, gönderen bilgi@tellihukuk.com)
```

---

## 6. ⛔ FD CANARY — HARD STOP (yapılmadı)

Canary'yi yürütmek için **FD kökü olmayan bir POSTED disposition** gerekir. Ölçüm:

```text
COLLECTION DISPOSITION (tenant × status)
  TELLİ HUKUK   POSTED = 2        REVERSED = 1
  Demo Firma    POSTED = 1        HELD_PENDING_DISTRIBUTION = 1

FD kökü OLMAYAN POSTED disposition : 2 — HER İKİSİ DE **TELLİ HUKUK**
Demo Firma'nın tek POSTED'ı zaten w5 canary FD'si tarafından tüketilmiş
(şema: @@unique([tenantId, collectionDispositionId]))
```

Üç seçeneğin **üçü de** owner kısıtlarını ihlal ediyor:

```text
(a) TELLİ HUKUK POSTED kullan   → GERÇEK müvekkilin GERÇEK tahsilat verisi üzerinde
                                   kalıcı PUBLISHED FD kaydı doğar.
                                   İhlal: "gerçek müvekkile/personeline canary gönderme"
(b) Demo Firma'ya yeni POSTED   → production'da tahsilat/dağıtım kaydı UYDURMAK demek.
    disposition üret               İhlal: "minimum ve geri alınabilir" + "ilgisiz ürün değişikliği"
(c) Mevcut FD'yi yeniden yayınla → duplicate gerçek teslim riski.
    / supersede et                 İhlal: "tekrar çalıştırmada duplicate delivery yok"
```

**Ek kısıt:** X1 ofis yüzeyi zinciri kimlik doğrulamalı HTTP çağrısı gerektirir;
bu oturum credential ÇIKARMAZ ve KULLANMAZ.

```text
FD CANARY DISPOSITION: BLOCKED_OWNER_DECISION
GEREKEN            : owner tarafından belirlenmiş GÜVENLİ CANARY SUBSTRATI —
                     (i) Demo Firma'da canary'ye tahsis edilmiş POSTED disposition, veya
                     (ii) böyle bir kaydın üretilmesi için açık owner yetkisi
GÖNDERİM YAPILMADI : provider'a tek byte gitmedi.
```

---

## 7. BU OTURUMDA YAPILMAYANLAR

```text
migration/schema değişikliği        : YAPILMADI
flag açma/kapama                    : YAPILMADI (mevcut durum korundu)
C1/C3 flag'lerine dokunma           : YAPILMADI
gerçek/deneme e-posta gönderimi     : YAPILMADI
başarısız teslim retry'ı            : YOK (teslim denenmedi)
deployment / restart                : YAPILMADI
ürün kodu değişikliği               : YAPILMADI
TERMINAL_CLOSED ilanı               : YAPILMADI
```

---

## 8. GÜNCELLENMİŞ RESIDUAL TABLOSU

```text
RESIDUAL-1  FD PUBLICATION ACTIVATION
            ÖNCEKİ KAYIT : OPEN / owner-gated / NOT PERFORMED
            GERÇEK       : PRODUCTION'DA AKTİF (LEVEL_2) — RECONCILED
            KALAN İŞ     : X1/X2 sayfa başlıklarının kendi lane authority'siyle
                           düzeltilmesi (CROSS-LANE RULE — bu sayfadan yapılmaz)

RESIDUAL-2  FD CANARY (deterministik renderer zinciri)
            DURUM        : AÇIK — BLOCKED_OWNER_DECISION (§6)
            NOT          : Canlıdaki tek FD renderer'dan ÖNCEdir; kanıt yerine GEÇMEZ.
                           MONTHLY_STATEMENT_PDF de kanıt yerine GEÇMEZ (owner kuralı).
```

**TERMINAL KAPANIŞ YAZILAMAZ** — owner talimatı §9'daki "FD canary PASS" ve
"production activation residual = 0" koşulları birlikte sağlanmıyor.
