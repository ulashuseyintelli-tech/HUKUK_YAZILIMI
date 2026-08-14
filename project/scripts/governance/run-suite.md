# Governance Suite Runner (P0-R1) — Kanonik Yerel Kullanım

Bu belge, governance full suite'inin YEREL kanonik çalıştırma sözleşmesidir
(owner kararı: GOVERNANCE SUITE PERFORMANCE PROGRAM / P0-R1 ve R02
reconciliation). CI bağımsız authoritative gate olarak korunur; bu sarmalayıcı
CI'ı değiştirmez ve CI'da koşmaz.

## Kanonik komut

Ajan workflow'larında governance full suite YEREL olarak şu şekilde koşulur:

```bash
pnpm gov:suite run
```

(veya eşdeğeri: `node scripts/governance/run-suite.cjs run`, cwd: `project/`).

Doğrudan `node --test scripts/governance-coordination.test.cjs` çağrısı geriye
uyumluluk için ÇALIŞMAYA DEVAM EDER; ancak kalıcı artefakt, single-flight ve
recovery istenen her ajan koşusunda kanonik giriş sarmalayıcıdır.

## Ne sağlar

- `RUN_ID` + iki ayrı fingerprint: `SUITE_FINGERPRINT` (repo kimliği, base/HEAD
  SHA, worktree diff sha256, suite/policy source sha256, node+git sürümleri,
  normalize komut) ve `EXECUTION_FINGERPRINT` (ajan türü, shell/wrapper zinciri,
  exact transport komutu, reporter, session).
- Makine-geneli `LOCAL_FULL_GOVERNANCE_SUITE_CONCURRENCY=1`: aynı fingerprint
  → mevcut koşuya ATTACH; farklı fingerprint → `RESOURCE_BUSY` (exit 75).
  Eşzamanlılık yalnız owner-authorized `--benchmark-mode --benchmark-run-id`
  ile serbesttir.
- Append-only timestamp'li `output.log`, 10 sn `heartbeat.json`, atomic
  `run.json`, makine-okur `result.tap`; exact exit code passthrough.
- Launcher/hücre ölümü sonucu ÖLDÜRMEZ: yeni oturum `status` / `attach` /
  `recover` ile devam eder; canlı sahipli ağaç varken yeni koşu başlamaz
  (`LOST_CONTROLLER`/`ORPHAN_RUNNING`, exit 76) ve kilit bırakılmaz.
- Sonuç sınıflandırması: `PASS` yalnız TAP planı tam + toplamlar tutarlı +
  fail 0 + exit 0 + sahipli ağaç kapandı + koşu boyunca fingerprint değişmedi
  koşullarının TÜMÜ ile yazılır. `STALE_INPUT`,
  `WORKTREE_CHANGED_DURING_RUN`, `TEARDOWN_HANG` ayrı durumlardır ve hiçbiri
  PASS değildir.
- Test sayısı runner'a gömülü değildir: `run-suite.baseline.json` suite source
  SHA'sına bağlı owner-onaylı beklenen sayıyı taşır; suite kaynağı değişince
  eski baseline ve eski sonuçlar otomatik reuse EDİLMEZ (`reuse-check`).

## Artefakt konumu

Git tarafından izlenmeyen makine-geneli alan (aynı repo'nun tüm
clone/worktree'leri ortak görür):

```text
Windows: %LOCALAPPDATA%\hukuk-governance-suite\<repoId>\
  machine.lock\owner.json
  runs\<RUN_ID>\{run.json, output.log, heartbeat.json, result.tap}
```

Artefaktlar LOCAL kalır; harici/cloud sisteme gönderilmez; secret/token değeri
yazılmaz (env değerleri kaydedilmez). Sonuç reuse yalnız local provenance +
exact fingerprint eşleşmesiyle değerlendirilir; CI kanıtının yerine geçmez.

## Komutlar

```text
run [--benchmark-mode --benchmark-run-id <id>]   kanonik koşu / aynı fp'ye attach
status                                           kilit + son koşular (salt-okunur)
attach [--run-id <id>]                           aktif/geçmiş koşuya bağlan
reuse-check                                      mevcut fingerprint için reuse kararı
recover [--apply]                                stale kilit/koşu sınıflandırma+onarım
```

## Sınırlar (bilinçli)

- CI wiring YOK: `run-suite.test.cjs` CI'da otomatik koşmaz (guard step'i exact
  dosya listelidir ve `ci.yml` control-plane'dir). CI bağlaması ayrı owner
  checkpoint/request-only akış gerektirir — P0-R1 kapsamı dışında bırakıldı.
- Untracked dosyaların İÇERİĞİ worktree fingerprint'ine girmez (adları girer).
- Ownership kaydı launcher+runner düzeyindedir; runner'ın torunları Windows'ta
  `taskkill /T` ile ağaç olarak temizlenir.
- `project/docs/runbooks/**` korumalı olduğundan runbook bağlaması bu fazda
  yapılmadı; kanonik kullanım bu colocated belgede tanımlıdır (owner fallback
  hükmü gereği).
