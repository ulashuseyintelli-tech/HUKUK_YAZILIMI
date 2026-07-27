# PROGRAM-WIDE-OWNER-DECISION-PACK-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Durum      : OPEN DECISION PACK
Rol        : Yalnız GERÇEKTEN owner kararı gerektiren kalemler. Teknik olarak çözülebilecek
             hiçbir iş bu pack'e taşınmamıştır.
Tarih      : 2026-07-27
```

Her kalem için varsayılan aynıdır: **karar verilmezse MUTASYON YOK.** Hiçbir kalem bu belge
tarafından uygulanmaz, kapatılmaz veya statüsü değiştirilmez.

---

## ITEM-01 — `codex/ccb-001-pr1-pr6-rescue` branch disposition

**CURRENT TRUTH**

```text
local  HEAD 961bbaf3   7 unique commit / 72 dosya / 69 residual delta vs main
remote HEAD 4263b26a   local remote'un 5 commit ÖNÜNDE (push edilmemiş)
PR                     hiç açılmadı
worktree               C:\Development\HUKUK_YAZILIMI\HUKUK_ccb-001-r  (clean)
commit izleri          "restore migrated WIP from old workstation"
                       "update local Claude workspace paths"
governance             product-backlog "ID: CCB-001" → WIP/unmerged;
                       CCB-001-RELEASE-BLOCKER-TRACK açıkça: "bu track o merge'i yapmadı
                       ve yetkilendirmiyor"
