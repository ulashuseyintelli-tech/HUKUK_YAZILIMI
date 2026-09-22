# R26 PENCERE A — CANLI YÜRÜTME KAYDI (A0–A6)

| alan | değer |
|---|---|
| Dayanak | Owner GO'ları "R26 PENCERE A / GO-COMPLETE DEVAM" ve A2–A6 devamı (2026-09-22). Yönerge: `../R26-P1-JOINT-TRANSITION-R01.md` §4 |
| Rol | Owner: owner-run adımları koştu. OFFICE `a8d9121a`: yürütücü; kaydı yazdı. CLIENT `22a15dd1`: bağımsız salt okuma doğrulayıcısı; kendi tarifini kullandı, kapı betiğini kullanmadı |
| Sonuç | **R26 CANLIDA.** A0–A5 PASS; CLIENT her adımı bağımsız doğruladı. Canlı durum **S1**: R26 uygulaması, başlatıcılar `P1-ONCESI` |
| Açık kalanlar | **P1/A3 UYGULANMADI** (ayrı pencere, ayrı GO). **AUTH-01 AÇIK** (kabul ölçütü owner kararında). Hizmet kabulü 0/8 ve dış erişim bu pencerenin dışında. OFFICE genel finali **ilan edilmez** |

---

## 1. Pencere koordinasyonu

Açılış 2026-09-21 ~22:40Z. Yöntem: `send_message` ile açık teyit istendi; sessizlik teyit sayılmadı.

