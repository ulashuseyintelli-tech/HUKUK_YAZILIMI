# M2-G4 — Eskalasyon "Dosya Sorumlusu = gerçek kişi owner" yeniden bağlama + A5 geri-alma — Tasarım Kararı

> Durum: **KARARLAR KİLİTLİ — kod onay-bekliyor (gate-by-gate).** Kod yok. Flag KAPALI kalır.
> Tarih: 2026-06-22 · Repo HEAD (karar anı): `bd6d1a8` · Branch: `main`
> Karar veren: Ulaş · Hazırlayan: agent (kod düzeyinde doğrulanmış çelişki)
> İlgili: [`real-person-case-responsibility-design.md`](./real-person-case-responsibility-design.md) (Model-2) · [`case-task-escalation-design.md`](./case-task-escalation-design.md) (D hattı)

---

## 0. Tek cümlelik özet

**Dosya Sorumlusu işi yapan kişi DEĞİL; o dosyadaki işlerin koordinatörü/kontrol sorumlusudur.**
Görevi *yapan* = `Task.assigneeId` (DOER); *ilk hesap-verebilirlik/eskalasyon makamı* = Dosya
Sorumlusu (gerçek kişi). Mevcut kod bu ikisini birleştiriyor (A5 + D-motoru) → **ayrılacak.**

---

## 1. Problem: iki kavram birleştirilmiş (çelişki, kod düzeyinde kanıtlı)

Yeni ürün ayrımı:
- **Görev Sorumlusu** (`Task.assigneeId` → User) = işi **fiilen yapan** kişi (DOER).
- **Dosya Sorumlusu** (`Case.responsibleLawyer/Staff` → gerçek kişi) = dosyanın **koordinatörü**;
  gecikme/eskalasyonun **ilk** hesap-verebilirlik makamı.

Mevcut kod bunları **birleştiriyor:**

### Çelişki 1 — A5 (otomatik görev varsayılan sahibi) — DOĞRUDAN
5 call-site `task.assigneeId = case.sorumluPersonelId` (Dosya Sorumlusu = User) yazıyor:
```
scheduler.service.ts:517           İhbarname     assigneeId = caseData.sorumluPersonelId
scheduler.service.ts:599           Alacak Haczi  assigneeId = caseData.sorumluPersonelId
scheduler.service.ts:~808/811      Tebligat İade assigneeId = caseData.sorumluPersonelId
expense-notification.service.ts:392  Masraf Takibi assigneeId = request.case.sorumluPersonelId
expense-notification.service.ts:573  Masraf        assigneeId = request.case.sorumluPersonelId
```
→ Dosya Sorumlusu'nu doğrudan DOER yapıyor. **Yeni kararla çelişiyor.**

### Çelişki 2 — D-motoru RESPONSIBLE alıcısı — GİZLİ
`case-task-escalation.service.ts:208-215`:
```
if (tier === "RESPONSIBLE") {            // İLK eskalasyon kademesi
  const a = task.assignee;               // ← görevin assignee'sine çözülür
  return { emails: [a.email] };           // yorum: "Owner-first: assignee (Dosya Sorumlusu, User)"
}
```
Bu **yalnızca A5 ikisini birleştirdiği için** doğru görünüyordu. A5 düzeltilince RESPONSIBLE =
assignee = **DOER** olur → ilk uyarı yanlış kişiye (yapan) gider, Dosya Sorumlusu'na değil.

