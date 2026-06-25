# CDT-1 — CaseDetailTabs Cleanup Forensic Inventory

> **Tür:** Read-only forensic / inventory. **Silme YOK · refactor YOK · re-wire YOK · UI davranışı YOK · backend/schema/migration YOK.**
> **Tarih:** 2026-06-24 · **main HEAD:** `9bc2245` · **Yöntem:** çok-ajanlı paralel yüzey taraması + git'e karşı
> bağımsız doğrulama. Karara temel olan veri (`UyapPanel` referans grafiği) **elle** teyit edildi.

## 1. Scope

`apps/web/src/components/case/CaseDetailTabs.tsx` ve onun import ettiği **14 panel** için canlı kullanım /
silinebilirlik denetimi. Silme/refactor/re-wire **yalnızca öneri**; hiçbir dosya değiştirilmedi. STATUS-1 caveat'ı
korunur: *CaseDetailTabs cleanup ancak re-wire ve C3/UYAP netleşirse güvenli.*

## 2. Search Method

- `git grep -n "<CaseDetailTabs"` (JSX mount) · `git grep -n "CaseDetailTabs"` (import/yorum).
- Barrel tüketim analizi (`components/case/index.ts`).
- Canlı case detay sayfası (`app/(dashboard)/cases/[id]/page.tsx`) + OperationDeck mount listesi.
- 14 panelin her biri için "CaseDetailTabs + barrel DIŞINDA canlı referans" çapraz kontrolü.
- Dışlanan gürültü: `node_modules/`, `dist/`, `.next/`.

## 3. Findings by Surface

