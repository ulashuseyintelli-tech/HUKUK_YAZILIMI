# A1 — Kambiyo İlişki & Müracaat Motoru — Uygulama Planı (Faz 0–5)

> **Durum:** PLAN (uygulama sırası) · **Kod / şema / migration / PR YOK** · **Tarih:** 2026-06-22 · **Karar:** ulas
> **Bu doküman HOW / SIRA'dır.** WHAT / WHY (kilitli kararlar) şu tasarımlarda — burada **TEKRARLANMAZ** (AGENTS.md anti-tekrar):
> - `ocr-draft-architecture.md` **§5** (Kambiyo İlişki Motoru veri-modeli) + **§5.0 A1-V1 kavram sözleşmesi** (`payeeName ≠ holderName ≠ clientMatch`; K1–K8; taksonomi; V2 manuel zincir; V3 müracaat) — ✅ Onaylı (Ulaş, 2026-06-21)
> - `a1-client-anchoring-design.md` — A1-a/b ✅ MERGED (#361), A1-c **kilitli (güvenli mod)**, **A1-d (ciro sırası) HOLD**
> - `case-instrument-canonical-design.md` — `CaseInstrument` = evrak (kanonik); `endorsers Json? / avals Json?` zaten alan
> - `party-registry-design.md` (→ Faz 4) · `fatura-engine-design.md` G3 (→ Faz 5)

---

## 0. Ana ilke (gevşetilemez)

**A1 motoru OCR'ın doğruluğuna değil, AVUKATIN doğrulamasına dayanır.**
(= §5.0 **K1/K5/K8**: OCR/clientMatch = aday/sinyal, **`CaseDebtor`/`CaseParty` YARATMAZ**; insan onayı zorunlu; sert blok yok — OCR başarısızsa **manuel zincir** kurulabilir.)

---

## 1. Bu konuşmada KRİSTALİZE olan 3 katkı (tasarımı genişletir, çelişmez)

1. **Provenance damgası** — her zincir düğümü/kenarı `{ source: MANUAL | OCR | XML, confidence: 0..1, verifiedBy?, verifiedAt? }` taşır.
   → §5'teki **"sıra = kenarın özelliği"** ilkesini ve onaylı **A2 köken (origin)** kararını zincir modeline somut hâle getirir. MANUEL kenar = otoriter; OCR kenarı = düşük-güven aday (review).
2. **Migration'sız motor** — Faz 2 motoru mevcut `CaseInstrument.endorsers/avals Json` **üstünde** hesaplar; **YENİ TABLO YOK**. Tek çekin zinciri tek enstrümanın içindedir → bellek-içi graf yeter. Normalize yapısal graf (çapraz-dava "aynı Gorka mı") **Faz 4 Party Registry**'e ertelenir. (= canonical-design **AS3** açık sorusunun **ara çözümü**.)
3. **Minimal manuel zincir-kurucu UI** — §5 **V2 (manuel zincir)** kavramını Faz 2'de **somut UI** olarak gönderiyoruz; kâğıtta bırakmıyoruz. (Karar **D-A**.)

---

## 2. Terim eşlemesi — TEK sözlük (bundan sonra bunu kullanırız)

| Bu konuşma (geçici ad) | Kilitli karşılık | Not |
|---|---|---|
| Faz 0 — InstrumentChain kontratı | §5.0 kavram sözleşmesi + §5 taksonomi (`EndorsedTo`/`Aval` kenar; sıra = kenar özelliği) | genişletir/kristalize |
| Faz 1 — payee wiring + JSON doldur | **A1-V1a** (ön-yüz `clientMatch`) + `endorsers/avals Json` popülasyonu | payee = **DOĞRULA** (güvenilmez; §5.0 K2) |
| Faz 2 — motor + manuel UI | §5 **V2** (manuel zincir) + **holder** tespiti + **V3** müracaat | ChainPosition = **MANUEL**; OCR-sıra (A1-d) **HOLD** |
| Faz 3 — OCR arka yüz | **A1-V1b** (arka-yüz holder/endorsement isim çıkarımı; **K7 "asıl yatırım"**) | Gorka/Şükrü'yü çözen iş |
| Faz 4 — Party Registry | `party-registry-design.md` Faz 0 | `partyId` slotunu doldurur; JSON → normalize |
| Faz 5 — XML ingest | `fatura-engine-design.md` **G3** (e-fatura UBL-TR) + **A3 ölçüm** kapısı | **UYAP-import beklet** |

**A1-d uzlaşması:** Faz 2'de **pozisyon MANUEL gelir** (avukat zinciri sıralar) ya da **bilinmiyor** kalır. OCR'dan otomatik sıra çıkarımı (**A1-d**) **HOLD** kalır (arka-yüz OCR sırası güvenilmez). Müracaat kümesi **yalnız pozisyon biliniyorsa** hesaplanır; bilinmiyorsa `needsReview`.

---

## 3. InstrumentChain veri kontratı (Faz 0 — kavram; DDL/şema DEĞİL)

```
InstrumentChain            // CaseInstrument başına; genişletilmiş endorsers/avals Json'da yaşar
  nodes: InstrumentParty[]
    role:     DRAWER | PAYEE | ENDORSER | AVALIST | HOLDER(hesaplanır)
    party:    { name, identityNo?, type, partyId?(Faz 4 slotu) }
    position: int | null   // DRAWER=0, PAYEE=1, ENDORSER 1..n; bilinmiyorsa null
    source/confidence/verifiedBy?/verifiedAt?     // provenance (madde 1.1)
  edges
    endorsements: { fromPos, toPos, type: FULL | WHITE, ...provenance }
    avals:        { avalistNode, guaranteesNode (varsayılan = DRAWER), amount?, ...provenance }
  holder:   hesaplanır     // ciro yoksa = lehtar; varsa = son cironun lehdarı; son ciro WHITE → zilyetlik (işaretli)
  recourse(holder = müvekkil): keşideci + müvekkilden ÖNCEKİ düğümler + onların avalistleri  // V3, Av. onayı
```

**Beyaz ciro:** ayrı boolean değil → `edge.type = WHITE`. Holder hesabını besler (zilyetlikle hamil). (§5.0 ile uyumlu.)
**clientMatch (read-model, §5.0 K4):** `{ found, location: FRONT_PAYEE|FRONT_DRAWER|ENDORSEMENT|NOT_FOUND, matchedField, confidence, evidence }` — otorite kayıt değil; yeniden hesaplanır. Mevcut `client-match.ts` (`computeClientMatch`) **REUSE**.

---

## 4. Faz planı (sıra · kapsam · reuse · etki · kapı · OUT)

> **Açılış uzlaşması:** `ocr-draft §sonraki-adım` onaylı kararı = **"ilk kod = A2 köken + A3 ölçüm"**. Bunu koruyoruz:
> **A3 ölçüm (= karar D-B)** ucuz + onaylı → **Faz 0 ile PARALEL açılışta** koşar. **A2 köken** = Faz 0/1 provenance damgası olarak zaten içeride.

- **Faz 0 — InstrumentChain kontratı** (kağıt + tip): yukarıdaki şekil kilitlenir. Üreten (Faz 1/3) ve tüketen (Faz 2) **aynı şekli** hedefler. *Reuse:* §5.0 + taksonomi. *OUT:* DDL, migration, UI.
  - **∥ A3/D-B ölçüm:** son X belgenin gerçek format dağılımı (PDF-scan / PDF-text / XML-UBL / image / other) — salt metrik, Faz 5'ten **bağımsız**. Düşük XML → G3 bekler; anlamlı XML → e-fatura import ayrı track.
- **Faz 1 — payee wiring doğrula + `endorsers/avals Json` doldur** (kontrata göre; beyaz ciro = `WHITE` kenar). *Önce:* payee uçtan-uca bağlı mı **spot-check** (backend `Instrument` tipi vs DB `payeeName` tutarsızlığı). *Reuse:* A1-V1a, `detectPayeeMismatch`, `normalizePersonName`. *Etki:* OCR sonuç DTO + `CaseInstrument` yazımı (transient→persist); **CaseDebtor YARATMAZ**. *Risk:* düşük.
- **Faz 2 — Kambiyo İlişki & Müracaat Motoru (migration'sız) + minimal manuel zincir UI.** Holder + ChainPosition(manuel) + Aval relation + Recourse. Mevcut `endorsers/avals Json` üstünde. Çıktı: rol + güven + hukuki dayanak + **aday** müracaat borçluları (**aday-only**, avukat onaylar). *Kapı:* **V3 müracaat kuralı Av. sign-off** (madde 6). *OUT:* otomatik borçlu, A1-d OCR-sıra, Party Registry yazımı.
- **Faz 3 — OCR arka-yüz zenginleştirme** (**A1-V1b**): holder/endorsement isim + aval/kaşe/imza/konumsal sıra ipuçları → kontrata `source=OCR, low-confidence` besler. Gorka/Şükrü'yü çözen iş (K7). *Kapı:* canlı-OCR veri kalitesi.
- **Faz 4 — Party Registry** (`party-registry-design.md`): `partyId` doldurur; JSON → normalize ilişki; "aynı Gorka mı". *Kapı:* gerçek veri hacmi + Av. sign-off (Faz 0 zaten gated).
- **Faz 5 — XML ingest** (e-fatura UBL-TR, G3). *Kapı:* **A3 ölçümü** anlamlı XML oranı gösterirse. **UYAP icra-dosyası import beklet** (karmaşık, örnek-veri-gated).

---

## 5. Bu oturumda kilitlenen kararlar

- **D-A ✅** — Faz 2'ye **minimal manuel zincir-kurucu UI dahil** (satır: ad · rol · sıra · kaynak · güven · onay). Otomatik borçlu yok; yalnız aday müracaat listesi (keşideci + müvekkilden önceki cirantalar + avalistler); avukat onaylar.
- **D-B ✅** — Intake format oranı **ölçülecek** (Faz 5'ten bağımsız metrik).

## 6. Açık hukuki kapı (Faz 2'den ÖNCE)

**V3 müracaat kuralı** = Av. sign-off: müteselsil sorumluluk kümesi + **aval varsayılanı** (TTK: kimin için belirsizse keşideci). `recourse()` bu onay gelmeden **otoriter hüküm üretmez** (yalnız aday/`needsReview`).

## 7. Etki alanı (AGENTS.md — ön bildirim)

- Faz 1/2 kod yazımında değişecek metotların `/// <remarks> Çağrıldığı yerler:` listesi güncellenecek.
- Multitenant: tüm yeni okuma/yazma `tenantId` kapsamında (CaseInstrument zaten tenant-scoped).
- `endorsers/avals Json` şeklini değiştirmek → onu OKUYAN/yazan tüm yerler taranacak (Faz 0 kontratı bu yüzden önce).
