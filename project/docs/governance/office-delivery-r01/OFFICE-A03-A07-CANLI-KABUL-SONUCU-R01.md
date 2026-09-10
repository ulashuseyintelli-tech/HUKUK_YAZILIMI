# OFFICE A-03…A-07 — Canlı Kabul Koşumu Sonucu (R01)

> **Kapsam:** owner'ın bu oturuma **doğrudan** yazdığı GO ile açılan A-03…A-07 canlı kabulü.
> Koşum planı: `OFFICE-A03-A07-CANLI-KABUL-KOSUM-PLANI-R01.md` @ `349e1a57` (§1 · §2 · §2.1.1 · §3 · §5 · §6).
> **Tek canlı yürütücü** bu oturumdur.

## 0. Sonuç özeti

| Kabul | Sonuç | Ölçüt |
|---|---|---|
| **A-03** ayar yüzeyi PUT yazma | ✅ **PASS** | **53/53** · FAIL 0 · ÖLÇÜLEMEDİ 0 |
| **A-04** avukat + personel yazma | ✅ **PASS** | **27/27** · FAIL 0 · ÖLÇÜLEMEDİ 0 |
| **A-05** personel okuma (maskeleme) | ✅ **PASS** | **12/12** · FAIL 0 · ÖLÇÜLEMEDİ 0 |
| **A-06** raporlama hattı | ✅ **PASS** | **17/17** · FAIL 0 · ÖLÇÜLEMEDİ 0 |
| **A-07** kontrollü yürütme | ⛔ **ÖLÇÜLEMEDİ** | hazırlık **5/5 PASS**; yürütme **BAŞLATILAMADI** — bayrak yazılamadı (ACL) |
| kapanış `revoke-access` | ✅ **DOĞRULANDI** | **3/3** · sentetik User 2/2 devre dışı |

`runId` **`f851d975`** · tenant **`off-acc-f851d975`** · canlı **RELEASE21** aday `2187a78b` ·
API PID **50316** (koşum boyunca **değişmedi**) · BUILD_ID `g91HUaBesekB-R2rRawQj`.

**A-07 TAMAMLANMADI.** Dört kabul canlıda kapandı; beşincisi **ölçülemedi** ve PASS sayılmaz.

## 1. Ön doğrulamalar (koşumdan önce, bağımsız)

- **A-01 kapanışı** — makbuz `CUTOVER-CUT-20260909-143723-0b9bc330.json` sha256 **`7DEED4E7F1A9AE54…`**,
  journal **`812932ED27F143DA…`**; `verdict=C33_RELEASE21_CUTOVER_APPLIED_AND_VERIFIED`,
  `claimConsumed=true`, `rollback.performed=false`, `dbMutations=0`, `dbPre == dbPost`.
  Hash'ler **bu oturumda yeniden hesaplandı**; ana yürütücünün beyanıyla birebir.
- **Canlı kimlik** — worktree HEAD `2187a78b`, API PID 50316 / WEB PID 53612, RELEASE21 dışında
  çalışan sürüm süreci **yok**.
- **Migration** — `CaseStatusHistory.approvalRequestId` + `approvalAttempt` kolonları ve
  `CaseStatusHistory_approvalRequestId_approvalAttempt_idx` canlıda **MEVCUT**; defter **130**;
  Prisma client alanları **tanıyor**.
- **Taban çizgisi** — `tenant 6 · user 37 · case 31 · caseStatusHistory 930 · approval 17`;
  önceden `off-acc-*` tenant **0**.

## 2. A-07 — neden ölçülemedi (kanıtlı)

Bayrak `OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED` API'nin EnvFile'ına yazılamadı:

```
dosya  : C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE21\project\apps\api\.env
sahip  : NT AUTHORITY\SYSTEM
ACL    : SYSTEM FullControl · BUILTIN\Administrators FullControl · TELLI\ulastelli **Read, Synchronize**
aktör  : TELLI\ulastelli — yönetici DEĞİL
sonuç  : EPERM / "Access to the path ... is denied"
```

