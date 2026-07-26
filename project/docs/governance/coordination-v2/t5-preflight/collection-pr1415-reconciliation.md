# T5 Preflight — COLLECTION PR #1415 Reconciliation

```text
Task            : GOV-COORD-V2-T5-PREFLIGHT-RECONCILIATION-R01, kapsam 2
Base            : origin/main @ 7fcd3b98
DISPOSITION     : MERGED_WITHOUT_MATCHING_GOVERNANCE_RECORD
Nitelik         : HAZIRLANMIŞ reconciliation — ratifiye DEĞİL
Retroactive yetki: ÜRETİLMEDİ
```

## 1. Exact repository evidence

```text
PR              #1415
title           feat(collection): add confirmedAt schema foundation
branch          codex/rc-col-w2-2d1-confirmed-at  ->  main
merged          2026-07-18T18:35:53Z
squash SHA      80a11c2a4dff047e86879d8628cdb090fae66743
parent          8bf0a7fc
author          ulashuseyintelli-tech
GitHub review   0 review, reviewDecision yok
origin/main     ANCESTOR — evet
```

Değişen dosyalar — **tam kapsam, iki dosya, 4 satır**:

```text
project/apps/api/prisma/schema.prisma                                    +1  -0
project/apps/api/prisma/migrations/
  20260718210000_rc_col_w2_2d1_collection_confirmed_at_foundation/
  migration.sql                                                          +3  -0
```

Migration içeriği tam metin:

```sql
-- AlterTable
ALTER TABLE "Collection"
ADD COLUMN "confirmedAt" TIMESTAMP(3);
```

