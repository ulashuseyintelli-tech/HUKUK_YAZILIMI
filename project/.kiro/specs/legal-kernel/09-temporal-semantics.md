---
status: active
review-trigger: "Faz 1 imzasına kadar — sprint sonu"
---

# Temporal Semantics

**Tarih:** 2026-05-19  
**Durum:** Active — vocabulary freeze 5. belgesi  
**Bağlam:** Event taxonomy (`07`) ve causality rules (`08`) imzalandı. Şimdi: hukukta zaman ne demek, hangi zaman hangi soruyu cevaplıyor?

---

## 0. Anayasal Soru

> **When did this become true?**

Bu hukukta merkezi soru. Bir ödeme dün yapıldı ama bugün sisteme girildi. Hangi tarih? Bir Yargıtay kararı bu yıl yayınlandı ama 3 yıl önceki bir olaya etki ediyor. Hangi tarih? Bir TCMB oranı yarın değişiyor ama dün hesaplanan bakiye? Hangi tarih?

Bu belge bu sorunun farklı yüzlerine ayrı kavramlar atar.

### Bu Belgenin NE OLMADIĞI

09 **date utility library** belgesi değildir. İçermez:

- ❌ `dayjs` / `moment` / `date-fns` API'leri
- ❌ Generic timezone handling
- ❌ Format converter spec'leri
- ❌ Tam adli tatil engine'i (Faz 2)

09 sadece **what time means legally** sorusunu cevaplar.

---

## 1. Anayasal Cümle (Temporal Truth)

> **Replay uses recorded truth. Calculation uses asOf truth. Legal interpretation uses effective truth.**

Bu cümle bu belgenin tek koruyucu prensibidir. Üç farklı eksen, üç farklı doğruluk:

- **Replay:** "Sistem o anda ne biliyordu?" → `recorded_at` sırası
- **Calculation:** "Bugün/şu tarihte ne görmeliyim?" → `asOf`
- **Legal interpretation:** "Hangi tarihten itibaren hangi yorum?" → `effective_from`

Karıştırıldıklarında: historical reconstruction bozulur, replay deterministik olmaz, audit kanıtı kaybolur.

---

## 2. Dört Temporal Kavram (Anayasal Tablo)

| Kavram | Anlam | Ne için |
|---|---|---|
| **`occurred_at`** | Olayın gerçek dünyada gerçekleştiği an | Wall-clock event time. Avukat ne zaman yaptı, banka ne zaman havale etti, mahkeme ne zaman karar verdi. |
| **`recorded_at`** | Olayın sisteme yazıldığı an | DB insert zamanı, monotonic. Replay sırası. |
| **`effective_from`** | Hukuki/yorumlayıcı etkinlik başlangıcı | Bir kuralın, profile'ın, oranın hangi tarihten itibaren uygulandığı. Geriye dönük olabilir. |
| **`asOf`** | Hesaplama / görüntüleme bakış tarihi | "Şu tarihte bakiye ne idi?" sorusunun cevabı. Calculator parametresi. |

### Bu Dördü Aynı Anda Farklı Olabilir

Somut örnek:

```
Olay: "Banka 15 Mayıs 2026 saat 14:30'da havaleyi gerçekleştirdi.
       Sistem 17 Mayıs 2026 saat 09:00'da bunu kayıt aldı.
       Avukat aslında ödemeyi geçmişe etkili olarak 1 Mayıs 2026'dan
       itibaren tahsilat saymak istiyor (sözleşmesel sebep).
       Mahkeme bilirkişi raporu için 30 Nisan 2026 itibariyle
       bakiyenin nasıl olduğunu istiyor."

→ occurred_at:    2026-05-15 14:30
→ recorded_at:    2026-05-17 09:00
→ effective_from: 2026-05-01
→ asOf (sorgu):   2026-04-30
```

**Dördü farklı.** Bunları aynı kabul etmek = sistemi bozmak.

---

## 3. Temporal Truth Modes (Eksen × Soru × Kullanım)

