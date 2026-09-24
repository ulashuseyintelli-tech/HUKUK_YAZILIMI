# H5-URL — B-I11-1 GİDERME PAKETİ (R01): `PUBLIC_INTAKE_BASE_URL` + dar canlı kabul

> **DURUM: HAZIRLIK — CANLIDA UYGULANMADI.** Bu belge owner onayı değildir. Canlı `.env` değişikliği ve dar
> kabul koşumu ayrı owner GO'ları ister. Hizmet kabulü **0/8** kalır; teknik sayaç **18/18** değişmez.

## 1. Kusur ve kapsam

İ11 kaydındaki **B-I11-1**: `PUBLIC_INTAKE_BASE_URL` canlıda tanımsız. `ClientIntakeLinkService.buildUrl`
yalnız bu değişkeni okur:

```ts
const base = (process.env.PUBLIC_INTAKE_BASE_URL || '').replace(/\/+$/, '');
return `${base}/intake/${rawToken}`;
```

Değişken yoksa üretilen adres **göreli** olur (`/intake/<token>`) ve müvekkil tıklanabilir bir bağlantı almaz.
Bu bir **yapılandırma** kusurudur; ürün kodu değişmez, yeni yayın gerekmez, migration gerekmez.

> **DÜZELTME (2026-09-21, Codex final denetimi + izole tarayıcı provası):** Yukarıdaki cümle yalnız
> **bağlantı metninin mutlaklaşması** için doğrudur. H5'in amacına — müvekkilin bağlantıyı açıp formu
> göndermesine — **env değişikliği TEK BAŞINA YETMEZ**; yeni web derlemesi ve yeni yayın (R26) GEREKİR. Ölçülen iki
> engel: (1) canlı web derlemesi API'yi `localhost:8080` olarak gömülü çağırır (19 geçiş); (2) personel oturum
> katmanı `/intake/<token>` sayfasını muaf tutmadığı için girişsiz tarayıcı formdan `/auth/login`'e
> yönlendirilir. Aşağıdaki "HTTP 200" ölçümü sunucu yanıtıdır; istemci tarafı yönlendirmeyi ÖLÇMEZ. Giderme ve
> izole prova: `client-external-access-r01/CLIENT-EXTERNAL-ACCESS-PACKAGE-R01.md` §1.1, §10.

## 2. Kullanılacak değer — TAHMİN EDİLMEDİ, KAYITTAN DOĞRULANDI

| Dayanak | Ölçüm |
|---|---|
| Emsal karar | `CLIENT-WAVE5-FD-PROVIDER-OPS.md` §P2-EK: davet bağlantısı aynı sınıf kusurdaydı; **ürün kodu değiştirilmeden** env'e `WEB_BASE_URL` girildi ve bağlantı mutlaklaştı |
| Canlı `.env` | `WEB_BASE_URL` **tanımlı** (tek geçiş), `PUBLIC_INTAKE_BASE_URL` **tanımsız**. Ölçüm salt okuma; değer ekrana yazılmadı. Biçim: mutlak (`^https?://…`), ters bölü yok, host `localhost:3002` |
| Hedef sayfa | Rota `apps/web/src/app/intake/[token]/page.tsx` (dashboard grubu dışında). Canlı web: `http://localhost:3002/intake/<token>` → **HTTP 200** (salt okuma ölçümü) |

**Karar:** `PUBLIC_INTAKE_BASE_URL`, canlı `.env` içindeki **`WEB_BASE_URL` değerinin birebir kopyası** olur.
Owner bloğu değeri dosyadan okur; betikte sabit bir adres yoktur ve değer hiçbir çıktıya yazılmaz.

## 3. Owner bloğu — `scripts/h5-owner-env-block.ps1` (yükseltilmiş pencere)

