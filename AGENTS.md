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

## AGENT OPERATING STANDARD v1.0

Bu standart HUKUK_YAZILIMI projesinde çalışan tüm ajanlar (Codex, Claude, ChatGPT vb.) için varsayılan çalışma biçimidir. AGENTS.md ana ve bağlayıcı ajan standardıdır; `project/docs/governance/` ise roadmap, backlog, karar ve süreç kayıtlarının tutulduğu governance alanıdır. Çift kural seti oluşturulmaz.

### 1. Çalışma Seviyesi

Her yeni görev şu formatla başlar:

```text
ÇALIŞMA SEVİYESİ ÖNERİSİ

- Faster
- Normal
- High
- Ultra

Neden: ...
```

Seçilen seviye tek cümleyle gerekçelendirilir. Mevcut Model / Effort önerisi bu dört seviyeye yorumlanır: basit okuma/git işleri `Faster`, olağan docs veya düşük riskli değişiklikler `Normal`, backend davranış değişikliği `High`, migration/finans/multitenant/veri bütünlüğü işleri `Ultra`.

### 2. Ön Analiz Zorunludur

Kod yazmadan önce mutlaka ön analiz yapılır. En az şu başlıklar raporlanır:

- Çağıran yerler
- Impact Scope
- Multitenant etkisi
- Tablo ilişkileri
- Schema etkisi
- Migration etkisi
- Runtime etkisi
- Güvenlik etkisi
- Mevcut mimariyle uyumu

Docs-only işlerde bu başlıklar "YOK" veya "etkisi yok" şeklinde kapatılabilir; ancak bilinçli olarak değerlendirilmeden geçilmez.

### 3. Scope Protection ve Backlog Triage

Hiçbir görev kendi kapsamını büyütemez. Yeni fikir bulunduğunda önce değerlendirilir:

- Mevcut fazın parçası mı?
- Yeni schema/migration gerektiriyor mu?
- Mevcut mimariyi değiştiriyor mu?
- Active Roadmap içinde mi?

Mevcut fazın parçası değilse implementasyon yapılmaz; Product Backlog maddesi önerilir. Hiçbir fikir doğrudan implementasyona girmez.

Akış:

```text
Yeni fikir
↓
Triage
↓
Product Backlog
↓
READY
↓
Active Roadmap
↓
Implementation
```

### 4. Architecture Decisions

Kesinleşmiş mimari kararlar tekrar tartışılmaz. Yeni görev mevcut Architecture Decision'ı bozuyorsa ajan durur, etkiyi raporlar ve kullanıcı kararı ister.

### 5. Worktree / Branch

Her implementasyon ayrı branch ve ayrı worktree üzerinde yapılır. Aşağıdaki Worktree Isolation Protocol korunur ve bu standartla birlikte uygulanır.

### 6. Görev Yetkileri

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

GO-COMPLETE açıkça verilmişse merge, cleanup, main sync, final verification ve checkpoint tek operasyon sayılır; ayrıca merge onayı istenmez. Kullanıcı bir görev için `GO-COMPLETE` verdiyse ve stop condition oluşmadıysa ajan zincir içinde tekrar onay istemez. Merge, remote branch cleanup, local branch cleanup, worktree cleanup, main sync, final verification ve checkpoint bu zincirde tek operasyonel bütündür. Bu zincirde `Onay Bekleniyor: YES` yazılmaz. Yalnız stop condition oluşursa operasyon durur, sebebi raporlanır ve `Onay Bekleniyor: YES` yazılır.

### 6.1 Onay Bekleniyor Rapor Semantiği

- `GO-ANALYZE` sonunda `Onay Bekleniyor: YES` yazılır; çünkü analizden sonra kullanıcı karar verir.
- `GO-IMPLEMENT` sonunda `Onay Bekleniyor: YES` yazılır; çünkü commit / PR / merge için kullanıcı karar verir.
- `GO-COMPLETE` sonunda stop condition yoksa `Onay Bekleniyor: NO` yazılır; çünkü kullanıcı baştan operasyon zincirini tamamlama yetkisi vermiştir.
- `GO-COMPLETE` sırasında stop condition varsa `Onay Bekleniyor: YES` yazılır; çünkü kullanıcı kararı gerekir.

