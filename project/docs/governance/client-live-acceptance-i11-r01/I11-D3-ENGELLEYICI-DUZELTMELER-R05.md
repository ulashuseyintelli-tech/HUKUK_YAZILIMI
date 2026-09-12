# CLIENT İ11 — D3 ENGELLEYİCİ DÜZELTMELERİ VE YENİDEN KANIT (R05)

```text
BELGE    : I11-D3-ENGELLEYICI-DUZELTMELER-R05   (R04'ün yerine geçen blok hash'leri)
TETİK    : OFFICE 33'ün #2656 D3 teyit isteği — CLIENT teyit etmeden önce ÖLÇTÜ, 3 engelleyici buldu
YETKİ    : owner GO "CLIENT İ11 / ADAYA BAĞLAMA VE SON KABUL HAZIRLIĞI" hazırlık yetkisi (kendi paketi)
ORTAM    : yalnız oturuma özel DB + Redis + yerel yakalayıcı + RELEASE23 aday dist; canlıya DOKUNULMADI
           (canlıda yalnız salt-okuma Get-Acl)
DURUM    : DÜZELTİLDİ + ÇALIŞTIRILARAK KANITLANDI · canlı kabul YAPILMADI
```

## 1. Bulgular — hepsi ÖLÇÜLDÜ

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **E1** | §9 K-PAR deseni `…|smtp-sink` pencere yakalayıcısını (`smtp-sink-noauth.js`) **eşleştiriyor** | Yakalayıcı çalışırken main'deki birebir ifade **4 süreç** eşleştirdi → throw | Canlı D3'te T-PENCERE-AÇ'tan sonra §9 **durur**, kabul koşumuna **hiç ulaşılmaz**. V-A'da `i11-run.js` doğrudan koşturulduğu için görünmemişti |
| **E2** | T-PENCERE-KAPA'da R-T2/R-T3 throw'u, önlem kaldırmadan (R-T4) ve yakalayıcı durdurmadan (R-T5) **önce** | Kaynak satır sırası (98 → 111–117 → 130) | API bütçe içinde kalkmazsa `I11-WINDOW-BLOCK-8080/3002` **kalır**, Web **kapalı** kalır; "önce T-KAPA sonra C33 geri dönüş" sırası kullanıcıları **dışarıda** bırakırdı |
| **E3** | Canlı `.env`: sahip **SYSTEM**, DACL **korumalı**, `ulastelli` yalnız **Read**; CLIENT oturumu **yükseltilmemiş** | `Get-Acl` (salt okuma): `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;…-1146)`; yazma izni veren kural 0 | T-PENCERE-AÇ canlıda `.env`'i **yazamaz**; firewall ve SYSTEM görev işlemleri de yükseltme ister |
| **E4** | `ENV-PREIMAGE.env` (canlı `.env` kopyası, **sır taşır**) karalama dizininin **kalıtsal ACL**'ını alıyor | Deney: yedek SDDL'inde birden fazla yabancı SID'e değiştirme hakkı (`0x1301bf`/`0x1301ff`) | Canlı DB bağlantı dizesi ve SMTP parolası korumasız kopyada |

