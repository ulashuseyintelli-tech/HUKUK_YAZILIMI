# OFFICE C1 / C2 / C3 CANLI KABUL KAYDI — runId `87220c29`

> **Owner GO'su ile 2026-09-22'de BİR KEZ koşuldu. Sonuç: PASS 33 / FAIL 0 / ÖLÇÜLEMEYEN 0.**
> Teknik sayaç 18/18 ve **hizmet kabulü 0/8 DEĞİŞMEDİ**. Bu kayıt hizmet kabulü değildir ve OFFICE genel finali ilan etmez.
> Açık kalanlar (bu koşumun kapsamı dışında): dört açık spec, ADR-014 kablolaması, forceExit ve süre riski.

## 1. Kimlik

| Alan | Değer |
|---|---|
| runId / slug | `87220c29` / `off-c123-87220c29` (tenantId `cmud3kz8z0001x78s9yjinvxd`) |
| Koşum | 2026-09-22T19:59:17.952Z → 19:59:38.995Z |
| main (koşum anı) | `c73048baad9ea1b1408656eedfff4d551688be54` |
| Canlı API | `127.0.0.1:8080`, pid 50204; DB `hukuk_db` (127.0.0.1:5432) |
| G-6 artefakt bağı | 8/8 dosya EŞİT (`distBinding.ok = true`) |
| §12 araç SHA'ları | 9/9 EŞİT (koşum öncesi blok tarafından ve CLIENT tarafından ayrıca ölçüldü) |
| Kanıt dizini | `Documents\CLIENT-EVIDENCE-20260911\c123-live-20260922-225840` |
| GO ref | `goref-consumed.json` içinde yalnız sha256 olarak kayıtlı. Oradaki `literalWritten=false` beyanı **yalnız o dosyayı** kapsar — paket kendi çıktılarına literali yazar, bkz. §11. Repoya yalnız maskelenmiş türevler kondu |

## 2. Owner kararları ve önkoşul — ayrı kayıt

| Kalem | Tür | Durum |
|---|---|---|
| Ö-1 C1 karma kanıt yöntemi | **Owner kararı** | ONAY (2026-09-22) |
| Ö-2 FD zincirinin canlıda üç **sentetik** aktörle koşulması | **Owner kararı** | ONAY (2026-09-22). Sentetik hesaplar gerçek kişiler arasındaki operasyonel görev ayrılığının kabulü **değildir** |
| Ö-7 Canlı outbox tüketicisinin C1-S olaylarına etkisi | **Owner kararı** | ONAY (2026-09-22) |
| Ö-3 `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED` | **Ölçülmüş önkoşul** (owner seçimi değil) | Canlı `.env`'den salt okuma: **`true`**. Kanıta yalnız bu bayrağın sonucu girdi; `.env`'in başka hiçbir alanı ya da ham içeriği alınmadı |

## 3. Sonuç — 33/33 PASS

| Aile | Ölçüt sayısı | Sonuç |
|---|---|---|
| C1 (dosya açılışı, atomiklik, VIEWER sınırı) | 4 | PASS |
| C2 (onay kararı rol sınırları) | 9 | PASS |
| C3 (CLF-O0-01 ve FD zinciri) | 16 | PASS |
| K (erişim kapanışı) | 2 | PASS |
| I (izolasyon) | 2 | PASS |

Örnek gözlemler: C1-S `HTTP 201` + beklenen satır farkı; C1-R1 `HTTP 400` yazma 0; C1-R2 `HTTP 409` yazma 0;
C1-V1 / C2-G1 / C2-G2 `HTTP 403` (`CLIENT_MUTATION_DENIED_VIEWER`, `OFFICE_APPROVAL_DECISION_DENIED_VIEWER`).

## 4. Erişim kapanışı (K-1, K-2)

| Ölçüm | Değer |
|---|---|
| Aktif sentetik kullanıcı | 5 → **0** (5 pasifleştirildi, `tokenVersion` artırıldı) |
| ACTIVE case | 2 → **0** (CLOSED) |
| PENDING_APPROVAL talep | 4 → **0** (CANCELLED) |
| AuditLog | 6 → 6, **`auditPreserved: true`** (silme YOK) |
| Kapanış hükmü | `verified: true`, `alreadyClosed: false`, `greetingDisabled: true` |
| K-2 kapanış sonrası erişim | admin, viewer, elev1, elev2, elev3 → **hepsi 401**, hiçbiri belirsiz değil |

## 5. İzolasyon (I-1, I-3)

- Sentetik olmayan tarafın parmak izi **önce = sonra**: `bd554246f1d0356c117320dd1edb325fb90abe136ae78f30a69d45d11372a1a8`, 27 tenant.
- Yabancı tenant'larda sentetik aktörlerin ürettiği audit satırı: **0**.
- Toplamlar değişmedi (user 112, lawyer 69, office 7, case 44, client 47, debtor 32, onay talebi 32, tahsilat kararı 19, FD 7).

## 6. Canlıda kalıcı kalanlar — owner tarafından kabul edildi