| Mode | Cevapladığı Soru | Hangi Zaman | Tipik Kullanım |
|---|---|---|---|
| **Historical Replay** | Sistem o anda ne biliyordu? | `recorded_at` order | Event store'dan state rebuild |
| **Legal Interpretation** | Hangi tarihten itibaren hangi yorum/kural geçerli? | `effective_from` | Profile selection, rate lookup |
| **Financial Calculation** | Şu tarihte bakiye ne idi? | `asOf` | Bilirkişi raporu, anlık ekran, mahkeme sunumu |
| **Audit Reconstruction** | Kim ne zaman ne yaptı? | `occurred_at` + `recorded_at` (her ikisi) | Mahkeme kanıt zinciri, KVKK denetimi |
| **Operational Debug** | Sistemde ne zaman ne oldu? | `recorded_at` | Hata ayıklama, performans analizi |

### Mode Karıştırma Yasak

Calculator imzasına `asOf` parametresi zorunlu (`00-architecture.md` HR-1). `asOf` ile `recorded_at` aynı şeymiş gibi davranılması yasak — bunlar **farklı sorulara** cevap veriyor.

---

## 4. occurred_at ≠ recorded_at

### Niye Önemli

| Senaryo | occurred_at | recorded_at | Kritik |
|---|---|---|---|
| Avukat dün ödeme aldı, bugün sisteme girdi | 2026-05-15 | 2026-05-17 | Faiz hesabında **occurred_at**; replay sırasında **recorded_at** |
| Banka geçen ay havale yaptı, bu ay rapor etti | 2026-04-15 | 2026-05-15 | Aynı şekilde |
| Migration'dan eski veri yüklendi | 2024-03-01 | 2026-05-19 | Replay düzeni recorded_at; hukuki gerçek occurred_at |

### Pratik Kural

- **Faiz hesabı:** `occurred_at` kullanılır (ödeme gerçek zamanına göre faiz işler/durur)
- **TBK 100 mahsup sırası (eşitlik halinde):** `occurred_at` kullanılır (hangisi daha önce gerçekleşti)
- **Replay determinism:** `recorded_at` kullanılır (sistem hangi sırayla kayıt aldı)
- **Aggregate version increment:** `recorded_at` ile sıralı (monotonic + gap-free)

### Tutarsızlık Senaryosu

Eğer iki ödeme aynı `occurred_at`'e sahipse ama farklı `recorded_at` ile geldiyse:
- Faiz hesabında pro-rata veya `occurred_at` + ek tie-breaker (event_id ascending) ile sıralanır
- Replay'de `recorded_at` sırası izlenir (deterministik)

Bu kural **AllocationPolicy** içinde `ties` field'ında belirtilir (06 belgesinde tanımlandı).

### occurred_at Source Confidence

`occurred_at` çoğu zaman dış kaynaktan gelir (banka, UYAP, PTT, avukat). **Bu tarih gerçekten doğrulanmış mı?** sorusu replay/audit sırasında kritik olur.

Event header'a yeni alan:

```typescript
{
  ...header
  occurred_at: ISO8601
  occurred_at_confidence: 'SYSTEM_VERIFIED' | 'EXTERNAL_SIGNED' | 'USER_DECLARED'
  occurred_at_evidence?: string   // EXTERNAL_SIGNED için evidence ref (örn UYAP barcode, banka transaction ID)
  ...
}
```

| Confidence | Anlam | Örnek |
|---|---|---|
| `SYSTEM_VERIFIED` | Sistem kendi tarafından doğruladı | Sistem bir şey otomatik yaptı (örn cron job tetikledi) |
| `EXTERNAL_SIGNED` | Dış sistemden cryptographic/audit-grade kanıt geldi | UYAP'ın imzalı timestamp'i, banka resmi havale onayı, PTT barkod scan |
| `USER_DECLARED` | Avukat manuel girdi, sistem doğrulayamıyor | "Müvekkil dedi ki dün ödedi" — sözle beyan |

### Pratik Sonuçlar

