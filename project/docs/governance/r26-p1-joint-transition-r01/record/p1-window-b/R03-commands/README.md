# P1 PENCERE B — UYGULAMA KOMUTLARI R03 (OFFICE a8d9121a, surumlu ek)

| alan | deger |
|---|---|
| Durum | **Codex/P1 uygunluk incelemesini BEKLIYOR. B0 sunulmadi, canliya dokunulmadi** |
| Dayanak | Codex R02 incelemesi **UYGUN DEGIL**: saglik kabulu dinleyicinin beklenen servis agacina ait oldugunu dogrulamiyor. R03 yalniz bu bulguyu giderir |
| Korunan | R02 `HY_P1_WINDOW_B_COMMANDS\R02\` (SHA256SUMS `FDB38A3B…6784`) degismedi. Urun kodu, pinli adaylar (`DDCCD091…`, `27099BDF…`), runbook `5F07A30A…`, Codex dosyalari degismedi |
| Degismeyen R02 kararlari | Operasyonel butce API 900 / WEB 300 / durdurma sessizligi 180 / muhur 60 sn · sessizlik kapisi · muhur sirasi (B4, servisler baslamadan) · `. { }` kapsami. Gerekce ve kaynak satirlari: R02 README par.2 |
| Ic butunluk | `SHA256SUMS.txt`; fark `DIFF-R02-R03.txt` |

## 1. Kimlik kapisi (R02 → R03)

**R02 kusuru:** `Start-HLService` su uc kosulu gorunce kabul veriyordu:
- portta tek dinleyici;
- beklenen HTTP kodu;
- komut satirinda `api`/`web` gecen bir host.

Dinleyicinin o host'un agacina ait oldugu dogrulanmiyordu.

**R03:** `Get-HLServiceIdentity` (P0) su zinciri **tamamen** dogrular. Herhangi bir halka tutmazsa sonuc `FOREIGN`, okunamazsa `UNKNOWN` olur; ikisinde de PASS yoktur.

| halka | kosul (kaynak) |
|---|---|
| dinleyici | Portun `OwningProcess` kumesi **tek PID**. Birden cok sahip = FOREIGN |
| node | `ExecutablePath` = `C:\Users\ulastelli\AppData\Local\Volta\tools\image\node\24.18.0\node.exe`. Tirnaga duyarli belirtecler: `[1]` = entry, geri kalan = args. API entry `…\apps\api\dist\apps\api\src\main.js`, args bos. WEB entry `…\apps\web\node_modules\next\dist\bin\next`, args `start --port 3002` (start-(api\|web).ps1 Cfg; `New-HLChildProcess NodeExe (EntryJs+EntryArgs)`) |
| launcher | node `ParentProcessId` → `ExecutablePath` = `C:\Ops\hukuk\pwsh\pwsh.exe` ve `-File` ardindaki belirtec = `C:\Ops\hukuk\bin\start-(api\|web).ps1` (host gen.cs `CreateProcessW(PwshPath, … -File <launcher>)`) |
| host | pwsh `ParentProcessId` → `ExecutablePath` = **`C:\Ops\hukuk\bin\hukuk-task-host.exe` tam yol**. Belirtecler tam olarak `[exe, mod]` (`--verify-seal` sureci kabul edilmez) |
| zaman | `CreationDate` sirasi: host ≤ pwsh ≤ node (PID yeniden kullanimi). Ayrica host ≥ bu baslatmanin `t0` − 2 sn (onceden kalmis agac = FOREIGN) |
| teklik | Mod icin `hukuk-task-host.exe` tam **1** tane ve zincirdeki host o |

Imza su bicimdedir: `L<pid>|N<pid>@<ctime>|P<pid>@<ctime>|H<pid>@<ctime>`.

**Saglik kabulu sirasi:**
1. kimlik EXACT (1);
2. beklenen HTTP kodu;
3. kimlik EXACT (2) ve **imza(1) = imza(2)**.

Olcum sirasinda sureç degisirse PASS verilmez. FOREIGN gorulurse butce beklenmeden durulur.

**Uygulandigi yerler:**
- **B5 ve R1:** API kimlik+saglik gecmeden WEB baslamaz. WEB gecmeden basari yazilmaz. Yabanci dinleyici ya da agac gorulurse yabanci surece dokunulmaz; yalniz gorevin kendi durdurma yolu (`Stop-HLTransition`) calisir. Yabanci dinleyici surdugu icin sessizlik dogrulanamazsa kopyalama/baslatma/basari yoktur, "R1 CALISTIRMAYIN, bildir" hatasi verilir.
- **B8:** Baslangic kimligi, B5'te dogrulanan `$IDN` imzasidir. Canli agac bu imzadan farkliysa ya da ikinci baslatma yeni agac uretirse kabul verilmez.

## 2. Canli salt okuma dogrulamasi (tek sefer; HTTP YOK)

`test/live-readonly-identity.txt`: calisan R26 agaci **EXACT**.
- API: L62900 = N62900 → P43324 → H50216.
- WEB: L58736 = N58736 → P30476 → H61948.

`since=simdi` ile ayni agac FOREIGN dondu ("host bu baslatmadan once olusmus"). Kaynaktan turetilen zincir varsayimi canli mimariyle ortusuyor.

Bu okuma bir hatayi da yakaladi: `[datetime]::MinValue.AddSeconds(-2)` tasma veriyordu, B8 bu yuzden her zaman UNKNOWN donerdi. Hata duzeltildi.

## 3. Izole sinama (gercek blok metinleri; canlida hata URETILMEDI)

Duzenek R02 ile aynidir, surec modeli gercek zincire gore genisletildi:
- `ExecutablePath`, `ParentProcessId` ve `CreationDate` tutulur; dinleyici = node.
- Her baslatmada yeni PID uretilir.
- Belgeli override'lar degismedi: `Test-HLAdmin`, `$p`.

**`test/assert.ps1` → PASS 52/52** (`test/assert-output.txt`). R02'nin 12 senaryosu (29 kontrol) degisen ortak yardimci ile yeniden dogrulandi. Yeni kimlik senaryolari:

| senaryo | enjekte edilen | dogrulanan |
|---|---|---|
| FOREIGN_LISTENER | 8080'de **dogru HTTP kodu (401) donduren** yabanci node (`C:\Tools\other\node.exe`) | kimlikte reddedildi; WEB baslamadi; sessizlik yok → acik hata; R1 dosya kopyalamadi |
| WRONG_HOST_PATH | host `C:\Temp\hukuk-task-host.exe` | API reddi; WEB yok; R1 dogru agacla DOGRULANDI |
| WRONG_PARENT | node parent = ilgisiz surec | ayni |
| WRONG_ENTRY | WEB `next dev` | WEB reddi; basari yok; R1 DOGRULANDI |
| PID_REUSE | host olusturulma zamani pwsh'den sonra | API reddi; WEB yok; R1 DOGRULANDI |
| ID_FLAP | her okumada degisen node olusturulma zamani | hic PASS yok (butce doldu); WEB yok |
| R1_FOREIGN | R1'de WEB baslarken 3002'de yabanci dinleyici (200) | R1 WEB reddi; DOGRULANDI yazilmadi |
| B8_NEWTREE | ikinci baslatmada yeni agac | B8 kabul vermedi |
| HAPPY | — | B5 imzali (L\|N\|P\|H) PASS; B8 baslangici = B5 imzasi |

**Negatif kontroller:**
- `test/negative-control-identity-mutant.txt`: kopyada `Get-HLServiceIdentity` "dinleyici varsa EXACT" yapildi (R02 anlami). Yabanci/yanlis agac senaryolarinin hepsinde B5/R1 gecti ve WEB baslatildi. Dogrulayici **FAIL 35/52, cikis 1**.
- `test/negative-control-r1-guard-mutant.txt`: R02'deki R1 API korumasi kaldirildi. **FAIL 51/52, cikis 1**.

**Ayristirma:** 11 blok pwsh 7'de, B0/B6/B7 PS 5.1'de hatasiz. Butun bloklar ASCII.

**Sinamada bulunan duzenek hatalari (bloklarda DEGIL):**
- sahte `Get-CimInstance`'ta ortak parametre cakismasi (`$ErrorAction`);
- duzenek senaryo tablosu `$S`'nin P0 yerel `$s` tarafindan dinamik kapsamla golgelenmesi (PowerShell buyuk/kucuk harf duyarsiz) → duzenek degiskenleri `$HX`/`$HV` oldu;
- Python kacisiyla bolunen yol.

## 4. Yurutme sirasi ve yetki

R02 ile aynidir:
- B0: Windows PowerShell, normal.
- B1: pwsh 7, normal.
- P0 → B2 → B3 → B4 → B5 (+ R1, B8): tek yonetici pwsh 7 penceresi.
- B6, B7: Windows PowerShell, normal. B7 yalniz `-SelfTest`.

## 5. Sinirlar

- Sahte ortam gercek zamanlayici, Job Object ve ACL davranisini kanitlamaz; bunlar canlida B3–B8 kapilarinda olculur.
- Kimlik kapisi yabanci sureci **durdurmaz**. Yabanci dinleyici varsa pencere acik hata ile durur ve owner'a birakir.
- Bu ek canli yetki vermez. Mevcut Pencere B GO'su Codex **UYGUN** kararindan sonra gecerlidir. R02 icin verilen ret karari bu ekle kaldirilmis sayilmaz.
