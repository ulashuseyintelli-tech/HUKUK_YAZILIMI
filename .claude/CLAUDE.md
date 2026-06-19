Her Zaman türkçe konuş, türkçe yorum yap, 
Multitenat yapı varsa ona uy.  Akışı bozma
Bir değişiklik yapmadan önce, Multitenant yapıda olması gerekiyormu geremiyormu karar ver, nedenlerini söyle.

Değişiklik yapacağın dosyayı/servisi/controller'ı KİM ÇAĞIRIYOR, NEREDEN ÇAĞIRILIYOR tam olarak tespit et. 

Yeni bir servis metodu veya controller action yazarken, metodun üstüne XML yorum olarak /// <remarks> bloğunda "Çağrıldığı yerler:" listesi yaz. Mevcut bir metodu değiştirirken de bu listeyi kontrol et ve güncelle. Format: "- {Controller/Servis}.{Metod}() → {HTTP METHOD} {endpoint} ({açıklama})" veya "- {Servis}.{Metod}() → {açıklama}"

 Değişikliğin etki alanını (impact scope) belirle ve onay sırasında "Bu değişiklik şu yerleri etkiler: ..." şeklinde bildir. Bir metodu değiştiriyorsan, o metodu çağıran TÜM yerleri kontrol et — controller ve benzeri gibi.  Etkiyi doğrulamadan kodlama yapma.

Bir tabloda işlem yapacağın zaman o tabloyla ilişkili başka tablolar var mı bak, işlem yapacağın tablo başka tabloları etkiliyormu incele. 

Bir geliştirme yapmadan önce daha önce yapılan bir geliştirme var mı bak, kod tekrarından kaçın. 

Onay almadan kodlamaya geçme ne yapacağını söyle onay aldıktan sonra devam et 

Daha önce bir yeri yaparken başka yeri bozduğun için bu kuralları otomatik yaptık ki aynı şeyi yapma diye.

## CI / PR Maliyet Disiplini (GitHub Actions)

- Gereksiz CI tetikleme yok: boş commit ile retry yok; aynı commit için push+PR çift koşu tetikleme; `gh run rerun` yalnız gerçek flaky/infra şüphesinde (boş log / step yok = infra; salt retry kod hatasını çözmez).
- PR ayrımı (maliyet için RİSK YIĞMA YOK):
  - Küçük typo/metin düzeltmeleri tek PR'da gruplanabilir.
  - Farklı davranış değişiklikleri ayrı PR.
  - Migration içeren işler AYRI PR.
  - Finans / kanonik / veri-yazan işler AYRI PR.
  - Migration + frontend-davranış + backend-logic ASLA aynı PR'da.
- Her PR öncesi: önce local tsc + test; PR açınca TEK CI bekle; yeşilse merge; gereksiz yeni commit/retry yok.
- Asla: CI maliyetini düşürmek için riskli işleri tek PR'a yığma; kırmızı CI'yı bypass etme; path-filter/docs-skip dâhil hiçbir mekanizma "testi atlatmak" için kullanılmaz (şüphede testi çalıştır).

## Worktree / Lokal Sunucu / Doğrulama Disiplini

ÇAKIŞMA = ZAMAN KAYBI. Worktree/lokal sunucu/session çoğaltması proje genelinde çakışma üretiyor (port, branch, paralel oturum, node_modules junction, shared tree). Bunu önle.

### Bulgu yönetişimi (kod tabanını issue-tracker'a ÇEVİRME)
Bir bug/risk/gözlem keşfedince seviyeye göre davran — hepsini koda yorum olarak GÖMME (diff'i kirletir, kalıcıdır, önem sıralamasını yok eder, CI/PR maliyet disipliniyle çelişir):
- A) Çalıştığın kodu ENGELLEYEN gerçek bug → hemen düzelt; kapsam dışıysa AYRI PR aç.
- B) Çalıştığın modülde ama bu PR kapsamı DIŞINDA risk/teknik borç → kodun içine değil, modülün LEDGER/DOC dosyasına yaz:
      RISK:
      Dosya: <path>
      Konu: <kısa>
      Bulundu: <YYYY-AA-GG>
- C) Sadece gözlem / mimari endişe → SOHBETTE bildir; kod tabanına yazma.
- Kod içine `// CLAUDE-UYARI` türü işaret bırakmak VARSAYILAN DEĞİLDİR; yalnız kullanıcı belirli bir yere açıkça isterse.

### Lokal sunucu / runtime doğrulama
- Varsayılan olarak "lokali başlat" ÖNERME. Önce STATİK doğrulama: kod okuma → tsc → unit/integration test.
- Runtime doğrulaması GERÇEKTEN gerekliyse (yalnız çalışırken görülenler: hydration, React state senaryoları, race condition, websocket, auth redirect, tarayıcı davranışı) → NEDEN gerekli olduğunu açıkla ve AYRICA onay iste. Sessizce sunucu başlatma.

### Worktree / yeni session (worktree = risk yönetim aracı, "yasak" değil)
- Varsayılan: mevcut worktree'de çalış (worktree/server kurulum + sahiplik maliyeti + shared-tree çakışması bedava değil).
- Worktree bir İSTİSNA değil RİSK YÖNETİM ARACIDIR — şu işlerde izole worktree TERCİH EDİLİR (maliyet değil, maliyetten kaçınma):
  - Farklı PR sahibi / aktif paralel oturum (shared-tree collision'ı önler)
  - Riskli refactor
  - Migration
  - Uzun süreli / deneysel çalışma
  - Rollback ihtiyacı yüksek iş
  - İzole smoke testi
- İzole worktree açtığında sahiplik maliyetini sıfırla: ayrı port · shared tree'ye DOKUNMA · iş bitince junction + branch temizle (`gh ... --delete-branch` shared-tree'de `main` çakışırsa branch'i manuel sil). Doc-only işte junction/node_modules gerekmez (hafif worktree).