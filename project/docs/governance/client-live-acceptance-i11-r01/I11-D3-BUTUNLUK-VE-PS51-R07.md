# CLIENT İ11 — D3 YEDEK BÜTÜNLÜĞÜ VE WINDOWS POWERSHELL 5.1 DÜZELTMESİ (R07)

```text
BELGE    : I11-D3-BUTUNLUK-VE-PS51-R07   (R05/R06'daki T-PENCERE-AÇ / T-PENCERE-KAPA hash'lerinin yerine geçer; §9 DEĞİŞMEDİ)
TETİK    : ana yürütücünün bağımsız doğrulayıcı bulgusu (2026-09-13, bilgi) — CLIENT her maddeyi kendisi ÖLÇTÜ
YETKİ    : owner GO "CLIENT İ11 / ADAYA BAĞLAMA VE SON KABUL HAZIRLIĞI" hazırlık yetkisi (kendi paketi)
ORTAM    : yalnız oturuma özel DB + Redis + yerel yakalayıcı + RELEASE23 aday dist; canlıya DOKUNULMADI
           (canlıda yalnız salt-okuma: .env sha256 + bayt özellikleri, Get-Acl, dinleyici/görev/kural sayımı)
DURUM    : DÜZELTİLDİ + Windows PowerShell 5.1 `-File` İLE ÇALIŞTIRILARAK KANITLANDI · canlı kabul YAPILMADI
```

## 1. Bulgular — CLIENT tarafından ÖLÇÜLDÜ

| # | Bulgu | CLIENT ölçümü | Etki |
|---|---|---|---|
| **E6** | Yedek zinciri korumasız | Karalama kökü → `i11s` → `twork`/`runs`: **6 yabancı SID kalıtsal Modify** (`CodexSandboxUsers` dahil), bunların **2'sinde `DeleteSubdirectoriesAndFiles`** | (a) `Copy-Item` ile `Set-Acl` arasında yedek kalıtsal ACL ile doğuyordu · (b) canlı `i11live` bu zincirden kalıtım alır; silme/yeniden adlandırma ile **yedek değiştirilebilir** · (c) R-T1 yedeği güvenilir bir değere karşılaştırmadan **yükseltilmiş oturumla canlı `.env`'e** yazıyordu · (d) SDDL tabanı, yakalayıcı taban dosyası ve yakalayıcı kaydı (K-T10b kanıtı) da değiştirilebilirdi |
| **E7** | Windows PowerShell 5.1'de env değişimi **sessizce bozuyor** | K-T7/K-T8 satırları betikten birebir, canlıyla aynı özellikte sentetik env üzerinde (CRLF, BOM yok, UTF-8 ASCII dışı): **5.1'de K-T8 GEÇTİ ama `ü` → `C3 83 C2 BC` (çift kodlama) + BOM eklendi**; PS 7'de doğru | Canlı `.env`'de **19 ASCII dışı bayt** var (salt okuma ölçümü; değer okunmadı). R02 sözleşmesi T bloklarını `powershell.exe -File` (5.1) ile çağırıyor → pencere süresince bu değerler **bozuk** yüklenirdi; eski 4-satır karşılaştırması iki tarafı aynı yanlış kodlamayla okuduğu için **yakalamıyordu** |
| E8 | R-T4a/R-T4b (firewall kaldırma, Web başlatma) hiçbir provada koşmadı | R05 §4.3 ile aynı; yükseltme olmadan koşturulamaz | **Kanıt eksiği** — owner'a bildirildi; bu sürümde de ÖLÇÜLMEDİ |

## 2. Düzeltmeler

