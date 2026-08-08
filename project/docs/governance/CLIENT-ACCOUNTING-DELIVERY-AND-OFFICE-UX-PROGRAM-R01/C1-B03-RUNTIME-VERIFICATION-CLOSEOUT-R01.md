# C1-B03 — RUNTIME VERIFICATION CLOSEOUT (R01)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    C1-B03-RUNTIME-VERIFICATION-CLOSEOUT-R01     LANE OWNER: CLAUDE
AUTHORIZATION: OWNER RATIFIED / SCOPED GO-COMPLETE (2026-08-09) — controlled cutover,
              PRESERVED w5-artifact, immutable RC release, backup-gated, task-target cutover.
VERDICT:      C1-B03 (owner GO-COMPLETE acceptance matrix) = RUNTIME_VERIFIED
SCOPE:        client-compliance office surfaces (KVKK/DSAR/legal-hold/deletion-gate/roles/
              tenant-isolation) + portal/web render, on the pinned RC. C1-B04 (canary) ve
              C1-B05 (product_complete) AYRI bloklar; kapsam DIŞI.
```

## 1. SHA / RUNTIME PINNING
| Öğe | Değer |
|---|---|
| **RC (immutable/pinned)** | `1488063d` |
| main tip (closeout anı) | `4bb6ebb3` (#2303 X3 schemas — RC'ye ALINMADI, constraint 8) |
| Route-shadow fix (kanonik) | `daaef957` (#2293) — RC içinde |
| Regresyon guard | `af391a06` (#2298) — RC içinde |
| Pre-deploy runtime (PRESERVED rollback) | w5-artifact `62199535` (#2261) + route-shadow hotfix (semantic==#2293) |
| Post-deploy runtime | `.worktrees/rc-1488063d` (detached @ 1488063d, immutable) |

## 2. TASK-TARGET CUTOVER
| Task | Pre (rollback) | Post (RC) |
|---|---|---|
| HukukPlatform-API | `node dist/apps/api/src/main.js` @ `w5-artifact/project/apps/api` | aynı komut @ `rc-1488063d/project/apps/api` |
| HukukPlatform-Web | `cmd /c npx next start --port 3002` @ `w5-artifact/project/apps/web` (Disabled) | aynı komut @ `rc-1488063d/project/apps/web` |

Rollback = task WorkingDirectory'yi PRESERVED w5 yollarına geri çevir + restart (ham #2261 rebuild DEĞİL).

## 3. DB BACKUP (custom-format, cutover ÖNCESİ)
- file: `_deploy_c1b03/hukuk_db-pre-c1b03-rc1488063d.dump` (host-dışı repo)
- format: custom `-Fc`, 1,173,483 bytes, magic `PGDMP`
- **SHA-256:** `ed341c4f6e2fe3b14a741c3bf08a19a991376687cc8ccc63311a83333dfd3f91`
- `pg_restore --list`: PASS (2167 TOC) — gerçek restore ÇALIŞTIRILMADI.

## 4. MIGRATION / ŞEMA
- Canlı DB `hukuk_db@localhost:5432`: `prisma migrate status` → 121 migration, **"up to date"**.
- #2261↔RC arası migration farkı = 0 → cutover **code-only**, şema değişmedi, veri migrasyonu yok.

## 5. DEPLOY GATE'LERİ (hepsi PASS)
| Gate | Sonuç |
|---|---|
| Phase 1 install(`--frozen-lockfile`)+generate+env-parity | PASS |
| Phase 2 API build / Web build | PASS / PASS (BUILD_ID `G9Wu00pkDaKzLbExTMizN`) |
| Phase 3 backup + sha256 + pg_restore --list | PASS |
| Phase 4 API cutover + smoke | **9/0** (3 compliance GET=200, `:id` found/unknown, mojibake-düzeltmesi RC teyidi) |
| Phase 5 Web cutover + smoke | **3/0** (RC BUILD_ID servis, compliance sayfası 200) |

## 6. UAT KABUL MATRİSİ (RC, canlı)
| Test | Sonuç |
|---|---|
| DSAR durum makinesi | `RECEIVED→IN_REVIEW→RESPONDED` PASS |
| Legal-hold maker-checker | place→ACTIVE, request-release, same-maker **403**, farklı-eligible **201 RELEASED** PASS |
| deletion-evaluation gate | `executionAllowed=false` fail-closed PASS |
| Rol sınırı | USER mutation **403** (K8.4) PASS |
| **Tenant izolasyonu (D-2/D-3)** | B-admin A'nın 3 compliance listesi=**len 0**, A client'ı=**404**, cross-tenant place-hold=**404**, B `/clients`=**0**; A hold sayısı değişmedi → **İZOLASYON İNTAKT** |
| Portal/web render | compliance UI 6B verisiyle render (DSAR RESPONDED, hold RELEASED, disclosure v1); authenticated network **tüm 200**; fail-closed/empty-state doğru; **HARD STOP yok** |

**Not (portal auth persistence):** apiClient token'ı bellekte tutuluyor (localStorage/cookie'ye yazmaz); hard-reload'da compliance çağrıları 401 döner ve UI **doğru fail-closed** (sessiz boş değil) davranır. Bu uygulama-geneli, önceden var olan davranıştır; route-shadow fix/compliance ile İLGİSİZ, D-2/D-3 değil. Owner disposition (kapsam dışı).

## 7. UAT CLEANUP (constraint 10)
- demo-firma UAT kayıtları (1 DSAR + 1 disclosure + 1 hold) silindi → listeler len=0.
- Tenant B (uat-tenant-b) + user + lawyer silindi → B admin login **401**.
- approver-2 deaktive + demote (role=USER, lawyer PARTNER→LAWYER, canApprove=false, tokenVersion++); **eski token replay 401** (auth + tokenVersion), audit kimliği korundu.
- UAT script + browser localStorage + scratchpad token'ları temizlendi.

## 8. VERDICT
Tüm deploy + UAT hard gate'leri PASS; D-2/D-3 intakt; rollback noktası (PRESERVED w5) korunuyor.
**C1-B03 (owner GO-COMPLETE acceptance matrix) = RUNTIME_VERIFIED / CLOSED**, RC `1488063d` üzerinde.
Kalan: C1-B04 (canary teslimleri) · C1-B05 (product_complete) ayrı bloklar; #2303 şemaları RC-dışı (ayrı deploy kararı).