Schema etkisi (`schema.prisma:2410-2412`, 7fcd3b98'de doğrulandı):

```prisma
status       CollectionStatus @default(CONFIRMED)
confirmedAt  DateTime?
cancelledAt  DateTime?
```

Migration zincirindeki konum: **86 / 103**, monotonik, sıralı komşuları
`20260718140000_office_reporting_line_date_range` ve
`20260720174245_legal_application_batch_foundation`. Zincir bozulmamış.

`Collection.confirmedAt` alanı 7fcd3b98'de **üretim kodunda hiç okunmuyor ve hiç
yazılmıyor** — `apps/api/src`, `apps/web/src` ve `packages` üzerinde test/fixture
hariç arama boş döner.

## 2. W2.2D-1 ile ilişki — PR'ın kendi beyanı

İlişki dolaylı çıkarım değil, PR'ın kendi metnidir:

- branch adı: `codex/rc-col-w2-2d1-confirmed-at`
- migration adı: `..._rc_col_w2_2d1_collection_confirmed_at_foundation`
- PR body ilk satırı: *"Adds the additive persistence foundation for
  `Collection.confirmedAt` **under RC-COL / W2.2D-1**."*

Dolayısıyla `NOT_PART_OF_W2_2D_1` disposition'ı **elenir**. Bu değişiklik
W2.2D-1'in bir parçası olarak icra edilmiştir.

PR body'sinin *Follow-up* bölümü iki şeyi kendisi kaydeder:

```text
"Runtime population of confirmedAt is intentionally deferred to W2.2D-2 and
 requires a separate owner gate."
"W2.2D-1 governance closure reconciliation remains separately owner-gated."
```

İkinci cümle, governance kaydının o an tamamlanmadığının PR tarafından
**kabulüdür**.

Ek bulgu: `W2.2D-2` ifadesi `project/docs/governance/` altında **hiçbir yerde
geçmiyor**. PR body'si var olmayan bir governance ID'sine atıf yapıyor.

## 3. Governance kaydı araması — sonuç: yok

`project/docs/governance/` altında `1415`, `80a11c2a`, `20260718210000` ve
`confirmed_at_foundation` için tek eşleşme:

```text
decision-log.md:335  — CLIENT-P1-BP-01-GOV kaydı, `origin/main` `80a11c2a`
                       bazlı izole worktree ifadesi
```

Bu bir **base-SHA anımsatması**dır; alakasız bir CLIENT governance kaydı
kendisinin hangi main SHA'sı üzerine kurulduğunu belirtiyor. #1415'i tescil
etmez, ona atıf yapmaz, onu bir workstream'e bağlamaz.

Başka hiçbir kayıt yok. `decision-log.md`, `COLLECTION-GOVERNANCE.md`,
`COLLECTION-DECOMPOSITION.md`, `COLLECTION-RISK-REGISTER.md`,
`master-triage-register.md`, `product-backlog.md`, `canonicalization-register.md`
— hiçbirinde #1415 girişi yoktur.

## 4. Zamanlama — yetkisizlik merge anında yürürlükteydi

Bu, disposition'ı `MERGED_UNDER_DIFFERENT_AUTHORITY`'den ayıran belirleyici
kanıttır. Tüm saatler +0300 yereldir:

```text
18:55:50   1156e4de   W2.2D-0 guard implementation merge (PR #1407)
20:10:50   1c73b7d9   docs(collection): record W2.2D-0 closure evidence
21:35:53   80a11c2a   PR #1415 — confirmedAt schema foundation merge
```

`1c73b7d9` ile gelen metin (`COLLECTION-GOVERNANCE.md:645-647`):

```text
"Collection.confirmedAt ve match-projection hardening hâlâ tamamlanmamıştır.
 W2.2D-1 yalnız sonraki owner gate'tir; W2.2D-1/W2.2E/W2.3 veya başka runtime
 implementation bu kapanışla yetkilendirilmez."
```

Ancestry testi: **`1c73b7d9` `80a11c2a`'nın atasıdır.** Yani bu metin #1415'in
üzerine kurulduğu ve merge edildiği ağaçta zaten mevcuttu — merge'den **85
dakika önce** yazılmış ve tazeydi.

`COLLECTION-DECOMPOSITION.md:487` bugün hâlâ aynı şeyi diyor:

```text
W2.2D-1 : OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED
```

## 5. Disposition ve gerekçe

```text
DISPOSITION: MERGED_WITHOUT_MATCHING_GOVERNANCE_RECORD
```

| Aday sınıf | Neden değil |
|---|---|
| `NOT_PART_OF_W2_2D_1` | PR body + branch + migration adı W2.2D-1 diyor |
| `MERGED_UNDER_DIFFERENT_AUTHORITY` | Alternatif bir authority kaydı **bulunamadı**; aksine merge anında yürürlükteki kayıt açıkça yetkilendirmiyordu |
| `INSUFFICIENT_EVIDENCE` | Kanıt bol ve tutarlı: PR, squash SHA, dosya listesi, migration içeriği, ancestry, zaman çizelgesi, arama sonucu |

Bir sınır: repository dışı bir owner GO (sohbet içi) **dışlanamaz**, çünkü
repository ile doğrulanamaz. Ancak PR body'sinin kendi beyanı bir authority
kanıtı değildir — kendi yazdığı bir PR'ın "yetkiliydim" demesi hiçbir zaman
kanıt sayılmaz. Bu yüzden disposition repository kanıtına göre verilir ve
sohbet-içi bir GO olasılığı §6'daki owner sorusuna dahil edilir.

GitHub review sayısının 0 olması **kanıt olarak kullanılmadı**: bu repoda owner
yetkisi governance kayıtlarında yaşar, GitHub review'ında değil.

## 6. Owner'a bırakılan karar — geriye dönük yetki üretilmedi

Bu kayıt #1415'i tescil **etmez** ve ona geçmişe dönük yetki **vermez**. Owner'ın
seçmesi gereken şey:

```text
A. #1415, W2.2D-1'in icra edilmiş ilk dilimi olarak tescil edilir.
   Bu durumda W2.2D-1'in statüsü artık "IMPLEMENTATION NOT AUTHORIZED"
   olamaz; kısmen icra edilmiştir ve kalan kapsam yeniden tanımlanmalıdır.

B. #1415 W2.2D-1 kapsamı dışında, bağımsız bir additive schema foundation
   olarak sınıflandırılır ve kendi ID'siyle kaydedilir. W2.2D-1 gate olarak
   dokunulmamış kalır.

C. Merge bir hata sayılır ve disposition (revert dahil) ayrıca kararlaştırılır.
   NOT: kolon canlı migration zincirindedir; revert bir schema kararıdır,
   bu görevin kapsamı DIŞINDADIR.
```

Hangi seçenek seçilirse seçilsin, **bu tescil W2.2D-1 için bir plan
pinlenmesinden önce yapılmalıdır** (contract §15.4): hesabı verilmemiş bir
merge'in üzerine pinlenen task spec'in baseline provenance'ı doğrulanamaz.

## 7. Bu kaydın nerede olmadığı — ve nedeni

Reconciliation'ın kanonik yeri normalde `decision-log.md` ve
`COLLECTION-GOVERNANCE.md`'dir. İkisi de
`governance-writer-coordination-protected-paths.json` içindeki
`grandfatheredOwnerWipExactPaths` listesindedir; V1 `deniedCapabilities`
`OWNER_WIP_MUTATION`'ı `DENIED` sayar ve `CLAUDE.md` "kullanıcıya ait WIP'e
dokunma" der. Bu yüzden o dosyalara **dokunulmadı**.

Kayıt bu nedenle additive bir preflight belgesi olarak yazıldı. Kanonik
register'lara işlenmesi bir owner işlemidir.

---

**AUTHORITY: NONE.** Bu belge hiçbir merge'i tescil etmez, hiçbir statü
değiştirmez, hiçbir execution grant üretmez.
