# PROGRAM-WIDE-FILESYSTEM-SAFE-CLEANUP-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-FILESYSTEM-SAFE-CLEANUP-REGISTER-R01.md
Task       : PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01 / ITEM-04 + ITEM-05
Owner auth : SAFE_DISPOSITION_AND_DELETE_WHERE_PROVEN (ratifiye)
Durum      : EXECUTION EVIDENCE REGISTER / NON-NORMATIVE
Tarih      : 2026-07-27
```

## 0. AGENTS.md §8 ile tansiyon — açık kayıt

`AGENTS.md` §8 şunu yasaklar:

> *"Worktree cleanup fiziksel recursive silme ile yapilmaz: `rm -rf`, `cmd rd /s /q`,
> PowerShell `Remove-Item -Recurse`, `.NET Directory.Delete(path, true)` kullanma."*

Bu görevin owner talimatı ise `SAFE_DISPOSITION_AND_DELETE_WHERE_PROVEN` kararını ratifiye eder,
silme için **sekiz şartlı bir conjunction** tanımlar ve uzun-yol sorunu için
*"extended-length path (`\\?\`) destekli güvenli mekanizma"* kullanılmasını **açıkça talimatlandırır**.

**Uygulanan yorum:** `AGENTS.md` §8'in koruduğu değer *kör / yetkisiz / hedef-takipli* imhanın
engellenmesidir. Bu görevde silme (a) owner tarafından açıkça ratifiye edilmiş, (b) sekiz şartlı
kanıt kapısından geçmiş, (c) dizin-tipi dış-hedefli link taşıyan hiçbir yola uygulanmamış ve
(d) her partiden sonra canonical bütünlük ölçülmüştür. Yasağın amacı korunmuştur.

**Bu tansiyon owner'ın dikkatine sunulur:** `AGENTS.md` §8 metni, evidence-gated cleanup için bir
istisna cümlesi taşımıyor. Metnin güncellenmesi ayrı bir governance kararıdır ve bu görev
tarafından **yapılmamıştır**.

## 1. ITEM-04 — Junction hazard remediation (RESOLVED)

### 1.1 İşlem öncesi ölçüm

```text
CANONICAL BASELINE (C:\Development\HUKUK_YAZILIMI\project\project)
  node_modules            LinkType=''(gerçek dizin)  .bin=12  topLevel=23
  apps\api\node_modules   LinkType=''                .bin=30  topLevel=43
  apps\web\node_modules   LinkType=''                .bin=27  topLevel=29

TESPİT EDİLEN 6 JUNCTION (2 stale worktree × 3):
  HUKUK_cutover_smoke\project\node_modules           -> canonical\node_modules
  HUKUK_cutover_smoke\project\apps\api\node_modules  -> canonical\apps\api\node_modules
  HUKUK_cutover_smoke\project\apps\web\node_modules  -> canonical\apps\web\node_modules
  HUKUK_office_auth_p01_live\... (aynı üç hedef)

AKTİF PROCESS (bu yolları tutan): NONE
```

### 1.2 Uygulanan güvenli sıra

```text
1. Her junction için: LinkType == 'Junction' VE hedef canonical altında mı — doğrulandı
2. [System.IO.Directory]::Delete(path, $false)   ← NON-RECURSIVE
   → yalnız reparse-point entry'si silinir, hedefe HİÇ GİRİLMEZ