- **Mount:** `<CaseDetailTabs>` JSX = **0**. Direct import = **0**. Barrel'dan export edilir (`index.ts:68`) ama
  **tüketilmez** (case barrel'dan canlı tüketilen tek şey `BulkDocumentGenerator`). Canlı koddaki tüm CaseDetailTabs
  referansları yorum ("(ölü) CaseDetailTabs"). **→ CaseDetailTabs ÖLÜ (unmounted).**
- **Canlı replacement:** `page.tsx` → OperationDeck (akordeon panelleri) + HacizHistoryCard (C1) + TebligatCard (C2a/b) +
  PreHacizRiskCard (C3a, read-only risk) + ClaimItemPanel.
- **Re-wire durumu:** Haciz ✅ (HacizHistoryCard) · Tebligat ✅ (TebligatCard) · **UYAP ⏳ (OperationDeck UYAP yüzeyi
  boş/yok; PreHacizRiskCard yalnız read-only — submit/status/history orphaned).**

## 4. Classification Table

| Panel | Canlı referans (CDT+barrel dışı) | Status |
|---|---|---|
| **TebligatPanel** | TebligatCard (canlı mount) | **ACTIVE_IMPORT — KORU** |
| **CaseHistoryPanel** | HacizHistoryCard (canlı mount) | **ACTIVE_IMPORT — KORU** |
| UyapPanel | — *(elle doğrulandı)* | DEAD_IF_CDT_DELETED · **UYAP_GATED** |
| ESignPanel | — | DEAD_IF_CDT_DELETED |
| BankPanel | — | DEAD_IF_CDT_DELETED |
| ValidationPanel | — | DEAD_IF_CDT_DELETED |
| InstrumentForm (Kambiyo) | — | DEAD_IF_CDT_DELETED |
| LeaseForm | — | DEAD_IF_CDT_DELETED |
| JudgmentForm | — | DEAD_IF_CDT_DELETED |
| CollateralForm | — | DEAD_IF_CDT_DELETED |
| CaseTimeline | — | DEAD_IF_CDT_DELETED |
| CaseNotes (case-notes) | — | DEAD_IF_CDT_DELETED |
| CaseAttachments (case-attachments) | — | DEAD_IF_CDT_DELETED |
| InterestCalculator (interest-calculator) | — | DEAD_IF_CDT_DELETED |

*(CaseDetailTabs.tsx kendisi + `index.ts:68` barrel satırı: import edilmediği için derleme açısından silinebilir görünür —
ama aşağıdaki "gated" maddeler nedeniyle toptan silme güvenli değil.)*

## 5. Live Usage Assessment

- **CaseDetailTabs mount'lu mu?** HAYIR — sıfır mount, sıfır direct import, barrel tüketilmiyor. Tamamen ölü.
- **Paylaşılan-canlı (CDT silinse de KALMALI):** `TebligatPanel`, `CaseHistoryPanel`. Bunlar silme adayı **DEĞİL**;
  yanlışlıkla silinirse canlı TebligatCard/HacizHistoryCard **kırılır**.
- **Yalnız-CDT (12 panel):** CaseDetailTabs DIŞINDA hiçbir canlı mount'u yok; CaseDetailTabs onları tutan TEK yer.
- **Elle doğrulama (UyapPanel):** `UyapPanel` import+mount yalnız `CaseDetailTabs.tsx:24/239` + barrel `index.ts:65`;
  hiçbir canlı page/OperationDeck mount'u yok. UYAP'ın submit/status/history yüzeyi canlıda **yok**.

## 6. Cleanup Risk Assessment

- **Önemli nüans (dürüstlük):** CaseDetailTabs zaten mount'suz olduğundan, 12 yalnız-CDT panel **şu an kullanıcıya
  zaten erişilemez**. Yani toptan silmenin riski "mevcut kullanıcı regresyonu" DEĞİL; risk **amaçlanan-ama-henüz-taşınmamış
  özelliklerin (re-wire kaynak materyalinin) kalıcı kaybı**dır (Haciz/Tebligat gibi bunlar da OperationDeck'e taşınacaktı).
- **TebligatPanel / CaseHistoryPanel:** re-wire edildiği için canlı; silinmemeli.
- **Derleme riski:** CaseDetailTabs + barrel satırı silinince tsc/build muhtemelen yeşil kalır (tüketilmiyor) — ama bu
  "güvenli" anlamına gelmez; özellik kaybı kararı ayrıdır.

## 7. Gated / Unsafe Cleanup Items

- **UYAP / C3 (UyapPanel):** canlı eşdeğeri YOK → **re-wire bekliyor, silinemez** (UYAP_GATED / C3_GATED).
- **Validation · Instruments(Kambiyo) · Lease · Judgment · Collateral · ESign · Bank · Interest · Timeline · Notes ·
  Attachments:** hepsi `ORPHANED` (canlı karşılığı yok). Her biri için **ya re-wire ya da Ulaş'ın açık "kapsam-dışı,
  silinebilir" ürün kararı** gerekir.
- **CaseHistoryPanel (history):** yalnız PARTIAL kapsandı (HacizHistoryCard haciz audit'i karşılar; genel geçmiş görünümü
  hâlâ orphaned) — ama panel paylaşılan-canlı olduğu için korunur.

## 8. Explicit Non-Goals

Silme YOK · component kaldırma YOK · route değişikliği YOK · tab sırası YOK · lazy-load/refactor YOK · C3/UYAP re-wire YOK ·
permission/RBAC YOK · backend YOK · migration YOK. Canlı UI runtime trace yapılmadı (mount sonucu statik kod kanıtına dayanır).

## 9. Recommended Next Gate + DECISION

**DECISION: `REWIRE_REQUIRED_BEFORE_CLEANUP`**
CaseDetailTabs ölü ve silmeye aday görünse de, onu tutan 12 panel canlı eşdeğeri olmayan özellikler içerir (en kritik:
UYAP). Dürüstlük kuralı gereği toptan silme şu an güvenli değil.

**Sıralı sonraki adımlar (her biri AYRI, onaylı gate):**
1. **C3 — UYAP re-wire** (UyapPanel → OperationDeck canlı yüzey) veya açık "UYAP kapsam-dışı" ürün kararı.
2. **Orphaned-feature ürün kararı** (Validation/Kambiyo/Lease/Judgment/Collateral/ESign/Bank/Interest/Timeline/Notes/
   Attachments): her biri re-wire mi, abandon mı? — küçük envanter + Ulaş kararı.
3. **Ancak (1)+(2) netleşince:** CaseDetailTabs.tsx + 12 yalnız-CDT panel + barrel satırı için **SAFE_TO_DELETE_AFTER_REWIRE**
   temizlik gate'i. `TebligatPanel` + `CaseHistoryPanel` **her halükârda korunur**.

**Bu PR'da temizlik yapılmaz.**

---

> **Kayıt:** CaseDetailTabs unmounted/ölü. İçindeki 2 panel (TebligatPanel, CaseHistoryPanel) re-wire edilmiş ve canlı →
> korunur. Kalan 12 panel yalnız-CDT ve canlı eşdeğeri yok (özellikle UYAP) → toptan silme **işlevsel kayıp riski** taşır.
> Karar: `REWIRE_REQUIRED_BEFORE_CLEANUP`. Gerçek silme, UYAP re-wire + orphaned-feature ürün kararı + ayrı temizlik gate'ine bağlı.

---

## 10. Re-verification (2026-06-25 · main `cb2203c`)

> **Tür:** docs-only re-verify şerhi. Kod/silme/refactor/re-wire YOK. Yeni forensic üretilmedi — bu bölüm yalnız §1-9'un
> hâlâ geçerli olduğunu mevcut main karşısında teyit eder.

Bu envanter `9bc2245`'te yazıldı. **`cb2203c`'de (88 commit sonra) tekrar doğrulandı; bulgular değişmedi:**

- **`<CaseDetailTabs>` JSX mount = 0** — kod tabanında hiçbir mount/direct import yok (yalnız bu doc + barrel `index.ts:68`
  re-export + 3 canlı kartın yorumları). → still dead/unmounted.
- **14 panel listesi değişmedi** — `CaseDetailTabs.tsx:23-36` aynı 14 paneli import ediyor.
- **2 canlı panel korunuyor** — `TebligatPanel` (→TebligatCard) · `CaseHistoryPanel` (→HacizHistoryCard).
- **12 orphan panel hâlâ orphan** — her birinin tek referansı kendi tanım dosyası + barrel re-export; `components/case`
  dışında hiçbir canlı mount kazanmadılar (UyapPanel dahil elle teyit).
- **Delta kanıtı:** `9bc2245..cb2203c` arasında `components/case` + `components/case-detail`'i değiştiren yalnız 2 commit
  (#479, #476 — legal-responsible) var; **ikisi de CaseDetailTabs'a veya 14 panelden herhangi birine dokunmadı.**
  CaseDetailTabs.tsx en son `407e3e2` (#123) ile değişti (migration öncesi).

**Verdict değişmedi: `REWIRE_REQUIRED_BEFORE_CLEANUP`.** §9'daki sıralı gate'ler (C3 UYAP kararı → orphaned-feature ürün
kararı → ayrı temizlik gate'i) geçerli. Bu re-verify hiçbir gate'i açmaz.
