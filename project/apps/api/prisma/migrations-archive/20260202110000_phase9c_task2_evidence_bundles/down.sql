-- ===============================
-- Phase 9C / Task 2: ROLLBACK Migration
-- Evidence Bundle System
-- ===============================
-- 
-- WARNING: Bu migration'ı rollback etmek TÜM evidence verilerini siler!
-- Production'da çalıştırmadan önce backup alın.

BEGIN;

-- Trigger'ları kaldır
DROP TRIGGER IF EXISTS bundle_seal_event_guard ON bundle_seal_events;
DROP TRIGGER IF EXISTS evidence_object_insert_guard ON evidence_objects;

-- Function'ları kaldır
DROP FUNCTION IF EXISTS trg_bundle_seal_event_guard();
DROP FUNCTION IF EXISTS trg_evidence_object_insert_guard();

-- Index'leri kaldır (tablolar silinince otomatik gider ama explicit olsun)
DROP INDEX IF EXISTS idx_bundle_seal_events_bundle_created;
DROP INDEX IF EXISTS idx_evidence_objects_bundle;
DROP INDEX IF EXISTS idx_evidence_objects_tenant_created;
DROP INDEX IF EXISTS idx_evidence_bundles_state;
DROP INDEX IF EXISTS idx_evidence_bundles_tenant_incident;
DROP INDEX IF EXISTS idx_evidence_bundles_one_open;

-- Tabloları kaldır (FK sırasına dikkat - child'lar önce)
DROP TABLE IF EXISTS bundle_seal_events;
DROP TABLE IF EXISTS evidence_objects;
DROP TABLE IF EXISTS evidence_bundles;

-- pgcrypto extension'ı kaldırmıyoruz - başka tablolar kullanıyor olabilir

COMMIT;
