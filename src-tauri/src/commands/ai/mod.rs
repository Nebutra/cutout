//! BYOK (bring-your-own-key) AI infrastructure commands.
//!
//! - [`auth_header`] — pure protocol-aware auth header shaping.
//! - [`keys`]        — OS-keychain key management (no secret ever returned to JS).
//! - [`providers`]   — non-secret provider-config persistence (app-config JSON).
//! - [`ai_proxy`]    — secure transport: inject the key in Rust, proxy the request,
//!                     return (buffered) or stream (via `Channel`) the response.
//! - [`image_edit`]  — 垫图: multipart `/images/edits` (reference-conditioned gen),
//!                     a sibling of the string-body proxy (edits is form-data).
//!
//! The secret lives only in Rust: keychain → request scope → provider. It never
//! enters the webview, disk (except the keychain), or logs.

pub mod ai_proxy;
pub mod auth_header;
pub mod image_edit;
pub mod keys;
pub mod provider_discovery;
pub mod providers;
