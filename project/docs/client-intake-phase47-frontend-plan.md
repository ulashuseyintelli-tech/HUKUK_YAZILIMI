# Faz 4.7 — Frontend: Public Intake Form + Personel Review/Promote UI — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK.** İlk frontend işi (önceki tüm faz backend'di).
> **Önkoşul:** 4.0/4.2/4.3/4.4/4.5/4.6a/4.6b MERGED → main `9b4fd52`. Backend zinciri uçtan uca hazır. ✅
> **Stack:** Next.js 14 **App Router** (`apps/web/src/app`), Tailwind, `lib/api.ts` (ApiClient, token localStorage, `${API_URL}/api${endpoint}`, Bearer yalnız token varsa). API global prefix `api`.
> **Kapsam:** Yeni backend YOK — yalnız mevcut uçları tüketen ekranlar. ASSET/CONTACT promote yok · Party/IR-0/cross-case yok · portal yok · captcha yok · otomatik parse yok.

## 0. İki parça
- **A) Public Intake Form** — müvekkil, tokenli linke girer, formu doldurur (AUTH YOK).
- **B) Personel Review/Promote UI** — personel kuyruğu görür, claim/review/promote yapar (JWT).

## ⚠️ Koordinasyon notu (paralel `feat/yeni-takip` oturumu)
`lib/api.ts` PAYLAŞILAN dosya; hem bu iş hem yeni-takip dokunabilir → **merge conflict riski** (geçmişte lib/api.ts conflict yaşandı). Öneri: bu PR `lib/api.ts`'e **yalnız yeni metod EKLER** (mevcut satırların ortasına girmez); ya da intake api çağrılarını **ayrı `lib/intake-api.ts`** dosyasına koyar (conflict yüzeyi sıfır). **Öneri: ayrı `lib/intake-api.ts`** (47-3 ile uyumlu).

---

## A) PUBLIC INTAKE FORM (AUTH YOK)

