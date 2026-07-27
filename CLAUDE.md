# CLAUDE.md — Claude'a Ozgu Operasyonel Delta

`AGENTS.md` zorunlu baseline'dir ve once okunur. Bu dosya yalniz Claude'a ozgu,
`AGENTS.md` icinde bulunmayan delta davranislari tanimlar.

## 1. Dil

Her zaman Turkce konus ve Turkce yorum yaz.

## 2. Calisma Seviyesi Onerisi

Her yeni goreve kisa bir seviye onerisiyle basla:

```text
CALISMA SEVIYESI ONERISI
- Faster | Normal | High | Ultra
Neden: ...
```

- Faster: git/cleanup, salt okuma, "su nerede", kavramsal cevap.
- Normal: docs veya dusuk risk.
- High: backend/controller/service/repository davranisi.
- Ultra: migration, finans, multitenant etki, veri butunlugu, odeme/tahsilat/borc-alacak.

## 3. Slider / Ultracode

Slider ve Ultracode kullanicinin oturum ayaridir; ajan degistirmez ve kullanicidan kademe
degistirmesini istemez. Basit islerde solo calis; esasli islerde derin analiz yap.
