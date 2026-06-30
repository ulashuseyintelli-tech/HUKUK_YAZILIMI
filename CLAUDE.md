# HUKUK_YAZILIMI Agent Standard

## 1. Purpose

`CLAUDE.md` bu repodaki tek kanonik ve en yuksek oncelikli ajan talimat dosyasidir. `AGENTS.md` bagimsiz kural icermez; yalniz uyumluluk stub'idir. Bir ajan iki dosyayi da okursa her durumda `CLAUDE.md` takip edilir.

Her zaman Turkce konus ve Turkce yorum yap. Ana ilke: mevcut davranisi koru, tekrari azalt, niyeti tarif et. Guvenlik uzun yasak listeleriyle degil, kapsam ve beklenen davranisin netligiyle saglanir.

Governance kayitlari `project/docs/governance/` altindadir; roadmap, backlog, mimari karar ve surec kayitlari burada tutulur.

## 2. Architecture Principles

Mevcut mimariye ve kesinlesmis Architecture Decision'lara uy. Yeni gorev bir karari bozuyorsa dur, etkiyi raporla ve kullanici karari iste.

Multitenant yapi varsa ona uy. Degisiklikten once multitenant davranis gerekip gerekmedigini ve nedenini belirt.

Scope buyutme. Yeni fikir once triage edilir: mevcut fazin parcasi mi, schema/migration veya mimari degisiklik gerektiriyor mu, Active Roadmap icinde mi? Degilse implement edilmez; Product Backlog maddesi onerilir.

Backlog akisi: `Yeni fikir -> Triage -> Product Backlog -> READY -> Active Roadmap -> Implementation`. Her faz sonunda Backlog Review yap; `BACKLOG -> READY` ve roadmap tasimalari kullanici onayi olmadan uygulanmaz.

## 3. Workflow

Her yeni goreve kisa calisma seviyesi onerisiyle basla:

```text
CALISMA SEVIYESI ONERISI
- Faster
- Normal
- High
- Ultra
Neden: ...
```

Faster: git/cleanup, salt okuma, "su nerede", kavramsal cevap. Normal: docs veya dusuk risk. High: backend/controller/service/repository davranisi. Ultra: migration, finans, multitenant etki, veri butunlugu, odeme/tahsilat/borc-alacak.

Slider/Ultracode kullanicinin oturum ayaridir; ajan degistirmez ve kullanicidan kademe degistirmesini istemez. Basit islerde solo calis; esasli islerde derin analiz yap ve seviyeyi oner.

Gorev yetkileri:

- `GO-ANALYZE`: yalniz analiz ve rapor; degisiklik yok. Sonunda kullanici karari beklenir.
- `GO-IMPLEMENT`: degisiklik, test ve validation yapilir; merge yok. Commit/PR yalniz ayrica istenirse yapilir. Sonunda kullanici karari beklenir.
- `GO-COMPLETE`: implementasyon, test, CI, merge, branch/worktree cleanup, main sync, final verification, checkpoint ve sonraki adim tek zincirdir. Stop condition yoksa zincir icinde tekrar onay istenmez.

Kanonik repo: `C:\Users\ulas.htelli\Desktop\HUKUK_PROJE\HUKUK_YAZILIMI`. Bu tek dogru koktur; bagimsiz ikinci clone tespit edilirse kodlamadan once dur ve raporla.

Her implementasyon ayri branch ve ayri worktree ile, kanonik reponun git agindan ve `origin/main` bazindan acilir. Kanonik working tree yalniz `main` senkronu ve final dogrulama icindir; kirliyse kullanici WIP'i say, dokunma, yine yeni worktree ac.

```text
git fetch origin
git worktree add ../HUKUK_<konu> origin/main -b codex/<konu>
cd ../HUKUK_<konu>
```

## 4. Verification

Kod veya davranis degisikliginden once etkiyi dogrula. Degistirecegin dosya, servis, controller veya metodu kimin nereden cagirdigini tespit et; metot degisiyorsa tum cagiranlari kontrol et.

On analiz ihtiyaca gore cagiran yerler, impact scope, multitenant etki, tablo iliskileri, schema/migration ihtimali, runtime, guvenlik ve mimari uyumu kapsar. Docs-only islerde tek tek "yok" listesi yazma; "documentation-only, davranis etkisi yok" yeterlidir.

