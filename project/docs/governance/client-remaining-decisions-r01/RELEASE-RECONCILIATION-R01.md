# CLIENT — YAYIN UZLASTIRMASI VE SONRAKI PAKET GIRDISI (R01)

```text
STATUS          : RECONCILED / NEXT_RELEASE_INPUT_READY — cutover YETKISI ISTENMEDI
KAYNAK          : owner GO "CLIENT kalan kararlar → uygulama ve kabul" (2026-09-06) §3
OLCUM ANI       : 2026-09-06, yerel salt-okuma (production yazmasi 0)
YAYIN SORUMLUSU : Office/C33 hatti (DEGISMEDI) — bu sayfa deploy ETMEZ, yalniz girdi verir
```

Bu belge iki isi yapar: (1) karar paketindeki **bayat yayin durumunu** guncel gercekle
uzlastirir, (2) CLIENT tarafinin **kesin commit listesini ve kabul kanitlarini** sonraki
yayin paketi icin hazirlar.

---

## 1. Uzlastirma: karar paketi bilgisi BAYATTI

`DECISION-PACK-R01.md` §1.1 ve §3 su bilgiyi tasiyordu: *"canli RELEASE18 `b5338552`,
RELEASE19 cutover YAPILMADI"*. **Bu bilgi artik gecerli DEGILDIR.** Office/C33 hatti karar
paketi merge edildikten sonra RELEASE19 cutover'ini yurutmustur.

### 1.1 Dogrulanan guncel canli durum (yerel olcum)

| Olcum | Deger |
|---|---|
| Canli API | pid 36544, `:::8080`, `HY_W4_RELEASE19\project\apps\api\dist\...` |
| Canli Web | pid 36764, `:::3002`, `HY_W4_RELEASE19\project\apps\web\...` |
| Surec baslangici | 2026-09-06 15:59 (yerel) |
| Gorevler | `HukukPlatform-API` / `HukukPlatform-Web` = Running |
| RELEASE19 worktree HEAD | `a60d772b6c53ece6bc23b77821a2921ab0ec7942` (SYSTEM sahipli → IMMUTABLE_RELEASE uygulanmis) |
| RELEASE18 (rollback hedefi) | dizin **mevcut**, silinmemis |

### 1.2 Cutover makbuzu (Office/C33 uretti; bu sayfa yalniz OKUDU)

`HY_C33_RELEASE19_CUTOVER_R23/cutover-receipts/`:

| Alan | Deger |
|---|---|
| Run | `CUT-20260906-155913-e945162f` (nonce `dd954d6b…`) |
| Verdict | `C33_RELEASE19_CUTOVER_APPLIED_AND_VERIFIED` · phase `COMMITTED` · gates **31/31** · engineExit 0 |
| Terminal dogrulama | `TERMINAL-VERIFICATION-R01.json` → **`TERMINAL_VERIFIED`** (mode: READ_ONLY) |
| Kesinti | **14.673 s** (quiesce/drain 0.929 s · bin swap 0.094 s · start+probe 13.744 s) |
| DB anlik goruntusu | pre = post = `129\|129\|0\|0\|7660053627876716578\|5\|36\|2` → **degismedi** |
| Ileri generation | host `BB136AA4…` · api launcher `B5716157…` · web launcher `3375A46F…` |
| `.env` | RELEASE19 sha = RELEASE18 sha (`3DBFAE32…`, 1 748 B) — bayt-es kopya |
| Web BUILD_ID | `xFgJAoTFqlTjW89Zf2CYS` |

Makbuzun `status` alani: `RELEASE19_DEPLOYED / CUTOVER_VERIFIED / TERMINAL_VERIFIED;
F-B01-03 CODE_MERGED / DEPLOYED / LIVE_ACCEPTANCE_PENDING; OFFICE/F01/F04 CLOSED DEGIL`.
Makbuzun `openScope` alani: OFFICE canli kabul (O-1..O-10), F04 canli yaris kabulu ve
**K-12 (F04 birim spec CI manifest boslugu)**.

**K-12 bu programda KAPANDI:** iki F04 birim spec'i (`disposition-posting.service.spec`,
`collection-reversal.service.spec`) `pure/client-portal` manifestine tam adiyla baglandi ve
CI'da PASS kaydi alindi (D-10; PR #2520, Charter §58.5). Cutover makbuzunun `openScope`
listesindeki bu kalem artik kapalidir; digerleri (OFFICE canli kabul, F04 canli yaris kabulu)
ACIK kalir.

