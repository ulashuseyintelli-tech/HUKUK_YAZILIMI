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
