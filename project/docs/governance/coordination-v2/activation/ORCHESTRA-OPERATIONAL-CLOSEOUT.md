# ORCHESTRA MODE: OPERATIONAL ON-DEMAND WORKER

Kanonik durum, 2026-07-28.

Bu belge bir hedef beyani degildir. Asagidaki her satir, taze bir surecte
depo, kuyruk ve task store gercegininden yeniden turetilmistir.

## Ne kanitlandi

Orkestra, enqueue'dan merge'e ve iki magazanin kapanisina kadar elle mudahale
olmadan bir gorevi bastan sona kosturdu. Kanit, iddia degil, olaydir:

    task           CANARY-OFFICE-ORCHESTRATION-CLOSEOUT-R04
    executor       CODEX_LOCAL, exitCode 0, 209 sn
    evidence PR    #1817
    head SHA       8fd1be6b46e52fc22137b1d5e1282c2da930aa28
    zorunlu CI     Web Tests (vitest) pass, Architectural Guardrails pass
    eligibility    15 kosul, gecmeyen yok
    merge          ec230de2ff2a13259c200717a0a29bfec1f68c08  (servisin kendisi)
    queue          CLOSED, merge SHA kayitta
    task store     CLOSED
    grant          CONSUMED; tekrar kullanim TASK_GRANT_CONSUMED ile reddedildi

Task store akisi eksiksiz:

    DECLARED -> AUTHORIZED -> ELIGIBLE -> CLAIMED -> WORKTREE_READY
    -> EXECUTOR_RUNNING -> VALIDATING -> PR_OPEN -> CI_PENDING
    -> MERGE_READY -> MERGED -> CLOSED

Ayrica R03'un terminal ayrismasi kapatildi: kuyruk CLOSED/MERGED iken task
store BLOCKED kalmisti. Dis gercek dogrulanarak (PR #1750 MERGED, merge SHA
7854504b25ef1c988606b1885d1562ef44ce54aa, origin/main atasi, revert yok)
CLOSED_MERGED_EXTERNAL_TRUTH gerekcesiyle reconcile edildi. Tarihsel blocker
silinmedi.

Ve bayat bir worker artik baskasinin isini olduremiyor: paylasilan kuyruktaki
bir kaydi eski kodla isleyemez, WORKER_VERSION_INCOMPATIBLE ile birakir, hicbir
seyi mutate etmez.

## Bu bir daemon DEGILDIR

Port yok, soket yok, arka planda donen bir surec yok. Orkestra, cagrildiginda
calisan bir isci. `status` komutu, bir supervisor calisiyor olsun ya da makine
bir saat once yeniden baslatilmis olsun ayni cevabi verir — cunku ayni
append-only kaydi okur.

Bu tercih bilincli: yalnizca kendisi ayaktayken dogru cevap veren bir durum
komutu, tam da ihtiyac duyuldugu anda ise yaramaz.

## Owner komutlari

Hepsi `pnpm orch:service <verb>` seklinde, `project/` icinden.

    enqueue --request <path>        bir talebi kuyruga al
    run-once                        tek bir adim calistir
    run-until-idle [--max N]        kuyrugu bosalana kadar surdur
    status                          kill switch, yuva, kuyruk derinligi, blocker'lar
    stop --reason "<why>"           kill switch: hicbir sey admit edilmez, hicbir sey merge olmaz
    start --reason "<why>"          kill switch'i birak
    recover                         yarim kalmis cross-store yazimlari tamamla
    audit [--limit N]               ne olduysa, oldugu sirayla

Kill switch bir DOSYADIR. Depoya yazabilen herkes calistirabilir; istemci,
port, token ya da izin isteyecek bir surec gerekmez. Calisan bir gorev mevcut
adimini bitirir, yenisine baslamaz ve merge etmez.

## Dogrulama (taze surec)

    R04 queue                CLOSED
    R04 task store           CLOSED
    R04 merge SHA            ec230de2ff2a13259c200717a0a29bfec1f68c08
    R04 one-shot grant       CONSUMED
    grant reuse              TASK_GRANT_CONSUMED
    R03 queue                CLOSED
    R03 task store           CLOSED
    stale worker             WORKER_VERSION_INCOMPATIBLE
    main sync                ahead=0 behind=0
    aktif orchestration wt   0
    orkestraya ait acik PR   yok

## Acikca kalan artiklar

Durustluk gerektirdigi icin yaziliyor; hicbiri OPERATIONAL statusunu
degistirmez ama gizlenmeleri de dogru olmaz.

  - `HUKUK_orch_runs/` altinda onceki canary denemelerinden 13 fiziksel dizin
    duruyor. R04'unki, on kontrolun tamami gecildikten sonra silindi: worktree
    kaydi yok, `.git` yok, canli surec yok, benzersiz commit yok, ve agactaki
    4792 reparse point'in SIFIRI agac disina bakiyordu. Digerleri ayni
    incelemeden gecmedi; bir kismi baska oturumlara ait.

  - Kuyrukta R01/R02 canary kayitlari ve baska oturumlarin gorevleri BLOCKED
    duruyor. Bunlar tarihsel kanittir; dokunulmadi.

## Bu durumun kapsami

"Operational", orkestranin YETKI VERILEN isi kosturabildigi anlamina gelir.
Yetkinin kendisi ayri bir sorudur ve her gorev icin yeniden sorulur: standing
grant, program uygunlugu, sinir, task class, lane ve — tek kullanimlik
grant'larda — o grant'in daha once harcanip harcanmadigi.

Orkestra kendi yetkisini genisletemez. Bunu deneyen her yol, kendi adiyla
reddedilir.
