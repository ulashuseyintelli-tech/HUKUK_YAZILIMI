# C123 kanıt türevleri — maskeleme notu (runId `87220c29`)

Repodaki dosyalar **türevdir**. Ham (bayt-birebir) kanıtlar repo dışındaki koşum dizinindedir ve **yerinde korunur**:
`Documents\CLIENT-EVIDENCE-20260911\c123-live-20260922-225840`. Hiçbir ham dosya değiştirilmedi veya silinmedi.

## Maskelenen alanlar

| Türev dosya | Kaynak dosya | Maskelenen alan | Yerine yazılan |
|---|---|---|---|
| `c123-result.redacted.json` | `c123-result.json` | `environment.goRef` | `[MASKELENDI — GO ref literali repoya yazilmaz; sha256 goref-consumed.json icinde]` |
| `c123-result.redacted.json` | `c123-result.json` | `note` (paket `c-run.js:41` bu alana `CANLI KOSUM · GO <literal>` yazar) | `CANLI KOSUM — GO ref MASKELENDI (sha256 goref-consumed.json icinde)` |
| `c123-state.redacted.json` | `c123-state.json` | `environment.goRef` | `[MASKELENDI]` |

Başka hiçbir alan değiştirilmedi. Türevlerde satır sonları LF'e normalize edildi ve BOM kaldırıldı; bu yüzden türev
hash'leri kaynak hash'lerinden **zorunlu olarak farklıdır**.

## Hash ayrımı

- **Kaynak (bayt-birebir) hash'ler:** `../C123-LIVE-RECORD-R01.md` §8.
- **Türev (repo) hash'ler:** `DERIVED-SHA256-MANIFEST.txt`.
- `SOURCE-SHA256-MANIFEST.copy.txt`, koşumun ürettiği kaynak manifestin okunabilir kopyasıdır; içindeki değerler
  **kaynak** dosyalara aittir, bu dizindeki türevlere değil.
- `office-verify-…json` doğrulayıcının ürettiği dosyadır ve **maskelenmedi**; kopyası bayt-birebirdir
  (`64BA44F9B1C54F5671E2E72E4954DE03AB391FE33E2F02E6326FE3893F081DFF`).

## Tarama

Yayımlanan kayıt ve ekleri, GO ref biçim deseni (`OWNER-GO-OFFICE-C123-\d{8}-R\d{2}`) ve bağlantı dizesi deseni için
**özyinelemeli** tarandı; tarama deseni eşleştirir, değeri çıktıya basmaz. Taranan dosya 6, literal veya sır taşıyan 0.
