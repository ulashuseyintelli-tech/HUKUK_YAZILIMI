# M2-G5 — Rapor/Filtre "effectiveOwner" (gerçek kişi) yeniden bağlama — Tasarım Kararı

> Durum: **KARARLAR KİLİTLİ — kod onay-bekliyor (gate-by-gate).** Kod yok. Migration yok.
> Tarih: 2026-06-22 · Repo HEAD (karar anı): `d44acac` · Branch: `main`
> Karar veren: Ulaş · Hazırlayan: agent (kod düzeyinde doğrulanmış forensic)
> İlgili: [`real-person-case-responsibility-design.md`](./real-person-case-responsibility-design.md) (Model-2) · [`real-person-escalation-g4-design.md`](./real-person-escalation-g4-design.md) (G4 fallback deseni)

---

## 0. Tek cümlelik özet

Rapor ve filtreler hâlâ `Case.sorumluPersonelId` (User) üzerine kurulu. Model-2'de
sorumluluk **gerçek kişiye** (`responsibleLawyer`/`responsibleStaff`) taşındı; rapor/filtre
de **effectiveOwner** kavramına geçer. **Migration yok** (FK'ler M2-G1'de mevcut); yalnız
sorgu-yeniden-bağlama + geçiş fallback'i.

---

## 1. KİLİT KAVRAM — `effectiveOwner`

```text
effectiveOwner(case) =
    case.responsibleLawyer    (varsa)
  : case.responsibleStaff     (varsa)
  : legacy case.sorumluPersonel (User)   ← geçiş fallback'i (adoption tamamlanana dek)
```

- Rapor/filtre/gruplama **effectiveOwner** üzerinden çalışır.
- Fallback ŞART: cases'in **hepsinde** `sorumluPersonelId` var (A2 = yaratıcı), ama
  `responsibleLawyer/Staff` yalnız set edilince (G3b/G3c) dolu. Saf `responsible*` geçişi,
  adoption tamamlanana dek raporları **boşaltır** → legacy fallback ile legacy dosyalar da
  görünür kalır. (Bu, G4b eskalasyon motorunun kurduğu desenin AYNISI.)

## 2. KİLİT TANIM — Sahipsiz / `noOwner` (Model-2)

```sql
noOwner  ⇔  responsibleLawyerId IS NULL AND responsibleStaffId IS NULL
```

