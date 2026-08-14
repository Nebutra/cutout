# Cutout official website

Static product site for `https://cutout.nebutra.com`.

```bash
node website/scripts/validate.mjs
python3 -m http.server 4174 --directory website
```

The site deliberately has no package or runtime dependency. Product images are
reviewed repository evidence converted to WebP; download links resolve through
the immutable `Nebutra/cutout` GitHub release authority.
