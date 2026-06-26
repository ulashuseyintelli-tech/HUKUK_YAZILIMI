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
- İş bitince geçici worktree `git worktree remove` ile temizlenmelidir; `rm -rf` kullanılmamalıdır.
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