teknik kanıt           Phase B Full Validation (961bbaf3'e karşı): 153 suite / 1758 test,
                       1719 PASS / 37 skip / 2 pre-existing FAIL; verdict READY_FOR_PR
```

**WHY OWNER DECISION IS REQUIRED**
Branch teknik olarak `READY_FOR_PR` doğrulanmış olmasına rağmen, hiçbir canonical kayıt merge'i
yetkilendirmemiştir. Merge, canonical hesaplama cutover'ını (ADR-014 PR-11..14 alanı) main'e
taşırdı — bu bir mimari/ürün kararıdır. Ayrıca 5 unpushed commit unique owner WIP'idir.

**OPTION A — RECOVER_ON_FRESH_MAIN**
Fresh main üzerinde yeni bir izole worktree açılır, hâlâ geçerli hunk'lar yeniden uygulanır
(main 706 commit ilerledi; büyük kısmı superseded olabilir), tam validation koşulur, yeni PR açılır.
Etki: canonical cutover main'e girer; ADR-014 PR sırası fiilen atlanmış olur.

**OPTION B — KEEP AS OWNER WIP (mevcut durum)**
Branch ve worktree olduğu gibi bırakılır; ADR-012-FEE / ADR-014 PR-11..14 kendi sıralarında,
kendi owner GO'larıyla yürütülür. Etki: main değişmez; branch bir süre daha stale kalır.

**RECOMMENDATION: B.** Governance kaydı merge'i açıkça yetkisiz sayar; teknik hazır olması
authority üretmez (`MERGEABLE != MERGE_ELIGIBLE`).

**DEFAULT IF NO DECISION: NO MUTATION** — branch, worktree ve 5 unpushed commit korunur.

---

## ITEM-02 — UYAP CPE-POA `I01` / `I02` — kayıt ile gerçeklik çelişkisi

**CURRENT TRUTH**

```text
merge edilmiş  PR #1627 / dde01ca2  UYAP-ACTING-LAWYER-RESOLVER-I01
merge edilmiş  PR #1633 / e20b36ff  UYAP-POA-TENANT-SAFETY-I01
                                    + schema.prisma
                                    + migrations/20260726210000_uyap_poa_tenant_safety_i01

canonical kayıt (3 belge) hâlâ diyor ki:
  §L  "hiçbiri bu görevle başlatılmaz"          I01 satırı PR sütunu: YOK
  §L  paket adı "UYAP-POA-TENANT-SAFETY-I02"    (PR'ın kullandığı ad: …-I01)
  §L  "I02 ayrıca pending-migration-coordination-register GO-MIGRATE gate'i gerektirir"
  §N  "hiçbir implementation, schema, migration … yetkisi üretmez"
  §N  "NEXT ELIGIBLE TASK: I01 — NOT GRANTED / NOT STARTED
       (DECISION-1 ve DECISION-2 karara bağlanmadan başlatılamaz)"

decision-log taraması: DECISION-1 / DECISION-2 için ÇÖZÜM KAYDI BULUNAMADI
belgenin kendi default'u: "her iki kararda FAIL-CLOSED / NO IMPLEMENTATION"
```

**WHY OWNER DECISION IS REQUIRED**
Üç ayrı defekt var (statü drift · task-ID drift · atlanmış GO-MIGRATE gate) ve hepsinin kökü tek
bir soruda birleşiyor: **bu iki paket yetkiyle mi yürütüldü?** `NOT GRANTED` ifadesini `GRANTED`'a
çevirmek, ajanın yetki icat etmesi olurdu — `AGENTS.md` bunu yasaklar. Kararı yalnız owner verebilir.

**OPTION A — RETROACTIVE RATIFICATION**
Owner, I01 ve I02'nin yetkiyle yürütüldüğünü teyit eder; DECISION-1/DECISION-2 karara bağlanır;
üç belgede statü `MERGED (PR #1627 / #1633)` olarak düzeltilir; `-I01`/`-I02` ID'si için tek
canonical ad seçilir + crosswalk yazılır; migration GO-MIGRATE kaydı retroaktif eklenir.
Etki: kayıt gerçekle hizalanır, I03 için yol açılır.

**OPTION B — AUTHORITY GAP DECLARATION**
Owner, bu iki merge'in tasarım belgesinin gate'i dışında yürütüldüğünü tespit eder; ayrı bir
`UYAP-AUTHORITY-GAP-RECONCILIATION` workstream'i açılır; I03..I07 gate'i **kapalı kalır**.
Etki: kayıt gerçeği "yetkisiz ama merge edilmiş" olarak taşır; runtime geri alınmaz.

**RECOMMENDATION: A** — repository'de merge edilmiş, CI'dan geçmiş, migration taşıyan bir gerçeklik
vardır; belgenin statü alanını gerçeğe hizalamak, gerçeği belgeye uydurmaya çalışmaktan güvenlidir.
Ancak DECISION-1/DECISION-2'nin **ayrıca** karara bağlanması şarttır — bunlar hâlâ açıktır.

**DEFAULT IF NO DECISION: NO MUTATION** — belgelerin statü alanları değiştirilmedi; yalnız
gözlem `decision-log.md`'ye kaydedildi.

---

## ITEM-03 — Commit edilmemiş owner WIP (5 worktree)

**CURRENT TRUTH**

| Worktree | Branch | Uncommitted içerik |
|---|---|---|
| `HUKUK_ver05a_unified_inventory` | `codex/ver-05a-unified-inventory` | 2 modified + 9 untracked (tam modül taslağı: `ver-05a-unified-inventory.{core,db,cli,types}.ts` + 4 spec + `scripts/inventory-ver-05.ts`) |
| `HUKUK_rcv_claim_form_p02_s05_i01` | `codex/rcv-claim-form-p02-s05-i01` | `M case.service.ts` + `?? case-due-formation-admission.spec.ts` |
| `HUKUK_rcv_ws04_p03_syn_01` | `codex/rcv-ws04-p03-syn-01` | `?? synthetic-allocation-corpus.spec.ts` + `?? synthetic-allocation-corpus.ts` |
| `HY_WT/T5_R02` | `codex/t5-plan-refresh-r02` | 2 modified grant template + 2 untracked `plan.v2.json` |
| `HY_WT/RUNTIME` | detached `1d042280` | `?? Invoke-CanaryAuthProbe.ps1` |

Hiçbirinde commit yok; tüm değer working tree'de. Hiçbirine dokunulmadı.

**WHY OWNER DECISION IS REQUIRED**
Bu içeriğin hangisinin canlı iş, hangisinin terk edilmiş deneme olduğu repository'den
çıkarılamaz. `AGENTS.md` §8: owner WIP'e dokunulmaz.

**OPTION A — HER BİRİ İÇİN AYRI GO**
Owner hangi WIP'in devam edeceğini söyler; her biri kendi bounded task'ı olarak commit + PR + CI
zincirine girer.

**OPTION B — TOPLU DISPOSITION**
Owner "şunlar arşiv, şunlar aktif" der; arşiv olanlar owner tarafından manuel temizlenir.

**RECOMMENDATION: A** — özellikle `HUKUK_ver05a_unified_inventory` tam bir modül taslağıdır ve
kaybı gerçek değer kaybı olur.

**DEFAULT IF NO DECISION: NO MUTATION** — beş worktree ve içerikleri korunur.

---

## ITEM-04 — Canonical `node_modules` junction hazard (2 worktree)

**CURRENT TRUTH**

```text
HUKUK_cutover_smoke         claude/cutover-smoke              0 unique commit
HUKUK_office_auth_p01_live  claude/office-auth-p01-live-migration  0 unique commit

her ikisinde de:
  project\node_modules            -> C:\…\project\project\node_modules            (CANONICAL)
  project\apps\api\node_modules   -> C:\…\project\project\apps\api\node_modules   (CANONICAL)
  project\apps\web\node_modules   -> C:\…\project\project\apps\web\node_modules   (CANONICAL)
```

Her iki worktree de "temiz + stale + sıfır unique commit" olduğu için normalde otomatik
temizlik adayıdır; **bu yüzden tehlikelidir.**

**WHY OWNER DECISION IS REQUIRED**
Güvenli kaldırma, junction'ları önce unlink etmeyi gerektirir — bu, `AGENTS.md` §8'in ajan için
yasakladığı fiziksel dizin mutasyonu sınırındadır. Yanlış komut (`rmdir /s`) canonical workspace'i
imha eder.

**OPTION A — OWNER MANUEL UNLINK + AJAN KALDIRMA**
Owner `cmd /c rmdir` (**/s YOK**) ile 6 junction'ı unlink eder, canonical integrity check yapılır,
ardından ajan `git worktree remove --force` uygular.

**OPTION B — OLDUĞU GİBİ BIRAK**
İki worktree registry'de kalır; MR-058 kalıcı uyarı olarak durur.

**RECOMMENDATION: A** — ancak yalnız owner'ın kendi elinden. Bu iki worktree'de hiç WIP yoktur
(her ikisi de 0 unique commit, clean), yani unlink sonrası kaldırma kayıpsızdır.

**DEFAULT IF NO DECISION: NO MUTATION** — MR-058 uyarısı yürürlükte kalır.

---

## ITEM-05 — 149 fiziksel orphan dizin

**CURRENT TRUTH**

```text
C:\Development\HUKUK_YAZILIMI\HUKUK_*                     141 kayıtsız dizin
C:\Development\HUKUK_YAZILIMI\project\.claude\worktrees\    8 kayıtsız dizin
git worktree registry                                      hiçbiri kayıtlı DEĞİL
maintenance-register                                       MR-002 şemsiyesi + MR-005..MR-059
```

Çoğu 77k-81k dosyalık pnpm store içerir; `Filename too long` / `Result too large` nedeniyle
normal git silme başarısızdır.

**WHY OWNER DECISION IS REQUIRED**
`AGENTS.md` §8 + `runbooks/worktree-cleanup.md` §2.3: recursive fiziksel silme AJAN tarafından
YAPILMAZ. Bu, ajanın aşamayacağı bir yasaktır, teknik bir engel değildir.

**OPTION A — TOPLU OWNER CLEANUP**
Owner, junction denetiminden geçmiş dizinleri toplu siler + her turdan sonra canonical integrity
check yapar. Etki: ~150 dizinlik disk kalıntısı temizlenir.

**OPTION B — RETENTION BİLDİRİMİ**
Owner dizinlerin kalıcı tutulacağını bildirir; MR-002 ve alt kayıtlar `CLOSED / RETAINED` yapılır.

**RECOMMENDATION: A**, fakat **ITEM-04'teki junction denetimi her dizin için tekrarlanmalıdır** —
bu programda 2/10 worktree'de canonical'a işaret eden junction bulundu, oran düşük değildir.

**DEFAULT IF NO DECISION: NO MUTATION** — dizinler yerinde kalır, MR-002 açık kalır.

---

## Bu pack'e ALINMAYANLAR (teknik olarak çözüldü)

```text
195 stale branch temizliği        → uygulandı, owner turu beklenmedi (Wave 1 yetkisi)
8 worktree unregister             → uygulandı
7 kapalı PR disposition           → gerekçeleri kayıtlı, karar gerekmedi
ver05 orphan izleme satırı        → RECOVER_ON_FRESH_MAIN ile bu PR'da kapatıldı
2 merged migration görünürlüğü    → mekanik reconciliation ile bu PR'da kapatıldı
8 ghost reference adayı           → 0 gerçek ghost; düzeltilecek hedef yok
```