Bu, C36 ENV-ACL sertleştirmesinin **amaçlanan** davranışıdır; ürün kusuru değildir.
**Yetki yükseltme denenmedi** (kapsam dışı ve güvenlik sınırı).

**Fail-closed doğru çalıştı:** bayrak **hiç açılmadı**, **restart sayısı 0**, API PID değişmedi,
ve `finally` yolu dosyadaki gerçeği ölçüp *"kapatılacak bir şey yok"* dedi — bellekteki
`flagOpened` değişkenine değil **ölçüme** dayandı.

**Fixture TÜKETİLMEDİ:** talep `APPROVED/NOT_RUN`, `attempt=0`, `Case.caseStatus=ISLEMDE`
(hedef `DERKENAR`'a **geçmedi**), `CaseStatusHistory` bağı **0**. K6 giriş kapısı hâlâ açık;
bayrak sorunu çözülürse aynı fixture ile yürütme mümkündür.

### Bayrağın kapalılığı UÇTAN ölçüldü (§3.4'ün ilk yarısı)
`POST /office-approvals/<id>/execute` → **HTTP 403 `OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED`**.
Bu, önceki turlarda yalnız *yapılandırma düzeyinde* kanıtlanabilen şeyin **uç düzeyi** karşılığıdır.

### A-07 için gereken (owner/işletme kararı)
Bayrak satırını yazabilecek **yükseltilmiş bir aktör** + `Restart-ScheduledTask HukukPlatform-API`.

> **ERRATUM (2026-09-10, ölçüldü):** `Restart-ScheduledTask` **bu makinede yoktur** — ne
> PowerShell 7'de ne 5.1'de (`Get-Command -Module ScheduledTasks` yalnız `Start-`/`Stop-ScheduledTask`
> döndürür). Doğru yol A-07 paketinin kapanış betiğidir (`a07-owner-pack/a07-99-close.js`); elle
> gerekirse `Stop-ScheduledTask` + `Start-ScheduledTask` — ama önce `C:/Ops/hukuk/logs/api/host-api.log`
> son satırına bakılır: başlatma sürüyorsa **durdurulmaz**.
Mekanizma ölçüldü ve pakette: görev `HukukPlatform-API` → `hukuk-task-host.exe` →
`pwsh -File C:\Ops\hukuk\bin\start-api.ps1` → `node main.js`; EnvFile yolu betikteki
`EnvFile = …` satırından okunur.

## 3. Yazma envanteri — **ÖLÇÜLEN GERÇEK** (plan §2'yi DÜZELTİR)

Planın §2'si üç kategori sayıyordu (kurulum 9 · yürütme 4+2 · kapanış). **Ölçüm gösterdi ki
A-03…A-06'nın KENDİ kabul yazmaları bu üç kategoride SAYILMAMIŞTI.** Aşağısı gerçek:

| kaynak | satır |
|---|---|
| kurulum (tek tx) | `Tenant` 1 · `Office` 1 · `User` 2 · `Lawyer` 2 · `StaffMember` 1 = **7** |
| A-07 fixture | `Case` 1 · `OfficeApprovalRequest` 1 = **2** → *(plan §2.1'in "9 satır"ı = 7+2 ✔)* |
| **A-04 kabul yazmaları** | `Lawyer` +1 · `StaffMember` +1 |
| **A-06 kabul yazması** | `ReportingLine` +1 |
| **A-03 kabul yazması** | `BankAccount` +1 sonra silindi → **net 0** |
| **yan etki** | `AuditLog` **11** |
| kapanış | sentetik `User` **2** güncelleme (`isActive=false` + `tokenVersion++`) |

**Kendi tenant'ımızdaki kalıcı satır: 23.** A-07 yürütmediği için `AuditLog` STARTED/SUCCEEDED,
`CaseStatusHistory` ve `DecisionLog` **yazılmadı**.

> **Kayda geçen ders:** "9 satır" ifadesi *kurulum + A-07 ön satırları* içindi; A-03…A-06 kendisi
> yazma kabulüdür ve kendi satırlarını üretir. Envanter bunları **ayrıca** saymalıdır.
> (Aynı sınıf hata #2549'da `OfficeApprovalRequest` güncellemesinin envanterde olmamasıydı.)

## 4. İzolasyon — gerçek tenant'lara etki **0**

- **A-03.iso:** izlenen **6** tenant (korunan `telli-hukuk` · `demo-firma` ·
  `local-development-office` · `c36-smoke-principal` · `c36-smoke-principal-2` dahil) → **FARK 0**.
  İzlenen küme **boş değildi** (boş küme HARD FAIL olurdu — A-02 §7).
- **Global fark = yalnız kendi satırlarımız:** `tenant +1 · user +2 · case +1 · approval +1 ·
  caseStatusHistory +0`.
- **Seyirci tenant KURULMADI** (dolu ortam; T-3 doğruladı) → **ikinci tenant YOK**, GO'nun
  dışlamasına uyuldu.

## 5. Kapanış — `revoke-access` DOĞRULANDI

`T-1` sentetik User 2/2 devre dışı, hâlâ aktif **0** · `T-2` `audit 11` / `approval 1` /
`reportingLine 1` **önce = sonra** (kanıt korundu) · `T-3` seyirci yok.
`purge` **kullanılmadı** (canlıda yasak; ortam kapısı da reddeder).

## 6. AK kalemleri — hüküm verilmedi

`AK-1a` · `AK-1b` · `AK-1c` · `AK-2` → **KARAKTERİZE EDİLDİ / OWNER KARARI BEKLİYOR**.
Kod değiştirilmedi. `AK-3` (CAP-07) bu sürümün açık sınırıdır.

## 7. Harness değişiklikleri (bu koşum için)

- `ow-lib.js` — G-0 artık **iki ortamlı**: `disposable` (5439/`hukuk_office_acc_test`) ve
  `live` (5432/`hukuk_db`). **Varsayılan `live`** (fail-safe) ve live'da `OW_CONFIRM_LIVE`
  jetonu **zorunlu**; eski `assertDisposableEnvironment` adı ortamı **zorla disposable** yapar.
- `ow-service.js` (**yeni**) — bayrak dosyası okuma/yazma (yalnız o satır; diğer satırların
  değişmediği **bayt düzeyinde doğrulanır**), Scheduled Task ile restart, §3.4 üç koşullu
  toparlanma doğrulaması, uçtan bayrak ölçümü.
- `ow-07-approval.js` (**yeni**) — iki fazlı A-07: `prepare` (fixture + §2.1.1'in beş ön koşulu)
  ve `execute` (yürütme + kanıt + hedefli reconcile). **409 kuralı** uygulanır.
- `ow-live.js` (**yeni**) — canlı giriş noktası. `DATABASE_URL`'i API'nin EnvFile'ından
  **süreç içinde** okur; argv'ye/log'a geçmez (süreç tablosunda görünmez). `OW_CONFIRM_LIVE`
  jetonunu **kendisi set etmez**.
- `ow-run.js` — A-07 dar bayrak penceresi sırası (5a→5b→5c) ve `finally` yolunda **5d bayrak
  kapatma**; kapatma kararı `flagOpened` değişkenine değil **dosyadaki gerçeğe** dayanır.

## 8. Sınırlar — uyuldu

Gerçek tenant verisi ✗ · ikinci tenant ✗ · gerçek alıcıya gönderim ✗ · gerçek UYAP ✗ ·
canlı O-8 Kaydet ✗ · `purge` ✗ · ayrı finansal F04 yarış koşumu ✗ · deploy/migration ✗.
Parola ve token hiçbir dosyaya, log'a veya bu rapora **yazılmadı** (G-4).