- **Bilirkişi raporunda:** `USER_DECLARED` tarihler **ayrı işaretlenir**, `EXTERNAL_SIGNED` tarihlerle aynı güçte sayılmaz
- **Mahkemede:** "Bu tarih nereden biliniyor?" sorusu confidence + evidence alanlarıyla cevaplanır
- **Replay validator:** Confidence düşükse audit warning üretir
- **TBK 100 mahsup tie-breaker:** Aynı occurred_at'te confidence farkı varsa, EXTERNAL_SIGNED öncelik kazanır

Faz 1'de default değer: `USER_DECLARED` (avukat manuel giriş varsayımı). UYAP/banka adapter'ları geldiğinde `EXTERNAL_SIGNED` set edecek.

---

## 5. effective_from ≠ recorded_at

### Niye Önemli

`effective_from` retroactive olabilir — bir kuralın geriye dönük uygulanması.

| Senaryo | recorded_at | effective_from |
|---|---|---|
| Yeni interpretation profile (TBK100_v2) bugün tanımlandı, 1 Ocak 2025'ten itibaren uygulanacak | 2026-05-19 | 2025-01-01 |
| Akdi faiz override sözleşme baştan beri vardı, sonradan kayıt edildi | 2026-05-19 | 2024-03-15 |
| Mahkeme kararıyla yorum değişimi geçen yılbaşına etkili | 2026-05-19 | 2025-01-01 |

### Pratik Kural

- **`INTEREST_POLICY_ASSIGNED.payload.effective_from`** geriye dönük olabilir. Sistem replay'de bu tarihten sonraki hesapları yeniden yapar.
- **`recorded_at`** her zaman bugün (artık bilgi).
- Aynı policy birden fazla `effective_from` ile atanırsa (yorum değişimi), her birinin kendi event'i var, `caused_by` zinciri çözümler.

### Retroactive Recalc Sınırı

Bir `effective_from` retroactive olursa **balance projection** yeniden hesaplanır. Ama:

- **`PAYMENT_RECEIVED` event'leri silinmez** — onlar legal facts (immutable).
- **Allocation projection** yeniden hesaplanır (yeni policy ile).
- **Past reports / sealed artifacts** eski hesaba göre kalır (write-once seal).

Yani: yeni yorum eski olayların etkisini değiştirir, ama eski olayların kendisini değiştirmez.

### Retroactive Guard (Hard Rule)

> **`effective_from` may not precede the earliest legally relevant event without explicit override authorization.**

Retroactive izin verilir, **ama serbest değil.** Sınırlar:

| Kontrol | Davranış |
|---|---|
| `effective_from < earliest_event.occurred_at` | **Default deny.** Avukat override authorization vermek zorunda. |
| Override authorization | Event payload'a `retroactive_override: { authorized_by: UUID, authorization_reason: string, references: string[] }` eklenir |
| Audit | Replay validator `is_retroactive: true` flag'ini set eder + `retroactive_distance: number` (kaç gün geriye) ölçer |
| Aşırı retroactive | `retroactive_distance > 365 gün` → ayrı warning, ek onay gerekir (örn senior avukat / partner sign-off) |

Pratik örnek:

```
Bugün:    2026-05-19
Profile yaratılıyor:
  effective_from: 2022-03-15  ← çok geriye

Sistem davranışı:
  1. Earliest case event: 2024-01-10
  2. effective_from < 2024-01-10 → retroactive_override ZORUNLU
  3. Avukat reasoning + references zorunlu doldurmalı
  4. retroactive_distance = ~3 yıl → ek onay warning
  5. Replay validator: is_retroactive=true flag, retroactive_distance kaydı
```

**Niye:** "2026'da profile yarat, 2022'ye effective_from ver" → çok büyük hukuki etki. Audit zinciri olmadan replay sonsuz kabuk değişir. Override authorization mahkeme/audit'te savunulabilir kanıt zinciri sağlar.

---

## 6. asOf Replay Zamanı Değil

Bu en sık karıştırılan ayrım. Açıkça yaz:

