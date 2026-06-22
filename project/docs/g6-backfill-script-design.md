# G6 Backfill Script — Tasarım Dokümanı

> **Statü:** Tasarım. **Kod / script / migration YOK. Dev DB'de apply YOK.**
> Bu doküman, legacy (gerçek-kişi owner'sız) dosyalara G6 kuralıyla `responsibleLawyerId`
> atayacak backfill script'inin **tasarımıdır**. Uygulama ayrıca onaylanır ve izole
> worktree'de kodlanır; öncesinde **prod'da dry-run forensic** koşulur.

İlişkili: Model-2 Dosya Sorumlusu (`case-responsibility-model`), G5c Sahipsiz tanımı,
A3a `validateResponsibleSelection` (atomik owner doğrulama).

---

## 1. Amaç

Legacy dosyalara, **per-tenant**, **idempotent**, **önce dry-run → ayrı onay → apply**
modeliyle gerçek-kişi (avukat) Dosya Sorumlusu yaz. Hiçbir veri sessizce değişmez; her
case için **reason/bucket** raporlanır; **tam rollback** mümkündür.

Konsept (kilitli):
- **Dosya Sorumlusu (Owner)** = dosyanın sahibi / koordinatörü / hesap veren.
- **Görev Sorumlusu (Doer)** = işi yapan (ayrı; `Task.assignee`).
- **Patron/Founder** = escalation zincirinin üst kademesi (literal kişi değil, **tenant-başına**).

---

## 2. Hedef (Target Predicate) & Idempotency

**Hedef:** `Case WHERE responsibleLawyerId IS NULL AND responsibleStaffId IS NULL`
(tenant-scoped). Bu, G5c **noOwner** tanımıyla birebir aynıdır.

- Atanmış dosya doğal olarak hedef-dışıdır → **re-run yalnız kalan null'ları** alır.
- Apply kesintide **resumable**; rollback `null→null` = no-op → **tümüyle idempotent**.
- `sorumluPersonelId`'ye **DOKUNULMAZ** (geçiş alanı; deprecate ayrı G6-cutover işi).
- Yalnız `responsibleLawyerId` set edilir; `responsibleStaffId` **hep null** kalır
  (kural avukat-merkezli). DB CHECK `Case_responsible_person_not_both` both-set'i ayrıca engeller.

---

## 3. Kural / Bucket Motoru — NİHAİ

Her hedef case için:
- `al` = **aktif avukat** sayısı (`CaseLawyer ⋈ Lawyer.isActive`)
- `resp` = `isResponsible = true` olan **aktif** avukat(lar)

| Bucket | Koşul | Aksiyon | Apply Aşaması |
|---|---|---|---|
| **R1** | `al == 1` | `responsibleLawyerId` = o avukat | **Faz-1 (oto)** |
| **R2** | `al > 1` ve `|resp| == 1` | = o tek sorumlu avukat | **Faz-1 (oto)** |
| **R3** | `al > 1` ve `|resp| == 0` | **founder fallback** | **Faz-2 (ayrı onay)** |
| **R4** | `al == 0` | **founder fallback** | **Faz-2 (ayrı onay)** |
| **AMBIGUOUS** | `al > 1` ve `|resp| > 1` | **manual queue** | — (asla otomatik) |
| **(founder yok)** | R3/R4 ama founder resolve edilemez | **manual queue** | — |

**Kilitli karar — AMBIGUOUS:** Birden çok `isResponsible=true` avukat = **veri çelişkisi**.
Patrona otomatik atamak yanlış olur → **manual queue** (founder fallback DEĞİL). Tek
"sorumlu" net seçilemiyorsa insan kararı gerekir.

Seçilen owner, yazılmadan **önce A3a `validateResponsibleSelection`** ile doğrulanır
(aktif + `canBeResponsible` + aynı tenant). Geçmezse → **SKIP + manual queue**.

---

## 4. Founder Resolution (per-tenant)

"Patron/Founder" **literal kişi değildir**; her tenant için çözülür. Zincir:

```
Office.escalationFounderLawyerIds[ilk aktif]
  → Office.escalationManagerLawyerIds[ilk aktif]
  → Office.escalationTeamLeadLawyerIds[ilk aktif]
  → null
```

`null` ise → o tenant'ın **R3/R4** case'leri SKIP + **manual queue** (backfill DOKUNMAZ).

> Kaynak: D-line escalation config ile aynı (Office). Sıra **açık karar** (§13).

---

## 5. Mod / Flag Tasarımı

| Flag | Davranış |
|---|---|
| `--dry-run` | **DEFAULT**, salt-okuma → hesapla + rapor + **pre-image snapshot**. Yazma YOK. |
| `--apply` | Yazar; tek başına yetmez (aşağıdaki kapılar zorunlu). |
| `--prod --confirm=<token>` | `--apply` için **ZORUNLU ek kapı** (typed onay). |
| `--tenant <id>` | Tek tenant; yoksa tüm tenant'lar. |
| `--chunk <n>` | Batch boyu (default 200). |
| `--only-buckets R1,R2` | **Seçici apply** — Faz-1 için zorunlu kullanım (§8). |

---

## 6. 🔴 Dev-Block (hard gate)

`--apply`, şu durumlarda **ABORT** eder (dry-run her yerde serbest):
- DB host `localhost`/`127.0.0.1` **VEYA** db adı dev/test pattern, **VEYA**
- `--prod`/`--confirm` yok.

→ **"dev DB'de update YOK" makineyle zorlanır**; insan hatasına kapalı.

---

## 7. Per-tenant Döngü + Chunk / Transaction Planı

```
for tenant in (hedef tenant'lar):
    founder = resolveFounder(tenant)            # §4
    hedef caseler cursor-pagination ile chunk'lanır (chunk=200)
    her case → bucket + chosenOwner hesaplanır  # §3
    (apply modunda) chunk TEK $transaction içinde yazılır
```

- Her **chunk tek `$transaction`** (atomik): chunk ya tam uygular ya geri alır.
  Önceki chunk'lar commit'li → kesintide **idempotent resume**.
- Update = PK ile **tek-satır** (`case.update responsibleLawyerId`) → **kısa lock**.
- **Giant-tx YOK** (uzun lock / WAL şişmesi). Chunk arası **checkpoint** yazılır.

---

## 8. Apply Stratejisi (KRİTİK — kademeli)

- **Faz-1 — `--apply --only-buckets R1,R2`:** Deterministik, kesin auto-assign
  (tek avukat / tek sorumlu). **Düşük risk** — başlangıç burası olmalı.
- **Faz-2 — `--apply --only-buckets R3,R4`:** Founder fallback. **AYRI apply + AYRI onay.**
  Çünkü founder fallback **gerçek kişiyi (patron) toplu değiştirir** → bağımsız gözden
  geçirme ve onay şart.
- **AMBIGUOUS** ve **founder-yok**: hiçbir fazda otomatik **yazılmaz** → manual queue.

> Tek seferde R1–R4 birlikte apply ÖNERİLMEZ; faz ayrımı geri-dönüş yüzeyini küçültür.

---

## 9. Raporlama (her case + özet)

**Per-case satır:**
`{ tenantId, caseId, fileNumber, bucket(R1|R2|R3|R4|AMBIGUOUS),
   chosenOwnerLawyerId|null, chosenOwnerName, reason, action(WOULD_ASSIGN|SKIP) }`

**Özet:** per-tenant + global bucket sayıları + **% (oto / founder-fallback / manual-queue)**.
Dry-run çıktısı = bu rapor + pre-image snapshot.

---

## 10. Export / Snapshot (pre-image — apply'dan ÖNCE ZORUNLU)

Her hedef case için:
`{ tenantId, caseId, fileNumber, sorumluPersonelId,
   responsibleLawyerId(null), responsibleStaffId(null), bucket, chosenOwner, reason }`

→ timestamp'li **JSON + CSV** (`backups/g6-backfill-<ts>/`). Bu snapshot **HEM dry-run
raporu HEM rollback kaynağıdır**. Apply sonrası **post-image** de yazılır (doğrulama).

---

## 11. Rollback Planı

- **Kaynak:** pre-image snapshot (hepsi eskiden `lawyer/staff = null` idi).
- **Geri-al:** `UPDATE Case SET responsibleLawyerId = NULL, responsibleStaffId = NULL
  WHERE id IN (snapshot.assignedIds)` ← **yalnız backfill'in attığı** id'ler.
- **Belt:** her atama `AuditLog(action=UPDATE, reason="G6_BACKFILL", bucket, owner)` →
  rollback audit'ten de hedefleyebilir.
- Rollback **idempotent** (`null→null` no-op) ve **dry-run'lı**.

---

## 12. Audit

Her yazma:
`AuditLog { tenantId, action:UPDATE, entityType:CASE, entityId:caseId,
  reason:"G6_BACKFILL", metadata:{ bucket, chosenOwnerLawyerId, ruleApplied } }`

→ izlenebilirlik + rollback hedefi + uyumluluk.

---

## 13. Execution Flow

1. **DRY-RUN** (default, prod) → rapor + pre-image snapshot. **Yazma yok.**
2. **İNSAN REVIEW** → %dağılım + founder-fallback + AMBIGUOUS/manual-queue onayı.
3. **APPLY Faz-1** (`--apply --prod --confirm --only-buckets R1,R2`) → chunk-tx + audit + post-image.
4. **APPLY Faz-2** (`--apply --prod --confirm --only-buckets R3,R4`) → **ayrı onay** sonrası.
5. **VERIFY** → dry-run tekrar: kalan null = yalnız AMBIGUOUS + manual-queue + founder-yok olmalı.
6. **ROLLBACK** (gerekirse) → snapshot'tan null'la.

---

## 14. Reuse (kod tekrarı yok)

- Hedef predicate = **G5c noOwner**.
- chosenOwner doğrulama = **A3a `validateResponsibleSelection`** (standalone fn).
- founder kaynağı = **Office escalation config** (D-line ile aynı).
- both-set guard = **DB CHECK** `Case_responsible_person_not_both`.

---

## 15. Kilitli Kararlar & Açık Sorular

**Kilitli:**
- **AMBIGUOUS** (R2'de >1 `isResponsible`) → **manual queue** (founder DEĞİL). Veri çelişkisi → insan kararı.
- **Founder fallback (R3/R4)** → **ayrı apply fazı + ayrı onay** (toplu gerçek-kişi değişimi).
- Backfill **avukat-only** (staff-owner backfill YOK; kural avukat-merkezli).
- **Dev'de apply YOK** (hard block).
- Dry-run **default**; apply **ayrı flag + prod-gate + typed confirm**.

**Açık (apply öncesi netleşmeli):**
- Founder zinciri sırası kesin mi (`founder → manager → teamLead`)?
- **PROD founder kapsamı:** her tenant'ta resolve edilebilen bir founder var mı?
  → prod dry-run forensic ile ölçülür; founder-yok oranı manual-queue hacmini belirler.
- Gerçek **% dağılım** (R1/R2 oto vs R3/R4 founder vs AMBIGUOUS/manual) yalnız **prod**
  veride anlamlı (dev'de temsil edici legacy yok — bkz. G6 forensic bulgusu).

---

## 16. Dev Forensic Notu (neden dev'de apply yok)

Dev DB (2026-06): 97 dosya · 1 gerçek-kişi-sahipli (`2026/9501`) · **96 legacy** ama
hepsi ayrı throwaway test-tenant'ında, **0 avukat + 0 `sorumluPersonelId`** (çıplak seed).
Gerçek çalışma tenant'ında (admin) **0 legacy**. → Dev'de backfill'i çalıştırmak da
ölçmek de **anlamsız**; gerçek dağılım **prod dry-run** ile çıkar. Bu yüzden script
dev-apply'ı **hard block** eder.
