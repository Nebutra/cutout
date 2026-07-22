//! Protocol-aware auth header shaping.
//!
//! Provider kind owns host policy. The validated effective wire protocol owns
//! the credential header shape, so a custom endpoint can safely use native
//! Anthropic or Google APIs without allowing caller-authored auth headers.

use super::providers::{ProviderKind, ProviderWireProtocol};

pub fn auth_headers(
    kind: ProviderKind,
    wire_protocol: Option<ProviderWireProtocol>,
    secret: &str,
) -> Result<Vec<(String, String)>, String> {
    if matches!(
        kind,
        ProviderKind::Ollama | ProviderKind::Vllm | ProviderKind::LmStudio
    ) {
        kind.effective_wire_protocol(wire_protocol)?;
        return Ok(Vec::new());
    }
    if kind == ProviderKind::Gateway {
        kind.effective_wire_protocol(wire_protocol)?;
        return Ok(vec![(
            "authorization".to_string(),
            format!("Bearer {secret}"),
        )]);
    }

    match kind.effective_wire_protocol(wire_protocol)? {
        Some(ProviderWireProtocol::Responses | ProviderWireProtocol::ChatCompletions) => {
            Ok(vec![(
                "authorization".to_string(),
                format!("Bearer {secret}"),
            )])
        }
        Some(ProviderWireProtocol::AnthropicMessages) => Ok(vec![
            ("x-api-key".to_string(), secret.to_string()),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ]),
        Some(ProviderWireProtocol::GoogleGenerateContent) => {
            Ok(vec![("x-goog-api-key".to_string(), secret.to_string())])
        }
        None => Err(format!("wire protocol is required for {}", kind.as_str())),
    }
}

pub const STRIPPED_INBOUND_HEADERS: &[&str] = &["authorization", "x-api-key", "x-goog-api-key"];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_endpoint_auth_follows_wire_protocol() {
        assert_eq!(
            auth_headers(
                ProviderKind::OpenaiCompatible,
                Some(ProviderWireProtocol::Responses),
                "secret"
            )
            .unwrap(),
            vec![("authorization".to_string(), "Bearer secret".to_string())]
        );
        assert_eq!(
            auth_headers(
                ProviderKind::OpenaiCompatible,
                Some(ProviderWireProtocol::AnthropicMessages),
                "secret"
            )
            .unwrap(),
            vec![
                ("x-api-key".to_string(), "secret".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ]
        );
        assert_eq!(
            auth_headers(
                ProviderKind::OpenaiCompatible,
                Some(ProviderWireProtocol::GoogleGenerateContent),
                "secret"
            )
            .unwrap(),
            vec![("x-goog-api-key".to_string(), "secret".to_string())]
        );
    }

    #[test]
    fn first_party_defaults_are_protocol_correct() {
        assert_eq!(
            auth_headers(ProviderKind::Anthropic, None, "ant").unwrap()[0],
            ("x-api-key".to_string(), "ant".to_string())
        );
        assert_eq!(
            auth_headers(ProviderKind::Google, None, "google").unwrap(),
            vec![("x-goog-api-key".to_string(), "google".to_string())]
        );
        assert_eq!(
            auth_headers(ProviderKind::Openai, None, "openai").unwrap(),
            vec![("authorization".to_string(), "Bearer openai".to_string())]
        );
    }

    #[test]
    fn unsupported_combinations_fail_closed() {
        assert!(auth_headers(
            ProviderKind::Deepseek,
            Some(ProviderWireProtocol::AnthropicMessages),
            "secret"
        )
        .is_err());
        assert!(auth_headers(
            ProviderKind::Gateway,
            Some(ProviderWireProtocol::ChatCompletions),
            "secret"
        )
        .is_err());
    }

    #[test]
    fn local_profiles_do_not_inject_credentials() {
        for kind in [
            ProviderKind::Ollama,
            ProviderKind::Vllm,
            ProviderKind::LmStudio,
        ] {
            assert_eq!(
                auth_headers(kind, None, "").unwrap(),
                Vec::<(String, String)>::new()
            );
        }
    }

    #[test]
    fn secret_is_verbatim_no_extra_processing() {
        let weird = "  spaces-and-Unicode  ";
        let headers = auth_headers(ProviderKind::Google, None, weird).unwrap();
        assert_eq!(headers[0].1, weird);
    }
}