| Soru | Hangi Zaman |
|---|---|
| "Bugün bakiye ne?" | `asOf = now()` |
| "30 Nisan 2026'da bakiye ne idi?" | `asOf = '2026-04-30'` (geçmişe bakış) |
| "Sistem hangi event'leri biliyordu?" | `recorded_at <= '2026-04-30'` filtreli replay |

### asOf vs recorded_at — Pratik Senaryo

Mahkeme bilirkişisi diyor: "30 Nisan 2026 tarihindeki bakiyeyi raporlayın."

İki farklı yorum:

**Yorum A: Bugünün event'leriyle, 30 Nisan'a bakış**  
`asOf = '2026-04-30'`, replay = tüm event'ler (bugüne kadar yazılmış olanlar dahil)  
→ "Bugün bildiğimize göre, o tarihte bakiye X idi."

**Yorum B: O tarih itibariyle sistemin bildikleriyle**  
`asOf = '2026-04-30'`, replay = sadece `recorded_at <= '2026-04-30'` event'ler  
→ "O tarihte sistem ne biliyordu, ne hesaplardı."

Bu ikisi farklı sayılar verebilir (geriye dönük girilen ödemeler farkı oluşturur).

**Hangi yorum doğru?** Mahkemenin sorusuna göre değişir. Sistem **her ikisini de desteklemeli**:

```
computeBalance(events, refData, asOf, profileId, replayMode)
  replayMode: 'RECONSTRUCTED_VIEW' | 'CONTEMPORANEOUS_VIEW'
  
  RECONSTRUCTED_VIEW (default): tüm event'ler dahil, asOf occurred_at filtreli
    → "Bugün bildiğimize göre, o tarihte bakiye X idi" (geçmişe bugünkü bakış)
    
  CONTEMPORANEOUS_VIEW: recorded_at <= asOf, asOf occurred_at filtreli
    → "O tarihte sistem ne biliyordu, ne hesaplardı" (o anın bilgisiyle bakış)
```

Bu Faz 1'de **default `RECONSTRUCTED_VIEW`** kabul edilir. `CONTEMPORANEOUS_VIEW` modu için ek implementation Faz 2'de.

### İsimlendirme Notu

İsimler hukuki anlamı netleştirmek için seçildi:
- **RECONSTRUCTED_VIEW**: Bugünden geriye bakarak yeniden inşa edilmiş görünüm
- **CONTEMPORANEOUS_VIEW**: Olayla aynı zamanda var olan (eş-zamanlı) görünüm

Önceki taslakta `CURRENT_KNOWLEDGE` / `HISTORICAL_KNOWLEDGE` isimleri vardı — semantik olarak doğru ama hukukçu olmayan geliştirici için bulanık olabiliyordu. Yeni isimler hem geliştiriciye hem hukuki context'e net.

---

## 7. Retroactive Recalculation — Kritik Disiplin

### Soru

> **Does historical balance change?**

Yeni TCMB oranı geldi. Yeni interpretation profile aktive edildi. Yeni effective_from geriye etkili. **Geçmiş bakiye değişir mi?**

### İki Mode

| Mode | Anlam | Ne zaman kullanılır |
|---|---|---|
| **Historical Truth (frozen)** | Geçmiş sonuç değiştirilmez | Sealed artifacts (gönderilmiş raporlar, mahkemeye sunulmuş hesaplar) |
| **Current Interpretation (live)** | Bugünkü yoruma göre yeniden hesaplar | Aktif ekran, anlık bakiye, devam eden takip için faiz |

### Pratik Sonuçlar

**Sealed:** Mahkemeye 1 Şubat 2026'da sunduğun bilirkişi raporu **yeniden hesaplanmaz**. Hash zincirinde bütünlük korunur. "O tarihte sistem bunu hesaplamıştı" kanıtı kalır.

**Live:** Bugün ekrana açtığın aktif takipte, yeni TCMB oranı geldikten sonra bakiye **bugünkü yorumla** gösterilir. Avukat farkı görür: "Eski hesap X, yeni hesap Y."

