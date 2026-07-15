# Speech Host Roadmap

Canonical status and launch claims are governed by the [Cutout roadmap](./ROADMAP.md). This file contains speech-specific implementation notes only.

The current desktop contract is local-first and truthful: it reports microphone capture and global shortcuts as unavailable until an authorized native backend is packaged. OpenAI-compatible ASR/TTS is a protocol adapter with an injected transport; tests use a local mock and never call a paid API.

Before enabling macOS recording:

- add a reviewed CoreAudio/AVFoundation or `cpal` capture backend;
- add `NSMicrophoneUsageDescription` and request permission from a user gesture;
- keep temporary audio below the app-private data directory, enforce the declared duration/byte limits, and remove it on stop, cancel, failure, or restart recovery;
- package and notarize the microphone entitlement and verify denial/revocation behavior on a signed build;
- add an approved global-shortcut plugin with collision detection and an explicit opt-in setting;
- connect the authorized Rust multipart proxy or an on-device ASR/TTS backend. Provider credentials must remain in the existing keychain boundary;
- run device, permission, cancellation, sleep/wake, hot-unplug, and privacy deletion tests on supported macOS hardware.

Deepgram, ElevenLabs, and remote OpenAI accounts remain catalog definitions only until their official protocol adapters, credentials, privacy terms, and receipts pass mock-server and authorized-host tests.
