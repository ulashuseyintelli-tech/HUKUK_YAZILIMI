# OFFICE A-07 — Owner Çalıştırma Paketi (R01)

> **Yetki:** owner'ın bu oturuma **doğrudan** yazdığı GO (2026-09-10) + kanonik plan **§8.15.6**.
> **Yol (a):** mevcut `off-acc-f851d975` fixture'ı ile devam. Yeni tenant/runId kurulmadı.
> **Hazırlık sırasında canlıya YAZMA YAPILMADI.** Bu belgedeki her ölçüm salt-okumadır.

---

## ⛔ 0. ÖNCE BUNU OKUYUN — KOŞUM ŞU AN BAŞLAYAMAZ

**Canlı PostgreSQL erişilemez durumda.** Ölçüm (2026-09-10, salt-okuma):

```
5432 dinleyici .............. YOK          postgres.exe ......... YOK
docker daemon ............... KAPALI       (canlı PG bir konteyner)
Prisma ...................... "Can't reach database server at 127.0.0.1:5432"

Scheduled Task API/Web ...... Running      API PID 27312 · WEB PID 22440 (ikisi de RELEASE21)
POST /api/auth/login (boş) .. 400          <- ValidationPipe; DB'ye DOKUNMAZ
POST /api/auth/login (gerçek) **500**      <- DB'ye DOKUNUR
GET  :3002 .................. 200
```

> **Ders — kayda geçti:** boş gövdeye **400** dönmesi "API sağlıklı" **demek değildir**;
> doğrulama katmanı DB'den önce çalışır. Önceki §3.4 toparlanma ölçütümüz bu 400'e dayanıyordu
> ve **DB kesintisini görmezdi**. Pakete DB'ye dokunan sınama (`PF-4.db`) eklendi.

**Veritabanını ben ayağa kaldırmadım.** Bu bir altyapı kurtarma işlemidir; GO'm A-07 kabulünü
kapsar, altyapı kurtarmayı değil — ve neden durduğu ölçülmeden körlemesine başlatmak durumu
bozabilir. Owner/işletme kararı.

**Paket bu durumu kendisi yakalar ve fail-closed durur** (aşağıdaki doğrulama koşumuna bakın).

---

## 1. Ön ölçüm — ne doğrulandı, ne doğrulanamadı

| Ölçüt | Sonuç |
|---|---|
| Tek yürütücü sahipliği | ✅ bu oturum; ikinci yürütücü yok, harness ve kanıtlar korundu |
| Canlı RELEASE21 kimliği | ✅ worktree HEAD `2187a78b` · API PID 27312 `HY_W4_RELEASE21` ağacından |
| Kabul bayrağı KAPALI | ✅ EnvFile'da satır **yok** (yokluk = fail-safe kapalı) |
| **Cron bayrağı KAPALI** | ✅ `OFFICE_APPROVAL_EXECUTOR_ENABLED` yok → çapraz-tenant tarama riski **doğmuyor** |
| ACL durumu | ✅ `.env` sahibi `NT AUTHORITY\SYSTEM`; **değiştirilmedi**, gevşetilmedi |
| Kapanış/kurtarma yolu | ✅ betik diskte, sözdizimi geçerli, görev sorgulanabilir · ⚠ **yazma izni yok** (yükseltilmiş terminal şart) |
| Fixture tüketilmemiş + 5 ön koşul | ⛔ **ÖLÇÜLEMEDİ — DB erişilemez.** Paket bunu koşum anında ölçer |

**Ölçülemeyen ölçüt PASS sayılmaz.** Fixture'ın son bilinen durumu (2026-09-09 ölçümü):
`APPROVED / NOT_RUN`, `attempt=0`, `Case.caseStatus=ISLEMDE`, yürütme izi bağı **0**.
Bu bilgi **bayattır**; paket koşum anında yeniden ölçer ve tutmazsa **durur**.

---

## 2. Erişim açma — ölçülmüş gerçek maliyet (planı DÜZELTİR)

Önceki kayıtlar "**iki satırlık** yeniden etkinleştirme" diyordu. Kaynağı ölçtüm
(`auth.service.ts` login kapısı): sıra **passwordHash NULL değil → bcrypt.compare → tenant
lifecycle → isActive**.

**İlk koşumun parolası G-4 gereği bellekte üretilip hiçbir yere yazılmamıştı → KURTARILAMAZ.**
Yani "erişimi yeniden açmak" tek başına `isActive` **değildir**; **taze bir parola da gerekir**.

