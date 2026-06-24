# STATUS-1 — Kanonik Strand Durum İndeksi

> **Amaç:** WP-1d / WP-1d-4 / WP-4 / CI-1 durumlarını tek kısa index'te toplamak, açık strand kalıp kalmadığını
> doğrulamak ve "devam edilecek en küçük güvenli gate" listesini çıkarmak. **Docs/inventory-only — kod YOK.**
> **Tarih:** 2026-06-24 · **main HEAD:** `1d4dfd2` · **Yöntem:** belge iddiaları git log'a karşı çapraz-doğrulandı
> (verify-live-not-just-code). WP-4'e dönülmez (kapalı kalır).

## 1. Doğrulama notu (belge vs git — otorite git)

Belge-iddialı CLOSED strand'lerin tüm PR'ları git history'de **bire-bir doğrulandı**:

- **WP-1d-4** PR'ları (`#422` WP-1d-0 contract `e4e1c48` dahil) → hepsi merged. (İlk taramada `#422` 40-commit
  log penceresi dışında kalmıştı; ayrı `git log --grep` ile **doğrulandı** → caveat kaldırıldı.)
- **WP-4** PR'ları (#440–#453) → hepsi merged, tam doğrulandı.
- **CI-1** (`#462` → `1d4dfd2`) → doğrulandı.

Belgeler **aşırı-iddia etmiyor**; CLOSED iddiaları git tarafından destekleniyor.

## 2. Strand durumları

### WP-1d / WP-1d-4 — Zamansal Sorumluluk (Temporal Responsibility) UI
- **Durum: KAPALI** (good-enough checkpoint, kapanış notu `#461`).
- Kanıt: WP-1d-0 contract `#422` · WP-1d-1 owner `#423` · WP-1d-2-pre metadata.caseId `#424` ·
  WP-1d-2 legal `#426` · WP-1d-3 combined endpoint `#427` · WP-2a/2b terminoloji `#428`/`#431` ·
  WP-1d-4a panel `#437` · 4b envanter `#439` · 4c-0 contract `#454` · 4c-1 backend `#455` ·
  4c-2 timeline `#457` · 4c-3 filtreler `#459`.
- Özet: Point-in-time panel + history timeline + tür/tarih filtreleri canlı; salt-okuma, confidence-dürüst,
  terminoloji-kilitli. Atama/devir/yazma/backfill/export açılmadı (ihtiyaç-gated).

### WP-4 — Yetkilendirme (Authorization / Permission Enforcement)
- **Durum: KAPALI** (good-enough checkpoint, kapanış notu `#453`).
- Kanıt: tasarım `#440`/`#441` · Faz0 envanter `#442` · credential hard guard `#443`/`#444` ·
  Faz1 diagnostics `#446` · warn-only `#448`/`#449` · Faz3 ilk hard guard `cases.delete` 403 `#452`.
- Özet: Credential açığı kapalı + warn-only audit + ilk yıkıcı hard guard. Full RBAC/permission-store
  **ihtiyaç-gated** (çok-kullanıcılı yetki ihtiyacı kanıtlanana dek açılmaz). **Bu strand'e dönülmez.**

### CI-1 — Confinement Test Kararlılığı
- **Durum: KAPALI** (`#462` → `1d4dfd2`).
- Özet: `includePassive` guard testi tam-suite timeout riski kapatıldı (ölçüme dayalı 20s timeout);
  tarama mantığı / kapsam / izinli set / ürün kodu DEĞİŞMEDİ.

## 3. Bu oturumun strand'leri açık mı?

**Hayır.** Bu oturumun sahiplendiği üç strand (WP-1d-4, WP-4, CI-1) git-doğrulanmış şekilde **KAPALI**.
Bu oturum kapsamında açık strand yok.

### Diğer strand'ler (bu oturumun kapsamı DIŞI — in-flight worktree'ler)
| Açık PR | Branch | Not |
|---|---|---|
| #463 | `codex/refresh-primary-cutover-readiness-after-blockers` | cutover-readiness docs |
| #408 | `feat/a1d-pre-g1-orientation` | OCR ciro çıkarımı (multi-rotation) |
| #407 | `balance-remaining-exposure-pr1b` | bakiye kalan-anapara/faiz exposure |
| #406 | `claim-item-wizard-multiitem-fix` | claim-item wizard çok-kalem fix |

