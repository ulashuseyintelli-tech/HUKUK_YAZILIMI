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
| GO ref | Yalnız sha256 olarak kayıtlı (`goref-consumed.json`, `literalWritten=false`). Literal repoya **kopyalanmadı**; `record/evidence/` kopyalarında maskelendi |

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

`record/evidence/` altındaki kopyalar **maskelenmiş** biçimdir (GO ref literali çıkarıldı, satır sonları normalize edildi);
bayt-birebir kopyalar yalnız kanıt dizinindedir. `c123-run.log` repoya kopyalanmadı; sha256'sı yukarıdadır.

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
- 4/4 dosya `SHA256-MANIFEST.txt` ile birebir eşit, dizinde fazla dosya yok.
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
  `19886A483D20FE12115C86A054F72E5617D43E363A2FBABB7196EA262B7577FC`. GO ref literali hiçbir dosyaya yazılmadı.

**Doğrulayıcının bulgusu — GO ref literali iki dosyadaydı:** `c123-result.json` yanında **`c123-state.json`** de
`environment.goRef` alanında literali açık taşıyordu. Repodaki `record/evidence/` kopyalarında **her iki dosya da**
maskelendi; maskeleme sonrası özyinelemeli tarama ile 4/4 dosya kontrol edildi ve sızıntı 0 ölçüldü. Bayt-birebir
dosyalar yalnız repo dışındaki kanıt dizinindedir. Bu, paketin kendi çıktı biçiminden gelen bir eksiktir ve
`office-live-acceptance-c123-r01` paketinin sonraki revizyonunda giderilmelidir (açık kalem).

**Kapsam notu:** C123 tek başına OFFICE finali sayılmaz; hizmet kabulü 0/8 ayrı owner kararı olarak durur.