**OFFICE 33 sorusu (b) — DACL korunumu, ÖLÇÜLDÜ (karalama deneyi, korumalı DACL'lı hedef):**
`Set-Content` sonrası SDDL **korundu** · yedekten `Copy-Item -Force` sonrası SDDL **korundu** ·
içerik geri geldi. **Sahip (SYSTEM) korunumu yükseltilmemiş oturumda ÖLÇÜLEMEDİ** → T-PENCERE-KAPA
artık sahip + DACL'i blok içinde karşılaştırıyor (R-T7).

## 2. Düzeltmeler

| # | Dosya | Değişiklik |
|---|---|---|
| E1 | §9 bloğu | K-PAR deseninde `smtp-sink` → `smtp-sink\.js`: yalnız AUTH ilan eden eski yakalayıcı durdurur; `smtp-sink-noauth.js` dışlanır |
| E2 | T-PENCERE-KAPA | Her adım kendi `try/catch`'inde; **R-T4a (firewall kaldırma), R-T4b (Web), R-T5 (yakalayıcı), R-T6, R-T7 HER DURUMDA denenir**; hatalar toplanır, blok **sonda throw** eder |
| E3 | T-PENCERE-AÇ ve T-PENCERE-KAPA | Canlı modda **K-ELEV** ilk kapı: yükseltilmiş Administrators değilse **hiçbir değişiklikten önce** durur |
| E4 | T-PENCERE-AÇ | K-T0 yedeği aldıktan hemen sonra **korumalı DACL** uygular (SYSTEM + Administrators + yürütücü) ve doğrular; kalıtsal/yabancı kural kalırsa durur |
| (b) | T-PENCERE-AÇ / KAPA | K-T0 env **SDDL tabanını** kaydeder; T-PENCERE-KAPA **R-T7** geri dönüş sonrası karşılaştırır — farkta **otomatik düzeltme YOK** |
| sıra | T-PENCERE-AÇ | K-T0 (yedek) salt-okuma kapılarından (K-T1…K-T5) **sonraya** alındı: onlar düşerse geride yedek kalmaz |

**Erişim geri açma gerekçesi (E2):** env geri yazılamamış olsa bile R-T4 erişimi geri açar. SMTP
loopback'te kalır ve yakalayıcı R-T5'te durdurulur → dış gönderim yine **imkânsız** (güvenli yön);
kilitli bir üretim bundan daha kötüdür. Hata, owner'a bildirilmek üzere sonda throw edilir.

## 3. Yeni blok hash'leri (main'de)

| Blok | R04 → **R05** | Doğrulama |
|---|---|---|
| İ11 §9 | `A16E4791…` → **`9804FEF634E45B62F5FBC497A1A9BABB8870F4D179EF11127ABF1BE6BACF862B`** | PS7 + PS5.1 hata 0 · yalnız K-PAR deseni + yorum değişti (kimlik sabitleri R04 ile aynı) |
| T-PENCERE-AÇ | `508C5323…` → **`CA99E69E278D94C95FDBBBE6CA0C22B1E5C41662BD4EAEC0B79ACC4D957A74F4`** | PS7 + PS5.1 hata 0 · **çalıştırıldı** |
| T-PENCERE-KAPA | `5895CFC7…` → **`0A80982B7CE35B22D05A7EA08CBDBA9802746EDFB4EF7A8CEF61E8B47882AE05`** | PS7 + PS5.1 hata 0 · **başarı ve hata yolunda çalıştırıldı** |

## 4. Yeniden kanıt — ÇALIŞTIRILARAK

### 4.1 E1 — K-PAR (desen bloktan birebir çıkarıldı)

| Durum | Eşleşen süreç | Anlam |
|---|---|---|
| `smtp-sink-noauth.js` çalışırken | **0** | §9 artık pencere içinde **durmaz** |
| Eski AUTH ilan eden `smtp-sink.js` çalışırken | **4** | koruma **sürüyor** |

### 4.2 E3 — K-ELEV (kapı bloktan birebir çıkarıldı, bu yükseltilmemiş oturumda)

| Blok | Sonuç | Konum |
|---|---|---|
| T-PENCERE-AÇ | **DURDU** ("…YÜKSELTİLMİŞ Administrators DEĞİL… HİÇBİR değişiklik yapılmadı") | ilk değiştirici komuttan (**Copy-Item**) **önce** |
| T-PENCERE-KAPA | **DURDU** | ilk değiştirici komuttan (**Copy-Item**) **önce** |

Canlı modlu blok canlıya karşı **koşturulmadı**; kapı izole sınandı.

### 4.3 Birleşik pencere — aday ikilisi (RELEASE23 dist), prova modu

| Aşama | Ölçülen |
|---|---|
| T-PENCERE-AÇ (`CA99E69E…`) | K-T1…K-T5 geçti → **K-T0 sonra**: yedek alındı, **yedek DACL korumalı** (bağımsız `Get-Acl`: yalnız SYSTEM · Administrators · yürütücü, kalıtsal 0), SDDL tabanı kaydedildi · restart **6 sn** |
| İ11 (runId `51c11954`, gönderim AÇIK) | **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0** · kapsam TAM · anonim 200→404 · login 401 · izolasyon EŞİT |
| **T-PENCERE-KAPA — HATA YOLU** (başlatıcı **kasıtlı bozuk**: yanlış DIST sha → G-A reddi) | R-T1 env geri ✔ · **R-T2 BAŞARISIZ** (182 sn) · **R-T3 BAŞARISIZ** · **R-T5 yine KOŞTU, yakalayıcı durdu** (bağımsız ölçüm: `:2526` dinleyici 0) · R-T6 ✔ · **R-T7 SDDL tabana EŞİT** · blok **sonda 2 hatayla throw**, exit 1 |
| **T-PENCERE-KAPA — KURTARMA** (normal tekrar) | R-T1 **idempotent** · R-T2 API **6 sn**'de ayakta (komut satırı R23 dist) · R-T3 özgün hedef · R-T7 SDDL eşit · **"tüm adımlar başarılı"** |

**Sınır:** R-T4a/R-T4b (firewall kaldırma, Web başlatma) **yalnız canlı modda** koşar; provada
çalıştırılmadı. Kontrol akışı R-T5 ile aynı yapıdadır (sıralı, bağımsız `try/catch`), hata yolunda
R-T5'in koştuğu ölçüldü.

**Taşıma gövdesi** bu turda ayrıca çıkarılmadı: `i11-run.js` ve yakalayıcı değişmedi, taşıma kanıtı
R04'te (`64245dc2`) aday ikilisinde alındı; bu turun pozitif hedef kanıtı (K-T10b: bu koşuma ait 2
ileti) ve İ11 11/0/0 aynı yolu doğruluyor.

