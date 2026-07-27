# PROGRAM-WIDE-GHOST-REFERENCE-REGISTER-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-GHOST-REFERENCE-REGISTER-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Durum      : EVIDENCE REGISTER / NON-NORMATIVE
Rol        : Governance korpusunda referans verilip gerçekte bulunmayan artefaktları kaydeder.
Tarih      : 2026-07-27
```

## 1. Tarama yöntemi ve kapsam

`project/docs/governance/**` (kök + 4 alt dizin) içindeki tüm backtick'li dosya yolu referansları
çıkarıldı ve üç ayrı kök (`.`, `project/`, `project/apps/api/`) altında varlık testi yapıldı.

```text
taranan benzersiz yol referansı : 136
bulunamayan (aday ghost)        :   8
incelendikten sonra GERÇEK ghost:   0
onarılan                        :   0  (onarılacak gerçek ghost yok)
```

## 2. 8 adayın tek tek karakterizasyonu

| # | Referans | Nerede | Karakterizasyon | Sınıf |
|---|---|---|---|---|
| G-01 | `apps/web/.../cases/new/page.tsx` | product-backlog / decision-log anlatısı | `...` içeren **prose kısaltması**, gerçek yol değil. Tam yol repo'da mevcut. | NOT_A_REFERENCE |
| G-02 | `apps/web/.../portal/layout.tsx` | aynı | Aynı — prose kısaltması. | NOT_A_REFERENCE |
| G-03 | `apps/web/src/lib/legacy-reference/guarded-primary-display.ts` | `product-backlog.md` CCB-001-R anlatısı | Metnin kendisi bunun **WIP-branch-only** olduğunu açıkça yazar: *"repo evidence on the WIP branch shows…"* + *"branch is unmerged, `main` behavior is unaffected"*. Dosya `codex/ccb-001-pr1-pr6-rescue` üzerinde mevcuttur. | CORRECT_AS_WRITTEN |
| G-04 | `docs/adr/ADR-013-CANONICAL-LEGAL-CALCULATION-CORE.md` | decision-log 2026-07-10 · canonicalization-register | **Tarihsel rename anlatısı.** Dosya oluşturuldu (PR #1019), sonra owner arbitration ile `ADR-014-CCB-001-…`'e taşındı (PR #1022). Kayıt bu üç aşamalı süreci anlatmak için eski adı zorunlu olarak içerir. | HISTORICAL_NARRATIVE |
| G-05 | `project/docs/adr/ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md` | aynı + `governance-writer-coordination-protected-paths.json` | CCB branch'in kendi taslağının adı; hiç main'e girmedi. Protected-paths listesinde `grandfatheredOwnerWipExactPaths` altında **bilinçli** olarak durur (owner WIP koruması, varlık iddiası değil). | HISTORICAL_NARRATIVE |
| G-06 | `scripts/diagnostic-orphan-collections.ts` | `product-backlog.md:838` | Metnin kendisi yazar: **"untracked, commit edilmedi"**. Kayıt doğrudur. | CORRECT_AS_WRITTEN |
| G-07 | `scripts/diagnostic-cutover-readiness.ts` | `product-backlog.md:884` | Metnin kendisi yazar: **"untracked"**. Kayıt doğrudur. | CORRECT_AS_WRITTEN |
| G-08 | `project/apps/api/scripts/diagnostic-cutover-readiness.ts` | `product-backlog.md:1214` `Related Modules:` | Aynı untracked dosyanın tam yolu; bu satırda `untracked` niteleyicisi tekrarlanmamış. Aynı kaydın :884 satırı niteleyiciyi taşıdığı için **yanıltıcı değildir**. | COSMETIC / P3 |

## 3. Sonuç

**Onarılacak gerçek ghost reference bulunmamıştır.** Governance korpusunda kırık canonical pointer
yoktur. Aday olarak işaretlenen 8 referansın tamamı ya prose kısaltmasıdır, ya branch-local /
untracked olduğu **belgenin kendisinde açıkça yazılıdır**, ya da tarihsel rename anlatısının
zorunlu parçasıdır.

Bu, `AGENTS.md`'nin *"gerçek canonical hedef kesin ise otomatik düzelt; belirsizse owner kararı iste"*
kuralı uyarınca **hiçbir otomatik düzeltme tetiklememiştir** — düzeltilecek bir hedef yoktur.

## 4. Ayrı tutulan bulgu — task ID drift (ghost DEĞİL)

Aşağıdaki bulgu bir dosya-yolu ghost referansı değil, **task kimliği tutarsızlığı**dır ve bu
register'da değil `PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01.md` §2 D-2'de izlenir:

```text
PR #1633 başlığı      : UYAP-POA-TENANT-SAFETY-I01
canonical decomposition: UYAP-POA-TENANT-SAFETY-I02
                         (UYAP-CPE-POA-ACTING-LAWYER-AUTHORITY-DESIGN-v1.0.md §L)
```

Bu, otomatik düzeltilebilir bir referans hatası **değildir**: hangi ID'nin canonical olduğuna karar
vermek (ve belgeyi mi PR geçmişini mi esas alacağına karar vermek) semantic bir owner kararıdır.
`PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md` ITEM-02 kapsamındadır.