### 6.2 CI WAIT / POLLING RULE

Bu kural yalnız `GO-COMPLETE` için geçerlidir. `GO-ANALYZE` ve `GO-IMPLEMENT` sonunda ajan kullanıcıya rapor verir; CI bekleme zinciri otomatik merge anlamına gelmez.

`GO-COMPLETE` sırasında CI durumu `IN_PROGRESS` ise ajan hemen kullanıcıya dönmez. CI durumunu otomatik olarak belirli aralıklarla yeniden kontrol eder.

- Önerilen polling aralığı: 60 saniyede bir.
- Önerilen maksimum bekleme: 20 dakika.
- Bu süre içinde CI `SUCCESS` olursa GO-COMPLETE zinciri devam eder; merge → cleanup → main sync → final verification → checkpoint tamamlanır.
- CI `FAIL` olursa ajan durur, merge yapmaz, cleanup yapmaz ve `Onay Bekleniyor: YES` yazar.
- CI 20 dakika sonunda hâlâ `IN_PROGRESS` ise ajan durur, merge yapmaz, cleanup yapmaz, timeout raporu verir ve `Onay Bekleniyor: YES` yazar.
- CI bitmediği için `mergeStateStatus` `BLOCKED` ise bu tek başına stop condition sayılmaz; CI tamamlandıktan sonra `mergeStateStatus` yeniden sorgulanır.
- CI bittikten sonra `mergeStateStatus` `CLEAN` değilse ajan durur, merge yapmaz, cleanup yapmaz ve `Onay Bekleniyor: YES` yazar.
### 7. Operational Stop Conditions

Ajan yalnız aşağıdaki durumlarda durur:

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

Bu durumlar dışında, verilen görev yetkisi sınırları içinde operasyon kesilmez.

### 8. Backlog Review

Her faz sonunda Backlog Review zorunludur. Product Backlog maddeleri tek tek değerlendirilir; bağımlılığı tamamlanan maddeler için `BACKLOG → READY` önerisi raporlanır. Kullanıcı onayı olmadan READY maddesi Active Roadmap'e taşınmaz ve implementasyon başlamaz.

### 9. Rapor Sonu Formatı

Her önemli rapor ve görev kapanışı şu blokla biter:

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
## Model / Effort önerisi

Her yeni işin başında, işe başlamadan önce önerilen çalışma seviyesini bildir.

- PR merge, branch/worktree cleanup, git işlemleri: low / Faster yeterlidir.
- Sadece kod okuma, "şu nerede", kavramsal soru-cevap, mevcut akışı açıklama: low / Faster yeterlidir.
- Kod değişikliği, backend akış değişikliği, controller/service/repository davranışı: yüksek/extra öner.
- Migration, finansal hesaplama, multitenant etki, veri bütünlüğü, ödeme/tahsilat/borç-alacak mantığı: ultra/code öner.
- Otomatik geçiş yapılamazsa kullanıcıya öneri olarak bildir.

### Varsayılan iş akışı (A şıkkı aktif)

- Slider/Ultracode kullanıcının oturum ayarıdır; ajan bunu otomatik değiştiremez ve değiştirmeye çalışmaz.
- Varsayılan tercih A şıkkıdır: slider açık kalsa bile basit işlerde çok-ajan akışı açılmaz.
- Git işleri, branch/worktree cleanup, salt kod okuma, "şu nerede" ve kavramsal soru-cevapta solo çalış; kısa "Faster yeter" uyarısı ver.
- Esaslı işlerde (feature, forensic, backend davranış değişikliği, multitenant, migration, finans, veri bütünlüğü, ödeme/tahsilat/borç-alacak) derin analiz yap ve "Ultra/code önerilir" diye bildir.
- Kullanıcıdan manuel kademe değiştirmesini isteme; yalnız işin riski gerçekten değiştiyse öneri ver.

