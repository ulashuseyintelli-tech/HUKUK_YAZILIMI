Gorev kimligi bu dosyada YAZILI DEGILDIR ve yazilmamalidir. Calisma aninda
plan, grant ve kuyruk kaydindan turetilip prompt'un basina eklenir.

Tek bir dosya OLUSTUR:

  project/scripts/orchestration-v2/activation-evidence/CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04.md

Bu dosya bir OPERATIONAL EVIDENCE kaydidir. Kod degildir, test degildir, urun
davranisi degildir.

KURALLAR

  - BASKA HICBIR DOSYAYI degistirme veya olusturma. Tam olarak 1 dosya.
  - Bu dizinin README.md'sini okuyabilirsin ama DEGISTIREMEZSIN.
  - Kod calistirma, bagimlilik ekleme, yapilandirma degistirme yok.
  - Dosya markdown olmalidir.

ICERIK

Kaydin tasimasi gereken alanlar, hepsi prompt'un basindaki kimlik blogundan ve
asagidaki sabitlerden turetilir:

  taskId                 kimlik blogundaki TASK ID
  program                kimlik blogundaki PROGRAM
  parentAuthorizationId  OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02
  taskGrantId            TASK-GRANT-CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04
  standingGrantContext   yok; bu tek kullanimlik task-scoped grant'tir
  executorLane           kimlik blogundaki EXECUTOR LANE
  planHash               kimlik blogundaki PLAN HASH
  requestDigest          asagida verilen REQUEST DIGEST
  targetPath             bu dosyanin kendi yolu
  requiredChecks         Web Tests (vitest), Architectural Guardrails
  mergePolicy            SQUASH, service-owned, maxSuccessfulMerges 1
  purpose                prove service-owned merge and terminal bookkeeping

YAZMAYACAKLARIN

Asagidakiler, sen yazarken HENUZ OLMAMIS olaylardir. Bunlari uydurma, tahmin
etme, bos birakip sonra doldurulacak diye isaretleme — hic yazma:

  PR number
  head SHA
  merge SHA
  effective main SHA
  terminal timestamp
  queue CLOSED
  task store CLOSED

Bunlari kuyruk, task store ve audit kaydi gercek merge olayindan turetir. Bir
artefaktin gelecegi ongormesi kanit degildir; sonradan kanit diye okunacak bir
tahmindir.

REQUEST DIGEST

  Kimlik blogunda verilmemisse "kayitta" yaz ve uydurma.

BITIRME

Dosyayi olustur ve dur. Commit, push, PR ve merge islerini orkestra yapar.
