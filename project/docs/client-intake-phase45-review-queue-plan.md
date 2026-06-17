# Faz 4.5 — Review Queue (personel inceleme) — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK.** **Önkoşul: #162 (4.2) + 4.3 + 4.4 MERGED olmadan koda GEÇİLMEZ.** Beklerken hazırlanır.
> **Kaynak:** [client-intake-link-design.md](client-intake-link-design.md)
> **Kapsam:** Personel (JWT) inceleme kuyruğu — gönderimleri görüp **alan-bazlı** onay/red işaretler. **PROMOTE (kanoniğe yazım) DEĞİL → 4.6.** Bu PR kanoniğe DOKUNMAZ.

## 0. Sınır (kritik)
- **4.5 kanoniğe yazmaz.** Yalnız `ClientIntakeField.reviewStatus` (PENDING→APPROVED/REJECTED) + `ClientIntakeSubmission` lifecycle işaretler.
- Kanonik yazım (DebtorAddress/Asset/ClientIntelStatement) **yalnız 4.6 promote**'ta. 4.5 sadece "hangi alan onaylı/red" kararını verir.
- `value`/`category` **immutable** (4.2'den); 4.5 yalnız review damgası.

## 1. Submission lifecycle (4.5 payı)
```
CLIENT_SUBMITTED ──claim──► IN_REVIEW ──(reject all)──► REJECTED
                                      └─(alanlar işaretlenir; PARTIALLY_PROMOTED/COMPLETED → 4.6)
```
- `claim`: CLIENT_SUBMITTED → IN_REVIEW (`reviewedById`=personel, `reviewedAt`).
- `reject-submission`: → REJECTED (silinmez; denetim izi). Reddedilen submission promote edilemez.
- `PARTIALLY_PROMOTED`/`COMPLETED` geçişleri **4.6**'da (promote sonucu).

## 2. Field review (alan-bazlı — F4-K1)
- `reviewStatus`: PENDING → **APPROVED** / **REJECTED** (+ `reviewNote`).
- APPROVED alan **henüz kanoniğe yazılmaz** — 4.6 promote'a aday olur.
- REJECTED alan promote edilmez (denetim izi).
- 45-2: IN_REVIEW iken review değiştirilebilir (PENDING↔APPROVED↔REJECTED); submission terminal (REJECTED) veya promote sonrası kilitlenir.

## 3. Endpoint'ler (TARİF — JWT/personel)
| Method | Path | İş |
|---|---|---|
| GET | `/client-intake-submissions?status=&caseId=` | kuyruk listesi (default CLIENT_SUBMITTED+IN_REVIEW) |
| GET | `/client-intake-submissions/:id` | detay + field'lar |
| POST | `/client-intake-submissions/:id/claim` | CLIENT_SUBMITTED → IN_REVIEW |
| POST | `/client-intake-submissions/:id/reject` | → REJECTED (`{ note? }`) |
| POST | `/client-intake-fields/:id/review` | `{ decision: APPROVE\|REJECT, note? }` → field reviewStatus |
> Promote endpoint'i **YOK** (4.6). İçerik PATCH/PUT/DELETE **yok** (value immutable).

## 4. Tenant guard / immutability
- Tüm uçlar tenant filtreli; submission/field tenant doğrulanır (field → submission.tenantId).
- `value`/`category` değiştiren metod **yok**; yalnız reviewStatus/lifecycle.
- Review yalnız personel (JWT); public uç buraya erişmez.

## 5. Test planı
**Unit:** claim CLIENT_SUBMITTED→IN_REVIEW · reject→REJECTED · field review PENDING→APPROVED/REJECTED (+note) · CLIENT_SUBMITTED dışı submission'da field review reddi (sıra guard) · REJECTED submission'da field review reddi · cross-tenant reddi · liste default filtre · **kanonik tabloya HİÇBİR yazım yok** (mock prisma'da DebtorAddress/Asset/ClientIntelStatement.create çağrılmadı).
**E2e (canlı DB):** submission(4.4'le ya da raw) → claim → 2 field (biri APPROVE biri REJECT) → reviewStatus DB'de doğru · submission IN_REVIEW · **kanonik değişmedi** (promote yok) · reject-submission→REJECTED · tenant izolasyonu. Temizlenir.

## 6. Bu PR'da YOK
**PROMOTE (kanoniğe yazım) — 4.6** · public submit (4.4) · frontend review UI (4.7) · cross-case/Party · COMPLETED/PARTIALLY_PROMOTED geçişleri (4.6).

## 7. Micro-kararlar — ✅ ONAYLANDI (Ulaş, 2026-06-17; kodlama #162+4.3+4.4 merge'e bağlı)
| # | Karar | Sonuç |
|---|---|---|
| 45-1 | tek tek + toplu onay | ✅ **tek tek + toplu**; toplu YALNIZ aynı submission'daki seçili alanlar. **Submission'lar arası toplu işlem YOK.** |
| 45-2 | IN_REVIEW'de değiştirilebilir mi? | ✅ **Evet** (APPROVED→REJECTED dönebilir, promote öncesi). **PROMOTED olduktan sonra 4.5 alana DOKUNAMAZ** (kilitli). |
| 45-3 | claim zorunlu mu? | ✅ **Evet + `claimedAt`/`claimedById` ZORUNLU** (iki personel aynı submission'a girmesin). *(Şema eki — §7.1)* |
| 45-4 | reject-submission alan davranışı | ✅ Submission REJECTED → **PENDING alanlar REJECTED**; **APPROVED alanlara DOKUNMA** (ileride kısmi-inceleme senaryosu için güvenli) |

### 7.1 Şema eki (4.5 PR'ında additive)
4.2'de `ClientIntakeSubmission`'da `reviewedById`/`reviewedAt` var ama **claim ayrı kavram** (kim üstlendi ≠ kim karar verdi). 4.5 PR'ı additive ekler: `claimedById String?` + `claimedAt DateTime?` (küçük migration; #162'ye dokunmadan, 4.5 kendi PR'ında). claim → bunları doldurur; ikinci personel claim denerse zaten IN_REVIEW → reddedilir.

## 7.2 ⛔ MİMARİ SINIR (Ulaş'ın kritik kuralı — review ≠ promote)
**4.5 hiçbir kanonik servisi ÇAĞIRAMAZ ve ReviewQueueModule, PromotionModule'a / kanonik modüllere BAĞIMLI OLAMAZ.**
- `ReviewQueueModule` import'ları: `PromotionModule`, `ClientIntelStatementModule`, `DebtorModule`/`Asset`/`DebtorAddress` servisleri **İÇERMEZ**. Yalnız `PrismaModule` (+ kendi). DI seviyesinde promote/kanonik servis **inject edilemez**.
- Test bunu hem davranışsal (canonical `.create` çağrılmadı) hem **yapısal** doğrular: ReviewQueueModule provider/import grafiğinde promote/kanonik servis YOK.
- **Neden:** sınır kaybolursa biri "approve'a basınca hemen oluşturayım" der → 4.5+4.6 birleşir → review katmanı anlamını kaybeder. Bu sınır, faz ayrımının bekçisidir.
- Promote yalnız 4.6'da, AYRI modül/serviste; 4.5 yalnız `reviewStatus` işaretler.

## 8. Sonraki: 4.6 Promote (EN KRİTİK)
4.6'da APPROVED alanlar **kategorilerine göre kanonik modele** yazılır (anti-tekrar, mevcut servis reuse):
- INCOME_SOURCE/COMMERCIAL_RELATION/FAMILY_CIRCLE/DIGITAL_FOOTPRINT/PAYMENT_HISTORY/STRATEGY → **ClientIntelStatement** (Faz 4.0, MERGED)
- ADDRESS → DebtorAddress(source=CLIENT) · ASSET → Asset · CONTACT → Debtor/DebtorCommunication
- Her promote: `promotedRefType/promotedRefId` doldurulur; submission COMPLETED (hepsi) / PARTIALLY_PROMOTED (bir kısmı). Idempotent (zaten promoted alan tekrar yazılmaz).

> #162+4.3+4.4 MERGED + 45-1..45-4 onaylanınca bu PR plan→additive kod→unit+canlı e2e→PR ile yazılır. **Şu an kod YOK; #162 bekliyor.**
