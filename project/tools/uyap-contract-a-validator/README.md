# UYAP Contract A Validator Image — Foundation (DBP-P2-UYAP-CONTRACT-A-P04B-VAL-I1)

Project-controlled **minimal** `xmllint`/`libxml2` validator image. Bu birim (**I1**) yalnız
**validator binary temelini** kurar. Resmî DTD, XML girdisi, DTD doğrulaması, hash gate,
result union ve host adapter **bu image'da ve bu dizinde YOKTUR** — onlar **P04B-VAL-I2**
kapsamıdır. **UYAP CUTOVER = HARD HOLD.**

## Neden bu image?
- Host'ta `xmllint` yok; rastgele public xmllint image güven/tekrarlanabilirlik açısından reddedildi (owner D1).
- Base + validator paketi **exact-pinned** (Alpine manifest digest + libxml2-utils sürümü) → tekrarlanabilir, denetlenebilir.
- Runtime kullanım **izole disposable container** ile yapılır (`--network none`, read-only, cap-drop) — P04B-VAL-I2.

## Exact pins (owner D1)
| Öğe | Değer |
|---|---|
| Base image | `alpine:3.22.5` |
| Base manifest digest | `sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce` |
| Architecture | linux/amd64 |
| Validator paketi | `libxml2-utils=2.13.9-r1` (Alpine v3.22/main) |
| libxml2 sürümü | 2.13.9 |
| Binary | `/usr/bin/xmllint` |
| License | MIT (libxml2-utils + libxml2) |
| User | `65532:65532` (non-root) |
| ENTRYPOINT | `["/usr/bin/xmllint"]` |

Makine-okunur pin kaydı: [`image-contract.json`](./image-contract.json).

## Build (LOCAL — registry push YOK)
```bash
./build-validator-image.sh
```
Script: Dockerfile SHA-256'yı yazdırır → `docker build --pull --no-cache` (digest doğrulanır) →
**local image ID (sha256)** yazdırır → security-profile smoke (`xmllint --version`) çalıştırır.
Image **registry'ye push edilmez**; kullanım daima **local image ID** iledir (mutable tag DEĞİL).

## Runtime kullanım sözleşmesi (P04B-VAL-I2'de; burada UYGULANMAZ)
```bash
docker run --rm \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user 65532:65532 \
  --pids-limit <P> --memory <M> --cpus <C> \
  <image-id-sha256> <xmllint-args>
```
`--network none` = **birincil** ağ izolasyonu. `xmllint --nonet` yalnız **defense-in-depth**
argümanıdır; container ağ izolasyonunun yerine geçmez.

## Doğrulanan capability (I1 gate)
`--dtdvalid` · `--noout` · `--nocatalogs` · `--max-ampl` · `--maxmem` · stdin `-` — hepsi PRESENT.
(xmllint: DTDValid + ISO8859X + Catalog + Iconv derlenmiş; libxml2 2.13.9.)

## Image içerik sınırı (I1)
- ✅ `xmllint` mevcut · non-root · entrypoint yalnız xmllint.
- ❌ Resmî DTD YOK · XML fixture YOK · repository source YOK · Node runtime / native addon YOK · compiler/build-tool YOK.
- Base'in `/bin/sh` + `apk`'sı mevcuttur ancak **runtime authority DEĞİLDİR** (entrypoint xmllint).

## CI sınırı (owner)
- CI'da image **build YOK · pull YOK · container execution YOK · resmî DTD YOK**.
- Local build + security characterization = final-rapor evidence'ı; **CI'da tekrarlanmaz**.
- CI yalnız repository lint/static checks çalıştırır.

## Ratifiye sıra (owner D2)
`P04B-VAL-I1 → P04B-VAL-I1-GOV → P04B-VAL-I2 → P04B-VAL-I2-GOV → P04C-SHADOW`.
