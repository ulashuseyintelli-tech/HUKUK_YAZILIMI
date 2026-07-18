# DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I1 — Resmî Contract A DTD validator IMAGE FOUNDATION
#
# Project-controlled MINIMAL xmllint/libxml2 validator image (owner D1).
# Bu image YALNIZ validator binary temelidir. DTD dosyası / XML girdisi / DTD doğrulaması /
# hash gate / result union / runtime network YOKTUR (bunlar P04B-VAL-I2 kapsamıdır).
#
# Çalıştırma sözleşmesi (P04B-VAL-I2'de kullanılacak; burada UYGULANMAZ):
#   docker run --rm --network none --read-only --cap-drop ALL \
#     --security-opt no-new-privileges --user 65532:65532 \
#     --memory <M> --cpus <C> --pids-limit <P> <image-id-sha256> ...
# --network none = birincil ağ izolasyonu; xmllint --nonet yalnız defense-in-depth argümanıdır.
#
# Base: Docker Official Alpine, exact patch + FULL manifest digest pinned.
# Validator: Alpine official libxml2-utils, exact package version pinned.
# Image registry'ye PUSH EDİLMEZ; local build + local image ID (sha256) ile kullanılır.
FROM alpine:3.22.5@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce

# Exact-pinned libxml2-utils (xmllint). apk build-time network kullanır; RUNTIME network
# EKLENMEZ (validator --network none çalışır). --no-cache: apk index image'a yazılmaz.
RUN apk add --no-cache libxml2-utils=2.13.9-r1

# Non-root çalışma (owner D1). Sabit UID/GID 65532 (nonroot konvansiyonu); home yok, login shell yok.
RUN addgroup -S -g 65532 validator \
 && adduser -S -u 65532 -G validator -H -s /sbin/nologin validator
USER 65532:65532

# Tek runtime yetki yüzeyi = xmllint. Base'in /bin/sh + apk'sı mevcuttur ancak ENTRYPOINT DEĞİLDİR.
ENTRYPOINT ["/usr/bin/xmllint"]

# Provenance etiketleri (köken beyanı; runtime authority değildir).
LABEL org.opencontainers.image.title="uyap-contract-a-validator" \
      org.opencontainers.image.description="Local-only ISO-8859-9 Contract A DTD validator foundation (xmllint/libxml2). No DTD/XML/validation in this image." \
      org.hukuk.workstream="DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I1" \
      org.hukuk.scope="validator-image-foundation-only" \
      org.hukuk.base="alpine:3.22.5" \
      org.hukuk.libxml2-utils="2.13.9-r1" \
      org.hukuk.registry-push="prohibited" \
      org.hukuk.uyap-cutover="hard-hold"