**RELEASE19 SUPERSEDED ILAN EDILMEDI** (owner talimati): calisan surumdur ve sonraki paketin
**rollback hedefidir**.

---

## 2. CLIENT tarafinin kesin commit listesi (canli `a60d772b` → main `48ab1eb1`)

Sekiz commit; **hicbiri canlida DEGIL**.

| # | Squash SHA | PR | Icerik | Sinif |
|---|---|---|---|---|
| 1 | `1a626e79` | #2515 | F02 — manuel scheduler tetiklemede dogrulanmis aktor + tenant kapsami | SCHEDULER (urun) |
| 2 | `2a9c3c33` | #2516 | F02 — manuel/global cron cakismasinda is kaybi (WAIT kuyrugu) | SCHEDULER (urun) |
| 3 | `a401d64e` | #2517 | OWN-13 R6 — legacy `POST /poa/:id/upload` servis-giris yetki kapisi | CLIENT/POA (urun) |
| 4 | `93ceeedb` | #2518 | OWN-13 sinirli terminal kapanis kaydi | docs |
| 5 | `eb4a61f8` | #2519 | Kalan kararlar paketi (D-1..D-10) | docs |
| 6 | `655a5dff` | #2520 | **Faz 1** — POA yazma yetkisi (D-4), legacy upload `filePath` (D-5), kimlik sikilastirmasi (D-1b), bilgi talebi yetkisi (D-3a), F04 birim spec manifest bagi (D-10) | CLIENT/POA (urun) + web |
| 7 | `1ea32e6e` | #2521 | **Yol1** — bilgi talebine intake baglantisi (D-3b, opt-in) | CLIENT (urun) |
| 8 | `48ab1eb1` | #2522 | **OWN-12** adim A (dar) + adim B — kanonik hata sozlesmesi ve cevap cozumleyici | web (urun) |

### 2.1 Paket etkisi (olculdu)

| Olcum | Sonuc |
|---|---|
| Urun dosyasi (test/docs/manifest haric) | **24** (API 16 · web 8) |
| Etkilenen alanlar | SCHEDULER (manuel tetik yetkisi + cron kuyrugu) · CLIENT/POA (yazma yetkisi, upload yaniti) · CLIENT (kimlik dogrulama, bilgi talebi yetkisi + intake baglantisi) · WEB (hata/zarf katmani, POA yetki mesajlari) |
| **Migration** | **0** — repo 129 = canli 129 |
| **Sema degisikligi** | **0** |
| Lockfile / `package.json` | **0** |
| Yeni env anahtari | **0** |
| CI workflow | **0** |
| Veri degisikligi | **0** (D-1 geregi mevcut kimlik verisi DEGISTIRILMEDI) |

### 2.2 Diger modullere etki

- **SCHEDULER:** manuel tetikleme artik I02-R3 esigini (PARTNER veya `canApproveOfficeActions`)
  ister ve aktorden turetilen tenant kapsaminda calisir; manuel/global cakismada is ATLANMAZ,
  siraya girer (`RAN_AFTER_WAIT`). Diger 29 job'un `SKIP` davranisi DEGISMEDI.
- **OFFICE:** bu sekiz commit OFFICE yuzeyine DOKUNMAZ. F-B01-03 zaten canlidadir (RELEASE19).
- **COLLECTION/ACCOUNTING:** F04 kodu zaten canlidadir (RELEASE19); bu pakette yalniz F04
  birim spec'lerinin CI manifest bagi eklendi (runtime etkisi YOK).
- **CLIENT/POA:** yazma yetkisi daralir (asagida kabul planinda dogrulanir).

---

