---
status: active
review-trigger: "Faz 1 imzasına kadar — sprint sonu"
---

# Implicit Rules

**Tarih:** 2026-05-19  
**Durum:** Active — vocabulary freeze 6. (sondan bir önceki) belgesi  
**Bağlam:** Event taxonomy (`07`), causality (`08`), temporal semantics (`09`) imzalandı. Geriye **formal modelde ifade edilemeyen** edge-case'ler kaldı.

---

## 0. Anayasal Açılış

> **Implicit rules exist only when the rule cannot be modeled cleanly as:**
> - **event taxonomy**,
> - **aggregate invariant**,
> - **causality constraint**, or
> - **temporal semantic**.

Bu cümle bu belgenin tek koruyucu prensibidir.

### Bu Belgenin NE OLMADIĞI

10 **çöp belgesi değildir**. Aşağıdakiler **kesinlikle reddedilir**:

- ❌ UX convenience kuralları
- ❌ Dashboard behavior tercihleri
- ❌ UI validation kuralları
- ❌ API ergonomics
- ❌ Operational preferences ("genelde böyle yapıyoruz")
- ❌ "Nereye koyacağımızı bilemedik" fallback logic
- ❌ Hidden invariant mezarlığı

10 sadece **what subtle constraints still exist outside the formal model?** sorusunu cevaplar.

---

## 1. Mandatory Filter (her rule için zorunlu)

Bir implicit rule eklenmeden önce **dört soruya cevap verilmeli**. Cevaplarsız rule kabul edilmez.

```yaml
rule_id: <kısa-açıklayıcı-isim>
why_not_event_taxonomy: <neden 07'ye ait değil>
why_not_aggregate_invariant: <neden 06'ya ait değil>
why_not_causality_rule: <neden 08'e ait değil>
why_not_temporal_semantic: <neden 09'a ait değil>
category: AUDIT_SAFETY | REPLAY_SAFETY | HUMAN_WORKFLOW | LEGAL_EDGE_CASE | INTEGRATION_AMBIGUITY
description: <kuralın somut tanımı>
trigger: <ne zaman devreye girer>
behavior: <ne yapar>
override_path: <kullanıcı override edebilir mi, nasıl>
```

Bu filtre **CI gate** ile zorlanır — eksik field'lı rule kabul edilmez.

---

## 2. Categories

5 kategori. Bu kategoriler dışında implicit rule **kabul edilmez**.

| Category | Anlam |
|---|---|
| **AUDIT_SAFETY** | Audit zincirinin korunması için pratik gereklilik |
| **REPLAY_SAFETY** | Event log replay'in deterministik kalması için ek koşul |
| **HUMAN_WORKFLOW** | İnsan kararı sürecinde erken uyarı / review trigger |
| **LEGAL_EDGE_CASE** | Hukuk pratiğinde nadir ama gerçek edge-case |
| **INTEGRATION_AMBIGUITY** | Dış sistem entegrasyonunda belirsiz durum yönetimi |

---

## 3. Active Implicit Rules (Faz 1)

### IR-001 — Same-Day Reverse + Re-Receive Pattern

```yaml
rule_id: same-day-reverse-reentry-review
category: HUMAN_WORKFLOW
description: |
  Aynı gün içinde aynı case için PAYMENT_REVERSED + yeni PAYMENT_RECEIVED 
  pattern'i tespit edilirse insan review tetiklenir.
trigger: |
  Bir case'de aynı 24 saat içinde:
  - 1+ PAYMENT_REVERSED, ardından
  - 1+ PAYMENT_RECEIVED (reverse_amount + new_amount eşit veya yakın)
behavior: |
  - Event'ler kayıt edilir (engellenmez)
  - Avukata bildirim: "Aynı gün ters kayıt + yeni ödeme. İnceleme önerilir."
  - Dashboard'da flag işaretlenir
  - Audit log'a 'pattern_detected: same-day-reverse-reentry' yazılır
override_path: Avukat "incelendi, normal" işaretler — review flag temizlenir.

why_not_event_taxonomy: |
  Pattern bir event değil, iki event'in zamansal kombinasyonu.
  Tek event'in payload'ı bunu ifade edemez.
why_not_aggregate_invariant: |
  Invariant değil — engellenmesi gereken bir durum yok.
  Geçerli bir hukuki düzeltme deseni olabilir (banka iadesi sonrası
  doğru tutarda yeni havale).
why_not_causality_rule: |
  Causality forbidden chain değil — pattern legal.
  caused_by zinciri kullanılsa bile "yasak" diyemeyiz.
why_not_temporal_semantic: |
  Temporal kavramların (occurred_at, recorded_at) tanımıyla ifade edilemiyor —
  bu bir DAVRANIŞSAL pattern, zaman ekseninde bir kavram değil.
```

