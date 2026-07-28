# GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R02 — executor prompt

Tek dosya degistir:

```text
project/scripts/orchestration-v2/delivery/delivery.test.cjs
```

Baska hicbir dosyaya dokunma. AGENTS.md, governance agaci, grant/evidence
kayitlari ve `orchestrator/` altindaki runtime bu task'in disindadir; boundary
validator gercek diff'i bu sinira gore yargilar.

## Yapilacak is

`successorMod.predecessorSatisfied` icin YENI bir acceptance assertion ekle:
**baska bir predecessor task kimligine ait** delivery kaniti successor'u serbest
birakmamalidir.

Zaten var olanlari tekrar etme:

```text
DV51  verifiedAtSha !== mergeSha            (kendi icinde tutarsiz)
DV54  evidence mergeSha !== kaydin mergeSha (baska bir merge'e ait)
```

Kapatilacak bosluk farkli: kayit hem kendi icinde tutarli olabilir
(`verifiedAtSha === mergeSha`) hem de predecessor'in gercek merge SHA'siyla
uyusabilir, ama tasidigi **task/capability kimligi** baska bir gorevin
kimligi olabilir. Boyle bir kanit her SHA kontrolunu gecer.

Yeni test `DV55` olarak eklenmelidir:

1. `state: 'CLOSED'` bir predecessor kaydi kur; `payload.taskId` bu gorevin
   kimligi olsun ve `payload.mergeSha` gercek merge SHA'si olsun.
2. `payload.delivery` icine, SHA'lari tamamen dogru olan gecerli bir PASS kaydi
   koy — fakat kaydin tasidigi `taskId` (veya esdeger kimlik alani) baska bir
   gorevi gostersin.
3. `successorMod.predecessorSatisfied(record, 2)` cagir.
4. `ok === false` bekle.
5. Reddin sebebi acikca kanitin baska bir goreve ait olmasi olsun.

Ayrica pozitif kontrolu de koru: kimlikler uyustugunda ayni kayit `ok === true`
vermelidir. Tek tarafli bir test, her seyi reddeden bir kapiyi da gecerdi.

Eger mevcut kod bu durumu reddetmiyorsa test KIRMIZI olur. Bu beklenen ve
dogru sonuctur: testi zayiflatma, hard-coded PASS yazma, assertion'i kaldirma.
Kirmizi kalirsa oldugu gibi birak ve raporunda ac.

## Kabul

```text
node --test scripts/orchestration-v2/delivery/delivery.test.cjs
```

`project` dizininden calisir ve yesil olmalidir (yukaridaki tek istisna ile).

## Yasaklar

- Yorum-only, docs-only veya bos degisiklik YOK.
- Hard-coded `assert.ok(true)` YOK.
- Mevcut bir testin kopyasi YOK.
- `orchestrator/successor.cjs` dosyasina dokunma — sinirin disinda.
- Commit mesajinda merge/close iddiasi YOK; merge'u finalizer yapar.
