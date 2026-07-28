# CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04 — semantic authority

Bu belge, R04 canary'sinin ve ona bagli tek kullanimlik grant'in yetki
kaynagidir. Owner karari 2026-07-28 tarihinde verilmistir.

## Karar

Owner, iki secenegi de reddedip ucuncusunu bagladi:

    (3) R04'E OZEL, TEK KULLANIMLIK OPERATIONAL-EVIDENCE GRANT

Gerekce, oturumun owner'a bildirdigi kanonik bosluktur: service-owned merge
yetkisi olan her standing grant urun modulu kod koklerine bagli; governance
evidence yuzeyine ulasan tek grant (MECHANICAL_GOVERNANCE) ise AUTO_MERGE'u
tasarim geregi reddediyor. Ikisini birlestirmek ancak bir standing grant'i
genislelterek mumkundu ve bu, her grant'in `noSelfAuthorizationChange` kurali
altinda yasaktir.

Owner bu yuzden standing grant'i genisletmek yerine yetkiyi daraltmayi secti.

## Baglayici hukumler

    MECHANICAL_GOVERNANCE standing grant'i genisletilmeyecektir.
    Urun modulu grant'lari evidence dosyasi icin kullanilmayacaktir.
    DELIVERY_TRUTH grant ve program kayitlarina dokunulmayacaktir.
    noSelfAuthorizationChange korunacaktir.
    Grant'i canary executor olusturmayacaktir.

## Program

ORCHESTRA_OPERATIONAL_CANARY dogfood live execution is authorized to run

Program yalnizca bu canary ailesi icindir. Domain implementasyonu, genel
orchestration-v2 ozellik gelistirmesi ve ilgisiz governance mutasyonu bu
programin kapsami DISINDADIR.

## Yetki

    GRANT ID   : TASK-GRANT-CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04
    TASK ID    : CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04
    CAPABILITY : CREATE_EXACT_OPERATIONAL_EVIDENCE
                 SERVICE_OWNED_SQUASH_MERGE

Bu grant standing grant DEGILDIR. Baska task'a devredilemez, baska programda
kullanilamaz ve yalniz bir basarili merge icin gecerlidir. Basarili merge
sonrasinda otomatik CONSUMED olur; ikinci PR veya ikinci basarili merge
girisimi reddedilir.

## Hedef

    project/scripts/orchestration-v2/activation-evidence/
    CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04.md

Bu dizinin olusturulmasi yalnizca bu R04 karariyla yetkilidir ve
`scripts/orchestration-v2/**` uzerinde genel yazim yetkisi DEGILDIR.

## Amac

Daha once eksik kalan terminal zinciri gercek canli yolda kanitlamak:

    MERGED
    -> merge SHA persisted
    -> queue CLOSED
    -> task store CLOSED
    -> cleanup complete
    -> next-task transition

Executor merge oncesinde yalniz degismez operational intent kaydini uretir. PR
numarasi, head SHA, merge SHA, effective main SHA, terminal zaman damgalari ve
iki magazanin terminal durumlari executor tarafindan ONCEDEN YAZILAMAZ; bunlar
gercek merge olayindan turetilir.