### Çelişki 3 (bonus) — yanlış varlık tipi
RESPONSIBLE alıcısı `task.assignee` = **User**. Model-2 Dosya Sorumlusu'nu **gerçek kişiye**
(`Case.responsibleLawyer/Staff`, email/mobilePhone'lu) taşıdı → alıcı hem yanlış kişi hem yanlış tip.

### Çelişki-OLMAYAN: 4-kademe ladder DOĞRU
`computeCaseTaskEscalationUpdate` (case-task-escalation-logic.ts): `RESPONSIBLE → TEAM_LEAD →
MANAGER → FOUNDER` = **Dosya Sorumlusu → Takım Lideri → Yönetici → Kurucu**. Onaylanan akışla
birebir. **State machine, içerik şablonları (D-G4), flag-gating, retry-guard, audit DEĞİŞMEZ.**

---

## 2. Ürün kararı (KİLİTLİ — Ulaş)

```text
- Dosya Sorumlusu DOER değildir (koordinatör/kontrol sorumlusu).
- A5'in assignee = Dosya Sorumlusu davranışı GERİ ALINACAK.
- Otomatik dosya görevleri default doer OLMADAN oluşabilir (assigneeId = null → ATANMAMIŞ).
  Doer sonradan manuel atanır (ileride görev-tipi bazlı rol-kuyruğu tasarlanabilir).
- CaseTaskEscalationService RESPONSIBLE alıcısı = task.assignee DEĞİL,
  case'in gerçek-kişi owner'ı (Case.responsibleLawyer/Staff).
- `assigneeId != null` filtresi KALDIRILACAK (atanmamış ama geç görev daha kritik; sahibi görmeli).
- Doer'a owner'dan ÖNCE hatırlatma YOK (ilk accountability uyarısı = Dosya Sorumlusu).
  Doer bildirimi ayrı görev-bildirim sistemi olabilir; eskalasyon zincirine karışmaz.
- D-line flag (CASE_TASK_ESCALATION_ENABLED) KAPALI kalır (açma = D-G6, ayrı ürün kararı).
```

---

## 3. Onaylanan akış

```text
Görev oluşur
  → doer atanmışsa doer işi yapar
  → doer yoksa görev ATANMAMIŞ kalabilir
Görev gecikirse (eskalasyon):
  1) ÖNCE  Dosya Sorumlusu (gerçek kişi)         [RESPONSIBLE]
  2) sonra Takım Lideri                          [TEAM_LEAD]   (yoksa atlanır — K-D2)
  3) sonra Yönetici Avukat                       [MANAGER]
  4) en son Kurucu / Büyük Patron                [FOUNDER] (+SMS, periyodik tekrar)
```

---

## 4. Düzeltme mimarisi (cerrahi — motor yeniden-yazımı DEĞİL)

### Fix-1 — A5 geri-alma (5 call-site)
`assigneeId = case.sorumluPersonelId` **kaldırılır** → `assigneeId` set EDİLMEZ (null/atanmamış).
Explicit assignee verilirse (manuel akış) korunur. Yorumlar "A5 reversal (M2-G4)" ile güncellenir.

### Fix-2 — RESPONSIBLE alıcısı yeniden bağlama (resolveRecipients)
`case-task-escalation.service.ts` RESPONSIBLE dalı: `task.assignee` yerine **case'in gerçek-kişi
owner'ını** çöz:
```text
case.responsibleLawyer (email/mobilePhone) varsa → o
else case.responsibleStaff (email/mobilePhone) varsa → o
else (legacy) case.sorumluPersonel (User.email) → fallback (geçiş; uyarı log'u)
else alıcı yok → SKIPPED (mevcut davranış)
```
Sorgu `include`'una `case.responsibleLawyer/responsibleStaff/sorumluPersonel` eklenir.
TEAM_LEAD / MANAGER / FOUNDER alıcıları **değişmez** (zaten Lawyer-tabanlı).

### Fix-3 — hedef sorgu: `assigneeId != null` kaldır
`case-task-escalation.service.ts:71-83` where'inden `assigneeId: { not: null }` çıkar. Disjointlik
**korunur** (operasyonel motor OPERATIONAL_COMPLETENESS; bu motor LEGAL_WORKFLOW + caseId — kategori
+ caseId ile zaten ayrık). Artık eskalasyon **case-sahibine** bağlı, göreve değil → atanmamış geç
görev de sahibine eskale olur.

### Değişmeyenler
`case-task-escalation-logic.ts` (state machine) · `case-task-escalation-content.ts` (şablon) ·
`tenant-notifier.service.ts` · `escalation.module.ts` · flag-gating · retry-guard · audit tablosu.

---

## 5. Gate planı (kod yok; her biri ayrı PR, onaylı)

| Gate | İçerik | Kod? |
|------|--------|------|
| **G4-DESIGN** | bu doküman | hayır |
| **G4a** | A5 geri-alma (5 creator; assignee defaultı kaldır) + test güncelle | evet |
| **G4b** | RESPONSIBLE rebind (owner=gerçek kişi + legacy fallback) + sorgu `assigneeId` filtresi kaldır + test | evet |
| **G4c** *(ops.)* | uçtan-uca doğrulama (flag KAPALI; recipient resolution birim+canlı) | evet |
| **D-G6** | *(ayrı/ertelenmiş)* flag açma = ürün+Av. kararı | — |

Sıra: G4a (assignee'yi serbest bırak) → G4b (eskalasyonu owner'a bağla). G4a tek başına güvenli
(flag kapalı; A5 yalnız assignee defaultını kaldırır). G4b motoru owner'a yönlendirir.

---

## 6. Impact (dosya/satır)

```text
A5 (Fix-1):  scheduler.service.ts ×3 · expense-notification.service.ts ×2   → assignee defaultı kaldır
D  (Fix-2/3): case-task-escalation.service.ts → resolveRecipients(RESPONSIBLE) + findMany where/include
Test:        scheduler-*.spec · expense (A5 testleri) · case-task-escalation.service.spec (RESPONSIBLE)
Dokunulmaz:  case-task-escalation-logic.ts · *-content.ts · tenant-notifier · module · flag
```

---

## 7. Ertelenen / açık (bloklamaz)

- **Doer atama akışı:** otomatik görevler atanmamış doğar; koordinatörün doer atamasını kolaylaştıran
  UI/akış = AYRI iş (görev modülü). Bu G4'ün parçası değil.
- **Görev-tipi bazlı rol-kuyruğu:** ileride otomatik görevlere varsayılan doer rolü = AYRI tasarım.
- **Doer bildirim sistemi:** "sana görev atandı" / "görevin yaklaşıyor" = AYRI sistem, eskalasyon değil.
- **Legacy fallback ömrü:** `sorumluPersonel` (User) fallback'i M2-G6 cutover'da gözden geçirilir.
- **Flag açma (D-G6):** canlı eskalasyon = ürün+Av. kararı; bu doc kapsamı dışı.

---

## 8. Kilitli kararlar özeti

```text
- Dosya Sorumlusu = koordinatör, DOER değil
- A5 assignee=sorumluPersonel GERİ ALINIR → otomatik görev atanmamış (assigneeId=null) doğar
- Escalation RESPONSIBLE = Case.responsibleLawyer/Staff (gerçek kişi), task.assignee DEĞİL
  (legacy fallback: sorumluPersonel User.email)
- Sorgu: assigneeId != null filtresi KALDIRILIR (case-sahibi bazlı eskalasyon; disjointlik korunur)
- Doer'a owner'dan önce hatırlatma YOK
- 4-kademe ladder + state machine + content + flag DEĞİŞMEZ
- Flag KAPALI kalır (açma = D-G6)
- Gate: G4a (A5 reversal) → G4b (RESPONSIBLE rebind + sorgu) ayrı PR'lar
```

---

> İlgili: [`real-person-case-responsibility-design.md`](./real-person-case-responsibility-design.md) ·
> [`case-task-escalation-design.md`](./case-task-escalation-design.md) ·
> [`case-responsibility-model-design.md`](./case-responsibility-model-design.md)
