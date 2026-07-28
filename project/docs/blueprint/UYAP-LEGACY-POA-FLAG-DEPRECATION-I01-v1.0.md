# UYAP Legacy POA Flag Deprecation I01 v1.0

```text
Task              : UYAP-LEGACY-POA-FLAG-DEPRECATION-I01
Parent program    : UYAP-MODULE-FULL-GAP-CLOSURE-R02
Tür               : LEGACY DEPRECATION / AUTHORITY SURFACE
Durum             : IMPLEMENTED — bounded patch (owner §15)
Tarih             : 2026-07-28
Kanıt tabanı      : canonical main `dcee49ce`
Yetki             : Owner `GO-COMPLETE — UYAP-LEGACY-POA-FLAG-DEPRECATION-I01`
Öncüller (ANCESTOR doğrulandı):
                    I01 `dde01ca2` · I02 `e20b36ff` · I03 `d778d3bb` · I04 `8b0fc020` ·
                    I04B `19a88b20` · PREFLIGHT `2c62dcf1` · INTEGRITY-A `6e2b114b` ·
                    INTEGRITY-B `43a52554` · FRESHNESS `4e7c78b2`
SCHEMA DELTA      : NONE (RETAIN DEPRECATED)
REAL TRANSPORT    : NOT AUTHORIZED
PRODUCTION CUTOVER: HARD HOLD
```

---

## 1. LEGACY FIELDS

| Alan | Tür | Önceki rol | Şimdiki rol |
|---|---|---|---|
| `case.has_power_of_attorney` | `icrabotCaseFlag` satırı + fact anahtarı | `POWER_OF_ATTORNEY_MISSING` gate'inin **tek** girdisi; manuel/persisted flag | **Computed compatibility alias.** Sahibi `UyapAuthorityFactProvider`; değeri her değerlendirmede canonical zincirden hesaplanır |
| `case.expense_gate_blocked` | `icrabotCaseFlag` satırı + fact anahtarı | `EXPENSE_BLOCKING` gate'inin dolaylı girdisi (hayalet — hiç production writer'ı yoktu) | **Terk edilmiş.** Hiçbir sahibi, hiçbir okuyucusu yok; yazımı YASAK |
| `skipPoaCheck` | 5 ayrı request interface alanı | `if (!skipPoaCheck && …)` — vekalet kontrolünü atlatabiliyordu (DEBTOR-IDOR-04) | **KALDIRILDI** (ölü alan; bypass sözleşmesi yok) |

---

## 2. PRODUCTION READERS — BEFORE / AFTER

