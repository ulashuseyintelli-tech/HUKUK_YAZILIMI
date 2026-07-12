# HUKUK_YAZILIMI Repository Agent Instructions

Bu dosya repository-level ajan talimatidir. Bu repository'de calisan ajanlar icin kalici davranis kurallarini tanimlar.

## Otorite Zinciri

1. `AGENTS.md` tum ajanlar icin repository-level zorunlu baseline'dir.
2. `CLAUDE.md` Claude'a ozgu operasyonel supplement'tir; `AGENTS.md` ile celisemez veya onu override edemez.
3. `project/docs/governance/` proje governance, roadmap, backlog, decision ve surec kayitlarini tutar; bu kayitlar `AGENTS.md` ile tutarli olmalidir.
4. Gelecekteki repo-local skill'ler resmi Codex scan yuzeyi olan `.agents/skills/` altinda tanimlanir.
5. `.codex/` Codex operasyonel config, hooks ve project-scoped custom agents yuzeyidir; mevcut owner/user WIP sayilir ve acik yetki olmadan degistirilmez.

## Ilkeler

- Ground Truth First: Repository gercek durumunu dosya, komut ciktisi veya resmi kaynakla dogrula; repository state uydurma.
- Repository-wide AI ground-truth rule: Sohbet gecmisi yalniz niyet ve karar tasir; mevcut gercekler her gorevde repository state, git state, dosya icerigi, governance kayitlari, PR/CI durumu ve komut ciktilarindan yeniden dogrulanir.
- Buyuk veya uzun omurlu workstream'lerde ise baslamadan once Session Initialization ozeti uretilir: Repository State, Execution Context, Context Drift, Concurrent Activity ve Ready/Not Ready.
- Varsayilan mod read-only'dir. Dosya degisikligi yalniz kullanici `GO-IMPLEMENT` veya `GO-COMPLETE` verdiginde yapilir.
- Implementation default: canonical project root icinde implementasyon yapilmaz. Her `GO-IMPLEMENT`, `GO-HOTFIX` veya `GO-COMPLETE` dosya degisikliginden once current directory ve branch dogrulanir; ajan canonical root icindeyse durur, `origin/main` tabanli fresh isolated worktree olusturur ve yalniz o worktree icinde calisir.
- Canonical project root yalniz read-only dogrulama, final main sync ve register verification icin kullanilir; PR branch'i canonical root icinde acilmaz ve canonical root'ta dosya editlenmez.
- Spekulatif refactor yapma.
- En kucuk guvenli patch'i tercih et.
- Mevcut mimariyi, geriye donuk uyumlulugu ve davranisi koru.
- Commit, push, merge veya branch silme islemleri yalniz kullanici acikca yetki verdiginde yapilir.
- DX-005 / Waiting & Progress Policy: Calisma dis bir bagimlilikla bloklandiginda ajanin davranisi icin bkz. `docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`.

## Calisma Modlari

- `GO-ANALYZE`: Salt-okunur analiz ve rapor. Dosya degisikligi, stage, commit, push veya merge yok.
- `GO-IMPLEMENT`: Kapsam icinde degisiklik, ilgili validation ve rapor. Commit, push veya merge yok.
- `GO-COMPLETE`: Kullanici acikca verdiyse implementasyon ve tamamlanma zinciri. Commit, push, PR, CI, merge, main sync veya branch/worktree cleanup yalniz gorev brief'i acik `IF GO-COMPLETE` owner yetkisi iceriyorsa zincire dahildir. Tool/system guardrail veya PR'a ozgu yetki gereksinimi varsa dur ve owner'dan acik yetki iste; aksi halde CI PASS ve `mergeStateStatus` CLEAN sonrasi zincir icinde tekrar onay isteme.

## Uygulama Kurallari

- Degisiklikten once ilgili dosyalari ve yakin cevre kodunu oku.
- Dosya editinden once current directory, branch ve worktree izolasyonu dogrulanir; canonical root'ta bulunuyorsan edit yapma.
- Scope disi dosyalari degistirme.
- Yeni abstraction yalniz gercek karmasayi azaltiyorsa veya mevcut mimariyle acikca uyumluysa eklenir.
- Davranis degisikligini sessizce tanitma.
- Hukuki/finansal semantiklerde domain dogrulugu implementasyon kolayligindan onceliklidir.
- Owner/user WIP'i owner acikca yetki vermedikce revert, stash, tasima, clean, delete veya baska sekilde modify etme.

## Validation

- Validation seviyesi risk ve etki alanina gore secilir.
- Kod veya davranis degisikliginde ilgili en kucuk anlamli test, type-check, lint veya smoke validation calistirilir.
- Docs-only degisikliklerde diff, kapsam ve ilgili register/dokuman tutarliligi kontrolu yeterlidir.
- Test iddialari factual olmalidir: yalniz gercekten calistirilan komutlar ve gozlenen sonuclar raporlanir.
- Calistirilmayan test veya kontrol icin "calistirilmadi" denir; tahmini sonuc test sonucu gibi sunulmaz.

## Borclu Hatti (Debtor) Zorunlu On-Kural

Borclu hattiyla ilgili her analiz, tasarim, implementation, migration, review veya governance gorevinden once:

1. `project/docs/governance/DEBTOR-GOVERNANCE.md` okunur.
2. Icindeki Mandatory Pre-Task Checklist doldurulur.
3. Belgenin invariant veya hard-stop kurallariyla celisen bir durum tespit edilirse durulur ve raporlanir.
4. Kanonik borclu kurallari, ratifiye edilmis governance karari olmadan override edilmez.

Belge hiyerarsisi ve okuma sirasi: `project/docs/governance/GOVERNANCE-INDEX.md`.

## Alacak Hatti (Receivable) Zorunlu On-Kural

ClaimItem, Due bridge, Collection etkisi, allocation, faiz authority'si, legal balance,
reversal veya receivable cutover ile ilgili her analiz, tasarim, implementation,
migration, review veya governance gorevinden once:

1. `project/docs/governance/RECEIVABLE-GOVERNANCE.md` okunur.
2. Belgenin authority matrisi, invariantlari ve goreve uygulanabilir checklist'i izlenir.
3. Belgenin invariant veya hard-stop kurallariyla celisen bir durum tespit edilirse durulur ve raporlanir.
4. Kanonik receivable kurallari, ratifiye edilmis governance karari olmadan override edilmez.

Belge hiyerarsisi ve okuma sirasi: `project/docs/governance/GOVERNANCE-INDEX.md`.

## Raporlama

- Dogrulanmis gercekler, makul varsayimlar ve riskler ayri belirtilir.
- Kanit yetersizse acikca soyle.
- Kapanistan once Master Register dogrulamasi zorunludur.
- Raporlarda degisen dosyalar, validation sonucu, kalan risk ve gerekiyorsa owner review ihtiyaci belirtilir.
