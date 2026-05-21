---
status: pending
created: 2026-05-19
timeout: 2026-06-02
owner: ulas
investigation-needed: "DueType ve ClaimItemType aynı domain'in iki yüzü mü, ayrı kavramlar mı? Birleştirilmeli mi yoksa ayrı kalmalı mı?"
---

# DueType vs ClaimItemType — Kavramsal Ayrım

## Why Pending

İki enum büyük ölçüde örtüşüyor:

**ClaimItemType** (14 değer, claim-item modülü):
PRINCIPAL, INTEREST, PRE_INTEREST, POST_INTEREST, EXPENSE, FEE, ATTORNEY_FEE, PENALTY, CHECK_PENALTY, CONTRACTUAL_PENALTY, TAX_KDV, TAX_BSMV, TAX_KKDF, OTHER

**DueType** (13 değer, case modülü):
PRINCIPAL, INTEREST, EXPENSE, VEKALET_UCRETI, HARC, TAZMINAT, CEZAI_SART, NAFAKA, KIRA, AIDAT, KOMISYON, PRIM, OTHER

Örtüşen değerler: PRINCIPAL, INTEREST, EXPENSE, OTHER + (FEE ↔ HARC), (ATTORNEY_FEE ↔ VEKALET_UCRETI), (PENALTY ↔ TAZMINAT/CEZAI_SART)

Soru: **Bunlar aynı kavramın iki tasarımı mı, gerçekten farklı domain konseptleri mi?**

İlk hipotez:
- `ClaimItemType` = **alacak kalemi türü** = total receivable item, parasal toplam yapısı (örn "asıl alacak + işlemiş faiz + harç + vekalet ücreti = takip tutarı")
- `DueType` = **taksit/talep türü** = scheduled installment, dönemsel ödeme planı (örn nafaka her ay PRINCIPAL + INTEREST taksiti)

Eğer hipotez doğruysa: ayrı kalmalı, **ama mapping tablosu** olmalı (her DueType bir ClaimItemType'a karşılık gelir).

Eğer hipotez yanlışsa: tek enum yeterli, biri sunset edilir.

## Investigation Plan

1. `case.service.ts` `getCaseDues()` ve `createDue()` metodlarını oku — gerçek kullanım pattern'i ne?
2. `claim-item` modülü `getClaimItems()` ve `createClaimItem()` — fark ne?
3. Prisma schema'da `Due` ve `ClaimItem` modelleri arasında foreign key var mı, nasıl ilişkili?
4. UI tarafında bir alacak nasıl gösteriliyor: due olarak mı, claim item olarak mı, ikisi de var mı?
5. **Kritik soru:** TBK 100 mahsup `Due` üzerinden mi yoksa `ClaimItem` üzerinden mi yapılıyor?

## Possible Resolutions

- **Active'e dönerse (ayrı kavram):** ADR-0005 yazılır. Mapping tablosu (DueType ↔ ClaimItemType) Faz 1 vocabulary unification içinde kayıt altına alınır.
- **Active'e dönerse (birleştir):** Migration spec yazılır, `Due` modeli `ClaimItem`'a refactor edilir. **Faz 2 işi** — Faz 1 kapsamı dışı.
- **Deferred'a dönerse:** Mevcut iki enum sürdürülür, mapping tablosu Faz 2'ye kalır, aggregate boundaries belgesinde "iki kavram ayrı, mapping deferred" diye işaretlenir.

## Timeout

2026-06-02 (created + 14 gün, bir review cycle).

Aşılırsa default: `deferred` (mevcut iki kavram olduğu gibi sürdürülür, aggregate design "iki ayrı kavram" varsayar).

## References

- `03-vocabulary-unification.md` Backend tablosu #25, P1 satırı
- `prisma/schema.prisma` `enum DueType`, `enum ClaimItemType`
- `apps/api/src/modules/case/dto/case.dto.ts` `enum DueType`
- `apps/api/src/modules/claim-item/dto/claim-item.dto.ts` `enum ClaimItemType`