**Audit Trail:** Aynı event stream + aynı asOf + farklı profile_id = farklı sonuç. Profile_id'nin event payload'ında olması bu ayrımı mümkün kılar.

### Kural

> **`SimulationSnapshot` write-once. Aynı `calcHash` aynı sonuç.**  
> **Yeni snapshot = yeni event veya yeni profile.**

> **Sealed artifacts must persist the exact `asOf` and interpretation context used during generation.**

İkinci cümle anayasal seviyede: bir bilirkişi raporu / mahkemeye sunulmuş hesap / sealed bundle üretildiğinde, **o sonucu üreten tüm parametreler** snapshot'a yazılır:

| Persistent Context | Niye |
|---|---|
| `asOf` | Hangi tarih için hesaplandı |
| `replay_mode` | RECONSTRUCTED_VIEW veya CONTEMPORANEOUS_VIEW |
| `interpretation_profile_id` | Hangi yorum profile'ı |
| `allocation_policy_id` | Hangi TBK 100 varyantı |
| `rate_table_version_hash` | TCMB tablosunun o anki hash'i |
| `engine_version` + `rule_version` | Calculator versiyonu |
| `event_log_cutoff` | `recorded_at <= X` (eğer HISTORICAL replay) |
| `input_hash` | Tüm girdilerin canonical hash'i |
| `output_hash` | Sonucun canonical hash'i (calc_hash) |

**Niye kritik:** Aksi takdirde:
- Bugün aynı raporu tekrar üretmeye çalışırsın
- Farklı sayı çıkar (yeni event girmiş, profile değişmiş, vs.)
- "Niye farklı?" sorusunun cevabı yok
- Audit zinciri kopar

Mevcut altyapı zaten bunu zorluyor (`SimulationSnapshot` Prisma modeli + `calcHash` UNIQUE + `bundle_seal_event` write-once trigger). Bu belge sadece **anayasal kural** olarak kayıt altına alıyor.

### Mevcut Altyapı Eşlemesi

| Anayasal Kural | Mevcut Implementation |
|---|---|
| Sealed artifact context persistence | `SimulationSnapshot` Prisma model + `calc_hash` UNIQUE |
| Write-once seal | `bundle_seal_event` Prisma model + INSERT trigger |
| Replay determinism | `determinism.ts` canonical JSON + SHA-256 |
| Event store immutability | `IcrabotTimelineEntry` + `IcrabotFactAudit` (append-only) |

Implementation Faz 1'de mevcut, sadece formalize ediliyor.

---

## 8. Day Count Basis

Faz 1'de iki canonical day count basis:

| Basis | Anlam | Tipik Kullanım |
|---|---|---|
| **365** | Actual/365 — gerçek gün sayısı | TCMB avans, kanuni faiz, çoğu ticari uygulama |
| **360** | Actual/360 — banka konvansiyonu | Bazı sözleşmeler, yabancı kaynak hesaplama |

`INTEREST_POLICY_ASSIGNED.payload.day_count_basis` zorunlu, freeze.

### Compounding

`compounding_rule`: `'NONE' | 'ANNUAL' | 'CUSTOM'`

- `NONE`: Basit faiz (default Türk uygulaması)
- `ANNUAL`: Yıllık bileşik (nadir)
- `CUSTOM`: Özel kural (Faz 2 — sözleşmesel override için)

Bu Faz 1'de değişmez kalır. Faz 2'de daha karmaşık compounding patterns değerlendirilir.

---

## 9. Adli Tatil — Placeholder

> **Faz 1'de tam adli tatil engine'i yazılmaz.**  
> **Sadece semantic placeholder tanımlanır.**

### Niye

Adli tatil (20 Temmuz - 31 Ağustos) genelde **sürelerle** ilgilidir (tebligat süreleri, itiraz süreleri, dilekçe süreleri). Money Truth Kernel'in başarı kriteri (deterministik bakiye) **doğrudan etkilenmez** — faiz takvim günü işler, adli tatilde durmaz.

