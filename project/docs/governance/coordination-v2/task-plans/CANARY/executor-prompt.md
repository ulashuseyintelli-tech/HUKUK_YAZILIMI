Gorev kimligi bu dosyada YAZILI DEGILDIR ve yazilmamalidir. Calisma aninda
plan, grant ve kuyruk kaydindan turetilip prompt'un basina eklenir.

Bu dosya uc revizyon boyunca "GOREV: ...-R01" diye acildi; plan R03 diyordu.
Executor ikisini de okudu, hangisinin yetkili oldugunu bilemedi ve isi
reddetti. Hakliydi.

Tek bir dosya OLUSTUR:

  project/apps/api/src/modules/office/__tests__/office-credential-encryption.characterization.spec.ts

Bu dosya, ayni moduldeki su dosyanin MEVCUT davranisini tarif eden bir
characterization test suite'i olmalidir:

  project/apps/api/src/modules/office/office-credential-encryption.util.ts

KURALLAR

  - BASKA HICBIR DOSYAYI degistirme veya olusturma. Tam olarak 1 dosya.
  - util dosyasina DOKUNMA. Davranisi degistirme.
  - Testler saf olmali: DB yok, ag yok, dosya sistemi yok.
  - process.env.CREDENTIAL_ENCRYPTION_KEY degerini test icinde ayarla ve
    her testten sonra eski haline getir.
  - Gercek bir secret YAZMA; test icin uydurma bir deger kullan.
  - Mevcut spec dosyalarindaki jest/TypeScript uslubunu takip et.
  - En az sunlari kapsa: isCredentialEncryptionConfigured davranisi,
    sifreleme + cozme turu (round-trip), enc:v1: format isareti, ve
    anahtar yokken ne oldugu.

Su komut GECMELIDIR:

  cd project/apps/api && pnpm exec jest --ci --forceExit --runInBand \
    --runTestsByPath src/modules/office/__tests__/office-credential-encryption.characterization.spec.ts
