# WP-1d-4b — Temporal Sorumluluk UI: Polish + Timeline Feasibility Envanteri

> **Durum:** Envanter / feasibility (yalnız döküman). Kod YOK, UI değişikliği YOK, backend YOK, migration YOK.
> **Amaç:** WP-1d-4a ile gelen "Sorumluluk Geçmişi" point-in-time panelinin (PR #437) cilalama (polish)
> fırsatlarını listelemek **ve** bir "sorumluluk değişim zaman çizelgesi (timeline)" UI'ının yapılabilirliğini
> (veri kaynağı / endpoint boşluğu / güven modeli) ölçmek; sonraki gate'leri **gated** olarak önermek.
> **Anchor:** [`case-responsibility-canonical-model-design.md`](./case-responsibility-canonical-model-design.md),
> [`wp1d-temporal-responsibility-query-contract.md`](./wp1d-temporal-responsibility-query-contract.md).
> **Ön sürüm:** origin/main `c16dec0` (WP-1d-4a #437 dahil).

---

## 1. Kısa hüküm

- **Point-in-time panel (#437) çalışıyor ve doğru kapsamda:** `GET /cases/:id/responsibility-at?asOf=` ile asOf
  tarihindeki operasyon sorumlusu + hukuki sorumlu avukatı, her biri kendi güven düzeyiyle, dürüstçe gösteriyor.
- **Gerçek bir "değişim zaman çizelgesi" (kim→kim, ne zaman, kim değiştirdi) UI'ı ŞU AN FRONTEND-ONLY YAPILAMAZ.**
  Sorumluluk değişim verisi yalnız `AuditLog`'ta (CASE `OPERATION_OWNER*` + CASE_LAWYER `isResponsible` geçişleri);
  bunu **listeleyen** read-only bir endpoint YOK (mevcut servis yalnız point-in-time `findFirst`). Mevcut
  `GET /cases/:id/timeline` ise farklı bir akış (`caseLifecycle`: CREATED/STATUS/TEBLIGAT/HACIZ/…) ve sorumluluk
  olaylarını İÇERMEZ. → Timeline UI, küçük bir **read-only liste endpoint'ine** bağlı = **backend-gated**.
- **Panel polish'i küçük ve frontend-only;** yüksek değerli tek-iki microcopy/keşfedilebilirlik öğesi var.
- **Bilinen kısıtlar dürüstlükle yönetiliyor** (CASE_LAWYER audit shape + tarihsel isim çözümü); timeline bu
  kısıtları satır-bazında güven düzeyiyle taşımak zorunda.

---

## 2. Mevcut durum (WP-1d-4a / #437)

- `components/case/responsibility-at-panel.tsx` (read-only): tarih/saat seçici (default now), iki blok
  (operasyon sorumlusu + hukuki sorumlu avukat), her blokta kişi · Geçerlilik Tarihi · Değiştiren Kullanıcı ·
  kendi Güven Düzeyi (etiket + tooltip + "Kaynak"). Loading/error/empty durumları. İsim çözümü best-effort
  (`/cases/responsible-candidates` + `/users`), çözülemezse dürüst fallback.
- `lib/responsibility-at.ts`: saf yardımcılar (path, confidence label/tooltip/badge, ISO).
- Confidence-first dürüstlük: `UNKNOWN_BEFORE_HORIZON`'da isim "Bu tarih için kesin kayıt yok" (≠ "Atanmamış").

---

## 3. Panel polish envanteri

| ID | Konu | Mevcut davranış | Öneri | Karar |
|---|---|---|---|---|
| P1 | Tarihsel isim çözümü | Owner/avukat artık aktif aday değilse `(kayıt)` gösterilir (dürüst ama isim yok) | tarihsel kişi lookup'ı endpoint gerektirir (yok) → kabul edilen sınır; istenirse ayrı gate | **DEFER** (kabul edilen sınır) |
| P2 | `Değiştiren Kullanıcı` | `/users`'a bağlı; başarısız/eksikse "Kullanıcı kaydı" | dürüst fallback yeterli; dokümante et | **LEAVE_AS_IS** |
| P3 | Keşfedilebilirlik | Default `now` → çoğunlukla EVENT_CONFIRMED/INFERRED; kullanıcı geçmiş tarih seçebileceğini fark etmeyebilir | küçük microcopy ipucu ("geçmiş bir tarih seçerek o tarihteki sorumluyu görün") | **DO_NOW-aday** (frontend, küçük) |
| P4 | Lookup tekrar fetch | Her panel mount'unda candidates+users çekiliyor (memoize yok) | düşük etki; gerekirse modül-içi cache | **DEFER** (düşük etki) |
| P5 | Önayar tarihler | Hızlı seçim yok (örn. "Şimdi", "Dosya açılışı") | opsiyonel preset butonları | **DEFER** (opsiyonel) |
| P6 | Zaman dilimi | datetime-local yerel; ISO (UTC) gönderilir; gösterim tr-TR | doğru; dokümante et | **LEAVE_AS_IS** |

> Polish'in tamamı frontend-only ve küçük; tek yüksek-değerli öğe P3 (keşfedilebilirlik microcopy).

---

## 4. Timeline UI feasibility (veri kaynağı analizi)

| ID | Bulgu | Sonuç |
|---|---|---|
| F1 | `GET /cases/:id/timeline` = `caseLifecycle` akışı (CREATED/STATUS_CHANGED/TEBLIGAT/HACIZ/TAHSILAT/NOTE/DOCUMENT/DURUSMA). Sorumluluk değişimi İÇERMEZ. | Mevcut timeline yeniden kullanılamaz |
| F2 | Sorumluluk değişim verisi yalnız `AuditLog`'ta: CASE `OPERATION_OWNER`/`OPERATION_OWNER_INITIALIZED` (entityId=caseId) + CASE_LAWYER `isResponsible` geçişleri (entityId=caseLawyerId). | Veri var ama liste-endpoint'i yok |
| F3 | `TemporalResponsibilityService` yalnız **point-in-time** (`findFirst` ≤ asOf). Değişim listesi (`findMany` + kronolojik) YOK. | Change-timeline için **yeni read-only liste endpoint'i** gerekir |
| F4 | CASE_LAWYER audit shape sınırı: `lawyerId` yalnız CREATE/DELETE'te; `metadata.caseId` yalnız WP-1d-2-pre sonrası event'lerde. Eski event'ler canlı junction ile çözülür (reliable=false). | Avukat timeline'ı **karışık güvenli** satırlar üretir → her satır kendi confidence'ı ile dürüst gösterilmeli |

**Sonuç:** Tam bir sorumluluk değişim timeline'ı **frontend-only yapılamaz**; küçük bir **read-only liste endpoint'i**
(`GET /cases/:id/responsibility-history` gibi: AuditLog OPERATION_OWNER* + CASE_LAWYER isResponsible event'lerini
kronolojik, satır-bazında confidence ile döndüren) ön-koşuldur. Bu **backend** işidir → ayrı, **onaya tabi** gate.

---

## 5. Kısıtlar / riskler

1. **Backend-gated:** Timeline, yeni read-only endpoint olmadan yapılamaz. "Yeni backend reconstruction yok"
   ilkesi gereği bu, WP-1d-4a/4b kapsamı DIŞINDA; ayrı tasarım+onay gerekir.
2. **Karışık güven (CASE_LAWYER):** Avukat sorumluluk geçmişi satırları reliable (yeni, metadata.caseId) ve
   inferred (eski, junction) karışımı olacak → yanlış kesinlik YASAK; her satır kendi confidence'ı ile.
3. **Tarihsel isim çözümü (P1):** Geçmiş sorumlu artık personel/avukat değilse isim çözülemez (best-effort).
4. **Ufuk-öncesi (UNKNOWN_BEFORE_HORIZON):** Enstrümantasyon ufkundan önceki tarihler dürüstçe "kesin kayıt yok".

---

## 6. Önerilen sonraki gate'ler (gated)

- **WP-1d-4b-1 — Panel polish (frontend-only, küçük):** P3 keşfedilebilirlik microcopy (+ opsiyonel P5 presetler).
  Düşük risk, merge-on-green uygun. *İsteğe bağlı — değer düşükse atlanabilir.*
- **WP-1d-4c — Sorumluluk değişim timeline'ı (BACKEND-GATED):** Önce read-only `responsibility-history` liste
  endpoint'i (tasarım + onay), sonra timeline/event-list UI. "Yeni backend reconstruction yok" sınırını gevşetir
  → **açık ürün/onay kararı.**
- **Alternatif yön — WP-4a — Permission Tree / Office Role Model design doc:** Temporal iş şu an backend-gated
  bir sınırda; permission/rol modeli tasarımı (docs-first) bağımsız ve hazır bir sonraki adım.

---

## 7. Kapsam dışı (non-goals)

- Kod / UI / backend / endpoint / migration / audit değişikliği (bu PR yalnız döküman).
- Timeline UI'ın kendisi (F3 endpoint'i olmadan yapılamaz; backend-gated).
- Sorumluluk değiştirme / atama / devir aksiyonları (read-only ilke korunur).
- Reports / task / staff terminolojisi; permission tree implementasyonu.