| oturum | teyit |
|---|---|
| OFFICE 33-F04 `d409db45` | TEYİT — push/merge, CI yeniden koşumu, canlı ve DB işlemi yok |
| Windows Disk Temizliği `d68d2234` | TEYİT |
| AUTH-01 `dbfb162f` | TEYİT |
| OFFICE 33 `20c5ed9b` | TEYİT |
| CLIENT `22a15dd1` | TEYİT; rolü doğrulayıcı |
| Codex/P1 (görev `01a07087`) | Owner üzerinden iletildi (Codex'in mesajlaşma aracı yok). Metin `evidence/window-a/A1-full-output-20260922.txt` sonunda: devam eden işlem yok, A2 başlatılmadı, P1 pencere kapanana kadar bekliyor, adaylar değişmedi |

Başlangıç durumu:
- main `3e61ffe8`: CI, Push ve GOV-COORD SUCCESS; açık PR 0.
- Kanonik yolda 7 dosyanın tam SHA256'sı pinlerle eşit (yönerge §1).

## 2. Adımlar

| adım | işlem | çalıştıran / pencere | sonuç | kanıt (sha256) | CLIENT bağımsız doğrulama (sha256) |
|---|---|---|---|---|---|
| **A0** | Kapı `S0 -ExpectRunning` | owner / normal | **PASS 16/16**, çıkış 0 · 22:55:35Z | `window-a/gate-S0-A0.json` `AA6B9D9693095A86D90246F81441820E5FBC0915A4295388C1BF0D6480D44622` | EŞİT: `A0-S0.json` `0B2647193D85C313072D824AD4F2055AA0AF3845286E8BE991E716A823313343` |
| **A1** | R02 B0 SelfTest + B2 SelfTest | owner / normal (`ELEVATED=False`) | **PASS**, çıkış 0 · 23:04Z. Üçlü `P1-ONCESI`; aday `A8B17A38`/`C17E7B13`; canlı `1524EDC1`/`F064DC95`; B2 paketi `7142C952` | `window-a/A1-full-output-20260922.txt` `F34C47CE5F15B05B3E6F9ED8D172828A908246D1849E165E969C920C471C8916` | PASS: `A1-state-S0.json` `2FF486CED59510980895200D69EE7084FCD470038FC759A324B6C17AC36E80CE` |
| **A2** | R02 **B1 yayın** | owner / **yükseltilmiş** | **YAYIN PASS**, çıkış 0 · 07:31:47–07:33:52Z (ayrıntı aşağıda) | `b1/R26-RELEASE-20260922-073147Z.json` `E09D1871F7CF1FCE040ADA6F5BDB131A56D55DFFB534D62DB8C039EA5FF6AAA9` | PASS: `A2-S1.json` `48B75BCFA34C240C3C2843DA1052D2D30E4BB857CAA36CE2C0BA2FB41DD257BA` |
| **A3** | Kapı `S1 -ExpectRunning` | owner / normal | **PASS 16/16**, çıkış 0 · 07:47:57Z | `window-a/gate-S1-A3.json` `E60C8A3F26D9E7C4F122D2D54911F93BDE4A75054F704F4A78289EA2AE25A47B` | PASS: `A3-S1.json` `1EB4D3F824F6F19088BA2E61023840825F016B7552CF0179CD4EFB8C762C79ED` |
| **A4** | R02 **B2 dar canlı kabul**; GO ref owner tarafından yerel girildi | owner / normal | **PASS**: B2 çıkışı 0, runId `5f06e5b1` (ayrıntı aşağıda) | `b2-5f06e5b1/` — `SHA256-MANIFEST.txt` `BAE8AA1086273F507DAD73BE7CB58D7AD2133A343943AE572273E04808C31038` (7/7 eşit) | Kapanış 7/7 PASS: `A4-B2-closure-5f06e5b1.json` `7DA77254DBFC8B037A2B8874A354E389A1B18849347BEC377E29EEDC1D2D0838`. B2 sonrası S1 PASS: `A4-S1-after-B2.json` `5E01E3B91E81C66944A02A6FFF034CE9319689BFE4DA1DC54D97C0FC139A3D47` |
| **A5** | R02 `r26-rollback.ps1 -SelfTest`, B1 yedekleriyle. **Yalnız SelfTest çağrısı**; R02 B3'teki gerçek geri alma satırı kullanılmadı | owner / normal | **PASS**, çıkış 0 · 08:22:04Z. Yedek API/WEB digest'i ve paket eşit; üçlü `P1-ONCESI` tanımlı; fonksiyon kümesi tam | Owner konsol çıktısı; SelfTest dosya yazmaz. Metin: "08:22:04Z — SELFTEST SONUC: PASS · A5 GERI-DONUS SELFTEST cikis=0" | PASS: `A5-backup.json` `F0BCF91C8A5710E533C56821BFCF192566F6A836A6DD4611CF31C965C3118531`. API `1524EDC1` (3867) + paket `9F58C985`; WEB `F064DC95` (505); `dOiGPj2M`; cfg `4AD4915C` |
| **A6** | Bu kayıt PR'ı | OFFICE | merge ve main CI (§5) | — | CLIENT doğrulama satırları bu kayıtta; araç sha'ları §4 |

### A2 — B1 ayrıntısı

- **Kaynak:** `c7a154b3`. Dahil olanlar #2739, #2738, #2740. Hariç olanlar #2716, #2727, #2730.
- **API:** `1524EDC1…4D4E` → `A8B17A38…53A0` (eklenen 0, silinen 0, değişen 2: `portal.service.js` + `.map`).
- **WEB:** `.next` `F064DC95…82F1` → `C17E7B13…5326`. BUILD_ID `dOiGPj2M0Abls0kCibY4r` → `5waeMoFGGMTLAYmn9oJvW`. `next.config.js` `4AD4915C` → `C43DEB5A`.
- **Sıra:** WEB, sonra API durdu; takas yapıldı; API, sonra WEB başladı.
- **API (pid 62900):** `/api/auth/me`, run-now ve `portal/cases` üçü de 401. Boot log'da Mapped 977 (run-now ve portal upload dahil).
- **WEB (pid 58736):** `/portal/login` 200, buildManifest 200, `/intake/x` 200, rewrite `/api/auth/me` 401.
- **Kapsam:** API ve WEB digest'leri eşit. `.env`, başlatıcı üçlüsü (`P1-ONCESI`) ve görev eylemleri değişmedi. Migration yok, silme 0, `.env` okunmadı.
- **Yedekler (KORUNUR):**
  - `D:\Development\HUKUK_YAZILIMI\HY_R26_RELEASE_EVIDENCE\rollback-api-src-R25B-20260922-073147Z`
  - `D:\Development\HUKUK_YAZILIMI\HY_R26_RELEASE_EVIDENCE\rollback-web-R25B-20260922-073147Z`
  - Canlı dizinde eski `.next`: `…\apps\web\.next.pre-r26-20260922-073147Z`

### A4 — B2 ayrıntısı (runId `5f06e5b1`)

- **(A) Dar kabul DK-1..DK-6 PASS.** Salt okuma; engellenen istek 0.
- **(B) Başarılı portal girişi 6/6 PASS:**
  - PL-0 create-user 201.
  - PL-1 `localhost:3002`: giriş 201 → token → `/portal` → `/api/portal/cases` 200, aynı origin.
  - PL-2 `ulashuseyintelli:3002`: aynı sonuç.
  - PL-GUARD: engellenen 0.
  - PL-CLOSE: kapanış doğrulandı; personel, `me` ve portal girişi 401.
  - PL-ISO: 23 tenant, parmak izi `6c5f151635614bfc` önce ve sonra eşit.
- **Sentetik kapanış:** `ah-5f06e5b1` ve `ah-5f06e5b1-x` tenant'larında aktif kullanıcı 0, ACTIVE dava 0, aktif portal 0. Tenant kayıtları kalıcıdır; silme yok.
- **GO ref:** Yalnız sha tutuldu (`6CBA48EC…3D90`). Düz metin hiçbir dosyaya ve bu repoya yazılmadı (`literalWritten=false`).
- **AUTH-01 gözlemi (kabul değil):** DK-6'da üç personel sayfası girişsiz tarayıcıda yerinde kaldı, `/auth/login`'e yönlenmedi: `/auth/forgot-password`, `/auth/reset-password#token=…`, `/auth/accept-invite?token=…`. OFFICE 33'ün önerdiği ölçütteki "`/dashboard` girişsiz açılınca login'e yönlenir" koşulu ölçülmedi. Ölçüt owner kararındadır. **AUTH-01 AÇIK.**

## 3. Son durum (pencere kapanışında)

| kalem | değer |
|---|---|
| Aşama | **S1** — R26 uygulaması, başlatıcılar `P1-ONCESI` |
| Başlatıcılar | `start-api.ps1` `CC634BBF…19B3` · host `691BC146…1627` · `start-web.ps1` `F39F7A54…59E0` |
| Uygulama | API `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` · WEB `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` · BUILD_ID `5waeMoFGGMTLAYmn9oJvW` · cfg `C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C` |
| Geri dönüş | R02 `r26-rollback.ps1` `43C1202F…5686` + yukarıdaki iki yedek. SelfTest S1'de PASS verdi (A5). P1'den sonra da `P1-SONRASI` altında geçerli (yönerge §3) |
| P1 | Uygulanmadı. Pencere B için ayrı GO gerekir. Yönerge B0'ı kapı `S1` olarak koşar |

## 4. Doğrulayıcı araçları (CLIENT; kapı betiğinden bağımsız)

| dosya | sha256 |
|---|---|
| `client-verify/r26-window-verify.py` | `8C63C2E128C2D1FA7739B0F35BC91E91C567C6B6EEE1FCA6A9DE4E340D82AF5C` |
| `client-verify/r26-closure-verify.js` (READ ONLY tx) | `01224AA67AB2BD019C795CC8BD4F6AB869AA80A4D1614AEE425C21BF988730D8` |
| `client-verify/dryrun-S0-against-historical-gate.json` | `E640C6DA6888DED5E129D8F2A11329F0A1D94CFDDD54251AA78BA1B9601CBCC1` |

B2 kanıt dosyaları (`b2-5f06e5b1/`) `SHA256-MANIFEST.txt` ile birebir. `.log` dosyaları gitignore nedeniyle `.log.txt` adıyla kopyalandı; içerikleri ve sha'ları aynı. Kaynak dizinler **yerinde korunur**:
- `D:\Development\HUKUK_YAZILIMI\HY_R26_WINDOW_A_EVIDENCE`
- `D:\Development\HUKUK_YAZILIMI\HY_R26_RELEASE_EVIDENCE`
- `C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\r26-live-5f06e5b1-20260922-111455`
- `…\r26-window-a-verify`

## 5. A6 kapanışı

Bu PR; eşleşen head, zorunlu kontrollerin tamamı SUCCESS ve main CI'ın **boşta ölçülmesi** koşuluyla squash edilir. Merge SHA'sı, main CI/CodeQL sonucu ve "PENCERE A KAPANDI" bildirimi PR açıklamasına ve oturum kapanış raporuna yazılır. Bu belge merge sonrası değiştirilmez.

---

## 6. Ek — merge sonrası takip (#2745 `b1ea4350` sonrasında)

CLIENT'ın merge öncesi düzeltme isteği merge'den sonra ulaştı (kuyrukta kalmıştı). §1–§5 değiştirilmedi. İki düzeltme bu ekle yapılır:

| # | düzeltme | değer |
|---|---|---|
| E-1 | **A5 sonrası canlı durum kanıtı eklendi.** CLIENT kendi doğrulayıcısıyla ölçtü: canlı hâlâ **S1**, PASS, 0 başarısız. A5'te gerçek geri dönüş yapılmadı | `client-verify/A5-S1.json` `B43D735663B5404EC1F4CBD1C368734ED63A5201B533760EF2C65CEBE54DAC69` |
| E-2 | **Etiket:** §4'teki `client-verify/dryrun-S0-against-historical-gate.json` (`E640C6DA…CBCC1`), **tarihsel kapıya karşı yapılmış bir kuru koşudur. A0 kabulü DEĞİLDİR.** A0 kabulünün kanıtı `window-a/gate-S0-A0.json` ve CLIENT tarafında `client-verify/A0-S0.json`'dur | — |

Merge sonrası doğrulama (#2745): main CI 35706571827, Push on main, GOV-COORD ve CodeQL Analyze ×3 SUCCESS. CLIENT bunu ayrıca bağımsız doğruladı. Pencere A yeniden açılmadı; canlıya dokunulmadı.
