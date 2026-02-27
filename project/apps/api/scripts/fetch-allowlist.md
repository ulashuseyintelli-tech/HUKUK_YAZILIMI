# Fetch Allowlist - Bare fetch() Kullanimina Izin Verilen Dosyalar
# Bu dosya CI-1 gate'inin tek kaynagi. CI build asamasinda path'ler buradan parse edilir.

- modules/calc-preview/regression/runner/regression-runner.ts - gerekce: test tooling, production path degil; catch verified: N/A (test)
- modules/exchange-rate/exchange-rate.service.ts - gerekce: inline AbortSignal.timeout(10000) mevcut; catch verified: try/catch line 49-58, 187-196
- modules/tariff/gazette-watcher.service.ts - gerekce: inline AbortSignal.timeout(15000) mevcut; catch verified: try/catch line 63-80
