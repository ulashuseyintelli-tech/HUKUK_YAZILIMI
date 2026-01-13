# Faiz Motoru Entegrasyon Planı

## Mevcut Durum Analizi

### ✅ TAMAMLANDI - Tüm Entegrasyon Adımları

**Tarih:** 14 Ocak 2026

### 1. InterestTypeCode Tekleştirme ✅

- `packages/types/src/interest.ts` oluşturuldu
- `packages/types/src/index.ts` güncellendi
- `domain.types.ts` tek kaynak olarak korundu
- Eski `types.ts` deprecate edildi

### 2. Rate Provider Prisma Entegrasyonu ✅

- `RateProviderService` Prisma desteği eklendi
- `setPrismaMode()` ile mod değiştirme
- `getRatesForPeriod()` async yapıldı
- `addRateToPrisma()` metodu eklendi
- Cache + TTL + Prisma hibrit çalışıyor

### 3. Strategy Entegrasyonu ✅

- `InterestEngineService` artık `StrategySelectorService` kullanıyor
- `selectStrategy()` metodu eklendi
- `applyStrategyDefaults()` ile strategy config'leri uygulanıyor
- `CalculationRequest`'e `caseType` ve `isCommercial` alanları eklendi
- `CalculationResult`'a `strategyUsed` alanı eklendi
- `ClaimBucket`'a `claimType` alanı eklendi

### 4. Prisma Audit Tabloları ✅

- `PrismaAuditService` oluşturuldu
- Mevcut tablolar kullanılıyor:
  - `InterestCalculationLog`
  - `InterestSegmentLog`
  - `RateSchedule`
- `createRun()`, `writeSegments()`, `finalizeRun()` metodları
- `flagForReview()`, `deleteOldRuns()` metodları

---

## Mimari Özet

### Tek Gerçeklik Kaynakları

| Kavram | Kaynak | Dosya |
|--------|--------|-------|
| InterestTypeCode | Enum | `domain.types.ts` |
| Rate Data | Prisma + Cache | `RateProviderService` |
| Strategy Config | Registry | `CaseTypeStrategyRegistry` |
| Audit Records | Prisma | `PrismaAuditService` |

### Servis Hiyerarşisi

```
InterestEngineService (Orchestrator)
├── StrategySelectorService → CaseTypeStrategyRegistry
├── RateProviderService → Prisma + Cache
├── PolicyGateV2Service → Mode Matrix
├── SegmentBuilderService → Day Count + Formula
├── AllocationEngineService → TBK 100 + Priority
├── LegalReportRendererService → Templates
├── AuditWriterService → In-Memory (test)
└── PrismaAuditService → Prisma (prod)
```

### Test Durumu

- **321 test geçiyor**
- 12 test suite
- Property-based tests dahil
- Golden scenarios dahil

---

## Sonuç

Motor artık "tek gerçeklik kaynağı" mimarisine kavuştu:

1. ✅ **Tek InterestTypeCode** - `domain.types.ts`'den import
2. ✅ **Tek Rate Provider** - Cache + Prisma + Coverage Map
3. ✅ **Strategy-driven Engine** - Case type'a göre otomatik config
4. ✅ **Kalıcı Audit** - KVKK uyumlu, Prisma ile sorgulanabilir

**Kazanımlar:**
- Aynı takipte farklı sayfalardan aynı enum/servis yüzünden çıkan "hayalet farklar" bitti
- Oran boşluğu/overlap gibi riskler tek bir yerde yakalanıyor
- LEGAL_REPORT üreten sistem, "delil zinciri"ni DB'den taşıyor
- Yeni takip tipi eklendiğinde Engine'i parçalamak gerekmiyor: sadece yeni Strategy ekleniyor
