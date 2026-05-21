---
status: active
review-trigger: quarterly
---

# Capability Escalation Triggers

Her capability'nin hangi koşulda `deferred`'dan `active`'a geçeceğini eşler.

İki tür trigger:
- **Technical:** Ölçek, performans, hata oranı (örn 1M+ events)
- **Business:** Kurumsal müşteri, denetim, KVKK (örn ilk 3rd party kurumsal müşteri)

İkisinden hangisi önce gerçekleşirse capability aktive olur. Hukuk yazılımında genellikle business önce gelir.

## Mevcut Eşlemeler

| Capability | Technical Trigger | Business Trigger | Owner | Current Status |
|---|---|---|---|---|
| Multi-currency support | 3+ FX alacaklı müşteri | İlk USD/EUR alacak | ulas | deferred |
| Snapshot verifier daemon | 1M+ events veya 30dk+ replay süresi | Audit denetimi günlük integrity check ister | ulas | deferred |
| Timeline explorer UI | 10k+ event/case | Audit ekibi günlük 5+ tarama | ulas | deferred |
| Replay UI (point-in-time view) | Event log büyüklük > 100k/case | Mahkeme bilirkişi raporu için sık kullanım | ulas | deferred |
| Interpretation profile switching | — | İlk Yargıtay yorum değişimi | ulas | deferred |
| Regulatory events stream | — | Toplu profile change ihtiyacı | ulas | deferred |
| Sealed artifacts (Trinity 4) | — | İlk tebligat/UYAP dispatcher | ulas | deferred |
| Bulk spec classification audit | — | Faz 1 vocabulary tamamlanır veya yeni geliştirici onboarding | ulas | deferred |
| Multi-region deployment | Region failover SLA gereksinimi | İkinci coğrafyada müşteri | ulas | deferred (rejected zone) |
| Microservice split | 5+ geliştirici + bounded context net | Iki ayrı domain (icra vs vergi) tek deploy'da çatışırsa | ulas | rejected |
| Kafka / distributed event bus | 1M+ async events/day | Real-time analytics kritik özellik | ulas | rejected |
| Generic workflow engine (Temporal/Camunda) | EventRuntimeService bakım haftalık 1+ gün | Çoklu domain tek motor talebi | ulas | rejected |
| Frontend rewrite | React major breaking | Mobile native istemci kararı | ulas | rejected |
| Kernel rewrite | Audit log integrity kanıtlanabilir kayıp | Hukuki regülasyon "kabul edilemez" derse | ulas | rejected |

## Disiplin

- Her satırın bir owner'ı olmalı
- Her trigger somut, ölçülebilir olmalı (örneğin "büyür" değil, "10k+ event/case")
- Çeyrek sonu review: hangi trigger yaklaştı, hangisi gerçekleşti?
- Trigger gerçekleşirse: capability `deferred`'dan çıkar, `active`'a geçer (yeni ADR ile)

## Önemli Not

Hukuk yazılımında **business trigger genellikle technical trigger'dan önce gelir**. İlk kurumsal müşteri 100 dosya tutsa bile KVKK silme talebi getirir → "kurumsal silme stratejisi" technical bir ölçek baskısı olmadan domain işi olur.

Bu yüzden iki ayrı sütun, ikisinden hangisi önce gerçekleşirse o tetikler.