### IR-002 — Retroactive Correction After Sealed Artifact

```yaml
rule_id: retroactive-after-sealed-warning
category: AUDIT_SAFETY
description: |
  Bir case'in sealed artifact'i (mahkemeye sunulmuş bilirkişi raporu,
  write-once snapshot) üretildikten sonra retroactive bir event 
  (effective_from < sealed_artifact.asOf) gelirse warning üretilir.
trigger: |
  Yeni event'in effective_from'u, herhangi bir mevcut sealed artifact'in
  asOf değerinden önce ise.
behavior: |
  - Event kayıt edilir (HR-32 sealed artifact recalc'tan etkilenmez)
  - Audit log'a 'sealed_artifact_predates_correction: true' yazılır
  - Avukata bildirim: "Mahkemeye sunulmuş rapor sonrası geriye dönük 
    düzeltme yaptınız. Mahkeme/karşı taraf bilgilendirme gerekebilir."
  - Sealed artifact'a "subsequent retroactive event recorded" not eklenir
    (artifact'in kendisi değişmez, ama context'i güncellenebilir)
override_path: Avukat reasoning girer — bildirim arşivlenir.

why_not_event_taxonomy: |
  Event tipi değil, mevcut event'in başka bir referans noktasıyla
  zamansal ilişkisi. Event payload'ında ifade edilemez.
why_not_aggregate_invariant: |
  Engellenmemeli — geçerli düzeltme. Invariant yapılırsa hukuki 
  düzeltmeler sistemi kilitler.
why_not_causality_rule: |
  Forbidden chain değil. Causality izinli, sadece warning gerekli.
why_not_temporal_semantic: |
  Temporal disipline retroactive guard zaten var (HR-33).
  Bu kural ondan SONRA gelir — sealed artifact spesifik audit notu.
```

### IR-003 — Duplicate Bank Reference Quarantine

```yaml
rule_id: duplicate-bank-reference-quarantine
category: INTEGRATION_AMBIGUITY
description: |
  Banka entegrasyonundan gelen bir PAYMENT_RECEIVED'ın bank_reference'ı
  daha önce kayıt edilmiş bir PAYMENT_RECEIVED ile aynıysa, ikinci event
  quarantine queue'ya alınır (otomatik kabul edilmez).
trigger: |
  Yeni PAYMENT_RECEIVED { source: 'external', actor.external_system: 'bank' }
  payload.bank_reference == mevcut PAYMENT_RECEIVED.payload.bank_reference
behavior: |
  - İkinci event event store'a YAZILMAZ
  - Quarantine queue'ya alınır (operational mechanism, event log değil)
  - Avukata bildirim: "Aynı banka referansı ikinci kez geldi. 
    Mükerrer kayıt mı, gerçek tekrar mı?"
  - Avukat kararı:
    (a) Mükerrer → quarantine sil, hiçbir şey yapılmaz
    (b) Gerçek tekrar → avukat manuel PAYMENT_RECEIVED emit eder 
        (farklı bank_reference veya reasoning ile)
override_path: 24 saat içinde avukat karar vermezse otomatik fail-safe → mükerrer kabul, sil.

why_not_event_taxonomy: |
  Event tipi/payload yapısı değil — duplicate detection mekaniği.
  Event taxonomy'de "duplicate detection" kavramı yer almaz.
why_not_aggregate_invariant: |
  bank_reference unique constraint olarak DB-level konabilirdi ama:
  - bazen geçerli tekrar olabilir (avukat aynı referansı yeniden kullanır)
  - hard fail yerine human review tercih ediliyor
why_not_causality_rule: |
  Forbidden chain değil — duplicate event'in kayıt edilmesi causality
  ihlali değil, integration ergonomic concern.
why_not_temporal_semantic: |
  Zaman boyutuyla ilgisi yok — referans eşleşmesi mekaniği.
```

### IR-004 — Identity Merge Alias Persistence