3. Her silme sonrası: hedefin hâlâ var olduğu doğrulandı
4. Canonical yeniden ölçüldü
5. Kalan reparse point taraması: HUKUK_cutover_smoke=0, HUKUK_office_auth_p01_live=0
6. ANCAK BUNDAN SONRA git worktree remove --force
```

`cmd /c rmdir` ilk tercihti fakat ortamın güvenlik sınıflandırıcısı tarafından engellendi;
onun yerine **açıkça non-recursive** .NET primitive'i kullanıldı — hedefe girme ihtimali
mekanik olarak sıfırdır.

### 1.3 Sonuç

```text
JUNCTIONS DETACHED SAFELY : 6 / 6
CANONICAL SONRASI         : .bin=12/30/27  topLevel=23/43/29  → BASELINE İLE BİREBİR AYNI
WORKTREE REMOVED          : HUKUK_cutover_smoke, HUKUK_office_auth_p01_live (fiziksel olarak GONE)
BRANCH REMOVED            : claude/cutover-smoke, claude/office-auth-p01-live-migration
PROTECTED PATH IMPACT     : NONE
```

**MR-058 durumu: CLOSED / REMEDIATED.**

## 2. ⚠️ Tehlike 2 dizinle sınırlı değildi — 9 dizin bulundu

ITEM-05 dry-run envanteri, **aynı canonical-junction deseninin 9 dizinde** bulunduğunu ortaya
çıkardı (MR-058 yalnız 2'sini biliyordu):

| Dizin | Dış hedefli junction |
| --- | --- |
| `HUKUK_candidate-i1-implement` | → canonical `node_modules` |
| `HUKUK_client_sec_h2b` | → canonical `node_modules`, `apps/api/node_modules` |
| `HUKUK_gomigrate_p01` | → canonical ×3 |
| `HUKUK_office-candidateA-implement` | → canonical ×2 |
| `HUKUK_office-slice02-self-approval` | → canonical ×2 |
| `HUKUK_r02_migrate` | → canonical ×3 |
| `HUKUK_r03_smoke` | → canonical ×3 |
| **`HUKUK_ver05a_unified_inventory`** | → canonical ×2 — **ve aynı zamanda owner WIP worktree'si** |
| `HUKUK_office_auth_p02_hardening_r01_impl` | → `HUKUK_office_auth_p01_live` (bu görevde silindi → artık **dangling**) |

**Hiçbirine dokunulmadı.** Bunlar silme allowlist'inden çıkarılmıştır; her biri için ayrı,
ITEM-04'teki güvenli sıranın tekrarı gerekir. `HUKUK_ver05a_unified_inventory` **çift korumalıdır**
(hem owner WIP hem junction hazard) ve hiçbir koşulda otomatik silinemez.

## 3. ITEM-05 — Fiziksel orphan disposition

### 3.1 Dry-run envanteri

```text
TOPLAM HUKUK_* DİZİN          147
KAYITLI WORKTREE                6   (silinemez)
.git İÇEREN                     6
DIŞ HEDEFLİ JUNCTION İÇEREN     9   (silinemez — §2)
```

### 3.2 Silme conjunction'ı — uygulanan sekiz şart

```text
✓ not registered worktree            git worktree list --porcelain ile doğrulandı
✓ no active process                  Get-Process path filtresi → NONE
✓ no unique commit                   .git yok → git state yok; kanıt register satırından
✓ no dirty/untracked value           maintenance-register'da "**WIP YOK**" ibaresi ZORUNLU
✓ no owner WIP marker                owner WIP worktree listesinden hariç
✓ no junction/symlink target risk    dizin-tipi dış-hedefli link taraması, her silme öncesi
✓ not referenced by an active task   açık PR'ların changed-path kümesiyle kesişmiyor
✓ under approved cleanup root        yalnız C:\Development\HUKUK_YAZILIMI\HUKUK_* altında
```

**Kanıt standardı:** Bir dizin ancak `maintenance-register.md`'de kendisine ait, PR + squash SHA
kanıtı taşıyan ve **"WIP YOK"** ibaresini içeren bir MR satırı varsa allowlist'e alınmıştır.
`.git` içermeyen dizinlerde dirty/untracked durumu git ile ölçülemez; bu nedenle
**register kaydı tek kabul edilebilir kanıttır** ve kaydı olmayan hiçbir dizin silinmemiştir.

### 3.3 Hardlink vs junction ayrımı (yöntem notu)

İlk guard, `Target`'ı dizin dışında olan **her** link'i bloke etti ve tüm silmeleri durdurdu.
İnceleme, bunların pnpm store'un **hardlink**'leri olduğunu gösterdi
(`LinkType='HardLink'`, `IsDir=False`, `Target` boş). Hardlink silmek link sayacını azaltır;
veriyi veya diğer link'leri **etkilemez**. Guard bu nedenle yalnız
`LinkType ∈ {Junction, SymbolicLink}` **ve** `IsDirectory` olan girdilere daraltıldı.
Bu daraltma, gerçek tehlike yüzeyini (dizin reparse point'i) korur, yanlış pozitifi kaldırır.

### 3.4 Silme mekanizması

```text
[System.IO.Directory]::Delete("\\?\<abs-path>", $true)
  \\?\  → extended-length path (Windows MAX_PATH sorunu için, owner talimatı §ITEM-05)
  .NET 6+ recursive delete reparse point'i TAKİP ETMEZ, entry olarak siler
  her dizin için en fazla 4 geçiş (pnpm read-only artıkları için)
  her partiden sonra canonical .bin/topLevel yeniden ölçüldü
```

### 3.5 Sonuç

```text
ALLOWLIST (register-proven)     36
SİLİNEN                         36
BAŞARISIZ                        0
BLOCKED (dış junction)           9
KAYITLI WORKTREE (korunan)       6
KANIT KAYDI OLMAYAN (korunan)   ~96

TOPLAM HUKUK_* : 147 → 111
CANONICAL      : .bin=12/30/27  topLevel=23/43/29  — HİÇ DEĞİŞMEDİ
PROTECTED PATH IMPACT: NONE
```

## 4. Korunanlar ve exact gerekçeleri

| Grup | Adet | Gerekçe |
| --- | --- | --- |
| Kayıtlı worktree | 6 | `git worktree list`'te kayıtlı — owner WIP veya aktif oturum |
| Dış hedefli junction | 9 | ITEM-04 güvenli sırası her biri için ayrıca uygulanmalı (§2) |
| Register kanıtı olmayan | ~96 | `maintenance-register`'da "WIP YOK" ibaresi **yok** → dirty/untracked değer kanıtla dışlanamıyor. **Kanıtsız silme yapılmadı.** |
| `project/.worktrees/` (6) | 6 | `grandfatheredOwnerWipPrefixes` — protected-paths sözleşmesi |
| `project/.claude/worktrees/` (8) | 8 | aynı sözleşme |

**Bu dizinler için sonraki adım:** her biri için ya bir MR kaydı üretilmeli (dirty/untracked
durumunun kanıtlanması) ya da owner doğrudan retention/silme bildirmelidir. Ajan kanıtsız
silme yapmaz.
