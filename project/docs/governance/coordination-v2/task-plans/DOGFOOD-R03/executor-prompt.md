# GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03 — executor prompt

Tek dosya degistir:

```text
project/scripts/orchestration-v2/delivery/delivery.test.cjs
```

Baska hicbir dosyaya dokunma. AGENTS.md, governance agaci, grant/evidence
kayitlari ve `orchestrator/` ile `service/` altindaki runtime bu task'in
disindadir; boundary validator gercek diff'i bu sinira gore yargilar.

## Kapatilacak bosluk

Iki bagimsiz liste var ve hicbir test onlari birbirine baglamiyor:

```text
URETICI   delivery/evidence.cjs  build()  ->  kanit kaydinin alanlari
KAPI      orchestrator/successor.cjs      ->  predecessorSatisfied'in okudugu alanlar
```

Bu boslugun bedeli olculdu. Kalici kayit merge commit'ini `expectedMergeSha`
diye adlandiriyordu; kapi `mergeSha` istiyor ve onu `verifiedAtSha` ile
karsilastiriyor. Gecerli, merge-SHA'sina bagli, PASS bir kanit kapiya **STALE**
gorundu ve successor asla serbest kalmadi.

Mevcut testler bunu goremez:

```text
DV55  kaydi kendisi kurar
DV56  deliveryRecordFrom'a elle yazilmis bir result verir
```

Ikisi de URETICININ gercek ciktisini kullanmiyor. `evidence.build` bir alani
yeniden adlandirsa veya birakmasa, ikisi de yesil kalir.

## Yapilacak is

`DV57` ekle: **gercek uretici ciktisi, production stamping'inden gecirildiginde
kapi tarafindan kabul edilir.**

1. `delivery/evidence.cjs` icindeki `build()` ile GERCEK bir kanit kaydi uret —
   elle nesne yazma. Manifest'ten bir capability ve `probes.cjs`'den onun
   probe'unu kullan; `DV12` bu cagriyi zaten yapiyor, sekli oradan al.
2. Kaydi production yolunun kullandigi helper'dan gecir:
   `delivery/post-merge.cjs` icindeki `deliveryRecordFrom(result, mergeSha, taskId)`.
3. Sonucu `state: 'CLOSED'` bir predecessor kaydinin `payload.delivery`'sine koy
   ve `successorMod.predecessorSatisfied(record, 2)` cagir.
4. `ok === true` bekle.
5. Kapinin okudugu her alanin gercekten URETILDIGINI ayrica iddia et — yani
   kapiya yeni bir alan sarti eklenip uretici degismezse bu test kirmizi olsun.

Negatif tarafi da koru: uretici ciktisindan kapinin gerektirdigi bir alan
cikarildiginda ayni kayit reddedilmelidir. Tek tarafli bir test, her seyi kabul
eden bir kapiyi da gecerdi.

## Kabul

```text
node --test scripts/orchestration-v2/delivery/delivery.test.cjs
```

`project` dizininden calisir ve **yesil** olmalidir.

`#1813` uretici ile kapiyi hizalayan onarimi indirdi, dolayisiyla dogru yazilmis
bir `DV57` gecmelidir. Gecmiyorsa gercek bir defect buldun demektir — testi
zayiflatma, oldugu gibi birak ve raporunda ac.

## Yasaklar

- Yorum-only, docs-only veya bos degisiklik YOK.
- Hard-coded `assert.ok(true)` YOK.
- `DV55` veya `DV56`'nin kopyasi YOK — bu test GERCEK URETICI CIKTISINI olcer.
- `orchestrator/successor.cjs`, `service/finalize.cjs`, `delivery/post-merge.cjs`,
  `delivery/evidence.cjs` dosyalarina DOKUNMA; hepsi sinirin disinda. Yalnizca
  require edip davranisi iddia et.
- Commit mesajinda merge/close iddiasi YOK; merge'u finalizer yapar.
