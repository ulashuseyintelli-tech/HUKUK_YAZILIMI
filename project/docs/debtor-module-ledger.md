# Borçlular Modülü — Karar & İlerleme Kaydı (Ledger)

**Durum:** İlk-fix hattı (D1→D5) KAPANDI · **15 PR (#99–#113)** + tasarım notları
**Son commit:** `c9a1aff` (main) · **Tarih:** 2026-06-16

Bu belge, Borçlular sayfası A'dan-Z'ye denetiminden (salt-okuma forensic) doğan 15 PR'lık işin
tek-kaynak kaydıdır. Amaç: kararların ve açık backlog'un dağılmaması. Detaylar PR açıklamalarında.

---

## 1. Denetim Çıktısı (başlangıç)

Borçlular sayfası baştan sona incelendi (liste/CRUD/adres/sorgu/tebligat/export/tenant/completeness).
Bulunan ana sorunlar:

- 🔴 **Tek-kaynak ihlalleri:** `identityNo`/`name` drift; deprecated `addressType`/`isMernis` vs kanonik `type`/`source`; legacy `Debtor.addresses Json`.
- 🔴 **Edit yüzeyi eksik:** detay modalında adres yönetimi yok; Tereke düzenlenemiyor.
- 🔴 **Ölçek hatası:** liste `limit=2000` ile tüm veriyi çekip client-side filtreliyor.
- 🔴 **Completeness kopuk:** borçlu eksikleri yalnız case-içi badge; Task'ta `debtorId` yok → görev/eskalasyon olamıyor.
- 🔴 **Export yok** (Müvekkiller/Takipler'de var).
- 🔴 **Prod kirliliği:** seed/test butonları üretim UI'sında.
- 🔴 **İki tebligat sistemi senkronsuz** (CaseDebtor.serviceStatus + Tebligat modeli).

---

## 2. PR Ledger (hangi PR neyi kapattı)

| PR | Faz | Kapatılan | Migration |
|----|-----|-----------|-----------|
| #99 | D1 | `update()` identity/name drift fix + seed butonları `isDev` gate | data yok |
| #100 | D2a | Detay modalı **adres CRUD** (ekle/düzenle/sil/birincil + kaynak/doğrulama) | yok |
| #101 | D2b | **Tereke (ESTATE) edit** (muris + mirasçı; atomik heir replace) | yok |
| #102 | D3 | **Server-side pagination** + search + type filtre (limit=2000 kaldırıldı) | yok |
| #103 | D4b | **Task.debtorId + taskSubType** enum + eskalasyon debtor-aware | additive |
| #104 | D4c | `computeDebtorMissingFields` + `syncDebtorTask` (completeness görevi) | yok (D4b kolonu) |
| #105 | D4d | Global liste **eksik-bilgi rozeti** (anlık compute) | yok |
| #106 | D4e-1 | **DebtorIntelligence** modeli + Task.addressId + subtype-aware eskalasyon | additive |
| #107 | D4e-2 | İstihbarat **tetikleri** (yeni adres / e-tebligat / iade → LOCATION görevi) | yok |
| #108 | D4e-3a | İstihbarat **sonuç yazma** (asimetrik DebtorAddress besleme + görev kapama) | yok (D4e-1 modeli) |
| #109 | D5-a | Adres yazımı **kanonik type/source** + idempotent backfill | data-only |
| #110 | D5-b-1 | **Tebligat → CaseDebtor** tek-yönlü senkron (istihbarat ortak-method) | yok |
| #111 | D5-c | **Server-side sorting** (sortBy/sortOrder + allowlist) | yok |
| #112 | D5-d | **Risk + şehir filtre UI** (backend zaten destekliyordu) | yok |
| #113 | D5-e | Borçlu **Excel + PDF export** (clients/cases deseni) | yok |

**Tasarım notları (kod yok):** D4a (completeness design), D4e (intelligence design), D4e-3 forensic, D5-b forensic.

---

## 3. Kilit Mimari Kararlar (gerekçeli)

- **Identity tek-kaynak:** `name`/`identityNo` her `update()`'te `??` merge ile yeniden hesaplanır. Eski davranış yalnız ad-alanı değişince hesaplıyordu → tckn-only değişimde drift. (#99)
- **Adres kanonikleştirme:** debtor.service yazımı kanonik `type` (AddressType) + `source` üretir; deprecated `addressType`/`isMernis` KORUNUR (frontend display). Enum eşleme (hukuki): EV→DECLARED, IS→BUSINESS_HQ, TEBLIGAT→DECLARED, MERNIS→MERNIS, KEP→KEP. Backfill yalnız `type=DEFAULT 'DECLARED'` satırlar, idempotent (manuel düzeltmeyi ezmez). (#109)
- **Completeness ≠ Intelligence:** Completeness = "veri eksik mi?" (deterministik, oto-sync). Intelligence = "sahada ne var?" (olay-tetikli, insan/kanıt). ORTAK Task altyapısı + `taskSubType` (CLIENT_CONTACT/DEBTOR_INFO/DEBTOR_INTELLIGENCE); AYRI rule-engine. (#103–#108)
- **İstihbarat borçlu-anchored + adres-referanslı:** Task=iş emri, `DebtorIntelligence`=sonuç+kanıt. dedupe `INTEL:LOCATION:{debtorId}:{addressId}` (caseId YOK). (#106–#108)
- **Asimetrik adres besleme (J-d):** VERIFIED_PRESENT güçlendirir (verified=true/FIELD/confidence↑); VERIFIED_ABSENT otoriter (UYAP/MERNIS/Kurum) `verified`'i KÖRLEMESİNE ezmez → riskFlag + confidence↓. (#108)
- **Tebligat yakınsama:** Kanonik canlı durum = `CaseDebtor.serviceStatus`; `Tebligat` = entegrasyon/evrak. Tek-yön senkron (Tebligat→CaseDebtor), atomik (aynı transaction). İstihbarat tetikleri ORTAK method → Tebligat sonuçlarında kaçmaz. (#110)
- **Liste server-side:** pagination + search + type + risk + city + sorting hepsi backend; sorting allowlist `[name,identityNo,type,createdAt,updatedAt]` (computed/relation alana girmez). (#102/#111/#112)
- **Export filtreli + sayfalamasız:** liste filtreleriyle uyumlu, tüm sonuç. (#113)

---

## 4. Açık Backlog (BİLİNÇLİ ertelendi — ilk-fix DIŞI)

| İş | Neden ertelendi | Tür |
|----|------------------|-----|
| **D4e-3b** haciz soft-uyarı | call-site dağınık (EnforcementAction + UYAP haciz); forensic gerek | yüksek ticari değer |
| **D4e-4** intelligence→haciz read-model skor | D4e-3b'den sonra | orta |
| **D5-b** UETS/KEP delivered sync + tam yakınsama (D5-b-3) | ilk sürüm PTT yolu yeterliydi | orta |
| deprecated `addressType`/`isMernis` kolon KALDIRMA | tüm yazım kanonikleşti ama frontend display hâlâ okur; backfill sonrası şema-kaldırma en son | düşük |
| ölü `DebtorIssue` kodları (NO_ASSET_QUERY/RISK_CONCORDAT/RISK_ADDRESS_SUSPECT/STALE_30D) | emit edilmiyor; ya emit ya kaldır | düşük |
| global liste ham telefon/e-posta masking | gizlilik notu | düşük |
| legacy `Debtor.addresses Json` kaldırma | ölü alan | düşük |
| case update/delete cancel-only (önceki strand) | frontend koordinasyonu | bekliyor |

---

## 5. Riskler

- **İki tebligat sistemi hâlâ tam birleşmedi:** D5-b-1 yalnız PTT sonuç yolunu senkronlar. UETS/KEP delivered ve manuel Tebligat status değişimleri henüz CaseDebtor'a akmıyor → kısmi divergence sürebilir.
- **Deprecated adres kolonları çift-okuma:** frontend display `addressType` okur, motor `type` okur. Kolon kaldırılana kadar iki alan paralel; yeni yazım kanonik ama eski satırlarda (backfill kapsamı dışı edge) tutarsızlık olabilir.
- **Intelligence haciz'e bağlı değil:** istihbarat sonucu (VERIFIED_ABSENT vb.) haciz kararını henüz UYARMIYOR → ticari değerin asıl kısmı (D4e-3b/4) açık.

---

## 6. Önerilen Sonraki Sıra (ulas kararı)

1. ✅ **Bu ledger** (karar kaydı sabitleme)
2. **D4e-3b** haciz soft-uyarı **forensic** (kod yok) — istihbaratın asıl ticari değeri
3. deprecated `addressType`/`isMernis` kolon kaldırma için **final cleanup forensic**
4. UETS/KEP tebligat sync **forensic**

İlgili: `decision-point-inventory.md`, ADR-007/008.