| Okuyucu | BEFORE | AFTER |
|---|---|---|
| `gates.compiled.ts` `POWER_OF_ATTORNEY_MISSING` | I04'ten beri granular fact'leri okur (alias'ı DEĞİL) | değişmedi |
| `rules.compiled.ts` `RULE_UYAP_SEND_INITIAL` | **`case.has_power_of_attorney` okur** | **granular authority fact'lerini okur** — alias okuması kaldırıldı |
| `gate-checker.service.ts` `collectUsedFacts` | alias'ı `factsUsed` telemetrisinde listeler | değişmedi (karar girdisi DEĞİL, yalnız evidence) |
| `case.expense_gate_blocked` | **hiçbir okuyucu yok** (I04B'den beri) | değişmedi — test ile kilitlendi |

**Sonuç:** legacy adlı alias'ı üretim kodunda artık yalnız **sahibi** (`UyapAuthorityFactProvider`), **sahiplik kaydı** ve **telemetri listesi** adlandırır. Architecture guard bu üçlüyü tam liste olarak kilitler.

---

## 3. PRODUCTION WRITERS — BEFORE / AFTER

### 3.1 Bulunan iki istemci-erişilebilir yazıcı

`icrabotCaseFact` / `icrabotCaseFlag` **serbest anahtarlı** bir key-value deposudur:

```text
POST /policy-engine/cases/:caseId/action-executed   body.result.newFacts
     → CasePolicyEngine.onActionExecuted → FactStoreService.writeFacts

POST /v28-engine/:caseId/flag/:key                  body.value
POST /v28-engine/:caseId/fact/:key                  body.value
POST /v28-engine/:caseId/facts (bulk)               body.facts / body.flags
     → v28 FactStoreService.setFlags / setFacts / batchWrite
```

Her ikisi de `case.has_power_of_attorney = true` gibi bir **manuel yetki kaydı** yazabiliyordu.

**Etki sınırı (dürüst ifade):** bu satır CPE kararını **değiştirmiyordu** — computed provider'lar `computeAll` sırasında base fact'lerin üzerine yazar (I04/I04B). Ancak:

- fact deposunda ve `icrabotFactAudit`'te **sahte bir yetki delili** bırakıyordu,
- provider bir gün kayıtsız kalırsa (modül yüklenmezse) canlı bir **fail-open**'a dönerdi,
- owner §5 böyle bir yazıcının varlığını doğrudan yasaklıyor.

### 3.2 Uygulanan çözüm

Yeni **sahiplik kaydı**: `policy-engine/fact-store/computed-fact-ownership.ts`

```text
COMPUTED_OWNED_FACT_KEYS      (10 anahtar — sahibi provider olan)
DEPRECATED_LEGACY_FACT_KEYS   (case.expense_gate_blocked)
assertManuallyWritableFactKey(s)  → ManualComputedFactWriteError (fail-closed)
```

Her iki fact-store'un yazma yolunda uygulanır. **Tümü ya da hiçbiri:** batch içinde tek yasak anahtar bile varsa transaction **hiç açılmaz** (kısmi yazım sessiz bir bypass olurdu).

| Yazıcı | AFTER |
|---|---|
| `FactStoreService.writeFact` / `writeFacts` | computed-owned anahtar → `ManualComputedFactWriteError`, Prisma'ya **ulaşılmaz** |
| v28 `FactStoreService.write` / `batchWrite` / `setFacts` / `setFlags` | aynı kapı; transaction **açılmaz** |

Legacy satırlar **SİLİNMEZ** (silent data repair yasak, owner §7); yalnız yeni manuel yazım engellenir.

---

## 4. BYPASSES

| Sembol | Bulgu | Disposition |
|---|---|---|
| `skipPoaCheck` | 5 interface'te tanımlı, **hiçbir kod yolunda okunmuyor** (DEBTOR-IDOR-04'ten beri ölü) | **REMOVE** |
| `skipAuthorityCheck` · `bypassPoa` · `ignorePoa` · `forceUyap` · `allowWithoutPoa` | repository'de **hiç yok** | — |

Architecture guard: üretim kodunun tamamı taranır (yorumlar çıkarılarak); bu sembollerden **hiçbiri** bulunamaz.

---

## 5. SCHEMA DISPOSITION: **B — RETAIN DEPRECATED**

`icrabotCaseFlag` / `icrabotCaseFact` **generic** tablolardır; legacy anahtarlar ayrı bir kolon değil, satır değeridir. Dolayısıyla:

- **REMOVE NOW uygulanamaz** — kaldırılacak bir kolon yok; satır silmek *silent data repair* olurdu (owner §7 yasak).
- Tablolar başka onlarca anahtar için canlı olarak kullanılıyor.

Karar: **tablo ve kolonlar korunur; production read yok, production write yasak.** Mevcut legacy satırlar tarihsel kayıt olarak yerinde kalır ve okunduklarında computed provider tarafından ezilirler.

**Follow-up (ARCH-4):** legacy `case.has_power_of_attorney` / `case.expense_gate_blocked` satırlarının tarihsel temizliği ayrı bir veri görevidir; bu task kapsamında değildir.

---

## 6. FIXTURE MIGRATION

| Fixture | Durum |
|---|---|
| `uyap-authority-fact-bridge.spec.ts` (I04) | Canonical ilişki zinciri (`User → Lawyer → Client → Case → CaseClient → POA → PoaLawyer`) mock Prisma ile zaten kuruluyor — **taşıma gerekmedi** |
| `uyap-expense-blocking-fact-bridge.spec.ts` (I04B) | `ExpenseBlockReason(blockedActionCode=UYAP_SEND, status=OPEN)` üzerinden kuruluyor — **taşıma gerekmedi**; legacy anahtar yalnız *etkisizliğini* kanıtlamak için enjekte ediliyor |
| `uyap-authority-freshness.db-gated.integration.spec.ts` (I05) | Gerçek satırlarla tam canonical zincir — **taşıma gerekmedi** |
| Yeni `uyap-legacy-flag-deprecation.spec.ts` | Legacy anahtarları **yalnız etkisizlik kanıtı** olarak kullanır; hiçbiri authority kurmak için kullanılmaz |

Üretim seed/script'lerinde legacy anahtar yazımı **yok** (`scripts/`, `prisma/` tarandı, sıfır eşleşme).

---

## 7. COMPATIBILITY STATUS

Ek telemetri **kurulmadı** (owner §9: "Yeni telemetry altyapısı kurma"). Mevcut mekanizmalar yeterli kanıt sağlıyor:

- `CpeDecisionLog.factsUsedKeys` — hangi fact'lerin karara girdiği (alias dahil) zaten kaydediliyor,
- `ManualComputedFactWriteError` — manuel yazma girişimi **sessizce yutulmaz**, çağırana açık kodla döner,
- `icrabotFactAudit` — mevcut yazım denetimi değişmedi.

`case.has_power_of_attorney` **compatibility alias olarak korunur**: adı legacy'dir, değeri computed'dır, sahibi tektir.

---

## 8. TESTS

`uyap-legacy-flag-deprecation.spec.ts` — **45/45 PASS**

| Blok | Kapsam |
|---|---|
| LG-01/02/03/06 POA matrisi | `{legacy true, false, YOK} × {geçerli, geçersiz authority}` = 6 senaryo + alias'ın daima computed'a eşitlenmesi + granular fact'lerin manuel enjeksiyona rağmen ezilmesi |
| LG-04/05 Expense matrisi | legacy true + blok yok → geçer · legacy false + OPEN blok → bloklar · legacy yok + OPEN blok → bloklar · RESOLVED → geçer · gate koşullarında `expense_gate_blocked` yok |
| LG-07 provider yokluğu | authority fact'i yoksa `POWER_OF_ATTORNEY_MISSING`; expense fact'i yoksa `UYAP_SEND_PRECONDITIONS_UNPROVEN`; registry built-in olarak bu fact'leri üretmez |
| LG-08 manuel yazıcı | 11 anahtar × 2 fact-store = 22 red senaryosu + batch bütünlüğü + regresyon (yasak olmayan anahtar normal yazılır) |
| Architecture guard | bypass sembolleri **yok** · `expense_gate_blocked` üretimde **yok** · alias'ı adlandıran dosyalar **tam liste** |

### Regresyon (gerçek `postgres:16-alpine`)

| Kapsam | Sonuç |
|---|---|
| `src/modules/policy-engine` | **380 PASS / 21 suite** |
| `src/modules/uyap` | **751 PASS / 42 suite** |
| `src/modules/icrabot` | **223 PASS / 20 suite** |
| `tsc -p tsconfig.prod.json` | EXIT 0 |
| `pnpm build` | EXIT 0 |

---

## 9. BLOCKING CI

Spec `ci-manifests/pure/uyap-icrabot-tebligat.txt` içine cerrahi eklendi — **yeni ci.yml step'i açılmadı**.

Owner §12 gereği "manifestte görünmek yeterli değildir" koşulu **gerçekten koşularak** doğrulandı:

```text
bash apps/api/scripts/run-ci-manifest.sh pure/uyap-icrabot-tebligat
→ PASS src/modules/uyap/__tests__/uyap-legacy-flag-deprecation.spec.ts
→ Test Suites: 56 passed / Tests: 935 passed
```

I04 (`uyap-authority-fact-bridge.spec.ts`) ve I04B (`uyap-expense-blocking-fact-bridge.spec.ts`) regression suite'leri aynı manifestte (satır 164-165) ve aynı koşuda PASS.

---

## 10. CANONICAL VERDICT

```text
LEGACY POA FLAG          : NON-AUTHORITY / DEPRECATED (computed compatibility alias)
LEGACY EXPENSE FLAG      : NON-AUTHORITY / DEPRECATED (sahipsiz, okunmayan, yazımı yasak)
MANUAL AUTHORITY WRITERS : ABSENT (iki fact-store da fail-closed)
UYAP_SEND AUTHORITY      : COMPUTED ONLY
AUTHORITY BYPASS         : YOK (skipPoaCheck kaldırıldı)
SCHEMA                   : RETAIN DEPRECATED (kolon yok; satır silme = ARCH-4)
```

---

## 11. REMOVAL FOLLOW-UP

| # | İş | Devir |
|---|---|---|
| F-1 | Mevcut legacy `case.has_power_of_attorney` / `case.expense_gate_blocked` satırlarının tarihsel temizliği | **ARCH-4** (veri görevi; silent repair yasak) |
| F-2 | `case.has_power_of_attorney` alias'ının tümüyle kaldırılması (gate ve telemetri artık granular fact'lere bakıyor) | **ARCH-4** — alias'ın dış tüketicisi olup olmadığı ayrıca ölçülmeli |
| F-3 | Legacy `PowerOfAttorney` tablosunun kaldırılması | **kapsam dışı** (owner §15) |
