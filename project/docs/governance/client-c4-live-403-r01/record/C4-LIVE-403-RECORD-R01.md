# C4 CANLI KOŞUM KAYDI — `403 SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED` (runId `1ffa7765`)

> **Koşum 2026-09-22'de owner GO'su ile BİR KEZ yapıldı; çıkış 0, PASS 5 / FAIL 0 / ÖLÇÜLEMEYEN 0.**
> Teknik sayaç 18/18 ve hizmet kabulü 0/8 **DEĞİŞMEDİ**. Bu kayıt hizmet kabulü değildir.

## 1. Kimlik

| Alan | Değer |
|---|---|
| runId | `1ffa7765` |
| Başlangıç (UTC) | `2026-09-22T17:36:30.4357859Z` |
| main (koşum anı) | `d4443c8fe8d3ee53f5e050f72ae1ce0e60becd9e` |
| Paket digest | `6D68848B8AD9ED6DEFD3D4DDD630931019A6F1F9A3E3517BC38457126F2AD4F0` |
| Blok sha256 | `D7B43A908071BA1E09E05301D6C8E16F646ED6A06465A4C16CC8BAC9F02DCEF3` |
| Canlı API dist digest | `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` (R26), pid 50204 |
| Kanıt dizini | `Documents\CLIENT-EVIDENCE-20260911\c4-live-1ffa7765-20260922-203630` |
| GO ref | Yalnız sha256 olarak kayıtlı (`goref-consumed.json`, `literalWritten=false`). Açık değer hiçbir yere yazılmadı |

## 2. Ölçütler — 5/5 PASS

| Ölçüt | Gözlem |
|---|---|
| C4-PRE | rol USER, aktif, aynı tenant, `staff=true`, Lawyer bağı yok; `isApproverEligible=false` nedeni **`staff fail-closed (satir 487)`**; sentetik tenantta SMTP host yok, ekstre 0 |
| **C4-403** | **HTTP 403 · `reasonCode=SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED`** (bilgi: anonim çağrı 401; bu ölçütü tek başına karşılamaz) |
| C4-ZERO | Sentetik tenant ledger 0→0, bildirim 0→0, ekstre 0→0; **GLOBAL teslim ledger 2→2**, global bildirim 7→7 |
| C4-CLOSE | `closure.ok=true`; sentetik kullanıcılar pasif, Case CLOSED (1 case kapatıldı), giriş 401, eski token 401 |
| C4-ISO | Sentetik olmayan tenant dağılımı **değişmedi**: önce = sonra = `d64960e810e438c3` / 25 tenant |

Gönderim yapılmadı, elevated çağrı yapılmadı, `.env` değiştirilmedi, yayın yapılmadı.

## 3. Sentetik kimlikler (canlıda kalır, erişimi kapalı)

| Nesne | Değer |
|---|---|
| Tenant | `ah-1ffa7765` (`cmucyhdii0001wci1c7myhwte`) |
| Yabancı kontrol tenant'ı | `ah-1ffa7765-x` (`cmucyhdjy001bwci14y8sbrwj`) |
| Client | `cmucyhdjj0012wci118497tas` |
| Case | `cmucyhdjo0016wci167jf4yi5` (CLOSED) |

Gerçek müvekkil verisi kullanılmadı; alıcılar `*.invalid`.

## 4. Kanıt sha256 (`record/evidence/` kopyaları kaynakla birebir)

| Dosya | sha256 |
|---|---|
| `c4-evidence.json` | `DB84ECD7951308BDE67477C384EE0B2C73A30374E30A212CA6181FA4169E3A77` |
| `c4-run.log` | `2A25E334525F0CDBB18DB51CCE21DF109DA9A5DA04434F0DA9D2F0D48159ABCB` |
| `c4-setup-receipt.json` | `A7B58329A497A53412B93BCC027455AC70B396CA97D6DAAB55A4F0237B209F7D` |
| `goref-consumed.json` | `D7B943A2BF929D5C67DBDE152F0EA814026817C8E9231677926CC40D6E0D4002` |
| `owner-block.json` | `50415EECAF57B70AB47D562663598B2734C63FF0848B1177034F26C46E0AEB9E` |