### Faz 1 Placeholder

`INTEREST_POLICY_ASSIGNED.payload`'a (gelecek için) eklenecek alanlar — şimdi opsiyonel, Faz 2'de kullanılır:

```typescript
{
  ...
  legal_calendar_provider?: 'TR_DEFAULT' | 'TR_NO_HOLIDAY' | 'CUSTOM'
  business_day_rule?: 'CALENDAR' | 'BUSINESS' | 'BUSINESS_AWARE'
  holiday_strategy?: 'IGNORE' | 'SUSPEND_INTEREST' | 'EXTEND_DEADLINE'
}
```

Faz 1'de hepsi default kabul edilir:
- `legal_calendar_provider: 'TR_DEFAULT'` (sadece tarih saymak için, faiz hesabı etkilenmez)
- `business_day_rule: 'CALENDAR'` (takvim günü)
- `holiday_strategy: 'IGNORE'` (faiz adli tatilde durmaz)

### Faz 2 Genişlemesi

Tebligat domain'i geldiğinde (Faz 2):
- Tebligat süreleri adli tatilde durur (`holiday_strategy: 'EXTEND_DEADLINE'`)
- İtiraz süreleri farklı kuralla (5 gün kambiyo, 7 gün ilamsız)
- Resmi tatil + adli tatil ayrımı

Faz 2'de `09a-temporal-deadlines.md` gibi ek bir belge yazılır. Bu Faz 1'de **deferred** (`90-future-work/deferred/legal-calendar-engine.md` olarak işaretlenecek).

---

## 10. Event Header Temporal Field'ları (07 ile uyum)

`07-event-taxonomy-v1.md` Common Header'da:

```typescript
{
  occurred_at: ISO8601    // wall-clock event time (avukat ne zaman yaptı)
  recorded_at: ISO8601    // insert time (DB'ye ne zaman yazıldı)
  ...
}
```

Bu belge ile uyum:

- **`occurred_at` opsiyonel mi zorunlu mu?** Zorunlu. Bilinmiyorsa default `recorded_at` ile aynı yazılır + `occurred_at_estimated: true` flag'i. (Migration verileri için.)
- **`recorded_at` her zaman DB tarafından set edilir** (server timestamp), client tarafından sağlanamaz.
- **`effective_from` event payload'ında** opsiyonel. Verilmezse `effective_from = occurred_at` varsayılır.
- **`asOf` event'te yok** — calculator parametresi (replay/projection bağlamı).

### Tarih Alanları İçin Format