Paket bunu **daha dar** yapıyor: A-07 yalnız ADMIN aktörüne ihtiyaç duyar →

| | önceki varsayım | paketin yaptığı |
|---|---|---|
| dokunulan satır | 2 (admin + personel) | **1 (yalnız ADMIN)** |
| değişen alan | `isActive` | `isActive` **+ taze `passwordHash`** |
| personel satırı | açılacaktı | **DOKUNULMAZ** |

Parola bu süreçte üretilir, yalnız bellekte tutulur, **hiçbir çıktıya/dosyaya/rapora yazılmaz**.
Kapanışta satır tekrar `isActive=false` + `tokenVersion++` ile kapatılır.

---

## 3. Paket — dosyalar ve **ilk kullanım SHA-256**

Dizin: `project/docs/governance/office-delivery-r01/a07-owner-pack/`

| dosya | bayt | SHA-256 (ilk kullanim) |
|---|---:|---|
| `a07-run.ps1` | 3710 | `8C8C30F01DD0817AE2E21682D08CFD479B6D1BFF15F49F4EFA4D02BFF6137196` |
| `a07-run.js` | 11266 | `486AEE6D20E38D74C56047D02A5862AF74F9CF06F70A858C79D14FBF46230EFF` |
| `a07-00-preflight.js` | 11189 | `A7342E6BD700B146FED8D68BBCE42D12092AFD6F868C04825EC4F02752039318` |
| `a07-99-close.js` | 7164 | `63AA62E3A0AC87C98C4E93F1B5A07B1CF7AC5D712FD1F1D7D6431B73E91182E7` |
| `a07-deps.js` | 4172 | `522BF7D4084D5BF14BF230C05E8D65671E81FE4A97725891D16503351919D75D` |

- `a07-run.ps1` — **TEK KOMUT** - yukseltilmis mi bakar, ortami kurar, DATABASE_URL'i EnvFile'dan sure icinde okur
- `a07-run.js` — tek yurutucu - sira + `finally` kapanisi
- `a07-00-preflight.js` — ON OLCUM (salt-okuma) - dusberse bayrak ACILMAZ
- `a07-99-close.js` — KAPANIS/KURTARMA - tek basina calisir, idempotent, `--dry-run` destekler
- `a07-deps.js` — bagimlilik cozucu + DELTA-A sema sinamasi

Mevcut harness **yeniden yazılmadı**, kullanıldı: `../scripts/ow-lib.js` (G-0…G-4 kapıları,
rate-limit farkında login, secret-safe HTTP) ve `../scripts/ow-service.js` (bayrak dosyası,
Scheduled Task restart, §3.4 üç koşullu toparlanma, uçtan bayrak ölçümü).

### 3.1 Bağımlılık çözümü — ölçülmüş bir dağıtım kusuru kapatıldı

Hazırlık sırasında ölçtüm: **kanonik kökte `apps/api/node_modules/@prisma/client` ve `bcrypt`
YOK.** Sabit gömülü tek yol kullanılsaydı paket owner'ın makinesinde *"modül bulunamadı"* ile
düşerdi. `a07-deps.js` adayları sırayla dener ve **hangisini kullandığını yazdırır**:

1. `OW_PRISMA_ROOT` / `A07_BCRYPT_ROOT` (açık override)
2. paketin kendi ağacı — `<repo>/project/apps/api/node_modules/…`
3. **canlı sürüm ağacı** — `HY_W4_RELEASE21/project/apps/api/node_modules/…` *(yalnız okuma;
   sürüm ağacına hiçbir şey yazılmaz)*
4. bilinen çalışma ağaçları

Ayrıca `PF-5.sema`: Prisma client'ın **`approvalRequestId`/`approvalAttempt` alanlarını
tanıdığı** ölçülür. Tanımayan bir client kanıt sorgusunu **sessizce boş** döndürür ve A-07
"ölçülemedi" olurdu — bu yüzden fail-closed sınanır.

---

## 4. Owner'ın çalıştıracağı **TEK KOMUT**

**Önce** kanonik kökü güncelleyin (paket bu PR ile gelir):

```powershell
cd C:\Development\HUKUK_YAZILIMI ; git pull
```