| # | Dosya | Değişiklik |
|---|---|---|
| E6 | iki T betiği | **Yeni zorunlu girdi `T_ENV_PRE_SHA`** (64 hex). T-AÇ: K-T0a salt okuma kapısı env sha256'yı buna karşı doğrular; eşit değilse **hiçbir değişiklik yapmaz**. T-KAPA: yedeği **yalnız pinli değere eşitse** geri yazar; R-T3 env = pin ister. Pin'siz çağrı iki blokta da ilk satırlarda durur |
| E6 | T-AÇ K-T0 | Yedek dizini **pencere başına yeni** (`i11live` / provada `twork\preimage`); önceden varsa K-T0a durur. Dizin **kopyadan ÖNCE** korumalı DACL (OI)(CI) ile kurulur, boş olduğu doğrulanır; yedek, SDDL tabanı, taban dosyası yalnız SYSTEM + Administrators + yürütücü; **yakalayıcı kaydına da korumalı DACL** uygulanır |
| E6 | T-KAPA | Yedek dizini, yedek, SDDL tabanı, taban dosyası ve yakalayıcı kaydı **kullanılmadan önce** sahip + DACL + reparse denetiminden geçer. Yedek güvenilmezse **geri yazma yapılmaz**, kanıt dosyası güvenilmezse K-T10b **YOK** sayılır ve R-T6 başarısız olur. R05'in hata yolu korunur: diğer adımlar yine denenir, blok sonda throw eder |
| E7 | T-AÇ K-T7/K-T8 | `Get-Content`/`Set-Content` kaldırıldı: **bayt oku → katı UTF-8 çöz (geçersizde dur) → satır sonları aynen korunarak yalnız iki satır → BOM durumu korunur → `WriteAllBytes`**. K-T8: yazılan bayt = hesaplanan bayt, farklı satır tam 2 ve beklenen indeksler, satır sonları aynı, **env SDDL yazımdan sonra aynı** |
| E7 | iki T betiği | Dosyalar **yalnız ASCII** (5.1 BOM'suz betiği ANSI okur; önceki `·`/`—` yalnız çıktıda bozuluyordu) |

**Kasıtlı olarak değişmeyenler:** K-ELEV ilk kapı · K-T1..K-T6 · restart bütçesi 180 sn · R-T2/R-T4/R-T5 mantığı · §9 bloğu (`27E754A7…`, R06) · yakalayıcı `smtp-sink-noauth.js` (`99A5D681…`).

## 3. Yeni hash'ler

| Öğe | R06 → R07 |
|---|---|
| T-PENCERE-AÇ `scripts/t-window-apply.ps1` | `CA99E69E…` → **`5AB1AF16F7E9FF1072248BF37C36CBD20871F6D23EC0EAB693036819D3FA6D5F`** |
| T-PENCERE-KAPA `scripts/t-window-close.ps1` | `0A80982B…` → **`3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C`** |
| İ11 §9 gömülü blok | **DEĞİŞMEDİ** `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` |

İki betik: yalnız ASCII, LF; PS 5.1.26100 ve PS 7.6.5 ayrıştırma hatası 0.

## 4. Kanıt — Windows PowerShell 5.1, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`

Prova env'i canlının özelliklerine getirildi: CRLF, BOM yok, `EMAIL_FROM_NAME=CL Kabul Büro Şirketi İğç` (10 ASCII dışı bayt).
Pin = `8ACF239A…B530`. Aday API: RELEASE23 dist, :8101, oturum DB 5442 / Redis 6389.

| # | Sınama | Sonuç |
|---|---|---|
| 1 | T-AÇ **yanlış pin** | K-T0a durdu · çıkış 1 · env sha aynı · yedek dizini yok · API PID aynı → **PASS** |
| 2 | T-AÇ doğru pin | K-T1..K-T5 → K-T0a → K-T0 (dizin+yedek+SDDL+yakalayıcı kaydı korumalı) → K-T8 **tam iki satır, BOM=False, SDDL aynı** → restart **6 sn** → K-T10a/b → **PASS**. Bağımsız bayt ölçümü: yalnız `SMTP_HOST`/`SMTP_PORT` farklı; `EMAIL_FROM_NAME` **bayt bayt aynı**; CR 8 / LF 8. Bağımsız ACL ölçümü: dizin, yedek ve kayıt korumalı, yalnız 3 güvenilir kimlik |
| 3 | Pencerede İ11 koşumu (runId **9490a65a**) | **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0 · kapsam TAM**; anonim yol 200→404; kapanış tamam; izolasyon eşit. Yakalanan 2 iletinin `From` başlığı çözülünce **`CL Kabul Büro Şirketi İğç`** — API ASCII dışı değeri doğru yükledi (eski 5.1 yolu burada mojibake üretirdi) |
| 4 | T-KAPA · yedeğe ve yakalayıcı kaydına **yabancı kural** (`icacls` BUILTIN\Users:R) | K-T10b "kayıt: yabancı kural 1" → kanıt YOK · R-T1 **"yedek dosyası güvenilir DEĞİL — GERİ YAZILMADI"** · R-T2 restart 6 sn · R-T3 env≠pin · R-T5 yakalayıcı durdu · R-T6 başarısız · R-T7 eşit · **4 hata, çıkış 1**, env pencere hâlinde kaldı → **PASS** |
| 5 | T-KAPA · ACL düzeltildi, yedeğe **bayt eklendi** | K-T10b kanıt VAR (2/2) · R-T1 **"yedek sha256 pinli değere EŞİT DEĞİL — GERİ YAZILMADI"** · R-T2 çalıştı · R-T3 başarısız · R-T5/R-T6/R-T7 geçti · **2 hata, çıkış 1** → **PASS** |
| 6 | Kurtarma: yedeğin özgün baytları geri konup T-KAPA aynen tekrar | R-T1 geri yazıldı = pin · R-T2 6 sn · R-T3 `SMTP_HOST='unreachable.invalid'` · R-T5/R-T6 (2 ileti, tamamı sentetik alan)/R-T7 · **"PENCERE KAPANDI — tüm adımlar başarılı", çıkış 0**, env = pin → **PASS** |
| 7 | T-KAPA **pin'siz** | `T-PIN` ile ilk satırlarda durdu · çıkış 1 · API PID ve env aynı → **PASS** |
| 8 | T-KAPA idempotent tekrar | R-T1 "ZATEN ön görüntüyle AYNI — yedeğe dokunulmadı" · diğer adımlar geçti · çıkış 0 → **PASS** |
| 9 | T-AÇ, yedek dizini **önceden varken** (yerleştirilmiş dizin) | K-T0a durdu · çıkış 1 · env ve API aynı → **PASS** |

**Aday köküne yazma yok:** nöbetçi 88.248 dosya / 13.600 klasör, değişen **0**.
**Canlı dokunulmadı** (sonrası ölçüm): `.env` sha `7A7228B1…`, :8080 PID 46332, :3002 PID 47004, `I11-WINDOW-BLOCK-*` 0, iki görev Running, `i11live` yok.

**Ölçüm aracı hataları (kusur değil, düzeltildi, geçersiz koşumlar ayrı adla saklandı):**
- Sürücünün `*>>` borusu API torununca kalıtıldı ve çağrı askıda kaldı (sınama 2 tamamlanmıştı, çıkış kodu yakalanamadı).
- `cmd` üzerinden başlatılan 5.1, pwsh'in PS 7 `PSModulePath`'ini aldı; `Get-FileHash`/`Get-Acl` yüklenmedi (`03b`). Bu koşumda da geri yazma yapılmadı, R-T2/R-T5 koştu, blok sonda throw etti.
- Önceki API torunu eski ham çıktı dosyasını kilitli tuttu; yeni koşum hiç başlamadı (`03c`, API PID'inin değişmemesiyle tespit edildi).
- PS 7 `Set-Acl` bozma adımında SeSecurityPrivilege istedi; bozma `icacls` ile yapıldı.

## 5. D3 çağrı sözleşmesi — R07 değişikliği

R05 §5 ve R06 §5 geçerli; **yalnız şu satırlar değişir**:

| Adım | Çağrı |
|---|---|
| Pencere öncesi | Owner/C33, cutover sonrası RELEASE23 `.env` sha256'sını kayda geçirir → **`T_ENV_PRE_SHA`** |
| T-PENCERE-AÇ | `T_MODE=live` · `T_GOREF=<İ11 ref>` · **`T_ENV_PRE_SHA=<pin>`** |
| T-PENCERE-KAPA | `T_MODE=live` · `T_RUNID=<runId>` · **`T_ENV_PRE_SHA=<aynı pin>`** — pin'siz çağrı hiçbir şey yapmaz; değerle tekrar |
| Kabuk | Bloklar **yükseltilmiş Windows PowerShell 5.1** penceresinde doğrudan `powershell.exe -File` ile. **`cmd` veya PowerShell 7 içinden `cmd` üzerinden çağrılmaz**: PS 7 modül yolu 5.1'e geçer ve cmdlet'ler yüklenmez (ölçüldü) |
| T-KAPA throw ederse | Listelenen adım owner'a bildirilir. "yedek güvenilir DEĞİL" ya da "pinli değere EŞİT DEĞİL" → **elle müdahale**: yedek başka kaynaktan doğrulanmadan canlı `.env`'e yazılmaz |

OFFICE 33'ün D3-0 yakalayıcı bloğu değişmez; yakalayıcı kaydı yolu `…\i11s\runs\smtp-sink.jsonl` kalır (T-AÇ K-T0a bu dosyanın varlığını ister).

## 6. Kalan sınırlar ve açık kalemler

- **Ölçülemeyen (yükseltme yok):** canlı modda sahip = `BUILTIN\Administrators` davranışı; firewall kaldırma ve Web başlatma (R-T4a/R-T4b). Güvenilir kimlik kümesi sahip olarak Administrators'ı ve yürütücüyü kabul eder.
- **Kalan risk (belgelendi):** yürütücü hesabıyla (yükseltilmemiş) çalışan süreçler güvenilir kümededir; bu hesap canlı `.env`'i zaten okuyabilir. Yedek değişikliğini **pin** yine yakalar; SDDL tabanı ve yakalayıcı kaydı için koruma sahip + DACL denetimidir.
- `i11live` / `twork\preimage` **sır taşır** (korumalı); silme owner kararı.
- CL_TOKENFIX disk kalıntısı ayrı açık kalem.
- İ12 başlatılmadı; İ11 canlı kabulü yapılmadı. Sayaç **10/17**, hizmet kabulü **0/8 tam**.