- ISO 8601 zorunlu: `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC) veya `YYYY-MM-DDTHH:mm:ss±hh:mm` (offset)
- Sadece tarih (saat yok) gereken yerde: `YYYY-MM-DD` (örn `start_date`, `effective_from`)
- Türkiye zaman dilimi: `+03:00` (DST yok, sabit)

---

## 11. Bu Belgenin Kapsamı Dışı

- Generic timezone library (Faz 2 ihtiyacı varsa, ayrı belge)
- Tam adli tatil engine (Faz 2)
- İş günü hesaplaması algoritması (Faz 2)
- Tebligat süresi hesaplaması (Faz 2)
- Day count basis 30/360 / 30E/360 / Actual/Actual (Faz 1'de sadece 365 ve 360)
- Multi-region timezone handling (rejected — `90-future-work/rejected/`)

---

## 12. Hard Rules (Temporal Disiplini)

(00-architecture.md Hard Rules'a eklenir)

**HR-29 (yeni):** `recorded_at` server-side set edilir, client tarafından override edilemez. CI gate event ingestion'da bunu kontrol eder.

**HR-30 (yeni):** Calculator imzasında `asOf` parametresi zorunlu (HR-1 ile uyumlu — pekiştirir). `asOf` çağrıda `recorded_at` ile karıştırılırsa runtime hata.

**HR-31 (yeni):** `effective_from < recorded_at` (retroactive) durumlarda audit log'da `is_retroactive: true` işaretlenir. Replay validator bu flag'i tespit eder.

**HR-32 (yeni):** Sealed artifacts (mahkemeye sunulmuş raporlar, write-once snapshots) **retroactive recalc'tan etkilenmez**. Bütünlük hash zinciriyle korunur.

**HR-33 (yeni):** `effective_from` earliest legally relevant event'ten önce ise (retroactive past), event payload'da `retroactive_override` zorunlu. `authorized_by` (user UUID), `authorization_reason` (string), `references` (kanıt linkleri) hepsi zorunlu. Olmadan event kabul edilmez.

**HR-34 (yeni):** Event header'a `occurred_at_confidence` zorunlu (`SYSTEM_VERIFIED` | `EXTERNAL_SIGNED` | `USER_DECLARED`). `EXTERNAL_SIGNED` için `occurred_at_evidence` referansı zorunlu (UYAP barkod, banka transaction ID, vs.).

**HR-35 (yeni):** Sealed artifact üretiminde `asOf`, `replay_mode`, `interpretation_profile_id`, `allocation_policy_id`, `rate_table_version_hash`, `engine_version`, `rule_version`, `event_log_cutoff`, `input_hash`, `output_hash` snapshot'a yazılır. Aksi halde reproduction kanıtı kaybolur — sealed artifact kabul edilmez.

---

## 13. DoD

- [x] Anayasal cümle: "Replay uses recorded truth, calculation uses asOf truth, legal interpretation uses effective truth"
- [x] **Yeni anayasal cümle:** "Sealed artifacts must persist the exact asOf and interpretation context used during generation"
- [x] 4 temporal kavram (occurred_at, recorded_at, effective_from, asOf) tablosu
- [x] 5 Temporal Truth Mode (Replay, Legal Interpretation, Calculation, Audit, Debug)
- [x] occurred_at ≠ recorded_at ayrımı + pratik kurallar
- [x] **occurred_at source confidence** (SYSTEM_VERIFIED / EXTERNAL_SIGNED / USER_DECLARED) + evidence reference
- [x] effective_from ≠ recorded_at ayrımı + retroactive policy
- [x] **Retroactive guard:** `effective_from` earliest event'ten önceyse override authorization zorunlu
- [x] asOf replay zamanı değil — `replayMode` parametresi
- [x] **replayMode adları netleştirildi:** RECONSTRUCTED_VIEW / CONTEMPORANEOUS_VIEW (önceki CURRENT/HISTORICAL_KNOWLEDGE yerine)
- [x] Retroactive recalculation: Historical Truth (frozen) vs Current Interpretation (live)
- [x] **Sealed artifact context persistence** (anayasal kural + 10 alanlık checklist)
- [x] Day count basis (365/360) + compounding placeholder
- [x] Adli tatil — Faz 1'de placeholder, Faz 2'de tam engine
- [x] 07 event header alanlarıyla uyum
- [x] **Mevcut altyapı eşlemesi** (SimulationSnapshot, bundle_seal_event, determinism.ts, IcrabotTimelineEntry)
- [x] 7 yeni Hard Rule (HR-29..35)
- [x] **ulas onayı (2026-05-19)**

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

---

## 14. Sıradaki Adım

İmza sonrası → `10-implicit-rules.md`. Senin verdiğin kritik not:

> Implicit rules document **hidden invariant mezarlığı** olmamalı.  
> Sadece event taxonomy/aggregate'ta temizce ifade edilemeyenler.  
> "Business convenience" kuralları girmesin.

Bu disiplin korunacak. 10'da sadece edge-case'ler — örnek: "INSTRUMENT_REGISTERED'da `due_date` `draw_date`'ten önce olamaz" gibi cross-field kurallar.

Sonra `11-domain-event-bridge.md`:
> Yeni event bus mimarisi değil, **transaction discipline** belgesi olmalı.  
> "Event ne zaman emit edilir? Before commit? After commit? Outbox-backed? Retry semantics?"

Bunlar 11'in omurgası olur.
