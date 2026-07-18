# Motion And Lottie Contract

## Status

- Capability status: `internal-only`
- Canonical structure: `motion-ir.v1`
- Lottie export: supported subset only

## Supported Subset

- Shape, null, and precomp layers
- Position, scale, rotation, and opacity tracks
- Static values and keyframes
- Linear and cubic-bezier easing
- Markers, load/manual interaction triggers
- SVG web rendering

## Quality Gates

- Schema and source revision
- Duration and layer bounds
- Blank-frame detection
- Reduced-motion fallback
- Web-render screenshot receipt

## Blocked Features

- Expressions, masks, effects, 3D and fonts
- Unsafe external asset paths
- Image export without an embedded-asset adapter
