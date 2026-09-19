#!/bin/bash
set -euo pipefail
# CI-4: trust proxy ayari kontrolu
# Ayar tek yapilandirma noktasindadir (src/common/trust-proxy.config.ts: applyTrustProxy +
# TRUST_PROXY_HOPS = 1); main.ts bootstrap'i listen oncesinde onu ayni app ile cagirir.
# Denetim yorum/string'i sayMAYAN bagimliliksiz statik tarayici ile yapilir; once kendi
# negatif durumlarini (self-test) dogrular. Ayrinti ve sinirlar: ci-4-trust-proxy-gate.cjs basligi.

node "$(dirname "$0")/ci-4-trust-proxy-gate.cjs"