`c4-run.log` UTF-16 konsol çıktısıdır ve repoya kopyalanmaz; sha256'sı yukarıda, dosya kanıt dizinindedir.
Repodaki kopyalar BOM ve CR karakterleri kaldırılmış metin biçimidir; bayt-birebir kopya kanıt dizinindedir.

## 5. Pencere ve roller

- Pencere teyidi: `Avukat personel analiz dosyası` (OFFICE a8d9121a) ve `OFFİCE 33` oturumları, koşum penceresi boyunca
  canlıya yazma ve kabul/prova başlatma yapmayacaklarını teyit etti. OFFİCE 33 ek olarak canlıya HTTP probu ve log
  okuması da yapmadı.
- Tek yürütücü: owner bloğu bir kez çalıştırdı (ajan aracı yönetici değildir; blok yönetici gerektirmez).
- Bağımsız doğrulama: `Avukat personel analiz dosyası` oturumu. Sonucu §6'da.

## 6. Bağımsız doğrulama

Doğrulayıcı: `Avukat personel analiz dosyası` (OFFICE a8d9121a). Owner bu oturuma **doğrudan** READ ONLY canlı DB onayı
verdi (yazma, koşum, gönderim, yeniden başlatma ve kurtarma hariç). Sonuç: **PASS**.

**(a) Dosya doğrulaması**
- Dizinde 5 dosya + manifest; `SHA256-MANIFEST.txt` (`28AA8282…B04A`) ile **5/5 birebir eşit**, manifest dışı dosya 0.
- `goref-consumed.json`: `exitCode=0`, `literalWritten=false`, GO yalnız sha256 (`FC43EE97…EC26`).
- `owner-block.json`: main `d4443c8f`, paket `6D68848B…4F0`, canlı API `A8B17A38…53A0`, pid 50204.
- `c4-evidence.json`: 403 + `SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED`, anonim 401, 5/5 PASS.

**(b) Canlı DB — doğrulayıcının kendi READ ONLY transaction'ı (`transaction_read_only=on` ölçüldü, yazma 0): 11/11 PASS**
- Makbuzdaki `tenantId`/`foreignTenantId` ile DB slug bağı eşit (`ah-1ffa7765`, `ah-1ffa7765-x`).
- `ah-1ffa7765`: aktif kullanıcı 0/9; Case yalnız CLOSED ×1, açık case 0. `ah-1ffa7765-x`: kullanıcı ve case satırı yok.
- Sentetik sayaçlar 0: `ClientStatementDeliveryLedger` 0, `ClientNotification` 0, `ClientStatement` 0.
- GLOBAL teslim ledger 2 ve global bildirim 7 — koşum kanıtındaki önce=sonra değerleriyle eşit (+0).
- Tenant toplamı 27 = sentetik dışı 25 + 2 sentetik; koşumun izolasyon sayısı 25 ile tutarlı.
- Doğrulayıcının kendi parmak izi (farklı tarif, koşum parmak iziyle kıyaslanamaz; gelecek koşumlar için taban):
  `d79143fdd9fdc56d`.
- Kanıt: `HY_C4_OFFICE_VERIFY\c4-office-readonly-verify-1ffa7765.json` (`B3FFEC38…E6B7`) + betik `c4verify.office.js`
  (`A287BE98…561D`). Sır yazılmadı.

**Doğrulayıcı kapsamı dışında kalan tek kontrol:** giriş ve eski token'ın 401 döndüğü ölçümü. Doğrulayıcıda kimlik
bilgisi yoktur; bu kontrol yalnız koşum kanıtındadır (`closureLogin=401`, `closureMe=401`).

## 7. OFFICE listesi eşlemesi

| Ölçüt | Kanıt |
|---|---|
| Hedef-scoped teslim | İ12 G7 (runId `92d04ef3`, 2026-09-18) — yeniden koşulmadı |
| Aynı dönem dedupe | İ12 G7 — yeniden koşulmadı |
| `403 …_NOT_ELEVATED` | **Bu koşum (runId `1ffa7765`)** |

decision-log ve product-backlog satırları, yazıcı sırası gereği ayrı bir PR ile eklenir.