- **Kapılar:** yükseltilmiş pencere · canlı dist `A8B17A38…53A0` (**R26**; pin 2026-09-24'te tazelendi, R25B `1524EDC1…4D4E` TARİHSEL) · pinli başlatıcı · `.env` sha **değişiklik öncesi** pin `7A7228B1…` · `:8080` tek dinleyici · `PUBLIC_INTAKE_BASE_URL` **yok** · `WEB_BASE_URL` tek geçiş ve mutlak.
- **Yedek:** `.env` **aynı dizine** `.env.bak-H5URL-<ts>` olarak kopyalanır (ACL değişmez), sha'sı doğrulanır.
- **Durdurma:** görev durdurulur; dinleyici 0, host süreci 0 ve görev `Running` değil olmadan dosyaya dokunulmaz.
- **Değişiklik:** dosya sonuna **tek satır** eklenir. Doğrulama bayt düzeyindedir: önceki satırların tamamı birebir aynı, satır sayısı tam +1, eklenen anahtar sayısı 1. Tutmazsa yedekten **otomatik geri alınır**.
- **Başlatma ve kapsam:** API başlatılır; `/api/auth/me` = 401, tek dinleyici, dist digest ve görev eylemi değişmemiş olmalı. Tutmazsa yedekten geri alınır.
- **Çıktı:** yeni `.env` sha'sı ve yedek yolu. **Değer yazdırılmaz.**
- **Geri alma:** `-Rollback -BackupFile <yol>`; yedeğin sha'sı taban pin değilse geri alma **başlamaz**.
- `-SelfTest`: yalnız kapıları koşar, hiçbir şey yazmaz. 2026-09-21 ölçümü: **PASS**.


> **PİN TAZELEME (2026-09-24; salt okuma, canlı koşum YOK).** Paket 2026-09-21'de yazıldığında canlı sürüm
> R25B ve başlatıcı P1-ÖNCESİ idi. O günden sonra R26 (Pencere A) ve P1 (Pencere B) canlıya alındı; bu yüzden
> owner bloklarındaki üç pin **bayat** kalmıştı ve bloklar kapıda DURACAKTI:
>
> | Pin | Eski (bayat) | Yeni (ölçülen canlı) |
> |---|---|---|
> | `h5-owner-env-block.ps1` `$EXP_DIST` | `1524EDC1…4D4E` (R25B) | `A8B17A38…53A0` (R26) |
> | `h5-owner-live-block.ps1` `$ExpLiveDist` | `1524EDC1…4D4E` (R25B) | `A8B17A38…53A0` (R26) |
> | `h5-owner-env-block.ps1` `$LAUNCH_PIN` | `CC634BBF…19B3` (P1-ÖNCESİ) | `DDCCD091…219C` (P1-SONRASI) |
>
> Paket digest'i (`DAF86D1E…D63B`) **değişmedi** — ölçüldü, dört araç dosyası aynı. Yeni `scripts/h5-pin-selftest.ps1`
> bu kusurun tekrarını yakalar: pinleri canlı ölçümle karşılaştırır ve ayrışma varsa FAIL verir. Koşum sonucu **5/5 PASS**.
> Bu değişiklik yalnız sabit pin değerleridir; akış, ölçüt ve geri alma yolu **değişmedi** ve canlı `.env`'e
> dokunulmadı.
>
> **Betik sha256 (tazeleme sonrası, çalıştırmadan önce karşılaştırılır):**
>
> | dosya | sha256 |
> |---|---|
> | `scripts/h5-owner-env-block.ps1` | `3226E4362339EE387C076BAB32443D18E12E2601CBC24CA54647DE5BB9982560` |
> | `scripts/h5-owner-live-block.ps1` | `4AE7B680D17FC692A9C60277DD3239ABE97622542F7B93A7738A9D395662C5CA` |
> | `scripts/h5-pin-selftest.ps1` | `D7073550F6C51DFBD37D017AAE4ECA2149C964122D1BF7E9FC4F5E6A0F00E43A` |

## 4. Dar canlı kabul — `scripts/h5-url-live-run.js` + `scripts/h5-owner-live-block.ps1`

Ölçütler (7 + kapanış):

| Ölçüt | Ne ölçer |
|---|---|
| U-00 | Ölçüm geçerliliği: elev1 ADMIN değil, yetki PARTNER bağından gelir |
| U-01 | `intakeUrl` mutlak (şema + host), ters bölü içermez |
| U-02 | `intakeUrl` = `<PUBLIC_INTAKE_BASE_URL>/intake/<ham token>` |
| U-03a | Hedef sayfa erişilebilir (web 200) |
| U-03b | Bağlantı uçta geçerli (API `/public/intake/<token>` 200). **503 → ÖLÇÜLEMEYEN**: hız sınırı Redis'e ulaşamazsa fail-closed 503 döner; bu geçersizlik kanıtı değildir |
| U-04 | Ham token yalnız oluşturma yanıtında; okuma ucunda yok |
| U-CLOSE | Erişim kapanışı: kullanıcılar pasif, Case CLOSED |
| U-ISO | Sentetik olmayan tenant dağılımı değişmedi |

**Gönderim yoktur.** Yalnız bağımsız bağlantı üretimi ucu çağrılır (`POST /client-intake-links/case/:caseId`);
bildirim akışı tetiklenmez. Ham token hiçbir çıktıya yazılmaz, yalnız sha256'sı raporlanır.

### 4.1 Disposable prova (2026-09-21) — canlı kabul DEĞİL

Aday dist `dist-r25b`, API `:8113`, disposable DB `:5443`:

| Koşum | Sonuç |
|---|---|
| `PUBLIC_INTAKE_BASE_URL` **girilmiş** | **7 PASS · 1 ÖLÇÜLEMEYEN** (U-03b, Redis yok → 503). U-01 mutlak, U-02 birebir eşit, U-03a web 200, U-04 sızıntı yok |
| `PUBLIC_INTAKE_BASE_URL` **yokken** (gerileme kanıtı) | **U-01, U-02 ve U-03a FAIL** — ölçüt kusuru gerçekten yakalıyor |

## 5. Sınırlar

- Canlıda `.env` değişikliği **API yeniden başlatması** gerektirir; bu kısa bir kesintidir ve owner penceresinde yapılır.
- Bu paket H5'in diğer ölçütlerini (H5-01…H5-06) yeniden ölçmez; onlar İ11'de kapandı.
- `PUBLIC_INTAKE_BASE_URL` dış ağdan erişilebilir bir alan adı değil, kayıtlı `WEB_BASE_URL` değeridir. Müvekkile
  dış ağdan ulaşılabilir bir adres gerekiyorsa bu **ayrı bir altyapı kararıdır** ve bu paketin kapsamı dışındadır.
