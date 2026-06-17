# Müvekkil Masraf / Avans / Tahsilat / Onay Merkezi — Tasarım (DESIGN-ONLY)

> **Ana cümle:** Müvekkilden istenen iş masrafını, avans bakiyesini, ödeme durumunu ve onay zincirini tek yerde toplayıp; "ödeme gelmediği için işlem yapılmadı" gibi kararları kayıt altına almak.
> **Durum:** Tasarım taslağı — **KOD YOK, migration YOK, endpoint YOK, frontend YOK.** İnceleme + onay sonrası fazlı uygulanır.
> **Kapsam dışı (bu doc):** kod, şema migration, veri taşıma, UI. Onaylı tasarımdan SONRA, ayrı PR'lar.
> **Bu, [client-intel-form-design.md](client-intel-form-design.md) ile KARIŞTIRILMAMALI** — o müvekkil *istihbaratı*, bu müvekkil *finansı*. Ayrı modeller, ayrı tablolar.
> **İlgili mevcut hat:** `expense-request` modülü (ExpenseRequest), `case-balance` modülü (CaseBalance/BalanceLedger), `policy-engine` (CPE APPROVE_EXPENSE gate), `ClientNotification`/`MessageTemplate` mail altyapısı.

---

## 0. EN ÖNEMLİ TESPİT — Bu modülün ~%65'i ZATEN VAR

Keşif sonucu: müvekkil masraf/ödeme altyapısının büyük kısmı **çoktan kodlanmış**. Bu doküman **sıfırdan sistem kurmaz**; mevcut `ExpenseRequest` hattının üstüne **yalnız gerçekten eksik parçaları** ekler. Senin "yanlış model kurulursa operasyon muhasebe çamuruna döner" uyarının somut karşılığı budur: **paralel ikinci bir masraf sistemi kurmak en büyük risk.**

| Senin önerdiğin model | Mevcut karşılığı | Karar |
|---|---|---|
| `ClientExpenseRequest` | ✅ **`ExpenseRequest`** (schema.prisma:3194) — status machine + item + payment + audit | **REUSE** — yeniden yazma |
| `ClientPayment` | ✅ **`ExpensePayment`** (schema.prisma:3323) — amount/date/method/matchedBy | **REUSE** |
| `CaseExpenseActual` | ✅ **`BalanceLedger` DEBIT** (schema.prisma:4742) — gerçekleşen masraf hareketi | **REUSE** (gerekirse alan ekle) |
| `ClientAdvanceLedger` | 🟡 **`CaseBalance` + `BalanceLedger`** (dosya bazlı avans) zaten CREDIT/DEBIT tutuyor | **REUSE / KARAR (K1)** |
| `ClientApprovalRequest` | 🟡 desen var (`IcrabotApprovalRequest`) ama bot-only; `CPE APPROVE_EXPENSE` gate var ama state'siz | **YENİ ama desen mevcut** |
| `ClientStatementLine` / müvekkil ekstresi | ❌ **YOK** | **YENİ** |

