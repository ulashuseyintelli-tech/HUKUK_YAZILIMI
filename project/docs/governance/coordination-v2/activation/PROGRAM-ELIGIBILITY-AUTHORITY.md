# PROGRAM ELIGIBILITY AUTHORITY — ORCHESTRA-PRODUCTION-ACTIVATION-R01

<!-- GOV-COORD-AUTHORITY kind=PROGRAM_ELIGIBILITY recordId=OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01 -->

```text
Authorization ID : OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01
Payload          : program-eligibility-authority.json
Kanit kaynagi    : PARENT-AUTHORIZATION-ENVELOPE.md
Turetici         : project/scripts/orchestration-v2/orchestrator/eligibility.cjs
Turetilen        : project/docs/governance/coordination-v2/programs.manifest.json
```

## Neden bu kayit var

Owner'in duzeltmesi acikti: **manifest elle `ELIGIBLE` yapilmaz.**

`programs.manifest.json` kendini `DERIVED / NON-AUTHORITATIVE` ilan eder ve bunu
ciddiye alir. O alani elle degistirip bir programi acmak, yetkiyi *raporlamak*
icin var olan tek dosyada yetki *yazmak* olurdu — ve asagi akista hicbir sey bir
turetme ile bir yazim hatasini birbirinden ayirt edemezdi.

Bu yuzden eligibility'nin **iki girdisi ve tek kurali** vardir:

```text
PROGRAM-ELIGIBILITY-AUTHORITY.md   owner'in karari + kaniti
programs.manifest.json             programin kendi governance durumu

ELIGIBLE  ⇔  authority programi ADIYLA ANAR  ∧  kendi governance'i REDDETMEZ
```

Ikisinden biri eksikse sonuc `DENIED`'dir.

## Kesisimin anlami

Ilginc olan yari ikinci kosuldur. Owner bir programi orkestre calistirmaya
acabilir; bu, o programin **icindeki her isi** yetkilendirmek demek degildir.
Kendi charter'i `IMPLEMENTATION NOT AUTHORIZED` diyen bir program, envelope onu
anmis olsa bile `DENIED` kalir.

> Envelope bir **serit** verir, bir **gorev** vermez.

"OFFICE acildi" ifadesinin "artik OFFICE altinda her sey kosabilir" diye
okunmasini engelleyen sey budur.

`OWNER_GATED` ise **red degildir**. Bir sonraki unit'i owner seciminde bekleyen
program, tam olarak standing grant modelinin hizmet ettigi durumdadir; bunu red
saymak, acilan iki programin ikisi de o durumda oldugu icin modeli ulasilamaz
kilardi.

## Kanit zinciri

`program-eligibility-authority.json` icindeki `ownerDecisionEvidence`, envelope
belgesinden **birebir** alintidir ve digest'i o metnin uzerinden hesaplanmistir.
`eligibility.verifyAuthorityRecord()` sunlari mekanik olarak dogrular:

```text
digest, alintinin kendisiyle uyusuyor mu
alinti, isaret edilen dosyada gercekten var mi
kayit kendi kendini kaynak gostermiyor mu
adi gecen her program bir standing grant'a bagli mi
```

Ucuncusu bu katmanin var olma sebebidir: **kendi yazdigi bir belgede owner onayi
oldugunu iddia eden bir kayit, hicbir zaman owner onayinin kaniti degildir.**

Dorduncusu de ayni cinstendir: standing grant'i olmayan bir "eligible" program,
cercevesi olmayan acik bir kapidir — icinde ne kosacagini hicbir sey sinirlamaz.

## Yururlukteki karar

```text
OFFICE      ELIGIBLE   STANDING-GRANT-OFFICE-LIVE-R01.json
COLLECTION  ELIGIBLE   STANDING-GRANT-COLLECTION-LIVE-R01.json

UYAP_CONNECTOR  DENIED   NOT_NAMED_BY_AUTHORITY
CLIENT          DENIED   NOT_NAMED_BY_AUTHORITY
DEBTOR          DENIED   NOT_NAMED_BY_AUTHORITY
RECEIVABLE      DENIED   NOT_NAMED_BY_AUTHORITY
```

`MECHANICAL_GOVERNANCE` bu listede **yoktur** ve olmayacaktir: o bir *profil*,
bir *program* degildir. Kendi kisitli grant'i ayri kayittadir.

## Degistirme yolu

Manifest'i elle duzenlemek bir degisiklik yolu **degildir**; bir test o dosyanin
kendi authority'sinin turetmesine birebir esit oldugunu dogrular ve elle yapilan
her duzenleme CI'da kirmizi doner.

Gercek yol:

```text
1. owner karari envelope'a girer
2. bu kayit yeni alintiyi ve digest'i pinler
3. turetici calisir, manifest yeniden uretilir
4. diff neyin nicin degistigini okunabilir birakir
```

Adim 4, elle duzenlemenin yok ettigi ozelliktir.

---

**IMPLEMENTATION AUTHORITY:** bu kayit yalniz program *eligibility* sorusunu
cevaplar. Task-seviyesi yetki standing grant'lardan, semantic authority ise
ilgili program governance'indan gelir; bu kayit ikisinin yerine gecmez.
