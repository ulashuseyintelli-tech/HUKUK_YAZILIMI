# UYAP Bot – Kurumsal Ölçek Katmanı (v38) – Tek Paket

Bu paket, MVP üzerine eklenen "SaaS / kurumsal ölçek" katmanını tek zip içinde verir.

Kapsam:
1) Multi-tenant (ofis/şube/tenant ayrımı)
2) RBAC (rol bazlı erişim) + PII maskeleme
3) Approval workflow (yüksek etkili aksiyonlar için onay)
4) KVKK / Audit / Immutable log
5) Email/PDF otomasyonu (weekly export gerçek) – iskelet
6) Job leasing / multi-worker ölçekleme (aynı işi iki worker kapmasın)
7) Rate limit / backpressure (UYAP yavaşsa sistem kendini kısar)
8) Billing / plan limitleri (opsiyonel)

Not: Bu katman "add-on"dır. Kod iskeleti + şema + endpoint taslakları sağlar.
Tarih: 2026-01-05
