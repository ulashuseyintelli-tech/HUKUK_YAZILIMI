# HUKUK_YAZILIMI Repository Agent Instructions

Bu dosya repository-level ajan talimatidir. Bu repository'de calisan ajanlar icin kalici davranis kurallarini tanimlar.

## Ilkeler

- Ground Truth First: Repository gercek durumunu dosya, komut ciktisi veya resmi kaynakla dogrula; repository state uydurma.
- Varsayilan mod read-only'dir. Dosya degisikligi yalniz kullanici `GO-IMPLEMENT` veya `GO-COMPLETE` verdiginde yapilir.
- Spekulatif refactor yapma.
- En kucuk guvenli patch'i tercih et.
- Mevcut mimariyi, geriye donuk uyumlulugu ve davranisi koru.
- Commit, push, merge veya branch silme islemleri yalniz kullanici acikca yetki verdiginde yapilir.

## Calisma Modlari

- `GO-ANALYZE`: Salt-okunur analiz ve rapor. Dosya degisikligi, stage, commit, push veya merge yok.
- `GO-IMPLEMENT`: Kapsam icinde degisiklik, ilgili validation ve rapor. Commit, push veya merge yok.
- `GO-COMPLETE`: Kullanici acikca verdiyse implementasyon ve tamamlanma zinciri. Commit, push, merge veya branch silme yine yalniz acik yetki varsa yapilir.

## Uygulama Kurallari

- Degisiklikten once ilgili dosyalari ve yakin cevre kodunu oku.
- Scope disi dosyalari degistirme.
- Yeni abstraction yalniz gercek karmasayi azaltiyorsa veya mevcut mimariyle acikca uyumluysa eklenir.
- Davranis degisikligini sessizce tanitma.
- Hukuki/finansal semantiklerde domain dogrulugu implementasyon kolayligindan onceliklidir.
- Owner/user WIP'i owner acikca yetki vermedikce revert, stash, tasima, clean, delete veya baska sekilde modify etme.

## Validation

- Validation seviyesi risk ve etki alanina gore secilir.
- Kod veya davranis degisikliginde ilgili en kucuk anlamli test, type-check, lint veya smoke validation calistirilir.
- Docs-only degisikliklerde diff, kapsam ve ilgili register/dokuman tutarliligi kontrolu yeterlidir.
- Test iddialari factual olmalidir: yalniz gercekten calistirilan komutlar ve gozlenen sonuclar raporlanir.
- Calistirilmayan test veya kontrol icin "calistirilmadi" denir; tahmini sonuc test sonucu gibi sunulmaz.

## Raporlama

- Dogrulanmis gercekler, makul varsayimlar ve riskler ayri belirtilir.
- Kanit yetersizse acikca soyle.
- Kapanistan once Master Register dogrulamasi zorunludur.
- Raporlarda degisen dosyalar, validation sonucu, kalan risk ve gerekiyorsa owner review ihtiyaci belirtilir.