> **GUNCELLEME (owner GO Faz 3, PR #PENDING):** asagidaki §2 commit listesi ve §3 kaynak commit'i
> **BU BELGENIN ILK SURUMUNE** aittir (main `48ab1eb1`). Paket o tarihten sonra iki teslim daha
> aldi (#2525 Faz 1 kaynak kusuru duzeltmeleri, #2528 Faz 2 OWN-12 A/C + Yol1 arayuzu) ve Office
> hatti da docs commit'leri ekledi. **Guncel ve baglayici paket kimligi, kapsami, rollback bedeli
> ve kabul plani `RELEASE20-HANDOVER-R01.md` belgesindedir.** Bu belge tarihsel kayit olarak durur.

## 3. Sonraki paket (RELEASE20) girdisi

| Konu | Deger |
|---|---|
| Kaynak commit | main `48ab1eb1e0720a81b246b9bc6a3436e84bc8fbd5` (veya owner cutover aninda dogrulanan taze main) |
| Ileri hedef | RELEASE20 (yeni aday worktree + zincir + muhur; RELEASE19 tooling forku) |
| **Rollback hedefi** | **RELEASE19** (`a60d772b`) — o anki **dogrulanmis canli surum**; RELEASE18 DEGIL |
| Rollback bedeli | **RELEASE19'a donus bu paketteki TUM yetki duzeltmelerini GERI ALIR** — bunlar RELEASE19'da YOKTUR: F02 manuel tetikleme yetkisi/tenant kapsami ve cron cakisma kuyrugu, OWN-13 R6 legacy POA upload kapisi, Faz 1 POA/bilgi talebi/kimlik yetki kapilari, intake token sizintisi duzeltmesi, lifecycle aktivasyon yarisi duzeltmesi, gonderim hata yolu duzeltmesi, Yol1 ve OWN-12 web katmani. **"Guvenlik gerilemesi yoktur" DENEMEZ:** rollback bu kapilari kaldirir ve sistem o kusurlarin bulundugu duruma doner. F-B01-03 ve F04 RELEASE19'da mevcuttur, yani onlar rollback'ten ETKILENMEZ; rollback karari bu iki grubun AYRIMI yapilarak verilir |
| DB adimi | **YOK** (migration 0) |
| Env adimi | **YOK** (yeni anahtar 0; RELEASE19 `.env` bayt-es kopyalanir) |
| Kesinti beklentisi | RELEASE19 olcumu ~15 s; R22/R23 motoru ayni (quiesce → atomik bin degisimi → probe) |
| Yayin sorumlusu | **Office/C33** — motor, muhur, nonce, owner-command o hatta kalir; iki sayfa ayni ortama ES ZAMANLI deployment YAPMAZ |

---

## 4. Sinirli canli kabul plani (cutover SONRASI; owner GO ile)

**D-8 kurali:** yazma potansiyeli olan **her** adim — "403 bekleniyor" denen POST/PUT/DELETE
cagrilari **dahil** — yalnizca **gercekten sentetik oldugu dogrulanmis** tenant/kayitlarda
yapilir. Gercek tenant'ta yalnizca **GET** ile salt-okuma dogrulama yapilir.

### 4.1 Salt-okuma (gercek tenant, `telli-hukuk`) — yazma YOK

| # | Olcum | Beklenen |
|---|---|---|
| R-1 | Canli bin sha'lari = RELEASE20 generation; RELEASE19 kopyalari rollback icin mevcut | esit |
| R-2 | API/Web gorevleri Running; tek surec zinciri; 5 altyapi portu loopback | esit |
| R-3 | DB `129\|129\|0\|0` + tenant/user/smoke sayimlari cutover oncesi = sonrasi | esit |
| R-4 | Web BUILD_ID = RELEASE20 build kimligi; `/auth/login` 200 | esit |
| R-5 | dist marker: `poa.service.js` icinde `persistPoaFile` + `POA_CREATE`; `scheduler.service.js` icinde WAIT | mevcut |

> **DUZELTME (owner GO Faz 3):** onceki surumde bu tabloda bir **R-6** satiri vardi:
> anonim `POST /poa`, `POST /address-discovery/client-info-request` ve manuel scheduler uclarina
> "401 bekleniyor" denerek **gercek tenant** salt-okuma listesinde tutulmustu. Bu YANLISTI:
> 401 beklenmesi cagriyi salt-okuma YAPMAZ — istek yine de bir **yazma ucuna** gonderilir ve
> beklenen sonuc gerceklesmezse gercek veride yan etki dogar. Satir bu tablodan CIKARILDI ve
> asagiya, sentetik tenant adimlarina **A-0** olarak tasindi. Gercek tenant'ta yalnizca **GET** kalir.

### 4.2 Sentetik tenant (`demo-firma`) — yazma potansiyeli olan adimlar (D-8)

Her satir icin **once** sentetik oldugu dogrulanir (tenant slug + kayit kimligi), **sonra**
calistirilir; e-posta gonderen adimlarda **test saglayicisi** kullanilir veya owner belirli bir
kontrollu aliciyi acikca yetkilendirir. **Gercek aliciya e-posta GONDERILMEZ.**

| # | Adim | Beklenen | Not |
|---|---|---|---|
| A-0 | Anonim (token YOK): `POST /poa`, `POST /address-discovery/client-info-request`, manuel scheduler uclari | 401; hicbir kayit OLUSMAZ | **yazma ucu** — 401 beklentisi bunu salt-okuma yapmaz; sentetik tenant |
| A-1 | VIEWER ile `POST /poa` | 403 `CLIENT_MUTATION_DENIED_VIEWER`; vekalet OLUSMAZ | **yazma denemesi** → sentetik tenant |
| A-2 | Elevated olmayan USER ile `PUT /poa/:id` | 403 `WORKSPACE_COMMAND_DENIED` | sentetik |
| A-3 | ADMIN ile `PUT /poa/:id` govdesinde `status` | 400 `POA_FIELD_NOT_WRITABLE` + `offendingFields:["status"]` | sentetik |
| A-4 | Elevated aktor ile `POST /poa` | 201 + `CLIENT_WORKSPACE_COMMAND` audit (commandType `POA_CREATE`) | sentetik |
| A-5 | ADMIN olup elevated OLMAYAN aktor ile `DELETE /poa/:id` (revoke) | 403 — revoke elevated-only KALDI | sentetik |
| A-6 | Legacy `POST /poa/:id/upload` yaniti | `filePath` YOK; `hasFile:true` | sentetik |
| A-7 | VIEWER ile bilgi talebi gonderimi | 403; **saglayici cagrilmaz**, kayit olusmaz | sentetik |
| A-8 | Elevated aktor + `attachIntakeLink:true` | 201; e-postada intake baglantisi; yanitta yalniz `intakeLinkId` | sentetik + test saglayicisi |
| A-9 | Gecersiz checksum'li pasif kaydi aktiflestirme | 400 `CLIENT_IDENTITY_CHECKSUM_INVALID`; kayit pasif KALIR | sentetik |
| A-10 | F02: VIEWER/USER manuel tetik → 403; PARTNER manuel tetik → 201 + `outcome` | yazma (Due/DecisionLog) → **yalniz sentetik tenant** | sentetik |

### 4.3 Bu programda YAPILMAYAN kabul adimlari

- **Gercek tenant'ta hicbir yazma** (POST/PUT/DELETE) — 403 beklenenler dahil.
- **Gercek aliciya e-posta** — hicbir adimda.
- **F04 canli yaris kabulu** — disposable replay veya production kontrollu yazma; ayri owner
  karari (C33 K-4). Disposable kosum **production'da calistirilmis gibi sunulamaz**.
- **OFFICE O-1..O-10** — Office/C33 hattinin kabul kapsami.

---

## 5. Owner karari beklenen tek nokta (D-9)

Bu belge **cutover yetkisi ISTEMEZ**. Sonraki paket icin sira:

1. Office/C33 hatti main `48ab1eb1` uzerinden **RELEASE20 aday paketi** uretir (build + zincir
   + qualification + muhur) ve **cutover paketini** (R23 forku; pins ileri RELEASE20, geri
   RELEASE19) hazirlar.
2. Paket kimligi, etki, rollback ve kabul adimlari **somut** hale geldiginde — yani makbuz ve
   pinler olustugunda — **yalnizca o pakete bagli canli gecis onayi** owner'dan istenir.
3. Mevcut yayin yetkisi RELEASE19 icindi; **RELEASE20'yi KAPSAMAZ**.

---

## 6. Bu turda yapilmayanlar

Cutover/deploy, RELEASE20 build veya muhur, owner-command, production yazmasi, gercek aliciya
e-posta, RELEASE19'un SUPERSEDED ilani, Office paketine mudahale, calisan servislere dokunma.
Olcumler salt-okuma; `.env` degeri okunmadi/yazilmadi; PII cikti YOK.