### A.1 Route
- **`apps/web/src/app/intake/[token]/page.tsx`** — `(dashboard)` GRUBUNUN DIŞINDA (auth layout'a girmez). `PUBLIC_INTAKE_BASE_URL`/intake/:token ile birebir (4.3).
- Client component (form etkileşimi).

### A.2 API çağrısı (güvenlik — token sızıntısı yok)
- **47-3: api.ts DEĞİL, dedike no-auth fetch.** Public form `lib/intake-api.ts` içinde minimal fetch ile `${NEXT_PUBLIC_API_URL}/api/public/intake/:token` çağırır — **Authorization header YOK** (müvekkilde token yok zaten; ama kazara personel token'ı gönderilmesin diye ayrı path).
- **Token loglanmaz:** `console.log`/analytics'e token/URL yazılmaz (4.4 ops kuralı UI'da da).

### A.3 Akış
```
GET /api/public/intake/:token → { title, scope }   (PII YOK)
  → scope kategorilerine göre boş alanlar render et (kategori başlıkları + value input)
  → honeypot: gizli alan (CSS ile saklı), bot doldurursa submit drop (backend zaten siler)
  → POST /api/public/intake/:token { fields:[{category,value,...}], hp }
  → başarı: generic teşekkür mesajı; hata: generic "bağlantı geçersiz/dolu" (backend generic döndürür)
```
- **PII gösterme:** ekran yalnız jenerik başlık + istenen kategoriler; müvekkil/borçlu/dosya bilgisi YOK (backend zaten döndürmüyor).
- **Kategori→etiket sözlüğü** (UI): INCOME_SOURCE="Gelir kaynağı", ADDRESS="Adres", … (statik map; backend enum'ları).
- value alanı: çok-satır textarea (raw beyan). ADDRESS dahil RAW metin (structured'ı personel girer — 4.6b HYBRID).
- Süre/limit dolmuş token: generic hata + form gizlenir.

### A.4 Bu parçada YOK
captcha (4.8) · dosya yükleme · structured adres inputu (raw text) · login/portal.

---

## B) PERSONEL REVIEW/PROMOTE UI (JWT)

### B.1 Route
- **`apps/web/src/app/(dashboard)/intake/`** — yeni üst-seviye bölüm (kuyruk cross-case). (Alternatif: cases/debtors altına nest — 47-2; öneri: ayrı `/intake`.)
  - `page.tsx` — kuyruk listesi · `[id]/page.tsx` — gönderim detayı.

### B.2 Liste (kuyruk)
- `GET /api/client-intake-submissions?status=` (default CLIENT_SUBMITTED+IN_REVIEW). Kolonlar: dosya, durum, tarih, claimedBy. Filtre: status/caseId.

### B.3 Detay + review (4.5)
- `GET /api/client-intake-submissions/:id` → submission + fields.
- **claim** butonu: `POST /:id/claim` (CLIENT_SUBMITTED→IN_REVIEW). Review aksiyonları yalnız IN_REVIEW + claim sonrası aktif.
- Her field satırı: değer + **Onayla/Reddet** (`POST /api/client-intake-fields/:id/review {decision,note}`). Toplu seç + bulk (`POST /:id/fields/bulk-review`).
- **reject submission** butonu (`POST /:id/reject`).
- PROMOTED alan: kilitli gösterilir (4.5 dokunamaz).

### B.4 Promote (4.6) — UI'da review'dan AYRI bölüm (review ≠ promote)
- **Mimari sınır UI'da da görünür:** promote, review'dan **ayrı bir aksiyon/bölüm** (örn. "Kanoniğe İşle" sekmesi). Onay≠oluşturma; promote bilinçli ek adım.
- **Borçlu seçimi:** promote `debtorId` ister → dosyanın borçlularından **dropdown** (mevcut case-debtor uçundan; 47-4). 
- **Soft-intel promote:** `POST /api/client-intake-submissions/:id/promote { debtorId }` → sonuç `{ promoted[], skipped[], submissionStatus }` ekranda gösterilir.
- **Address promote (HYBRID):** her ADDRESS alanı için: **ham rawAddress READ-ONLY göster** + personel **street/city/district…** girer → `POST /api/client-intake-fields/:id/promote-address { debtorId, street, city, ... }`.
- **Sonuç gösterimi:** PROMOTED (✓ + hedef kayıt) · **DUPLICATE_ADDRESS** (uyarı: zaten var, yeni kayıt yok) · skipped (4.6b/c kategorileri). Sessiz başarı/yutma YOK.

### B.5 api.ts/intake-api.ts metodları (yalnız wrapper — yeni backend yok)
`listIntakeSubmissions` · `getIntakeSubmission` · `claimSubmission` · `reviewField` · `bulkReviewFields` · `rejectSubmission` · `promoteSubmission` · `promoteAddress`. (Mevcut uçlara ince sarmalayıcı; staff için authed api.ts veya intake-api.ts.)

## C) Test
- **Web testi vitest** (mevcut). Component/akış testleri: public form scope render + submit + generic mesaj + honeypot; staff list/detail render + claim/review/promote butonları doğru uç çağırır (api mock); DUPLICATE/skipped sonuç gösterimi.
- **Canlı/manuel doğrulama:** dev API'ye karşı public form submit → review queue'da görünür → claim → approve → promote → ClientIntelStatement/DebtorAddress yazılır (uçtan uca akış). (`/run` veya tarayıcı ile.)

## D) Açık kararlar (kodlamadan önce)
| # | Karar | Öneri |
|---|---|---|
| 47-1 | public form route | **`/intake/[token]`** (dashboard dışı, public; base URL ile uyumlu) |
| 47-2 | staff UI yeri | **yeni `(dashboard)/intake`** üst-bölüm (kuyruk cross-case) |
| 47-3 | public form API: api.ts mi, ayrı mı? | **ayrı `lib/intake-api.ts` + no-auth fetch** (token sızıntısı yok + lib/api.ts conflict yüzeyi sıfır) |
| 47-4 | promote borçlu seçimi kaynağı | dosyanın CaseDebtor listesi (mevcut case detay/debtor uçu) — yeni backend yok |
| 47-5 | tek PR mi (A+B) iki PR mi? | **iki ayrı PR** (A public form · B staff UI) — daha küçük, bağımsız review |

## E) Bu fazda YAPILMAYACAKLAR
ASSET/CONTACT promote UI (4.6c sonrası) · captcha · dosya yükleme · portal entegrasyonu · otomatik adres parse · yeni backend endpoint · Party/IR-0/cross-case · `lib/api.ts` orta-satır düzenlemesi (conflict önleme).

> Onaylarsan (47-1..47-5 dahil) — özellikle tek-PR vs iki-PR (47-5) ve ayrı intake-api.ts (47-3) — 4.7'yi plan→additive kod (web)→vitest+manuel akış→PR ile yazarım. **Bu adımda kod yok.**
