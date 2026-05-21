---
status: rejected
rejection-date: 2026-05-19
rejected-by: ulas
review-trigger: "Mevcut altyapı kanıtlanabilir şekilde geri dönülmez şekilde bozulursa (örn audit log hash chain bütünlük kaybı)"
---

# Sıfırdan Kernel Rewrite

## Reason for Rejection

İlk mimari analizinde "Money Truth Kernel'i sıfırdan inşa et" yaklaşımı vardı. Deep scan (`04-deep-scan-findings.md`) gösterdi ki sistem zaten event-sourced bir kernel'e sahip:

- v28-engine event ingestion + fact store + outbox + timeline
- policy-engine sync gate
- interest-engine segmented calculator + version pinning
- IcrabotAuditLog hash chain
- evidence-bundle write-once seal

Rewrite:
- Mevcut yatırımı çöpe atar
- 6+ ay sürer (formalize 6-8 hafta)
- Mevcut 1000+ test çöpe gider
- Production altyapısı bozulur

## Reopen Trigger

Bu fikir şu durumda yeniden gündeme gelir:

- Mevcut altyapıda tahmin edilemeyen, geri dönülmez bir bütünlük kaybı olur (örn audit log hash chain manipülasyonu kanıtlanırsa)
- Tek başına bilinmeyen bir hukuki regülasyon (KVKK denetimi, mahkeme kararı) "bu altyapı kabul edilemez" derse
- Mevcut altyapı bakım maliyeti rewrite maliyetinden büyük olursa (kanıt: 3+ ay süreğen patch'ler)

## What Was Considered Instead

ADR-0001 (formalize vs rewrite). Formalize seçildi. Mevcut altyapı = canonical kernel.

## References

- ADR-0001 (formalize vs rewrite)
- `04-deep-scan-findings.md` (real baseline kanıtı)