**Sonra, yükseltilmiş (Yönetici) PowerShell'de:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\project\docs\governance\office-delivery-r01\a07-owner-pack\a07-run.ps1"
```

Başka hiçbir şey ayarlamanız gerekmez: canlı `DATABASE_URL` **komut satırına konmaz**,
başlatıcı betiğindeki `EnvFile` satırından **süreç içinde** okunur (argv süreç tablosunda
görünür — bu yüzden böyle).

### Yarıda kesilirse — tek başına kurtarma

```powershell
node "C:\Development\HUKUK_YAZILIMI\project\docs\governance\office-delivery-r01\a07-owner-pack\a07-99-close.js"
```

Durum dosyasına ihtiyaç duymaz, **idempotenttir**, güvenle tekrar koşulur.

---

## 5. Akış — ve bayrağın ne zaman açıldığı

```
00 ÖN ÖLÇÜM (salt-okuma)              düşerse -> BAYRAK AÇILMAZ, hiçbir şey değişmez
   ↓
KAPANIŞ YOLUNUN KURU KOŞUMU           düşerse -> BAYRAK AÇILMAZ
   ("kapatma ve toparlanma yolu hazır olmadan bayrağı açma" — GO şartı)
   ↓
01 ERİŞİM AÇ    (1 satır: ADMIN · isActive + taze parola)
   ↓
   bayrak UÇTAN kapalı mı? (403 DISABLED)   değilse -> DUR
   ↓
02 BAYRAK AÇ + API restart + toparlanma doğrulaması (PID değişti · istek işliyor · uç teyidi)
   ↓
03 A-07: execute (TEK KEZ) → kanıt → hedefli reconcile
   ↓
99 KAPANIŞ — **`finally`, başarısızlıkta DA**: bayrak kapat + restart + erişim iptal
   + ÜÇÜNÜ DE doğrula
```

**Restart sayısı: 2** (açma + kapatma). Yalnız **API** etkilenir; Web ayrı görevdir.

---

## 6. Paketin kendi doğrulaması (bugün koşuldu, canlıya yazma yok)

| Test | Sonuç |
|---|---|
| Yükseltilmemiş terminalde tek komut | **exit 2** + "yükseltilmiş terminal ister · ACL DEĞİŞTİRMEYİN" |
| Ön ölçüm (salt-okuma) | **exit 1** · 8/23 PASS — `PF-1.write` FAIL (EPERM), `PF-4.db` FAIL (HTTP 500), 13 ölçüt **ÖLÇÜLEMEDİ** |
| Kapanış yolu kuru koşumu | **exit 1** · *"KURU KOŞUM — hiçbir şey değiştirilmedi. Kapanış yolu HAZIR DEĞİL!"* |
| Sözdizimi (`node --check` ×3 + PS parser) | **4/4 temiz** |

Yani üç bağımsız kapı da **bayrağı açmadan** durdurdu. Fail-closed davranış varsayım değil,
**ölçüldü**.

---

## 7. Sınırlar — pakette uygulanan

ACL **değiştirilmez** · cron bayrağına **dokunulmaz** · `purge` **yok** · gerçek tenant/alıcı
işlemi **yok** · deploy/migration/rollback/yeniden mühür **yok** · ikinci tenant **yok** ·
araç reddi veya erişim kontrolü **atlatılmaz** · sırlar terminale/rapora **dökülmez**.

`OW_CONFIRM_LIVE` jetonu G-0 tarafından **zorunlu** tutulur; `a07-run.ps1` onu açıkça verir,
yani canlıya yazma bir ortam değişkeni unutmasıyla **kazayla olamaz**.

---

## 8. Koşum sonrası ana yürütücüye teslim edilecek üç kanıt

1. **bayrak KAPALI** — uçtan `403 OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`
2. **sentetik erişim İPTAL** — `isActive=false`, `tokenVersion++`, login **401**
3. **servis TOPARLANDI** — PID değişti · istek işliyor · **DB'ye dokunan** sınama geçti

Bunlara ek olarak A-07'nin kendi ölçütleri (`executionStatus SUCCEEDED` · `AuditLog`
STARTED+SUCCEEDED · `CaseStatusHistory` **kesin bağ** · `Case.caseStatus` hedefe eşit ·
`DecisionLog` · reconcile **yeniden uygulamadı**).

**A-07 hâlâ AÇIK.** Bu belge bir kabul kaydı değil, **çalıştırma paketidir**.