```yaml
rule_id: identity-merge-alias-persistence
category: LEGAL_EDGE_CASE
description: |
  İki Debtor aggregate'i merge edildiğinde (mükerrer kayıt birleştirmesi
  via DEBTOR_IDENTITY_CORRECTED { correction_reason: 'MERGE_DUPLICATE' }),
  silinen debtor_id IMMUTABLE alias olarak korunur.
  
  ANAYASAL ALT-KURAL:
  Alias lookup must be read-only and must never create a new legal identity.
trigger: |
  DEBTOR_IDENTITY_CORRECTED { correction_reason: 'MERGE_DUPLICATE' }
  payload'ında merged_into: <kanonik debtor_id>
behavior: |
  - Eski debtor_id silinmez
  - Cross-aggregate FK referansları (Case → Debtor) eski debtor_id'ye 
    işaret etmeye devam edebilir
  - Identity index'te eski debtor_id artık aktif kayıt değil ama 
    'redirects_to: <kanonik>' field'ıyla işaretli
  - Replay sırasında eski debtor_id görüldüğünde otomatik canonical'e map edilir
  - Eski debtor_id ile yeni event yaratılamaz (deny)
  
  ALIAS DİSİPLİNİ (read-only contract):
  - Alias sadece YÖNLENDİRME ve AUDIT amacıyla yaşar
  - Alias bir lookup'a hit olduğunda canonical debtor_id'ye redirect olur,
    yeni bir Debtor identity ÜRETMEZ
  - Alias üzerinden DEBTOR_REGISTERED, DEBTOR_IDENTITY_CORRECTED veya
    yeni debtor aggregate yaratılamaz
  - Alias kendi kendine bir hukuki kimlik DEĞİLDİR — sadece bir 
    tarihsel referans pointer'ıdır
override_path: Yok — merge geri alınamaz. Yanlış merge için ayrı 
  DEBTOR_IDENTITY_CORRECTED { correction_reason: 'MERGE_REVERSAL' } event'i 
  gerekir (Faz 2 kapsamı).

why_not_event_taxonomy: |
  Event olarak DEBTOR_IDENTITY_CORRECTED zaten var.
  Bu rule alias persistence implementasyon detayı (event'in payload'ı 
  yetmez — alias mekaniği gerek).
why_not_aggregate_invariant: |
  Aggregate invariant olarak yazılırsa "debtor_id silinemez" anlamına gelir
  ki zaten bu mevcut. Ek olan: alias chain mekaniği + read-only kuralı —
  aggregate dışı identity layer disiplini.
why_not_causality_rule: |
  Causality değil. Identity layer mekaniği.
why_not_temporal_semantic: |
  Zaman boyutu yok — referans eşleşmesi.
```

### IR-005 — Replay Validation Halt on Hash Mismatch

```yaml
rule_id: replay-halt-on-hash-mismatch
category: REPLAY_SAFETY
description: |
  Replay sırasında bir snapshot'ın state_hash'i hesaplanan değerle
  uyuşmazsa replay durur, manual müdahale gerektiren alarm üretilir.
trigger: |
  case_snapshots.state_hash != sha256(canonical(rebuilt_state_at_up_to_version))
behavior: |
  - Replay HALT
  - Tüm projection rebuild süreci durur
  - Audit alarm: 'CRITICAL: snapshot hash chain integrity violated'
  - Olası nedenler audit log'a yazılır:
    (a) snapshot manipülasyonu (DB tampering)
    (b) calculator logic değişimi (engine_version mismatch)
    (c) reference data değişimi (rate_table_version mismatch)
    (d) event log corruption
  - Manuel inceleme + güvenli rebuild gerekir
override_path: Yok — manuel forensic inceleme zorunlu.

why_not_event_taxonomy: |
  Event değil — replay validation mekaniği.
why_not_aggregate_invariant: |
  Snapshot tablo yapısının bir invariant'ı değil, **runtime check**.
  DB constraint olarak hash compute edilemiyor.
why_not_causality_rule: |
  Causality chain ile alakası yok.
why_not_temporal_semantic: |
  Temporal değil — bütünlük (integrity) kontrolü.
```

---

## 4. Rejected Implicit Rule Adayları

Bu kategoriye girmeyen "implicit rule" önerileri burada listelenir — gelecekte aynı öneri tekrar gelmesin diye.

| Önerilen Rule | Niye Reddedildi | Yerine |
|---|---|---|
| "Boş notlar olan event'ler quarantine" | UX validation, business convenience | Frontend validation veya event payload schema validation |
| "Dashboard'da X case sayısı geçince warn" | UI/dashboard behavior | UI-side widget logic |
| "Aynı user 5+ aksiyon yaparsa rate limit" | Operational concern, rate limiting | Auth layer / API gateway |
| "Iki avukat aynı case'de aynı anda çalışırsa lock" | UX concurrency concern | Implementation (optimistic locking, FE conflict resolution) |
| "Müvekkil bilgisi eksikse case açma" | Form-level validation | Frontend form validator + backend DTO validation |