> **Sonuç:** Gerçekten yeni kod gereken yer **3 nokta**: (1) müvekkil onay zinciri (state'li), (2) müvekkil ekstresi (statement), (3) "ödeme gelmedi → işlem yapılmadı" gerekçe kaydı. Geri kalan mevcut hattın genişletilmesidir.

---

## 1. DO-NOW / HOLD sınırı

```
Müvekkil masraf/avans/ödeme/onay takibi (operasyonel)  =  DO-NOW
Otomatik banka/muhasebe/e-fatura/portal-ödeme/mahsup   =  HOLD
```

### YAPILACAK (DO-NOW)
- Masraf talebi kaydı *(çoğu mevcut ExpenseRequest ile)*
- Avans bakiyesi *(mevcut CaseBalance/BalanceLedger)*
- Ödeme / kısmi ödeme durumu *(mevcut ExpensePayment + status machine)*
- Hatırlatma statüsü *(mevcut REMINDED state + ClientNotification)*
- **Dosya bazlı** müvekkil muhasebesi görünümü *(yeni okuma/derleme + ekstre)*
- Onay bekleyen işlem kaydı *(yeni onay zinciri)*
- **"Ödeme gelmedi → işlem başlatılmadı" gerekçe kaydı** *(yeni audit kuralı, §5)*

### YAPILMAYACAK (HOLD)
- Otomatik banka mutabakatı (statement matching)
- Otomatik e-fatura / e-arşiv entegrasyonu
- Harici muhasebe programı entegrasyonu (Logo/Mikro vb.)
- Tahsilattan otomatik **karmaşık** mahsup motoru *(borçlu tarafı TBK100 allocator AYRI sistemdir, §2)*
- Müvekkil portalından **doğrudan ödeme** (sanal POS tahsilat)
- Tam çift-taraflı finansal muhasebe sistemi

---

## 2. Kavram ayrımı (çamuru engelleyen sözlük)

İki para tarafı **asla aynı kayıtta** olmaz:

```
BORÇLUDAN gelen para   →  Collection / CollectionAllocation (TBK100)  [bu modülün DIŞINDA]
MÜVEKKİL ile para ilişkisi  →  bu modül
```

| Kavram | Tanım | Nerede tutulur |
|---|---|---|
| **Masraf talebi** | Müvekkilden istenen tutar (henüz harcanmadı) | `ExpenseRequest` (mevcut) |
| **Masraf avansı** | Müvekkilin peşin yatırdığı, ileride harcanacak bakiye | `CaseBalance` CREDIT (mevcut) — K1 |
| **Gerçekleşen masraf** | Fiilen yapılan harcama (harç, tebligat bedeli…) | `BalanceLedger` DEBIT (mevcut) |
| **Müvekkil ödemesi** | Müvekkilin talebe/avansa karşı yaptığı ödeme | `ExpensePayment` (mevcut) |
| **Tahsilat** | **Borçludan** gelen para | `Collection` (AYRI sistem — bu modül değil) |
| **Mahsup** | Tahsilatın kalemlere dağıtımı | `CollectionAllocation` TBK100 (AYRI) |
| **Vekalet ücreti** | Avukatın hak ettiği ücret | `DueType.VEKALET_UCRETI` / `ATTORNEY_FEE` (alacak tarafı; masraf değil) |
| **Müvekkile aktarılacak bakiye** | Tahsilattan müvekkile ödenecek net | *(türetilir — ekstrede, §3.2)* |

> **Sert kural (senin notun):** **Ofis kasası ≠ müvekkil dosya bakiyesi.** **Talep edilen tutar ≠ harcanan tutar.** Bu yüzden "talep" (`ExpenseRequest.totalAmount`) ile "gerçekleşen" (`BalanceLedger` DEBIT) **ayrı kayıtlardır** — mevcut yapı zaten böyle, doküman bunu korur.

---

## 3. Ana modeller — mevcut + yeni

### 3.1 MEVCUT (reuse — yeniden yazma)
```
ExpenseRequest        // masraf talebi başlığı (status, totalAmount, paidTotal, gateType)
  ExpenseRequestItem  // kalem (itemCode, suggestedAmount, finalAmount, overrideReason)
  ExpensePayment      // müvekkil ödemesi (amount, paymentDate, method, matchedBy)
  ExpenseAuditLog     // CREATED/SENT/PAYMENT_RECORDED/STATUS_CHANGED/OVERRIDE
CaseBalance           // dosya bakiyesi (balance, lowThreshold) — avans görünümü
BalanceLedger         // CREDIT(ödeme/avans) / DEBIT(masraf) / ADJUST / REFUND
ClientNotification    // müvekkile EMAIL/SMS/WHATSAPP bildirim (MASRAF_ISTEK, HATIRLATMA…)
MessageTemplate       // şablon (EXPENSE_REQUEST / EXPENSE_REMINDER kategorileri)
CpeDecisionLog        // APPROVE_EXPENSE gate kaydı (BLOCKING/NON_BLOCKING)
```

### 3.2 YENİ (yalnız bunlar)
```
ClientApprovalRequest {           // §4 onay zinciri — masraf/işlem onayı
  id, tenantId, caseId, clientId,
  subjectType,                    // EXPENSE_REQUEST | OPERATION | OTHER
  subjectId,                      // bağlı ExpenseRequest/operation id
  status,                         // §4 durum makinesi
  channel,                        // EMAIL | PORTAL
  requestedById, decidedAt, decisionNote,
  expiresAt, createdAt, updatedAt
}

ClientStatement {                 // müvekkil ekstresi başlığı (dosya bazlı — DO-NOW)
  id, tenantId, caseId, clientId,
  periodStart, periodEnd,
  openingBalance, closingBalance,
  generatedById, createdAt
}
ClientStatementLine {             // ekstre satırı (türetilir; immutable snapshot)
  id, statementId,
  lineDate, lineType,             // EXPENSE_REQUESTED | EXPENSE_ACTUAL | CLIENT_PAYMENT | ADVANCE_CREDIT | REFUND
  refType, refId,                 // kaynak kayıt (ExpenseRequest/ExpensePayment/BalanceLedger)
  debit, credit, runningBalance, note
}

ExpenseBlockReason {              // §5 "ödeme gelmedi → işlem yapılmadı" gerekçe kaydı
  id, tenantId, caseId, expenseRequestId,
  blockedActionCode,              // hangi işlem yapılmadı (örn. HACIZ_BASLAT)
  reasonCode,                     // PAYMENT_NOT_RECEIVED | APPROVAL_PENDING | INSUFFICIENT_ADVANCE
  note, createdById, createdAt,
  resolvedAt, resolvedById        // ödeme/onay gelince kapanır
}
```

> Tümü `tenantId` taşır (mevcut desen). `ClientStatementLine` türetilmiş **snapshot**'tır — kaynak kayıt değişse bile geçmiş ekstre değişmez (delil/mutabakat).

---

## 4. Durum makineleri

### 4.1 Masraf talebi — MEVCUT makineyi koru, uydurma yeni yapma
Mevcut `ExpenseRequestStatus` (9 durum):
```
PENDING → SENT → REMINDED → PARTIAL → RECEIVED → PAID
                                    ↘ OVERDUE
        ↘ CANCELLED        (LAWYER_PAID: avukat cebinden ödedi)
```
Senin verdiğin `DRAFT→SENT→PARTIALLY_PAID→PAID→CANCELLED→OVERDUE` ile **eşleştirme**:
`DRAFT≈PENDING` · `PARTIALLY_PAID≈PARTIAL` · `PAID/CANCELLED/OVERDUE` birebir. **Yeni enum açmayız**, mevcut makineyi kullanırız (çift-makine = çamur).

### 4.2 Onay (YENİ — `ClientApprovalRequest`)
```
DRAFT → SENT → APPROVED
            ↘ REJECTED
            ↘ EXPIRED
        ↘ CANCELLED
```

### 4.3 Avans (MEVCUT `BalanceLedger` üstünde mantıksal durum)
```
CREDITED (ödeme/avans girdi) → RESERVED (işleme ayrıldı) → SPENT (harcandı)
                                                         ↘ REFUNDED
                                                         ↘ CARRIED_FORWARD (sonraki işe devir)
```
> RESERVED/CARRIED_FORWARD mevcut `BalanceLedger.type` enum'unda yok → **K2 kararı**: ya yeni ledger tipleri eklenir (additive), ya da rezervasyon ayrı tutulmaz (yalnız CREDIT/DEBIT). Öneri: DO-NOW'da CREDIT/DEBIT yeter; RESERVED'i Faz sonrası.

---

## 5. Kritik audit kuralı — "ödeme gelmedi → işlem yapılmadı"

Masraf ödenmediği için bir işlem **yapılmadıysa**, sistemde **açık ve okunur** bir kayıt kalmalı:

```
"Masraf talep edildi (ExpenseRequest #..), ödeme gelmedi,
 bu nedenle HACIZ_BASLAT işlemi başlatılmadı."
```

- Mevcut `ExpenseRequest.gateType = BLOCKING` + `CPE APPROVE_EXPENSE` gate, işlemi **teknik olarak** durduruyor; ama **"neden durdu" gerekçesini operatöre/müvekkile gösteren kalıcı kayıt** yok.
- `ExpenseBlockReason` (§3.2) bu boşluğu doldurur: hangi işlem, neden (PAYMENT_NOT_RECEIVED / APPROVAL_PENDING / INSUFFICIENT_ADVANCE), ne zaman, çözüldü mü.
- Ödeme/onay gelince `resolvedAt` ile kapanır → "kim neye dayanarak işlem başlattı/başlatmadı" zinciri tam.
- [client-intel-form-design.md](client-intel-form-design.md)'deki append-only/delil-izi ilkesiyle aynı çizgi: gerekçe **silinmez**, kapanır.

---

## 6. Mail davranışı (altyapı MEVCUT — yalnız şablon + tetik)

`ClientNotificationService` (EMAIL prod-ready) + `ExpenseNotificationService` (HTML render) + `MessageTemplate` zaten var. Gereken: **şablon kodları + tetik noktaları**, yeni mail altyapısı değil.

| Tetik | Şablon kategorisi | Durum |
|---|---|---|
| İlk masraf talebi maili | `EXPENSE_REQUEST` (mevcut) | ✅ altyapı var |
| Hatırlatma maili | `EXPENSE_REMINDER` (mevcut) | ✅ altyapı var |
| Kısmi ödeme sonrası bakiye maili | yeni şablon kodu | 🆕 şablon ekle |
| Ödeme alındı teyit maili | yeni şablon kodu | 🆕 şablon ekle |
| İşlem onay maili (ClientApprovalRequest) | yeni şablon kodu | 🆕 şablon ekle |

> SMS/WhatsApp kanalları altyapıda var ama prod-ready değil → DO-NOW'da **EMAIL yeterli**, SMS sonraki faz.

---

## 7. Anti-karışıklık kuralları (kalıcı)

1. **Ofis kasası ≠ müvekkil dosya bakiyesi.** Bu modül müvekkil/dosya bakiyesini izler; ofis kasası ayrı (kapsam dışı).
2. **Talep edilen ≠ harcanan.** `ExpenseRequest.totalAmount` (talep) ile `BalanceLedger` DEBIT (gerçekleşen) ayrı kayıt; tek satıra bindirilmez.
3. **Müvekkil parası ≠ borçlu parası.** `ExpensePayment`/`CaseBalance` (müvekkil) ile `Collection`/`CollectionAllocation` (borçlu, TBK100) **asla** birleştirilmez.
4. **Tek kaynak.** Masraf talebi tek yerde (`ExpenseRequest`); paralel ikinci masraf tablosu açılmaz.

---

## 8. Faz planı

| Faz | İçerik | Not |
|---|---|---|
| **Faz 1** | Bu tasarım dokümanı | 👈 **şu an** (kod yok) |
| **Faz 2** | Backend model + migration: `ClientApprovalRequest`, `ClientStatement`/`Line`, `ExpenseBlockReason` (additive; mevcut ExpenseRequest'e dokunmadan) | onay sonrası |
| **Faz 3** | Masraf talebi POST/GET — **çoğu mevcut**; eksik okuma/derleme uçları + onay endpoint'leri | mevcut servisi genişlet |
| **Faz 4** | Ödeme / kısmi ödeme kaydı — **mevcut `recordPayment` üstünde**; block-reason resolve akışı | |
| **Faz 5** | Mail şablonları (3 yeni kod) + tetikler | altyapı mevcut |
| **Faz 6** | Müvekkil ekstresi (`ClientStatement` derleme + PDF export — mevcut export deseni) | |
| **Faz 7** | **HOLD** — portal ödeme / banka mutabakatı / muhasebe / e-fatura | legal+entegrasyon gated |

Her faz: plan → onay → additive kod → unit + canlı DB e2e → PR → merge → ledger.

---

## 9. Açık kararlar (Faz 2'den önce netleşmeli)

| # | Karar | Tasarım önerisi |
|---|---|---|
| K1 | Müvekkil avansı = mevcut `CaseBalance`/`BalanceLedger` mi, yeni `ClientAdvanceLedger` mi? | **Mevcut `CaseBalance`/`BalanceLedger` REUSE** (dosya bazlı avans zaten CREDIT/DEBIT). Yeni tablo = çift kaynak riski. Cross-case müvekkil cari hesabı **HOLD** (Party'ye yakın). |
| K2 | Avans RESERVED/CARRIED_FORWARD durumu eklensin mi? | DO-NOW'da **hayır** (CREDIT/DEBIT yeter); rezervasyon Faz sonrası additive. |
| K3 | Onay zinciri kendi modeli mi, yoksa CPE gate'e mi gömülsün? | **Kendi modeli** (`ClientApprovalRequest`) + CPE gate'i **tetikleyici** olarak bağla. CPE state tutmuyor; onay state'i ayrı olmalı. |
| K4 | Masraf onayı UYAP işlemini bloklar mı? | Mevcut `gateType=BLOCKING` korunur; `ExpenseBlockReason` ile **gerekçe görünür** kılınır. |
| K5 | Ekstre dosya bazlı mı, müvekkil-global mi? | **Dosya bazlı** (DO-NOW). Müvekkil-global ekstre cross-case → **HOLD**. |
| K6 | `ExpenseRequestStatus` enum'una DRAFT eklensin mi? | **Hayır** — `PENDING` zaten DRAFT işlevinde; çift-durum açma. |

---

## 10. Özet

- **Kova:** DO-NOW operasyonel müvekkil finansı. Ama **modülün ~%65'i mevcut** (`ExpenseRequest` hattı).
- **En büyük risk:** paralel ikinci masraf/ödeme sistemi kurmak → **yasak** (§7). Mevcut üstüne additive.
- **Gerçek yeni kod:** onay zinciri · müvekkil ekstresi · "ödeme gelmedi→işlem yapılmadı" gerekçe kaydı. Gerisi genişletme.
- **Çamur önleyici 4 kural** (§7) + kavram sözlüğü (§2) kalıcı.
- **Sonraki adım:** Doküman onaylanınca **Faz 2** için ayrı plan + onay. **Bu fazda kod yazılmadı.**