**Eşleşen açık PR'sı olmayan worktree'ler (muhtemelen bayat):** `codex/alacak-payment-reversal-observe-readonly` ·
`audit/borclu-forensic` · `codex/borclu-forensic-20260623` · `casedetailtabs-migration-cleanup-a`.
**Detached HEAD (muhtemelen terk):** `HUKUK_demo` · `HUKUK_vkndedup`.
*(Bu strand'ler başka oturumların; bu index karar vermez — yalnız görünürlük.)*

## 4. En küçük güvenli sıradaki gate (dürüst sıralama)

> Kriter: **en küçük + en güvenli + kendi başına anlamlı + WP-4/permission/RBAC'e dönmeyen + legal-gated olmayan.**
> Forensic/inventory gate'ler önce (sıfır blast-radius); kod/balance/legal-gated olanlar caveat'lı, alt sırada.

1. **Deprecated `addressType` / `isMernis` kolon temizliği — FORENSIC (read-only)** · inventory · **risk: düşük** —
   *EN İYİ ÖNERİ.* Tüm yazımlar kanonik type/source kullanıyor (#109 merged); salt okuma-yolu teyidi + şema-drop
   planı dokümante et. Sıfır kod, STATUS-1'in docs-first ruhuna en uygun, kendi başına değerli.
2. **CaseDetailTabs cleanup — FORENSIC subset confirm (read-only)** · inventory · **risk: düşük** —
   Hangi panellerin canlı eşdeğeri kesin var, onu listele. **DİKKAT:** gerçek silme C3 UYAP re-wire'dan SONRA
   (kural: önce re-wire, sonra cleanup; C1/C2a tamam, C3 UYAP forensic bekliyor). Bu gate yalnız *forensic*; silme ayrı.
3. **Scheduler NAFAKA `DueType.PRINCIPAL` fix** · code · **risk: orta** — Gerçek latent footgun (`scheduler.service.ts`
   nafakayı PRINCIPAL yazıyor; NAFAKA/null olmalı). Dormant ama re-save/backfill'de computeBalance'ta nafaka
   ikilenir. Dar enum/mapper değişikliği — ancak balance semantiğine dokunur, dikkatli test gerekir.

### Bilinçli dışlananlar (smallest-safe DEĞİL)
- **TBK100 #404 overpayment guard (`excludedOutstanding`)** — gerçek defansif fix ama **balance/TBK100 hassas
  alanı**; "en küçük güvenli" değil. Ayrı, dikkatli bir gate olarak ele alınmalı (legal kararlar kilitli).
- **Balance display cutover (FAİZ=0 stub → computeBalance)** — **legal-gated** (Av. sign-off; gösterilen borç değişir).
- **WP-3b block enforcement · WP-1c-5 AuditLog userId sweep** — yetkilendirme/sorumluluk-enforcement alanı → DIŞLANDI.
- **WP-2b reports terminoloji** — sentez aday gösterdi ama git'te **zaten merged** (`#430`/`#431`) → **bayat, düşürüldü.**

### Yüksek-eforlu / legal-gated (bilgi için; sıradaki-küçük-gate değil)
ALACAK-OVERPAYMENT projection (Av./muhasebe sign-off) · UYAP C3 real SOAP (legal+güvenlik) ·
UETS/KEP elektronik tebligat (legal) · Debtor haciz call-site forensic (orta) · claim-item-wizard PR-2b (VKN dedup ön-koşul).

---

> **Kayıt:** Bu oturumun üç strand'i kapalı ve git-doğrulanmış. Önerilen sıradaki en küçük güvenli iş:
> **deprecated kolon temizliği forensic** (read-only, sıfır blast-radius). Seçim kullanıcıya aittir; bu index
> yalnızca güvenli düzlemi yeniden kurar. WP-4 kapalı kalır.