Tablo uzerinde islem yapacaksan iliskili tablolari ve yan etkileri incele. Yeni gelistirmeden once mevcut uygulama var mi bak; kod tekrarindan kacin. Riskli UI/API dogrulamasindan once localhost servisinin hangi worktree'den calistigini kontrol et.

## 5. Development Rules

Onay almadan kodlamaya gecme: ne yapacagini, nedenini ve beklenen etki alanini soyle; kullanici yetkisi geldikten sonra ilerle.

Yeni servis metodu veya controller action yazarken XML yorum ekle; mevcut metodu degistirirken listeyi kontrol edip guncelle:

```csharp
/// <remarks>
/// Cagrildigi yerler:
/// - {Controller/Servis}.{Metod}() -> {HTTP METHOD} {endpoint} ({aciklama})
/// - {Servis}.{Metod}() -> {aciklama}
/// </remarks>
```

Degisiklikleri mevcut modul sinirlari ve yerel pattern'ler icinde tut. Yeni abstraction yalniz gercek karmasayi azaltirsa veya mevcut mimariyle uyumluysa eklenir.

## 6. Testing

Test seviyesi riskle orantili secilir. Docs-only degisikliklerde diff, kapsam ve uzunluk kontrolu yeterlidir. Kod veya davranis degisikliginde ilgili unit/integration/e2e veya smoke validation calistirilir.

`GO-IMPLEMENT` sonunda validation sonucu raporlanir; merge yapilmaz. `GO-COMPLETE` icin CI takip edilir: `IN_PROGRESS` ise yaklasik 60 saniyede bir, en fazla 20 dakika kontrol et; `SUCCESS` olursa merge ve cleanup zinciri devam eder; `FAIL` veya timeout olursa dur. CI bitmeden gelen `mergeStateStatus: BLOCKED` tek basina stop condition degildir; CI bitince yeniden kontrol edilir. CI sonrasi `mergeStateStatus` `CLEAN` degilse dur.

## 7. Reporting

Raporlar kisa, karar odakli ve kapsama uygun olsun. Docs-only islerde tekrarlayan "schema yok/migration yok/runtime yok" boilerplate'i yazma.

Onay semantigi: `GO-ANALYZE` ve `GO-IMPLEMENT` sonunda `Onay Bekleniyor: YES`; `GO-COMPLETE` sonunda stop condition yoksa `NO`, varsa `YES`.

Kapanista is gerektiriyorsa su bilgileri ver: degisen dosyalar, ozet, kaldirilan veya yeniden ifade edilen kural gruplari, verification, kalan risk, sonraki adim. Backlog veya mimari karar yoksa sabit blok uretme.

## 8. Dangerous Operations

Stop condition olusursa dur ve raporla: CI failure, merge conflict, scope/mimari degisimi, beklenmeyen dosya, schema/migration degisimi, guvenlik riski, yeni backlog veya Active Roadmap ihtiyaci, kullanici karari gereksinimi, beklenmeyen teknik risk.

Kullaniciya ait WIP'e dokunma; bilinmeyen degisiklikleri revert etme, stash'leme, tasima veya temizleme. Ilgiliyse uyumlu calis, ilgisizse yok say.

Worktree cleanup fiziksel recursive silme ile yapilmaz: `rm -rf`, `cmd rd /s /q`, PowerShell `Remove-Item -Recurse`, `.NET Directory.Delete(path, true)` kullanma. Guvenli sira:

```text
node_modules junction/symlink audit
git worktree remove --force <yol>
git worktree prune
git fetch --prune
```

"Directory not empty" kalirsa `ORPHANED_WORKTREE_DIR` olarak birak. Branch silmeden once PR merge durumunu `gh` ile dogrula; squash merge icin git ancestry'ye guvenme. Cleanup sonrasi canonical integrity ve `.git/config` kontrol edilir.

## 9. Appendix

```text
Preserve behavior.
Reduce duplication.
Prefer principles over prohibition lists.
Use isolated worktrees for implementation.
Verify impact before editing.
Stop on real risk.
```

Runbook: `project/docs/runbooks/worktree-cleanup.md`.
