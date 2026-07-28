# GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02 — executor prompt

Tek dosya degistir:

```text
project/scripts/orchestration-v2/delivery/delivery.test.cjs
```

Baska hicbir dosyaya dokunma. AGENTS.md, governance agaci, grant/evidence
kayitlari ve `orchestrator/` ile `service/` altindaki runtime bu task'in
disindadir; boundary validator gercek diff'i bu sinira gore yargilar.

## Bu gorevin durumu

Gorevin ilk yarisi tamamlandi. `DV55` artik mevcut ve yesil: **baska bir
predecessor task kimligine ait** delivery kaniti successor'u serbest
birakmiyor, `PREDECESSOR_DELIVERY_TASK_ID_MISMATCH` ile reddediliyor.

Bu prompt ayni declared intent'in kalan yarisini kapatir. Bir kapi, uzerinde
karar verdigi alan gercekten YAZILIYORSA calisir, ve su anda bunu dogrulayan
hicbir test yok.

## Kapatilacak bosluk

`DV55` kaydi kendisi kuruyor. Yani uretici tarafi `taskId` damgalamayi
tamamen birakirsa `DV55` yine yesil kalir — alan her production kaydinda
sessizce yok olur ve kapi hicbir zaman ateslemez. Kural metinde dogru,
pratikte atil olur.

Olcum: `deliveryRecordFrom` su anda **hicbir test tarafindan cagrilmiyor**.

```text
grep -rn "deliveryRecordFrom" --include=*.test.cjs .   ->   sonuc yok
```

Bu tam olarak bu programin durdurmak icin var oldugu hata bicimidir: bir
JSDoc iddiasi runtime'da hicbir seyi zorlamaz.

## Yapilacak is

`DV56` ekle: **uretici, kapinin okudugu kimligi gercekten yaziyor.**

Iki yarisi da gerekli, cunku tek basina her biri yaniltir:

1. **Uretici sozlesmesi.** `delivery/post-merge.cjs` icindeki
   `deliveryRecordFrom` ciktisini kur ve iddia et:
   - tasidigi `taskId` kendisine verilen gorev kimligidir;
   - urettigi kayit, `orchestrator/successor.cjs` icindeki
     `predecessorSatisfied(record, 2)` tarafindan kabul edilir — yani uretici
     ile kapi alan adlari konusunda anlasiyor;
   - kimlik baska bir goreve degistirildiginde ayni kayit reddedilir.

2. **Canli yolun damgaladigi.** Kaydi kalicilastiran production yolu
   `service/finalize.cjs`. Onun persist ettigi delivery kaydinin `taskId`
   tasidigini dogrula. Dosyaya DOKUNMA — sinirin disinda. `DV53`'un successor
   kapisi icin kullandigi teknik burada da gecerlidir: kaynagi okuyup davranisi
   iddia etmek, bir gate'in gercekten bagli oldugunu kanitlamanin bu dosyada
   zaten kabul edilmis yoludur.

## Kabul

```text
node --test scripts/orchestration-v2/delivery/delivery.test.cjs
```

`project` dizininden calisir ve **yesil** olmalidir.

Bu gorev kirmizi bir test beklemiyor: `#1792` hem kapiyi hem damgayi indirdi,
dolayisiyla dogru yazilmis bir `DV56` gecmelidir. Gecmiyorsa gercek bir defect
buldun demektir — testi zayiflatma, oldugu gibi birak ve raporunda ac.

## Yasaklar

- Yorum-only, docs-only veya bos degisiklik YOK.
- Hard-coded `assert.ok(true)` YOK.
- `DV55`'in veya baska bir testin kopyasi YOK — bu test URETICIYI olcer,
  kapiyi degil.
- `orchestrator/successor.cjs`, `service/finalize.cjs`, `delivery/post-merge.cjs`
  dosyalarina DOKUNMA; hepsi sinirin disinda. Yalnizca require edip davranisi
  iddia et.
- Commit mesajinda merge/close iddiasi YOK; merge'u finalizer yapar.
