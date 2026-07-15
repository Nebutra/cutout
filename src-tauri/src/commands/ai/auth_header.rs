//! Per-provider-kind auth header shaping.
//!
//! This is the *only* provider-specific logic that lives in Rust: given a
//! provider `kind` and the raw secret, return the `(name, value)` header pairs
//! that must be injected before the request leaves the machine. It is a pure
//! function (no I/O, no keychain, no logging) so it can be unit-tested in
//! isolation and reviewed for correctness.
//!
//! The secret is passed by reference and only ever appears inside the returned
//! `HeaderValue`; it is never logged or `format!`-ed into an error here.

/// Return the auth headers to inject for a given provider `kind`, or `None` if
/// the kind is unknown (the proxy rejects unknown kinds).
///
/// - `anthropic`            → `x-api-key: <secret>` + `anthropic-version: 2023-06-01`
/// - OpenAI-compatible cloud profiles → `authorization: Bearer <secret>`
/// - Local profiles (`ollama`, `vllm`, `lm-studio`) → no injected credentials
/// - `google`              → `x-goog-api-key: <secret>`
pub fn auth_headers(kind: &str, secret: &str) -> Option<Vec<(String, String)>> {
    match kind {
        "anthropic" => Some(vec![
            ("x-api-key".to_string(), secret.to_string()),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ]),
        "openai" | "gateway" | "openai-compatible" | "dashscope" | "deepseek" | "zhipu"
        | "moonshot" | "volcengine" | "siliconflow" | "openrouter" | "together" | "groq"
        | "fireworks" | "xai" | "mistral" => Some(vec![(
            "authorization".to_string(),
            format!("Bearer {secret}"),
        )]),
        "ollama" | "vllm" | "lm-studio" => Some(Vec::new()),
        "google" => Some(vec![("x-goog-api-key".to_string(), secret.to_string())]),
        _ => None,
    }
}

/// Header names a client (the webview / AI SDK) is not allowed to set itself —
/// we strip any inbound value and inject our own from the keychain. This stops a
/// dummy `x-api-key: __managed__` (or a malicious auth header) from leaking
/// through or shadowing the real injected credential.
pub const STRIPPED_INBOUND_HEADERS: &[&str] = &["authorization", "x-api-key", "x-goog-api-key"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_injects_key_and_version() {
        let h = auth_headers("anthropic", "sk-ant-123").unwrap();
        assert_eq!(
            h,
            vec![
                ("x-api-key".to_string(), "sk-ant-123".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ]
        );
    }

    #[test]
    fn openai_uses_bearer() {
        let h = auth_headers("openai", "sk-oai-123").unwrap();
        assert_eq!(
            h,
            vec![("authorization".to_string(), "Bearer sk-oai-123".to_string())]
        );
    }

    #[test]
    fn gateway_uses_bearer() {
        let h = auth_headers("gateway", "gw_abc").unwrap();
        assert_eq!(
            h,
            vec![("authorization".to_string(), "Bearer gw_abc".to_string())]
        );
    }

    #[test]
    fn openai_compatible_uses_bearer() {
        let h = auth_headers("openai-compatible", "local-key").unwrap();
        assert_eq!(
            h,
            vec![("authorization".to_string(), "Bearer local-key".to_string())]
        );
    }

    #[test]
    fn google_uses_goog_api_key() {
        let h = auth_headers("google", "AIza-xyz").unwrap();
        assert_eq!(
            h,
            vec![("x-goog-api-key".to_string(), "AIza-xyz".to_string())]
        );
    }

    #[test]
    fn unknown_kind_is_none() {
        assert!(auth_headers("unknown-provider", "x").is_none());
        assert!(auth_headers("", "x").is_none());
    }

    #[test]
    fn local_profiles_do_not_inject_dummy_credentials() {
        for kind in ["ollama", "vllm", "lm-studio"] {
            assert_eq!(
                auth_headers(kind, "").unwrap(),
                Vec::<(String, String)>::new()
            );
        }
    }

    #[test]
    fn secret_is_verbatim_no_extra_processing() {
        // Guard against accidental trimming/encoding of the secret.
        let weird = "  spaces-and-Ünïcode  ";
        let h = auth_headers("google", weird).unwrap();
        assert_eq!(h[0].1, weird);
    }
}