## Repository discipline

Kanonik repo:

```text
C:\Users\ulas.htelli\Desktop\HUKUK_PROJE\HUKUK_YAZILIMI
```

- Bu tek doğru repository köküdür.
- AGENTS.md ana agent kural dosyasıdır; repository discipline için tek kaynak burasıdır.
- Başka bir HUKUK_YAZILIMI clone otomatik seçilmemelidir.
- HUKUK_PROJE altındaki kardeş dizinler yalnız kanonik repodan açılmış geçici git worktree olabilir.
- Worktree isimleri serbest olabilir; önemli olan `git worktree list` içinde kanonik repo ağına bağlı olmalarıdır.
- Yeni worktree her zaman kanonik repodan oluşturulmalıdır.
- Bağımsız ikinci HUKUK_YAZILIMI clone tespit edilirse kodlamaya başlamadan dur ve raporla.
- Riskli, migration, finans veya çok-oturumlu işlerden önce şunları raporla:
  - repo path
  - active branch
  - HEAD
  - git worktree list
- İş bitince geçici worktree `git worktree remove --force` ile temizlenmelidir; recursive fiziksel silme (`rm -rf`, `cmd rd /s /q`, PowerShell `Remove-Item -Recurse`, `.NET Directory.Delete(path,true)`) YASAKTIR (Windows junction/pnpm hardlink canonical'ı sessizce bozar). "Directory not empty" kalırsa ORPHANED_WORKTREE_DIR olarak bırakılır (owner manuel). Branch silmeden önce gh PR-merged doğrulanır (squash→git ancestry güvenilmez). Her cleanup sonrası canonical integrity check + `.git/config` torn-write stop-condition. Detay: `project/docs/runbooks/worktree-cleanup.md`.
- Aktif WIP worktree silinmemelidir.
- Localhost çalışan servislerin hangi worktree’den servis edildiği riskli UI/API doğrulamalarından önce kontrol edilmelidir.

### Worktree Isolation Protocol (her iş = ayrı worktree)

Bu protokol yukarıdaki repository discipline'ı bağlayıcı operasyon kuralına dönüştürür ve TÜM HUKUK_YAZILIMI işleri için geçerlidir (Claude, Codex ve diğer ajanlar dahil). Göreve-özel oturum/sayfa bu protokolü yeniden yazmaz; yalnız "Bu iş de Worktree Isolation Protocol'e tabidir" diye kısa çapraz-referans verir.

- Canonical (`HUKUK_YAZILIMI`) working tree yalnız `main` senkronu ve final doğrulama içindir. Kanonik working tree'de feature/bugfix çalışması YAPILMAZ.
- Her aktif iş, konuya özel ayrı worktree + ayrı branch ile yürütülür. Worktree kanonik reponun git'i ile, base `origin/main` olacak şekilde açılır (kanonik'in o an checkout'lu/kirli branch'i baz ALINMAZ). Branch adı konuya özeldir ve yeniden kullanılmaz. Tüm değişiklik yalnız o worktree içinde yapılır.
- Kanonik kirliyse (sana ait olmayan WIP) ona DOKUNULMAZ: bilinmeyen/sahipsiz WIP `stash`/`pop`/relocate EDİLMEZ, branch'i değiştirilmez, "temizleme/düzeltme" girişilmez. Kanonik kirli olsa bile iş durmaz — yine `origin/main`'den yeni worktree açılır.
- Merge sonrası cleanup'tan ÖNCE `node_modules` junction/symlink denetimi ZORUNLUDUR (junction'ı takip eden recursive silme kanonik repoyu bozabilir). Sıra: junction/symlink audit → `git worktree remove <yol>` → `git worktree prune` → `git fetch --prune`.

İş başlatma şablonu:

```text
git fetch origin
git worktree add ../HUKUK_<konu> origin/main -b feat/<konu>
cd ../HUKUK_<konu>
```
