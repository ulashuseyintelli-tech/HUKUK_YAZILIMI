# IR-0 — Borçlu Kimlik Çözümleme (Identity Resolution) Karar Dökümanı

**Durum:** KARARLAR SABİT (ulas onayı, 2026-06-17). Kod YOK · Migration YOK · PR YOK.
Bu döküman yalnız karar kaydıdır (ADR benzeri). Uygulama IR-1+ PR'larında, ayrı onayla.

---

## 0. Problem (neden bu katman var)

Sistemde TCKN/VKN'siz iki+ aynı isimli borçlu (ör. iki "Mehmet Yılmaz") meşru olarak bulunabilir
(create-time duplicate guard bunu engellemiyor; bilinçli izin veriyor — bkz. [debtor-similar-name-review]).
Kullanıcı bunlardan **birine sonradan TCKN girince**, diğer aynı isimli kimliksiz kayıtların "acaba
aynı kişi mi?" sorusu doğuyor.

**Yanlış çözüm:** TCKN'yi otomatik olarak aynı isimli tüm kayıtlara basmak. Bu, duplicate bırakmaktan
DAHA tehlikeli (iki gerçek farklı Mehmet Yılmaz olabilir → yanlış kişiye icra).

**Doğru çözüm:** Otomatik hiçbir şey yapma. "Olası aynı kişi" **adayı** üret, kararı insana bırak.

---

## 1. Üç katman kesin ayrılır

| Katman | Ne zaman | Davranış | Durum |
|---|---|---|---|
| **Duplicate Guard** | create/update anında (senkron) | yazmayı engellemez, review-dialog açar (`SIMILAR_NAME_REVIEW` / `DUPLICATE_IDENTITY`) | ✅ var (PR-U serisi) |
| **Identity Resolution** | kimlik sonradan öğrenilince (asenkron) | otomatik bir şey yapmaz → "olası aynı kişi" adayı üretir | 🆕 bu döküman (IR) |
| **Merge** | kullanıcı "aynı kişi" + ayrı onay verince | referans taşıma + AuditLog + rollback | 🔜 ayrı, çok sonra (kapsam DIŞI) |

**Mutlak kurallar:** Otomatik merge YOK · Otomatik TCKN/VKN yayma YOK · "Aynı kişi" kararı tek başına
veri değiştirmez.

---

## 2. SABİT KARARLAR (ulas onayı 2026-06-17)

1. **MVP'de Task/eskalasyon entegrasyonu YOK.** Ayrı, bağımsız bir **"Kimlik Eşleştirme"** sayfası olacak.
   Görev/notification/eskalasyon entegrasyonu sonraya. (Gerekçe: görev sistemini erken kirletmemek;
   önce aday üretimi + karar mekanizması tek başına çalışsın.)
2. **`Debtor.source` alanı şimdilik EKLENMEYECEK.** Kaynak karşılaştırması sonraya. (İleride manuel /
   UYAP import / OCR ayrımı; şimdilik mevcut veriden ne çıkarılabiliyorsa o.)
3. **Skor MVP'de numeric DEĞİL.** Sistem otomatik güven puanı ("%87 aynı kişi") VERMEYECEK. İlk sürümde
   ham sinyaller listelenecek:
   - isim eşleşmesi
   - telefon eşleşmesi
   - adres benzerliği
   - aynı / farklı müvekkil
   - aynı / farklı dosya
   - takip tarihi / borç tutarı (varsa gösterim)
   (Numeric skor → sonraki sürüm.)
4. **İlk tetik YALNIZ update-identity.** TCKN/VKN/detsisNo **sonradan** girildiğinde, aynı normalize-isimli
   **kimliksiz aktif** borçlular için candidate üretilecek. Create / import / UYAP tetikleri SONRAYA.
5. **Merge YOK** (bu kapsamda).
6. **Otomatik TCKN/VKN yayma YOK.**
7. **"Aynı kişi" kararı** veri değiştirmeyecek — sadece candidate `state` değiştirecek.
8. **"Farklı kişi" kararı** aynı pair'in tekrar önerilmesini KALICI engelleyecek.
9. **"Emin değilim"** geçici `ignored` olacak (ileride tekrar yüzeye çıkabilir).

---

## 3. Tasarım kararları (yukarıdaki sabitlerle uyumlu)

