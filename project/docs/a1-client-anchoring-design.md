# A1 — Seçili Müvekkil OCR Anchoring (Kambiyo İlişki Motoru) — Karar Kaydı

**Durum:** A1-a/A1-b KODLANDI+MERGED · A1-c rol haritası **KİLİTLİ (güvenli mod)** · A1-c kodu bekliyor · A1-d HOLD
**Tarih:** 2026-06-22 · **Karar:** ulas

## Amaç
Yeni Takip → **Borçlular** adımında, OCR'dan çıkan taraflar ile **seçili müvekkil(ler)** arasında ilişki kur: müvekkil çek üzerinde nerede görünüyor (keşideci/lehtar/ciro) ve buna göre **borçlu adayı üretimini kapıla + kullanıcıya sinyal/uyarı ver**. Bu, "eşleştirme hatası" değil **kambiyo ilişki motoru** meselesidir.

## Mevcut altyapı (greenfield DEĞİL — REUSE)
- `apps/web/src/lib/client-match.ts` — `computeClientMatch(instrument, selectedClients)`; saf/deterministik (AI yok); location = `FRONT_DRAWER | FRONT_PAYEE | ENDORSEMENT | NOT_FOUND`; matchType = `IDENTITY | EXACT | SUFFIX | NONE`. Bu, ekrandaki "Müvekkil: Ciro/Yok" rozetini besler.
- Arka-yüz **endorsement** (ciro/kaşe isimleri) second-pass (P4-1) main'de; `inst.endorsementNames`.

## A1-a + A1-b — KODLANDI (PR #361, `2cc11bc`)
Mevcut `client-match`'i **gate + uyarıya** bağladı (frontend-only, payee'siz, backend/DB yok):
- `isReliableMatch` = `IDENTITY | EXACT` (gate yalnız GÜÇLÜ eşleşmede; `SUFFIX/NONE` zayıf).
- `matchClientToParty` (party'nin **yapısal** identityNo'su ↔ müvekkil, veya isim) + `isSelectedClientParty` (gate).
- `clientAnchorWarning` (non-blocking): müvekkil ne party'lerde ne enstrüman alanlarında güvenilir eşleşmezse uyarı; **müvekkil ciroda bulunursa uyarı çıkmaz** (anchored).
- DebtorStep: seçili müvekkille güvenilir eşleşen party → **borçlu adayı YAPILMAZ** + "Müvekkil eşleşti"; eşleşme yoksa → takip **bloklanmaz** + net uyarı.

## A1-c — ROL HARİTASI (KİLİTLİ — GÜVENLİ MOD)
**NET KİLİT:** Hiçbir yerde **otomatik kesin rol ataması YOK.** A1-c yalnızca **UI rol-sinyali / uyarı / review** katmanıdır. Kalıcı `Party`/`CaseParty` yazımı YOK. Ciro sırası YOK. #296 payee YOK.

Girdi: client-match `location` + `matchType`.

| Location | Karar | Aksiyon |
|---|---|---|
| **FRONT_PAYEE** | Payee OCR **güvenilmez** (kanıtlı: Şükrü→Süreyya misread) → **AUTO-ROL YOK** | Yalnız "olası lehtar/alacaklı — **DOĞRULA**" önerisi. `IDENTITY` yoksa kesin kabul yok. |
| **ENDORSEMENT** | Müvekkil ciro zincirinde (anchored) ama pozisyon (hamil/alacaklı vs ara ciranta/borçlu) **sıra gerektirir = A1-d HOLD** | **Anchored + REVIEW**; borçlu/alacaklı rolü **ATANMAZ**. |
| **FRONT_DRAWER** | Müvekkil keşideci = borçlu konumu; alacaklı beklenirken ters → **ANOMALİ** | Varsayılan uyarı: *"Seçili müvekkil keşideci olarak görünüyor; belge/müvekkil seçimi kontrol edilmeli."* Auto-rol YOK. |

**Güven seviyeleri (matchType → aksiyon):**
- `IDENTITY` (kimlik no eşit) / `EXACT` (isim birebir) → GÜÇLÜ → anchor + rol-**sinyali** (FRONT_DRAWER hariç=anomali).
- `SUFFIX` (şirket-eki farkı) → ZAYIF → **yalnız öneri/review; auto-anchor YOK.**
- `NONE` → eşleşme yok (A1-a uyarısı devrede).

**Çoklu müvekkil:** her müvekkil ayrı değerlendirilir (`allMatches`); konumlar raporlanır; çelişki (biri lehtar biri keşideci) → flag. **primary müvekkil = IDENTITY > EXACT > SUFFIX > first found.**

## Sınırlar / non-goals
- Kalıcı **Party Registry** (Party/CaseParty) yazımı YOK — Faz 0 (gerçek veri + Av. sign-off) bekliyor; A1 OCR-sonucu/wizard (transient) katmanında kalır.
- **#296 (payee second-pass) PARK** — canlı gate'te payee yanlış kişi + uydurma TCKN üretti (OCR data-kalitesi duvarı). A1 payee'ye bağımlı değil.
- **A1-d (ciro zincir sırası)** = HOLD (ayrı büyük epik; "müvekkilden önceki ciranta=borçlu" kuralı sıra gerektirir, OCR arka-yüz sırası güvenilmez).
- Per-page ön-yüz extraction prompt'una dokunulmaz.

## Sıra
A1-0 (#296 reconcile → STOP/PARK) ✅ · A1-a+A1-b (gate+uyarı) ✅ MERGED #361 · **A1-c (rol-sinyali/uyarı/review, güvenli mod)** ← sıradaki, yalnız bu sınırlarla kodlanır · A1-d (ciro sırası) HOLD.
