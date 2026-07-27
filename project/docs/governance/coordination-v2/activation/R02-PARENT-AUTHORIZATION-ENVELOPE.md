# OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02 — Parent Authorization Envelope

<!-- GOV-COORD-AUTHORITY kind=PROGRAM_AUTHORIZATION recordId=OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02 -->

```text
Authorization ID : OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02
Owner            : Ulas Huseyin Telli
payloadSha256    : 06da65660dad523c18ee3bafce130996e849462cf3275a953d84b6866ae4e240
Payload          : r02-authorization-payload.json
Serial execution : maxConcurrency 1
Auto-merge       : AUTHORIZED for orchestration-owned PRs under this envelope
Repo-wide auto-merge : NEVER
Supersedes       : R01'i GENISLETIR, iptal ETMEZ
```

Bu belge owner'in program-seviyesi kararinin **transkripsiyonudur**. Yeni bir
owner karari uretmez; onu normalize edip hash'e baglar.

## Canli yol karari

```text
tek gercek production yolu:
  request -> enqueue -> admission -> standing grant -> governance profile
          -> durable queue -> dispatch revalidation -> executor
          -> PR -> CI -> merge gate -> cleanup -> next

ikinci bir production yolu YOKTUR
orch:run adapter veya development-only'dir, bypass DEGILDIR
```

## Acilan programlar

```text
CLIENT      kontrollu canli calistirmaya acilir
DEBTOR      kontrollu canli calistirmaya acilir
RECEIVABLE  kontrollu canli calistirmaya acilir
UYAP_CONNECTOR  yalniz TEKNIK is icin canli calistirmaya acilir
OFFICE ve COLLECTION mevcut eligibility ve grant'lerini korur
```

Her program **kendi** standing grant'ini alir. Alti program icin tek bir sinirsiz
grant olusturulmaz.

## Eligibility serit acar, gorev vermez

Bu programlarin bir kismi kendi governance kayitlarinda `NOT AUTHORIZED`
isaretli **belirli birimler** tasir. Bu envelope o birimleri yetkilendirmez;
yalnizca orkestratorun o program adi altinda **teknik olarak is kosmasina** izin
verir. Reddedilmis birimler ilgili standing grant'in izinli yollari ve
siniflari **disinda** kalir — gorev seviyesi yetki orada yasar.

## UYAP ozel siniri

```text
gercek credential           YOK
gercek dosyalama/tevdi      YOK
gercek musteri verisi gonderimi  YOK
production external activation   AYRI OWNER KARARI
```

UYAP eligibility'si **teknik calistirma iznidir**, production UYAP baglanti izni
degildir.

## Gecerlilik

```text
program tamamlanana kadar
owner acikca iptal edene kadar
kill switch etkinlesene kadar
scope ihlali olusana kadar
```

---

**IMPLEMENTATION AUTHORITY:** bu envelope yalniz
`ORCHESTRA-END-TO-END-OPERATIONALIZATION-AND-ALL-PROGRAM-COMPLETION-R02`
programinin is paketleri ve altindaki standing grant'lar icindir.