---

## 5. Implicit Rule Lifecycle

Implicit rule eklenmek istendiğinde:

1. **Mandatory filter** doldurulur (Section 1)
2. **Category** seçilir (Section 2)
3. **CI gate** yaml schema'yı doğrular
4. ADR yazılır (örn `ADR-0005-IR-006-<rule-name>.md`)
5. ulas onayı
6. Bu belgeye eklenir

Implicit rule **silinmek** istendiğinde:

1. ADR yazılır (rule'un niye gereksiz hale geldiği)
2. Rule status `accepted` → `superseded`
3. Bu belgede archive section'a taşınır (silinmez — Hard Rule #19 governance)

---

## 6. Implicit Rule Sayısı Disiplini

> **Bu belge 10 rule'u geçmemelidir.**

10+ rule'a ulaşılırsa:
- Belge bölünür (kategori bazlı ayrı belgeler)
- Veya: rule'lar formal modele (event taxonomy, aggregate, causality, temporal) **migrate edilir**

Şu an: 5 rule. Sınır altında, sağlıklı.

Hedef: Faz 1 boyunca 8'i geçmemek. Faz 2'de tebligat, haciz, sale geldiğinde yeni edge-case'ler çıkacak — ama o zaman belge bölünür.

---

## 7. Bu Belgenin Kapsamı Dışı

- Event payload schemas → `07`
- Causality enforcement runtime → `08`
- Temporal semantics → `09`
- Aggregate invariants → `06`
- UI/UX validation → frontend
- API rate limiting → infrastructure
- Form validation → DTO + frontend
- Implementation detayı (algoritma, DB query, cache strategy) → out of scope

---

## 8. Hard Rules (Implicit Rule Disiplini)

(00-architecture.md Hard Rules'a eklenir)

**HR-36 (yeni):** Yeni implicit rule eklenmek için 4 mandatory filter sorusunun (why not event taxonomy / aggregate invariant / causality rule / temporal semantic) hepsine cevap zorunlu. CI gate eksik field'lı rule'u reddeder.

**HR-37 (yeni):** Implicit rule sayısı 10'u geçemez. 10+ ulaşılırsa belge bölünür veya rule'lar formal modele migrate edilir.

**HR-38 (yeni):** Implicit rule kategorileri 5 ile sınırlıdır (AUDIT_SAFETY, REPLAY_SAFETY, HUMAN_WORKFLOW, LEGAL_EDGE_CASE, INTEGRATION_AMBIGUITY). Yeni kategori eklemek için ADR zorunlu.

---

## 9. DoD

- [x] Anayasal açılış (4 + temporal = 4 sorulu filtre)
- [x] 5 kategori tanımı
- [x] Mandatory filter format (her rule için zorunlu yaml)
- [x] 5 active implicit rule (IR-001..005), her biri 4 filtre cevabıyla
- [x] **IR-004 alias read-only kuralı eklendi** (anayasal alt-kural: alias yeni hukuki kimlik üretmez)
- [x] Rejected adaylar listesi (mezarlık önleme)
- [x] Implicit rule lifecycle (ekleme/silme prosedürü)
- [x] 10-rule sayı sınırı (HR-37)
- [x] 3 yeni Hard Rule (HR-36..38)
- [x] Bu belgenin kapsamı dışı listesi
- [x] **ulas onayı (2026-05-19)**

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

---

## 10. Sıradaki Adım

İmza sonrası → `11-domain-event-bridge.md`. Senin verdiğin kritik notlar:

> 11 **event bus architecture değildir**, **transaction discipline** belgesidir.  
> Açıkça yazılmalı:
> - Event ne zaman emit edilir? Before commit? After commit?  
> - Outbox-backed mı?  
> - Retry semantics?  
> - Aşamalar tablosu: `before commit / inside same tx / after commit without outbox / outbox-backed after commit` — hangileri allowed?

Bu omurga olur. 10'daki edge-case'ler 11'de transaction semantics'e dönüşmeyecek (10 ayrı kalır), ama **same-day-reverse-reentry-review** gibi pattern'lerin emit timing'i 11'in işi.

11 ile vocabulary freeze tamamlanır.
