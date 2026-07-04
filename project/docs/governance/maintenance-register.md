# Maintenance Register

Bu register, urun backlog'u olmayan ve runtime/domain logic degisikligi gerektirmeyen bakim, temizlik ve senkronizasyon islerini tek yerde izler.

Repository son otoritedir. Owner WIP dosyalari otomatik overwrite, stash, revert veya cleanup konusu yapilmaz.

## Kayitlar

| ID | Baslik | Status | Reason | Exit condition | Next action |
| --- | --- | --- | --- | --- | --- |
| MR-001 | Canonical main sync deferred | Deferred | Canonical `main`, owner WIP nedeniyle `origin/main` gerisinde kalabilir; WIP dosyalara dokunmadan otomatik sync yapmak guvenli degil. | Owner WIP tamamlanir veya owner sync icin net izin verir; ardindan `main` temiz sekilde `origin/main` ile hizalanir. | Owner WIP durumunu kapatinca canonical `main` icin `git fetch origin` ve kontrollu fast-forward/sync uygula; WIP varken sync denemesi yapma. |
| MR-002 | ORPHANED_WORKTREE_DIR kayitlari | Owner cleanup required | Git worktree kaydi temiz olsa bile fiziksel dizinler kalabilir; recursive fiziksel silme yasak oldugu icin owner-manuel cleanup bekler. | Owner kalan fiziksel dizinleri manuel olarak temizler veya dizinlerin kalici olarak tutulacagini bildirir; sonraki `git worktree list` temiz/uyumlu gorunur. | Owner, orphaned worktree dizinlerini manuel inceleyip temizler; ajan yalniz `git worktree remove --force`, `git worktree prune` ve `git fetch --prune` guvenli sirasini kullanir. |
| MR-003 | Deferred governance sync | Deferred | Governance dosyalarinda owner WIP bulunabilir; otomatik overwrite/stash/revert repo otoritesini ve owner calismasini riske atar. | Owner WIP governance degisiklikleri merge edilir, kapatilir veya owner belirli dosyalar icin sync izni verir. | Owner WIP kapanana kadar governance sync'i ertele; yalniz ayrik maintenance register guncellemeleri yap ve Product Backlog/Master Triage'a yeni urun isi ekleme. |

## Kapsam Disi

- Product Backlog kaydi eklemek.
- Master Triage'a yeni urun isi eklemek.
- Runtime davranis, domain logic, schema veya migration degistirmek.
- Owner WIP dosyalarini overwrite, stash, revert veya fiziksel cleanup yapmak.