### 3.1 Tetik noktası
`debtor.service.update` içinde `dto.tckn || dto.vkn || dto.detsisNo` geldiğinde,
**`DUPLICATE_IDENTITY` guard'ı geçtikten ve kimlik persist edildikten sonra** (ref: debtor.service.ts:521-555).
"Kimliksiz bir borçlu kimlik kazandı" anı. Yalnız bu tetik (Karar #4).

### 3.2 Aday nesnesi: ayrı tablo (Task DEĞİL — Karar #1)
Yeni model `DebtorIdentityCandidate` (pairwise + kalıcı verdict):
- `tenantId`
- `debtorAId`, `debtorBId` (kanonik sıralı çift) + `pairKey` **unique** (aynı çift iki kez üretilmez)
- `state`: `pending` | `same_person` | `different_person` | `ignored`
- `signals` (Json — hangi ham sinyaller eşleşti; Karar #3, numeric skor YOK)
- `source`: şimdilik tek değer `UPDATE_IDENTITY` (Karar #4)
- `triggeredByDebtorId` (kimliği yeni girilen kayıt — yön bilgisi)
- `decidedByUserId`, `decidedAt`, `decisionNote`
- timestamps

`pending` haricindeki state'ler verdict olarak KALICI saklanır. `different_person` = kalıcı bastırma
(pairKey unique bunu garanti eder). `ignored` = geçici (resurface edebilir). MVP'de Task referansı YOK.

### 3.3 İnceleme ekranı — gösterilecek alanlar ve kaynakları
| Alan | Kaynak | Sinyal? |
|---|---|---|
| Ad-Soyad (normalize) | `Debtor.name` | isim eşleşmesi |
| Telefon | `Debtor.phone` | telefon eşleşmesi |
| Adres | `DebtorAddress` (birincil) | adres benzerliği |
| Müvekkil | `CaseDebtor → Case → Client` | aynı/farklı müvekkil |
| Dosya no | `CaseDebtor → Case.caseNumber` | aynı/farklı dosya |
| Takip tarihi | `Case` açılış / `CaseDebtor.createdAt` | gösterim |
| Borç tutarı | `CaseDebtor.liabilityAmount` | gösterim |
| Kaynak | (Karar #2: ŞİMDİLİK YOK) | — |

İki kayıt **yan yana** gösterilir; ham sinyaller işaretlenir (otomatik karar YOK).

### 3.4 Kullanıcı kararları (state geçişleri)
| Karar | state | Etki |
|---|---|---|
| Aynı kişi | `same_person` | Yalnız verdict. **Veri değişmez** (Karar #7). Kimlik-uygula/merge AYRI (kapsam dışı). |
| Farklı kişi | `different_person` | Pair kalıcı bastırılır (Karar #8). |
| Emin değilim | `ignored` | Geçici (Karar #9). |
| Vazgeç | (değişiklik yok) | Kapat. |

### 3.5 Guard'lar (yanlış yayılımı önleme)
- Asla otomatik uygulama; aday yalnız öneridir.
- Aday üretimi **yazmayı engellemez** (asenkron/post-write) → Duplicate Guard ile çakışmaz.
- Yalnız aynı tenant + aynı `DebtorType` + aynı normalize-isim + **karşı taraf kimliksiz + aktif**.
- (Kimlik-uygula ve merge kapsam DIŞI; geldiğinde kendi guard'larıyla — mevcut `DUPLICATE_IDENTITY`
  yeniden kullanılarak collision engellenecek.)

### 3.6 AuditLog
Mevcut desenle: her state geçişi → `entityType="DEBTOR_IDENTITY_CANDIDATE"`, `action="UPDATE"`,
`oldValues/newValues={state}`, `metadata={ candidateId, pairKey, fromState, toState, signals, triggeredByDebtorId }`,
`userId/userName`.

### 3.7 Mevcut guard'larla ilişki
Duplicate Guard = senkron, write-time, bloklar/sorar. Identity Resolution = asenkron, post-write, advisory.
update'te kimlik eklenince `DUPLICATE_IDENTITY` zaten **aynı-TCKN** ikincil kaydı engeller; Identity Resolution
diğer kaydın **TCKN'siz** olduğu isim-eşleşmesinde çalışır → örtüşme/çakışma YOK.

---

## 4. PR yol haritası (henüz AÇILMADI — her biri ayrı onay)

| PR | İçerik | Karar bağı | Risk |
|---|---|---|---|
| **IR-0** | Bu karar dökümanı | — | – (bu dosya) |
| **IR-1** | Şema: `DebtorIdentityCandidate` model + enum'lar + migration (mantık yok) | #1,#3 | düşük |
| **IR-2** | Aday üretim servisi (yalnız update-identity tetiği) + unit test, UI yok | #4 | orta |
| **IR-3** | Read API: GET kimlik-eşleştirme worklist + yan-yana karşılaştırma projeksiyonu | #1,#3 | düşük |
| **IR-4** | Karar API: PATCH state (same/different/ignored) + AuditLog + kalıcı bastırma | #7,#8,#9 | orta |
| **IR-5** | UI: ayrı "Kimlik Eşleştirme" sayfası + yan-yana inceleme + karar butonları | #1 | orta |
| **IR-6** | (AYRI, sonra) Kimlik-uygula aksiyonu (guard'lı) | #6 | yüksek |
| **IR-7** | (ÇOK SONRA) Merge + rollback | #5 | en yüksek |
| **IR-1b** | (ops.) create-identity + import/UYAP tetikleri | #4 | orta |

---

## 5. Sonraya bırakılanlar (bilinçli backlog)
- `Debtor.source` alanı + kaynak karşılaştırması (Karar #2).
- Numeric güven skoru (Karar #3).
- create / import / UYAP tetikleri (Karar #4 → IR-1b).
- Task/eskalasyon entegrasyonu (Karar #1).
- Kimlik-uygula (IR-6) ve Merge (IR-7).

---

İlgili: `docs/debtor-module-ledger.md` · benzer-isim/duplicate guard serisi (PR-U #135-138) ·
[debtor-similar-name-review handoff].
