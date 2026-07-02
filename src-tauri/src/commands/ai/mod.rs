//! BYOK (bring-your-own-key) AI infrastructure commands.
//!
//! - [`auth_header`] — pure per-kind auth header shaping.
//! - [`keys`]        — OS-keychain key management (no secret ever returned to JS).
//! - [`providers`]   — non-secret provider-config persistence (app-config JSON).
//! - [`ai_proxy`]    — secure transport: inject the key in Rust, proxy the request,
//!                     return (buffered) or stream (via `Channel`) the response.
//!
//! The secret lives only in Rust: keychain → request scope → provider. It never
//! enters the webview, disk (except the keychain), or logs.

pub mod ai_proxy;
pub mod auth_header;
pub mod keys;
pub mod providers;