### 4.4 Aday köküne yazma YOK (OFFICE 33 D2 kuralı)

Yeni nöbetçi tabanı `2026-09-12T21:26:20Z`: dosya **88.248 → 88.248** · klasör **13.600 → 13.600** ·
değişen **0** → **YAZMA YOK** (kayıt sha `2A1062EAC54A2D5EBBCE2E7F583B4769E1654AF786420EBCCE0B88E5FCAFF7CB`).

## 5. D3 çağrı sözleşmesi — DÜZELTİLMİŞ (OFFICE 33 #2656 için)

| Adım | Sözleşme |
|---|---|
| **Önkoşul 0** | Yürütücü **YÜKSELTİLMİŞ (Administrators)** PowerShell oturumu — K-ELEV bunu zorlar |
| **Önkoşul 1** | T-PENCERE-AÇ'tan önce yakalayıcı: `SINK_PORT=2526` · `SINK_LOG=<CLIENT scratchpad>\i11s\runs\smtp-sink.jsonl` · `node scripts/smtp-sink-noauth.js` (K-T10b **tam bu yolu** okur) |
| T-PENCERE-AÇ | `T_MODE=live` · `T_GOREF=<İ11 ref>` |
| §9 | `$GoRef=<İ11 ref>` · `$SendGo=<aynı ref>` · `$SmtpAck='EVET'` |
| T-PENCERE-KAPA | `T_MODE=live` · `T_RUNID=<runId>` — **sonuç ne olursa olsun**; throw ederse listelenen adımlar owner'a bildirilir, otomatik tekrar yok; kurtarma = aynı bloğun tekrarı (idempotent, ölçüldü) |
| Geri dönüş sırası | **Önce T-PENCERE-KAPA** (artık önlemi her durumda kaldırır), **sonra** C33 elle geri dönüş |
| Kapanış ölçütü | OFFICE'in D3-5'i (env sha + SDDL = taban, otomatik düzeltme yok) **kabul**; blok içi R-T7 aynı karşılaştırmayı yapar |

## 6. Açık kalemler

- **`ENV-PREIMAGE.env`** pencereden sonra CLIENT oturum dizininde kalır — **artık korumalı DACL'lı**;
  sır taşır; **silme owner kararı**.
- **`CL_TOKENFIX`** disk artığı ayrı açık kalem (kanca reddi; alternatif silme yolu denenmedi).
- **İ12 başlatılmadı.** **Canlı kabul yapılmadı.**
- Main'e aday sonrası **#2655** (OFFICE ürün değişikliği) girdi; aday `2740df3d`'de **sabit** olduğu
  için bu bağlamayı etkilemez.

---

CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.
