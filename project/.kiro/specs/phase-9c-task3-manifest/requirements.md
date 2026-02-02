# Phase 9C Task 3 - Bundle Manifest Requirements

## Overview

Sealed evidence bundle'ı tek dosya manifest ile dışarı çıkarılabilir ve doğrulanabilir yapmak.

## Functional Requirements

### FR-1: Manifest Schema (v1.0.0)
- Manifest SEALED bundle için üretilir (OPEN için manifest yok)
- Schema versiyonu forward compatibility için zorunlu
- Tüm timestamps ISO 8601 UTC (Z suffix)
- Tüm bigint değerler string olarak serialize edilir
- Objects listesi objectKey ASC sıralı

### FR-2: Manifest Storage
- Seal anında otomatik yazılır (zorunlu)
- Write-once semantics (overwrite yok)
- Key format: `bundles/{bundleId}/manifest.json`
- Re-export API mevcut manifest'i döndürür, yeniden yazmaz

### FR-3: Hash Hierarchy
- `sealedHash`: Object content hash (bundle-seal.hasher'dan)
- `manifestHash`: Envelope hash (tüm manifest, manifestHash alanı hariç)
- İki hash farklı amaçlara hizmet eder, eşit olmak zorunda değil

### FR-4: Canonical JSON
- Object keys lexicographic (ASCII) sıralı
- Array ordering: objects objectKey ASC
- Whitespace yok (minified)
- UTF-8 encoding

### FR-5: Signature Preparation
- `signature` alanı şimdi null
- Phase 10/11'de gerçek imza eklenecek
- Schema backward compatible

### FR-6: Verification
- manifestHash doğrulaması
- sealedHash doğrulaması (objects'ten yeniden hesaplama)
- S3 HEAD ile etag/size doğrulaması (opsiyonel)

## Non-Functional Requirements

### NFR-1: Determinism
- Aynı input → aynı output (byte-for-byte)
- Locale-independent serialization

### NFR-2: Write-Once
- Manifest bir kez yazılır, değiştirilemez
- Re-export sadece okuma yapar

### NFR-3: Audit Trail
- Manifest legal-grade audit trail için yeterli bilgi içerir
- sealRunId ile seal event'e bağlanabilir

## Constraints

- Sadece SEALED bundle için manifest üretilir
- bundleId tek gerçek anchor (tenant/incident path'e gömülmez)
- Manifest yazımı seal transaction'ı dışında (idempotent)

## Dependencies

- Phase 9C Task 2.5 (bundle-seal) ✅
- Phase 9C Task 1 (object-store, write-once) ✅
- Phase 9C Task 2 (DB migration) ✅