Sentetik tenant `off-c123-87220c29` ve tüm satırları canlıda **kalır**; kapanış silme yapmaz:
muhasebe fişleri ve satırları, masraf talepleri, FD taslağı ve sürümü, audit satırları, outbox satırları.
Kurulumda yazılan satır sayısı 27. Erişim kapalıdır (kullanıcılar pasif, case'ler CLOSED, bekleyen talepler CANCELLED).

## 7. Sarmalayıcı kusuru — kabul sonucundan AYRI

Owner bloğu çalıştırdığında **dış sarmalayıcı `-999` gösterdi**. Bu bir koşum sonucu **değildir** ve kurtarma gerekçesi
sayılmamıştır. Nedeni kaynaktan doğrulandı: koşumu saran `c123-owner-block.ps1` (CLIENT tarafından üretildi) sonunda
`exit $rc` çağırmıyor; PowerShell betiği çağıran kabuğun `$LASTEXITCODE` değerini güncellemez, bu yüzden sarmalayıcının
önceden koyduğu `-999` olduğu gibi kalır. İç koşumun gerçek çıkışı `goref-consumed.json` içinde **`exitCode: 0`**
olarak kayıtlıdır ve `c123-result.json` `verdict: PASS` ile tutarlıdır. Kusur CLIENT'ındır; kabul ölçütlerini etkilemez.

## 8. Kanıt sha256 (kaynak dizindeki bayt-birebir dosyalar)

| Dosya | sha256 |
|---|---|
| `c123-result.json` | `6095FAA3977CBE42EFF19A760C4AE80B2D00EF9667695C1E12B6B05044DBF25F` |
| `c123-run.log` | `112C8CDBB92B19AAD900A967068669F81DC26F3B4761510EF364B7BE4BF4F835` |
| `c123-state.json` | `64899B8F126942629C6283A77CB78AE9285067F6D0CD7077DBCC6B8DFCE4A640` |
| `goref-consumed.json` | `A26E8017FAAA29F805DBBF347AF7D3F9452FCC4213D045056A4F9E7810148D53` |

`record/evidence/` altındaki kopyalar **türevdir** (GO ref literali maskelendi, satır sonları LF'e normalize edildi,
BOM kaldırıldı); bu yüzden türev hash'leri kaynak hash'lerinden zorunlu olarak farklıdır. Ham kanıtlar repo dışındaki
koşum dizininde **yerinde korunur**; hiçbiri değiştirilmedi veya silinmedi. `c123-run.log` repoya kopyalanmadı;
sha256'sı yukarıdadır.

| Katman | Nerede |
|---|---|
| Kaynak (bayt-birebir) hash'ler | Bu tablo (§8) |
| Türev (repo kopyaları) hash'leri | `record/evidence/DERIVED-SHA256-MANIFEST.txt` |
| Hangi alanın maskelendiği | `record/evidence/MASKING-NOTES.md` |

Türev dosya adları kaynaktan ayrıldı: `c123-result.redacted.json`, `c123-state.redacted.json`,
`SOURCE-SHA256-MANIFEST.copy.txt` (içindeki değerler **kaynak** dosyalara aittir).

## 9. Pencere ve roller

- Pencere teyidi: `Avukat personel analiz dosyası` ve `OFFİCE 33` oturumları koşum penceresi boyunca canlıya yazma ve
  kabul/prova başlatma yapmayacaklarını teyit etti; OFFİCE 33 ek olarak canlıya HTTP probu, log okuma ve dosya digest
  ölçümü de yapmadı.
- Tek yürütücü: owner bloğu bir kez çalıştırdı; GO ref yalnız yerel olarak girildi.
- Bağımsız doğrulama: `Avukat personel analiz dosyası` (owner'ın o oturuma doğrudan verdiği READ ONLY yetkisiyle). Sonuç §10'da.

## 10. Bağımsız doğrulama

Doğrulayıcı: `Avukat personel analiz dosyası` (OFFICE a8d9121a), owner'ın o oturuma **doğrudan** verdiği yetkiyle
(dosya bütünlüğü + canlı DB READ ONLY; DB yazması, gönderim, yeniden başlatma, migration ve kurtarma hariç).
Sonuç: **PASS**.

**(a) Dosya — CLIENT kanıtından doğrulandı**
- Kaynak dizindeki 4/4 dosya, koşumun ürettiği `SHA256-MANIFEST.txt` ile birebir eşit; dizinde fazla dosya yok.
- `goref-consumed.json`: `exitCode 0`, `literalWritten=false`, main `c73048ba`.
- `c123-result.json`: `verdict PASS 33/33`, fail 0, ölçülemeyen 0; `distBinding` 8/8 true; kapanış ve izolasyon
  alanları CLIENT'ın bildirdiği sayılarla eşit.

**(b) Canlı `hukuk_db` — doğrulayıcının kendi READ ONLY transaction'ı (`transaction_read_only=on` sorgulardan ÖNCE
doğrulandı, yazma 0): 11/11 PASS**
- Tenant `off-c123-87220c29` bulundu.
- Aktif kullanıcı 5 → 0 (5/5 pasif), `tokenVersion` 5/5 artırılmış.
- Case: yalnız CLOSED ×2, açık case 0.
- `OfficeApprovalRequest`: APPROVED ×4 + CANCELLED ×4, PENDING_APPROVAL 0.
- AuditLog 6 (önce = sonra).
- **Kalıcı satırlar silinmemiş:** muhasebe fişi 4, masraf talebi 3, FD taslak 1, FD sürüm 1, outbox 2.
- Yabancı özet: 27 tenant, user 112, lawyer 69, case 44, client 47 — CLIENT'ın önce/sonra digest'iyle (`bd554246…`)
  tutarlı; bu aktörlerin yabancı tenant'ta audit izi 0. Toplam tenant 28 (27 + 1 sentetik).
- Kanıt: `HY_C123_OFFICE_VERIFY\c123-office-readonly-verify-87220c29.json` — tam sha256 CLIENT tarafından bağımsız
  ölçüldü: `64BA44F9B1C54F5671E2E72E4954DE03AB391FE33E2F02E6326FE3893F081DFF`; betik `c123verify.office.js`:
  `19886A483D20FE12115C86A054F72E5617D43E363A2FBABB7196EA262B7577FC`. Doğrulayıcı kendi ürettiği hiçbir dosyaya GO ref literalini yazmadı (bu ifade doğrulayıcının dosyalarına özgüdür; paket çıktıları için §11).

**Doğrulayıcının bulgusu — GO ref literali iki dosyadaydı:** `c123-result.json` yanında **`c123-state.json`** de
`environment.goRef` alanında literali açık taşıyordu. Repodaki `record/evidence/` türevlerinde **her iki dosya da**
maskelendi; ayrıntı ve kapsam §11 ile `MASKING-NOTES.md` içindedir.

**Kapsam notu:** C123 tek başına OFFICE finali sayılmaz; hizmet kabulü 0/8 ayrı owner kararı olarak durur.

## 11. `literalWritten=false` beyanının kapsamı — paket geneli için GEÇERLİ DEĞİL

`goref-consumed.json` dosyasını koşum bloğu (`c123-owner-block.ps1`, CLIENT) yazar ve `literalWritten: false` alanı
**yalnız o dosyayı** anlatır: blok GO ref'i hiçbir yere literal olarak yazmaz, yalnız sha256'sını kaydeder.

Paketin kendisi bunu kapsamaz. Kaynak ölçümü:
- `c-lib.js:116` — ortam nesnesi `goRef` alanını **literal** taşır; bu nesne `c123-result.json` ve `c123-state.json`
  dosyalarına yazılır.
- `c-run.js:41` — `note` alanına `CANLI KOSUM · GO <literal>` yazar.

Bu nedenle **"bu koşumda GO ref literali hiçbir dosyaya yazılmadı" denemez.** Doğru ifade: literal, repo dışındaki iki
ham kanıt dosyasında bulunur; repoya yalnız maskelenmiş türevler konmuştur (§8, `MASKING-NOTES.md`). Paketin çıktı
biçimindeki bu eksik, `office-live-acceptance-c123-r01` paketinin sonraki revizyonu için **açık kalemdir**.

**Bir kerelik ifşa:** Bağımsız doğrulayıcı, dosya doğrulaması sırasında `c123-state.json` dosyasını doğrudan okurken
literal değer bir kez kendi araç çıktısında göründü. Doğrulayıcı değeri tekrarlamadığını ve hiçbir dosyaya ya da
belleğe yazmadığını bildirdi. Bu kayıt, geçmiş araç çıktısının silindiğini **iddia etmez**; yalnız ifşanın olduğunu,
kapsamının tek bir okuma olduğunu ve değerin burada tekrarlanmadığını tespit eder.

## 12. "R25B dist kökü" ifadesinin netleştirilmesi — dizin adı ≠ çalışan sürüm

`c-dist-pins.json` içindeki `measuredFrom` alanı pinlerin **2026-09-21'de R25B dist'inden** ölçüldüğünü yazar; kök
dizin adı `HY_W4_RELEASE23`'tür. Bu **tarihsel bir dizin adıdır** ve çalışan sürümü göstermez.

| Kalem | Değer |
|---|---|
| Kök dizin (tarihsel ad) | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api` |
| Bu koşum anında çalışan sürüm | **R26** — dist tam ağaç digest'i `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` (3867 dosya), CLIENT tarafından ölçüldü |
| Pinlerin ölçüldüğü tarihsel sürüm | R25B — dist digest `1524EDC1…4D4E` |
| Pin sonucu | G-6 artefakt bağı **8/8 EŞİT**: pinlenen sekiz derlenmiş dosya R25B'den R26'ya **değişmeden** geldi |

Yani "R25B dist kökü" ifadesi yalnız pinlerin kökenini anlatır. Koşum R26 üzerinde yapılmıştır ve C1/C2/C3 kodunun
canlı derlemede bulunduğu iddiası, bu koşum anında ölçülen 8/8 dosya eşitliğine dayanır.