- **Önemli ayrım:** legacy `sorumluPersonelId` DOLU olsa bile, gerçek-kişi owner yoksa
  Model-2 açısından dosya **SAHİPSİZDİR**. (Eski `noOwner = sorumluPersonelId IS NULL` tanımı
  A2 sonrası yalnız pre-A2 legacy'yi yakalıyordu — yanlış.)
- `noOwner` artık effectiveOwner'ın **fallback'e düştüğü** (gerçek kişi yok) durumdur.

---

## 3. Etkilenen yüzey (forensic — kod düzeyi)

**Backend**
| Dosya:satır | Mevcut |
|---|---|
| `report.controller.ts:119,150` | `getCasesWithSummary` + `exportCases` `@Query('sorumluPersonelId')` |
| `report.service.ts:74-99` | `getPersonelReport` — **User** döngüsü, `sorumluPersonelId=user.id` |
| `report.service.ts:377` | `getCasesWithSummary` filtre `where.sorumluPersonelId` |
| `case.service.ts:775` | `findAll` noOwner = `sorumluPersonelId = null` |
| `case.service.ts:2063` | `getStats.ownerless` = `count(sorumluPersonelId=null)` |
| `case.service.ts:2162-2195` · `case.controller.ts:161` | `batchUpdate` (bulk-assign) `sorumluPersonelId` |

**Frontend**
| Dosya:satır | Mevcut |
|---|---|
| `reports/page.tsx:558,615,188` | person filtre dropdown + query-param (`/users`-bazlı) |
| `reports/page.tsx:919-935` | bulk-assign dropdown → `batch-update {sorumluPersonelId}` |
| `cases/page.tsx:1109` | cases-list "staff" filtre → `c.sorumluPersonel?.id` |
| `lib/bulk-assign.ts` | `{sorumluPersonelId}` payload |

## 4. Mevcut → Hedef

| Kullanım | Mevcut (User) | Hedef (effectiveOwner) |
|---|---|---|
| **A. Açık person filtre** | `sorumluPersonelId = X` | `responsibleLawyerId = X` VEYA `responsibleStaffId = X` (+ legacy fallback opsiyonu); dropdown = `/cases/responsible-candidates` (G2) |
| **B. Personel performans** | per-User, `sorumluPersonelId` say | per-Lawyer/Staff, `responsible*` say (+ legacy fallback) |
| **C. noOwner/Sahipsiz** | `sorumluPersonelId IS NULL` | **`responsibleLawyerId IS NULL AND responsibleStaffId IS NULL`** |
| **D. Bulk-assign** | `batch-update {sorumluPersonelId}` | `responsibleLawyerId`/`responsibleStaffId` (G3a PATCH semantiği reuse) |

## 5. Geçiş / legacy-compat

- **effectiveOwner fallback** her rapor/filtrede uygulanır (legacy dosyalar legacy owner'la görünür).
- **Query param geçişi:** yeni `responsibleLawyerId`/`responsibleStaffId` paramları eklenir; eski
  `sorumluPersonelId` paramı **geçiş için ya korunur ya da deprecated olarak DOKUNULMAZ** (kırma yok).
- **Backfill YOK** (sorumluPersonel → responsible* veri taşıma = M2-G6 cutover kararı, G5 değil).

## 6. Person-filter tasarımı (Lawyer/Staff)
- Filtre değeri: tek `sorumluPersonelId` yerine person-ref → `responsibleLawyerId` / `responsibleStaffId`
  (veya `{type, id}`). Dropdown = `/cases/responsible-candidates` (G2; 7 canonical kaynak).
- noOwner = both-FK-null (yukarıda); istenirse geçişte ayrı "legacy-ownerless" (sorumluPersonelId null) ölçümü tutulabilir.

## 7. Gate planı (kod yok bu doc; her biri ayrı PR, onaylı)

| Gate | İçerik | Migration |
|------|--------|-----------|
| **G5-DESIGN** | bu doküman | yok |
| **G5a** | Backend filtre rebind: `report.service` getCasesWithSummary/export + `case.findAll` → effectiveOwner (`responsible*` + legacy fallback) + query-param | **yok** |
| **G5d** | Frontend: reports filtre + cases-list filtre + bulk-assign → `responsible-candidates` dropdown + `responsible*` query/payload | yok |
| **G5b** | `getPersonelReport` → per Lawyer/Staff (`responsible*` say + legacy fallback) | yok |
| **G5c** | `noOwner`/`getStats.ownerless` → both-FK-null tanımı (Sahipsiz'in Model-2 anlamı) | yok |

Sıra: **G5a → G5d → G5b → G5c** (Ulaş kararı).

## 8. G5a dikkat (ilk code gate)
```text
- Migration YOK.
- effectiveOwner legacy fallback VAR.
- Yeni query paramları: responsibleLawyerId / responsibleStaffId.
- Eski sorumluPersonelId paramı: transition için KORUNUR veya deprecated-DOKUNULMAZ (kırma yok).
- case.service.ts'e dokunmak gerekiyorsa: paralel WIP kontrolü (sadece kendi hunk'ların staged).
```

## 9. Ertelenen / açık (bloklamaz)
- **Backfill** (`sorumluPersonel → responsible*`): M2-G6 cutover, G5 değil.
- **Adoption:** rapor/filtre değeri, dosyaların gerçek-kişi owner'a atanma oranına bağlı; fallback bunu köprüler.
- **`getPersonelReport` boyut seçimi:** yalnız-responsible mı, yoksa effectiveOwner (fallback dahil) mı gruplanır → G5b'de netleşir (öneri: effectiveOwner).

## 10. Kilitli kararlar özeti
```text
- Rapor/filtrelerde effectiveOwner = responsibleLawyer/Staff ?? legacy sorumluPersonel
- noOwner (Model-2) = responsibleLawyerId IS NULL AND responsibleStaffId IS NULL
  (legacy sorumluPersonelId dolu olsa bile real-person owner yoksa SAHİPSİZ)
- Migration YOK (FK'ler M2-G1'de mevcut; yalnız sorgu rebind)
- Eski sorumluPersonelId query paramı transition'da korunur/deprecated-dokunulmaz
- Gate sırası: G5a (backend filtre) → G5d (frontend) → G5b (personel rapor) → G5c (noOwner/stats)
- Backfill = M2-G6 (G5 değil)
```

---

> İlgili: [`real-person-case-responsibility-design.md`](./real-person-case-responsibility-design.md) ·
> [`real-person-escalation-g4-design.md`](./real-person-escalation-g4-design.md) ·
> [`sahipsiz-dosyalar-design.md`](./sahipsiz-dosyalar-design.md)
