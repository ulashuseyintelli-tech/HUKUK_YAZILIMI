# Maintenance Register

Bu register, urun backlog'u olmayan ve runtime/domain logic degisikligi gerektirmeyen bakim, temizlik ve senkronizasyon islerini tek yerde izler.

Repository son otoritedir. Owner WIP dosyalari otomatik overwrite, stash, revert veya cleanup konusu yapilmaz.

## Kayitlar

| ID | Baslik | Status | Reason | Exit condition | Next action |
| --- | --- | --- | --- | --- | --- |
| MR-001 | Canonical main sync deferred | Deferred | Canonical `main`, owner WIP nedeniyle `origin/main` gerisinde kalabilir; WIP dosyalara dokunmadan otomatik sync yapmak guvenli degil. | Owner WIP tamamlanir veya owner sync icin net izin verir; ardindan `main` temiz sekilde `origin/main` ile hizalanir. | Owner WIP durumunu kapatinca canonical `main` icin `git fetch origin` ve kontrollu fast-forward/sync uygula; WIP varken sync denemesi yapma. |
| MR-002 | ORPHANED_WORKTREE_DIR kayitlari | Owner cleanup required | Git worktree kaydi temiz olsa bile fiziksel dizinler kalabilir; recursive fiziksel silme yasak oldugu icin owner-manuel cleanup bekler. | Owner kalan fiziksel dizinleri manuel olarak temizler veya dizinlerin kalici olarak tutulacagini bildirir; sonraki `git worktree list` temiz/uyumlu gorunur. | Owner, orphaned worktree dizinlerini manuel inceleyip temizler; ajan yalniz `git worktree remove --force`, `git worktree prune` ve `git fetch --prune` guvenli sirasini kullanir. |
| MR-003 | Deferred governance sync | Deferred | Governance dosyalarinda owner WIP bulunabilir; otomatik overwrite/stash/revert repo otoritesini ve owner calismasini riske atar. | Owner WIP governance degisiklikleri merge edilir, kapatilir veya owner belirli dosyalar icin sync izni verir. | Owner WIP kapanana kadar governance sync'i ertele; yalniz ayrik maintenance register guncellemeleri yap ve Product Backlog/Master Triage'a yeni urun isi ekleme. |
| MR-004 | Canonical main divergence (committed parallel-session work) | Deferred | MR-001'den FARKLI kok neden: canonical `main` uzerinde baska bir oturumun/terminalin **committed** local commit'leri bulunabilir (dosya-bazli uncommitted WIP degil, gercek git-tarihce ayrismasi); bu durumda `git merge --ff-only origin/main` "diverging branches" hatasi verir. Rebase/force/merge --no-ff ile tek-tarafli cozum guvenli degildir (baska oturumun commit'lerini bozabilir/cakisma yaratabilir). | Diger oturum kendi commit'lerini origin'e push eder/reconcile eder (kendi PR/merge akisi ile) veya owner acik sekilde hangi tarafin esas alinacagini belirtir; ardindan `git merge --ff-only origin/main` normal sekilde basarili olur. | Diverged durum tespit edilince rebase/force/merge --no-ff DENEME; yalniz durumu raporla ve bekle. Periyodik `git fetch origin` ile kontrol et; diger oturum kendi isini push/reconcile edince ff-only kendiliginden basarili olur (gozlemlendi: 2026-07-04, PR #910 sirasinda). |

## Kapsam Disi

- Product Backlog kaydi eklemek.
- Master Triage'a yeni urun isi eklemek.
- Runtime davranis, domain logic, schema veya migration degistirmek.
- Owner WIP dosyalarini overwrite, stash, revert veya fiziksel cleanup yapmak.
