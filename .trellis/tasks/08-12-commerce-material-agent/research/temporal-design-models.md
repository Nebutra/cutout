# Temporal design model research

Sources inspected 2026-08-12:

- `https://www.minimax.io/blog/minimax-h3`
- `https://302.ai/product/detail/minimax-h3`
- `https://seed.bytedance.com/zh/seedance2_5`
- `https://302.ai/product/detail/jimeng-doubao-seedance-2-5-260628`

## MiniMax H3 official claims

- General-purpose multimodal generation with unified text, image, video and
  audio context.
- Native stereo sound, up to 15 seconds and up to 2K.
- Commercial-content focus including advertising, branding, e-commerce,
  product design, UI/UX, gaming and film titles.
- Multi-shot modeling, accurate text/brand rendering, V2V motion transfer and
  generalized natural-language reference/edit relationships across modalities.
- Model weights were announced as planned for release, subject to applicable
  rules; do not infer a self-hostable production route until artifacts/license
  and hardware compatibility are actually published and verified.

302.ai lists asynchronous POST/GET endpoints at
`/minimaxi/v2/video_generation`, reference-image pricing and 768p/2K pricing.
This proves one aggregator product surface, not every editing parameter or the
official MiniMax API contract.

## Seedance 2.5 official claims

- Up to 30-second single clips and two video extensions.
- Improved reference interpretation, camera-language understanding and editing
  task response/usability.
- White-model control, green-screen editing, professional camera movement and
  performance direction.

302.ai lists asynchronous task create/get endpoints under
`/volcengine/api/v3/contents/generations/tasks`. Its page additionally describes
large multimodal reference sets and time-range editing, but those limits and
payload fields require confirmation from actual API documentation and probes
before Cutout advertises or routes them.

## Design OS implications

1. Provider models are becoming multimodal intent interpreters rather than
   isolated T2V/I2V tools, but Cutout still needs its own stable editorial IR.
2. A generic `video-generation` or `video-edit` flag is insufficient. Route
   contracts must describe references, time/duration, audio, multi-shot,
   extension, range editing, transfer and control modes independently.
3. H3 and Seedance fit brand, launch, commerce, product and UI/UX design, so
   video belongs in the main Design OS rather than a short-drama vertical.
4. Motion IR and Media Timeline IR solve different problems: deterministic
   component/vector animation versus audiovisual shot/sequence composition.
5. The product differentiator is non-destructive, evidence-backed direction and
   review across model routes, not dependence on whichever model leads today.
6. The Qianwen competition model allowlist inspected separately does not include
   H3 or Seedance 2.5; its package must use an allowed Wan route even if desktop
   Design OS later prefers H3/Seedance for other workflows.
7. Temporal design is a horizontal capability, not a first-class vertical named
   after launch films, ads, commerce videos or short drama. Profiles supply
   semantics; the kernel supplies timing, composition, revisions and evidence.
