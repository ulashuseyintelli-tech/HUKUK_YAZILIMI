# admin_panel_spec_v12.md
## Amaç
Recipe/rule parametrelerini "kod deploy" olmadan yönetmek, çalışan job'ları izlemek, audit kanıtlarını tek ekranda görmek.

## Kullanıcı Rolleri
- Admin: Recipe, params, ui_map düzenler; sistem ayarı yapar.
- Ops: Job monitör eder, retry/disable yapar, lock açma talebi oluşturur.
- Avukat: Dosya bazlı görevleri onaylar/override eder; rapor görür.

## Ekranlar

### 1) Recipe Registry
- Liste: recipe_id, version, stage_tags, scope, trigger, risk_level, enabled
- Detay: YAML editor + şema doğrulama + diff viewer (vN-1 vs vN)
- Butonlar: Enable/Disable, Rollback, Clone, Dry-run validate

### 2) Params Registry
- rules_params, risk_scoring params, recovery params, installment params vb.
- Tür bazlı override UI (icra_type -> deadline)
- Yayınlama modeli: Draft -> Approved -> Active (3 aşamalı)

### 3) UI Map Registry
- Screen -> nav_path -> fields/actions/table mapping
- "Locator health check": son çalışan job'da element bulunma oranı

### 4) Job Monitor
- Filtre: case_id, debtor_id, stage, recipe_id, status, time range
- Kolonlar: started_at, duration, attempt, status, last_error_code
- Aksiyonlar: Retry now, Disable recipe for case, Quarantine case, Download evidence

### 5) Case Timeline (Dosya Zaman Çizgisi)
- Events + Facts + Decisions
- Her event'e tıklayınca: kaynak snapshot, hash, ilgili task'lar

### 6) Locks & Gates Dashboard
- Açık kilitler: LOCK_COST_ACTIONS, LOCK_EXECUTION_ACTIONS...
- Neden (opened_by) + çözüm önerisi
- "Request override" butonu (avukat onayı akışı)

### 7) Audit & Evidence Viewer
- Her aksiyon için: uyap_nav_path, snapshot_hash, proof refs, ekran görüntüsü
- İndirme: pdf paket / zip

## Güvenlik
- Her değişiklik: who/when/what + diff log
- Recipe değişikliği: en az 2 kademeli onay (Admin + Ops)
- PII maskeleme: TCKN/telefon/email görüntüleme kısıtları (role-based)

## Minimum API
- GET/PUT /admin/recipes/{id}
- GET/PUT /admin/params/{bundle}
- GET/PUT /admin/ui-map
- GET /jobs?filters...
- POST /jobs/{id}/retry
- POST /cases/{id}/quarantine
- GET /audit/{case_id}
