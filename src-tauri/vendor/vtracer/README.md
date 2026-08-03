# Vendored VTracer 0.6.5

This directory contains a library-only copy of `vtracer` 0.6.5 from the
published crates.io package.

- Upstream repository: https://github.com/visioncortex/vtracer
- Upstream package: https://crates.io/crates/vtracer/0.6.5
- Upstream commit: `8acb6bd911e160a55cd8a5503cfac54550a429f8`
- Crates.io archive checksum:
  `c2307187c5c99e7387f3158a29b0be541b99b06c5c492598b77644bf5603bd0c`

The published crate declares its command-line dependency for all consumers and
its Python dependency behind an optional feature. Cutout only uses the Rust
library. This local package therefore:

- omits the `vtracer` binary, `src/main.rs`, and the CLI-only Clap dependency;
- omits the Python binding module, feature, and optional PyO3 dependency; and
- retains the upstream Rust library implementation and public API used by
  Cutout.

`src/config.rs`, `src/converter.rs`, and `src/svg.rs` are byte-for-byte copies
of the 0.6.5 package. `src/lib.rs` differs only by removal of the conditional
Python module declaration and re-export. Both upstream licenses are preserved
in this directory. Remove this copy when an official VTracer release stops
requiring the vulnerable Clap 2 / `atty` dependency chain for library users.
