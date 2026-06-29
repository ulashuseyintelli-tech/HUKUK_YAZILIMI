# Process Rules

Bu dosya AGENTS.md içindeki Agent Operating Standard v1.0'in kısa operasyonel özetidir. Bağlayıcı kaynak AGENTS.md'dir; çelişki halinde AGENTS.md uygulanır.

## Required Start

Her yeni görev çalışma seviyesi önerisiyle başlar:

```text
ÇALIŞMA SEVİYESİ ÖNERİSİ

- Faster
- Normal
- High
- Ultra

Neden: ...
```

## Required Pre-Analysis

Kod yazmadan önce en az şu başlıklar değerlendirilir:

- Çağıran yerler
- Impact Scope
- Multitenant etkisi
- Tablo ilişkileri
- Schema etkisi
- Migration etkisi
- Runtime etkisi
- Güvenlik etkisi
- Mevcut mimariyle uyumu

## Authority Modes

```text
GO-ANALYZE
↓
Yalnız analiz
Yalnız rapor
Kod yok
```

```text
GO-IMPLEMENT
↓
Kod / dokümantasyon değişikliği
Test / validation
CI gerekiyorsa çalıştır
Dur
Merge yok
Commit/PR yalnız ayrıca istenirse yapılır
```

```text
GO-COMPLETE
↓
Kod / dokümantasyon değişikliği
Test
CI
Merge
Remote Branch Cleanup
Local Branch Cleanup
Worktree Cleanup
Main Sync
Final Verification
Checkpoint
NEXT RECOMMENDED STEP
Dur
```

GO-COMPLETE verilmişse merge, cleanup, main sync, final verification ve checkpoint tek operasyon sayılır. Kullanıcı bir görev için `GO-COMPLETE` verdiyse ve stop condition oluşmadıysa ajan zincir içinde tekrar onay istemez. Merge, remote branch cleanup, local branch cleanup, worktree cleanup, main sync, final verification ve checkpoint bu zincirde tek operasyonel bütündür. Bu zincirde `Onay Bekleniyor: YES` yazılmaz. Yalnız stop condition oluşursa ajan durur, sebebi raporlar ve `Onay Bekleniyor: YES` yazar.

## Approval Reporting Semantics

- `GO-ANALYZE` sonunda `Onay Bekleniyor: YES` yazılır; çünkü analizden sonra kullanıcı karar verir.
- `GO-IMPLEMENT` sonunda `Onay Bekleniyor: YES` yazılır; çünkü commit / PR / merge için kullanıcı karar verir.
- `GO-COMPLETE` sonunda stop condition yoksa `Onay Bekleniyor: NO` yazılır; çünkü kullanıcı baştan operasyon zincirini tamamlama yetkisi vermiştir.
- `GO-COMPLETE` sırasında stop condition varsa `Onay Bekleniyor: YES` yazılır; çünkü kullanıcı kararı gerekir.

## Stop Conditions

- CI başarısız
- Merge conflict
- Scope değişti
- Mimari değişti
- Beklenmeyen dosyalar oluştu
- Schema değişti
- Migration değişti
- Güvenlik riski oluştu
- Kullanıcı kararı gerekiyor
- Yeni Product Backlog oluştu
- Active Roadmap değişmeli
- Beklenmeyen teknik risk oluştu

## Backlog Review

Her faz sonunda Backlog Review zorunludur. Bağımlılığı tamamlanan maddeler için `BACKLOG → READY` önerisi raporlanır.

## Required Report Ending

```text
══════════════════════════════

NEXT RECOMMENDED STEP

Aktif Faz:

Önerilen Sonraki İş:

Backlog Review Gerekli mi?
YES / NO

READY Durumuna Geçen Maddeler:

Yeni Eklenen Product Backlog Maddeleri:

Bekleyen Mimari Kararlar:

══════════════════════════════
```