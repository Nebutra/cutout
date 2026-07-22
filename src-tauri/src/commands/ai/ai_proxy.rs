//! The secure AI transport proxy.
//!
//! The AI SDK (in the webview) builds a provider request with a **dummy** api
//! key and hands it to a custom `fetch`, which forwards url/method/headers/body
//! here. Rust reads the *real* secret from the keychain, injects the auth
//! header, performs the `reqwest` call, and returns/streams the response. The
//! secret exists only in Rust and is never logged, serialized back, or embedded
//! in an error.
//!
//! Two commands:
//! - [`ai_proxy_request`] — buffered response (drives `generateText`).
//! - [`ai_proxy_stream`]  — streamed response over a `Channel` (drives `streamText`).
//!
//! ## Channel streaming contract (`ai_proxy_stream`)
//! Frames are sent on `on_chunk: Channel<tauri::ipc::InvokeResponseBody>`:
//! - **head**  — JSON `{ "type":"head", "status":u16, "headers":{..} }` (sent once, first).
//! - **chunk** — raw bytes (`InvokeResponseBody::Raw`) → JS receives an `ArrayBuffer`.
//! - **end**   — JSON `{ "type":"end" }` (terminal success marker).
//! - **error** — JSON `{ "type":"error", "message":string }` (mid-stream failure; terminal).
//!
//! JS distinguishes frames by `msg instanceof ArrayBuffer` (chunk) vs object
//! (`type` field). Pre-flight failures (before the head frame — bad host,
//! missing key, connect error) instead reject the command with [`ProxyError`];
//! once the head is sent, failures are delivered in-band as an error frame and
//! the command returns `Ok(())`.

use std::collections::HashMap;
use std::error::Error as StdError;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use serde::Serialize;
use serde_json::json;
use tauri::ipc::{Channel, InvokeResponseBody};

use super::auth_header::{auth_headers, STRIPPED_INBOUND_HEADERS};
use super::keys::{read_secret, KeyError};
use super::providers::{ProviderKind, ProviderWireProtocol};

const DEFAULT_BUFFERED_TIMEOUT_SECS: u64 = 120;
const GENERATION_BUFFERED_TIMEOUT_SECS: u64 = 600;

/// Buffered proxy response returned to JS.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Proxy errors. Serialize to a plain string across IPC and **never contain the
/// secret**. `reqwest` error strings may include the target URL (not sensitive)
/// but never the injected auth header.
#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    #[error("no key configured for provider")]
    NoKey,
    #[error("keychain error")]
    Keychain,
    #[error("unknown provider kind")]
    UnknownKind,
    #[error("unsupported provider wire protocol: {0}")]
    UnsupportedWireProtocol(String),
    #[error("invalid request url")]
    BadUrl,
    #[error("host not allowed for this provider kind")]
    DisallowedHost,
    #[error("invalid http method")]
    BadMethod,
    #[error("invalid header")]
    BadHeader,
    #[error("request failed: {0}")]
    Request(String),
    #[error("stream channel closed")]
    Channel,
}

impl Serialize for ProxyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<KeyError> for ProxyError {
    fn from(e: KeyError) -> Self {
        // Map "not found" to NoKey; keep other keychain failures opaque and
        // secret-free (`KeyError` Display never includes the secret anyway).
        match e {
            KeyError::NotFound => ProxyError::NoKey,
            _ => ProxyError::Keychain,
        }
    }
}

/// SSRF guard: enforce that `url`'s host is acceptable for the provider `kind`.
///
/// Cloud kinds are pinned to vendor domains over https. `openai-compatible`
/// permits a user-configured non-loopback https host. Explicit local profiles
/// permit only loopback HTTP(S), so selecting Ollama/vLLM/LM Studio does not
/// broaden the proxy into a general LAN request primitive. Unknown kinds fail closed.
///
/// `pub(crate)` so the sibling multipart `image_edit` command reuses the same
/// host guard for the `/images/edits` endpoint.
pub(crate) fn enforce_host(kind: &str, url: &str) -> Result<(), ProxyError> {
    let parsed = reqwest::Url::parse(url).map_err(|_| ProxyError::BadUrl)?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ProxyError::BadUrl);
    }
    let host = parsed
        .host_str()
        .ok_or(ProxyError::BadUrl)?
        .to_ascii_lowercase();
    let is_https = parsed.scheme() == "https";

    let suffix_ok = |suffix: &str| host == suffix || host.ends_with(&format!(".{suffix}"));

    let allowed = match kind {
        "anthropic" => is_https && suffix_ok("anthropic.com"),
        "openai" => is_https && suffix_ok("openai.com"),
        "google" => is_https && suffix_ok("googleapis.com"),
        "gateway" => is_https && (suffix_ok("vercel.sh") || suffix_ok("vercel.app")),
        "openai-compatible" => is_https && !is_forbidden_remote_host(&host),
        "dashscope" => is_https && suffix_ok("aliyuncs.com"),
        "deepseek" => is_https && suffix_ok("deepseek.com"),
        "zhipu" => is_https && suffix_ok("bigmodel.cn"),
        "moonshot" => is_https && suffix_ok("moonshot.cn"),
        "volcengine" => is_https && suffix_ok("volces.com"),
        "siliconflow" => is_https && suffix_ok("siliconflow.cn"),
        "openrouter" => is_https && suffix_ok("openrouter.ai"),
        "together" => is_https && suffix_ok("together.xyz"),
        "groq" => is_https && suffix_ok("groq.com"),
        "fireworks" => is_https && suffix_ok("fireworks.ai"),
        "xai" => is_https && suffix_ok("x.ai"),
        "mistral" => is_https && suffix_ok("mistral.ai"),
        "ollama" | "vllm" | "lm-studio" => {
            matches!(parsed.scheme(), "http" | "https") && is_loopback_host(&host)
        }
        _ => return Err(ProxyError::UnknownKind),
    };

    if allowed {
        Ok(())
    } else {
        Err(ProxyError::DisallowedHost)
    }
}

/// Best-effort loopback/unspecified check for the `openai-compatible` guard.
fn is_loopback_host(host: &str) -> bool {
    if host == "localhost" {
        return true;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return ip.is_loopback() || ip.is_unspecified();
    }
    false
}

fn is_forbidden_remote_host(host: &str) -> bool {
    if host == "localhost" || host.ends_with(".localhost") {
        return true;
    }
    host.trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
        .map(is_non_public_ip)
        .unwrap_or(false)
}

fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip == Ipv4Addr::BROADCAST
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || is_ipv6_unique_local(ip)
                || is_ipv6_link_local(ip)
        }
    }
}

fn is_ipv6_unique_local(ip: Ipv6Addr) -> bool {
    ip.octets()[0] & 0xfe == 0xfc
}
fn is_ipv6_link_local(ip: Ipv6Addr) -> bool {
    let o = ip.octets();
    o[0] == 0xfe && o[1] & 0xc0 == 0x80
}

/// Resolve immediately before connecting and reject any non-public address.
/// This closes the hostname-to-private-address DNS rebinding gap left by URL
/// syntax checks. Explicit local providers are intentionally exempt because
/// their contract is loopback-only.
pub(crate) async fn enforce_resolved_host(kind: &str, url: &str) -> Result<(), ProxyError> {
    if matches!(kind, "ollama" | "vllm" | "lm-studio") {
        return Ok(());
    }
    let parsed = reqwest::Url::parse(url).map_err(|_| ProxyError::BadUrl)?;
    let host = parsed.host_str().ok_or(ProxyError::BadUrl)?;
    if let Ok(ip) = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
    {
        return if is_non_public_ip(ip) {
            Err(ProxyError::DisallowedHost)
        } else {
            Ok(())
        };
    }
    let port = parsed.port_or_known_default().ok_or(ProxyError::BadUrl)?;
    let addresses: Vec<_> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| ProxyError::DisallowedHost)?
        .collect();
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| is_non_public_ip(address.ip()))
    {
        Err(ProxyError::DisallowedHost)
    } else {
        Ok(())
    }
}

fn requires_secret(kind: &str) -> bool {
    !matches!(kind, "ollama" | "vllm" | "lm-studio")
}

fn parse_provider_kind(kind: &str) -> Result<ProviderKind, ProxyError> {
    serde_json::from_value(serde_json::Value::String(kind.to_string()))
        .map_err(|_| ProxyError::UnknownKind)
}

/// Parse the method (default POST when empty) and build the outgoing header map:
/// forward client headers minus stripped/auth headers, then insert the injected
/// auth headers (overwriting, so a client-sent `anthropic-version` is replaced).
fn build_method_and_headers(
    kind: ProviderKind,
    wire_protocol: Option<ProviderWireProtocol>,
    method: &str,
    headers: HashMap<String, String>,
    secret: &str,
) -> Result<(Method, HeaderMap), ProxyError> {
    let method = if method.is_empty() {
        Method::POST
    } else {
        Method::from_bytes(method.as_bytes()).map_err(|_| ProxyError::BadMethod)?
    };

    let injected =
        auth_headers(kind, wire_protocol, secret).map_err(ProxyError::UnsupportedWireProtocol)?;

    let mut map = HeaderMap::new();
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        // Drop client-supplied auth and headers reqwest manages itself.
        if STRIPPED_INBOUND_HEADERS.contains(&lower.as_str())
            || matches!(lower.as_str(), "host" | "content-length" | "connection")
        {
            continue;
        }
        let hn = HeaderName::from_bytes(name.as_bytes()).map_err(|_| ProxyError::BadHeader)?;
        let hv = HeaderValue::from_str(&value).map_err(|_| ProxyError::BadHeader)?;
        map.insert(hn, hv);
    }
    for (name, value) in injected {
        let hn = HeaderName::from_bytes(name.as_bytes()).map_err(|_| ProxyError::BadHeader)?;
        let mut hv = HeaderValue::from_str(&value).map_err(|_| ProxyError::BadHeader)?;
        hv.set_sensitive(true); // hint: keep out of any header logging
        map.insert(hn, hv);
    }
    Ok((method, map))
}

/// Collect response headers into a UTF-8 string map (non-UTF-8 values skipped).
fn collect_headers(resp: &reqwest::Response) -> HashMap<String, String> {
    resp.headers()
        .iter()
        .filter(|(k, _)| !is_sensitive_response_header(k.as_str()))
        .filter_map(|(k, v)| {
            v.to_str()
                .ok()
                .map(|s| (k.as_str().to_string(), s.to_string()))
        })
        .collect()
}

fn is_sensitive_response_header(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    matches!(
        name.as_str(),
        "set-cookie"
            | "authorization"
            | "proxy-authorization"
            | "proxy-authenticate"
            | "www-authenticate"
    ) || name.contains("api-key")
        || name.contains("token")
        || name.contains("secret")
}

/// Build an HTTP client with sane timeouts. `overall` (seconds) bounds the whole
/// request; left `None` for streaming so long token streams aren't cut. A
/// connect timeout applies either way. Falls back to the default client on error.
///
/// `pub(crate)` so the sibling multipart `image_edit` command reuses the same
/// client builder for the `/images/edits` call.
pub(crate) fn build_client(overall: Option<u64>) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none());
    if let Some(secs) = overall {
        builder = builder.timeout(std::time::Duration::from_secs(secs));
    }
    builder.build().unwrap_or_else(|_| reqwest::Client::new())
}

/// Generative endpoints can run substantially longer than catalog and health
/// probes. Keep probes bounded at 120s while allowing one non-retried model
/// request to use the same ten-minute lease as the desktop runtime.
pub(crate) fn buffered_timeout_for_url(url: &str) -> u64 {
    if url.contains("/images/generations")
        || url.contains("/images/edits")
        || url.contains("/chat/completions")
        || url.ends_with("/responses")
        || url.contains("/responses?")
        || url.ends_with("/messages")
        || url.contains("/messages?")
        || url.contains(":generateContent")
    {
        GENERATION_BUFFERED_TIMEOUT_SECS
    } else {
        DEFAULT_BUFFERED_TIMEOUT_SECS
    }
}

/// Preserve reqwest's useful source chain (timeout, dns, tcp, tls, body decode)
/// without ever including headers or secrets. The top-level Display is often
/// just "error sending request for url (...)", which is not actionable enough.
pub(crate) fn request_error_message(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    if error.is_timeout() && !parts.iter().any(|part| part.contains("timed out")) {
        parts.push("operation timed out".to_string());
    }

    let mut source = StdError::source(error);
    while let Some(cause) = source {
        let text = cause.to_string();
        if !text.is_empty() && !parts.iter().any(|part| part == &text) {
            parts.push(text);
        }
        source = cause.source();
    }

    parts.join(": ")
}

/// Buffered request: read key, inject auth, send, return status/headers/body.
#[tauri::command]
pub async fn ai_proxy_request(
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<ProxyResponse, ProxyError> {
    let secret = if requires_secret(&kind) {
        read_secret(&provider_id).map_err(ProxyError::from)?
    } else {
        String::new()
    };
    request_with_secret(&kind, wire_protocol, &url, &method, headers, body, &secret).await
}

/// Internal one-shot request for pre-persistence provider checks. The caller owns
/// secret resolution; the value never crosses back through IPC or enters Keychain.
pub(crate) async fn request_with_secret(
    kind: &str,
    wire_protocol: Option<ProviderWireProtocol>,
    url: &str,
    method: &str,
    headers: HashMap<String, String>,
    body: Option<String>,
    secret: &str,
) -> Result<ProxyResponse, ProxyError> {
    enforce_host(kind, url)?;
    enforce_resolved_host(kind, url).await?;
    let provider_kind = parse_provider_kind(kind)?;
    let (method, header_map) =
        build_method_and_headers(provider_kind, wire_protocol, method, headers, secret)?;

    // Bound the whole call. Image endpoints use a longer cap; text/model probes
    // keep the shorter default so a bad relay does not hang the app.
    let client = build_client(Some(buffered_timeout_for_url(&url)));
    let mut req = client.request(method, url).headers(header_map);
    if let Some(body) = body {
        req = req.body(body);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| ProxyError::Request(request_error_message(&e)))?;
    let status = resp.status().as_u16();
    let resp_headers = collect_headers(&resp);
    let body = resp
        .text()
        .await
        .map_err(|e| ProxyError::Request(request_error_message(&e)))?;

    Ok(ProxyResponse {
        status,
        headers: resp_headers,
        body,
    })
}

/// Streamed request: read key, inject auth, send, then stream the response body
/// as frames on `on_chunk` (see the module-level streaming contract).
#[tauri::command]
pub async fn ai_proxy_stream(
    provider_id: String,
    kind: String,
    wire_protocol: Option<ProviderWireProtocol>,
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    on_chunk: Channel<InvokeResponseBody>,
) -> Result<(), ProxyError> {
    // --- Pre-flight: failures here reject the command (no head frame yet). ---
    enforce_host(&kind, &url)?;
    enforce_resolved_host(&kind, &url).await?;
    let secret = if requires_secret(&kind) {
        read_secret(&provider_id).map_err(ProxyError::from)?
    } else {
        String::new()
    };
    let provider_kind = parse_provider_kind(&kind)?;
    let (method, header_map) =
        build_method_and_headers(provider_kind, wire_protocol, &method, headers, &secret)?;

    // Streaming: only a connect timeout (no overall cap — a long token stream is
    // expected to outlive any fixed request timeout).
    let client = build_client(None);
    let mut req = client.request(method, &url).headers(header_map);
    if let Some(body) = body {
        req = req.body(body);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| ProxyError::Request(request_error_message(&e)))?;

    // --- Head frame: status + headers, sent before any body bytes. ---
    let status = resp.status().as_u16();
    let resp_headers = collect_headers(&resp);
    let head = json!({ "type": "head", "status": status, "headers": resp_headers });
    on_chunk
        .send(InvokeResponseBody::Json(head.to_string()))
        .map_err(|_| ProxyError::Channel)?;

    // --- Body: stream raw chunks; post-head errors are delivered in-band. ---
    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        match item {
            Ok(bytes) => {
                if bytes.is_empty() {
                    continue;
                }
                if on_chunk
                    .send(InvokeResponseBody::Raw(bytes.to_vec()))
                    .is_err()
                {
                    // Consumer went away; stop quietly.
                    return Ok(());
                }
            }
            Err(e) => {
                let frame = json!({ "type": "error", "message": request_error_message(&e) });
                let _ = on_chunk.send(InvokeResponseBody::Json(frame.to_string()));
                return Ok(());
            }
        }
    }

    // --- End frame: terminal success marker. ---
    let end = json!({ "type": "end" });
    let _ = on_chunk.send(InvokeResponseBody::Json(end.to_string()));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_allowlist_accepts_vendor_domains() {
        assert!(enforce_host("anthropic", "https://api.anthropic.com/v1/messages").is_ok());
        assert!(enforce_host("openai", "https://api.openai.com/v1/chat/completions").is_ok());
        assert!(enforce_host("google", "https://generativelanguage.googleapis.com/v1beta").is_ok());
        assert!(enforce_host("gateway", "https://ai-gateway.vercel.sh/v1/chat").is_ok());
    }

    #[test]
    fn host_allowlist_rejects_wrong_and_insecure_hosts() {
        // Wrong vendor host.
        assert!(matches!(
            enforce_host("anthropic", "https://evil.example.com/v1"),
            Err(ProxyError::DisallowedHost)
        ));
        // Right host but http (not https).
        assert!(matches!(
            enforce_host("openai", "http://api.openai.com/v1"),
            Err(ProxyError::DisallowedHost)
        ));
        // Suffix-spoofing (anthropic.com.evil.com) must not pass.
        assert!(matches!(
            enforce_host("anthropic", "https://api.anthropic.com.evil.com/v1"),
            Err(ProxyError::DisallowedHost)
        ));
    }

    #[test]
    fn host_allowlist_rejects_url_userinfo() {
        assert!(matches!(
            enforce_host("openai-compatible", "https://secret@relay.example/v1"),
            Err(ProxyError::BadUrl)
        ));
        assert!(matches!(
            enforce_host("openai", "https://user:secret@api.openai.com/v1"),
            Err(ProxyError::BadUrl)
        ));
    }

    #[test]
    fn openai_compatible_allows_custom_host_but_blocks_loopback() {
        assert!(enforce_host("openai-compatible", "https://my-llm.internal.example/v1").is_ok());
        assert!(matches!(
            enforce_host("openai-compatible", "https://127.0.0.1/v1"),
            Err(ProxyError::DisallowedHost)
        ));
        assert!(matches!(
            enforce_host("openai-compatible", "https://localhost/v1"),
            Err(ProxyError::DisallowedHost)
        ));
        for host in [
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "[::1]",
            "[fc00::1]",
            "[fe80::1]",
        ] {
            assert!(matches!(
                enforce_host("openai-compatible", &format!("https://{host}/v1")),
                Err(ProxyError::DisallowedHost)
            ));
        }
    }

    #[test]
    fn sensitive_response_headers_are_redacted() {
        for name in [
            "set-cookie",
            "authorization",
            "x-api-key",
            "x-refresh-token",
            "x-client-secret",
        ] {
            assert!(is_sensitive_response_header(name));
        }
        assert!(!is_sensitive_response_header("content-type"));
    }

    #[tokio::test]
    async fn resolved_host_guard_rejects_private_destinations() {
        assert!(matches!(
            enforce_resolved_host("openai-compatible", "https://192.168.1.10/v1").await,
            Err(ProxyError::DisallowedHost)
        ));
        assert!(
            enforce_resolved_host("openai-compatible", "https://8.8.8.8/v1")
                .await
                .is_ok()
        );
        assert!(enforce_resolved_host("ollama", "http://127.0.0.1:11434/v1")
            .await
            .is_ok());
    }

    #[test]
    fn local_profiles_allow_only_loopback_http_or_https() {
        for kind in ["ollama", "vllm", "lm-studio"] {
            assert!(enforce_host(kind, "http://127.0.0.1:11434/v1/models").is_ok());
            assert!(enforce_host(kind, "http://localhost:11434/v1/models").is_ok());
            assert!(matches!(
                enforce_host(kind, "https://remote.example/v1"),
                Err(ProxyError::DisallowedHost)
            ));
        }
    }

    #[test]
    fn unknown_kind_rejected_and_bad_url_rejected() {
        assert!(matches!(
            enforce_host("unknown-provider", "https://example.com/v1"),
            Err(ProxyError::UnknownKind)
        ));
        assert!(matches!(
            enforce_host("anthropic", "not a url"),
            Err(ProxyError::BadUrl)
        ));
    }

    #[test]
    fn build_headers_strips_inbound_auth_and_injects_real() {
        let mut inbound = HashMap::new();
        inbound.insert("x-api-key".to_string(), "__managed__".to_string()); // dummy from AI SDK
        inbound.insert("anthropic-version".to_string(), "1999-01-01".to_string()); // stale
        inbound.insert("content-type".to_string(), "application/json".to_string());
        inbound.insert("host".to_string(), "spoof".to_string());

        let (method, map) = build_method_and_headers(
            ProviderKind::Anthropic,
            None,
            "POST",
            inbound,
            "real-secret",
        )
        .unwrap();

        assert_eq!(method, Method::POST);
        // Injected real key overrides the dummy.
        assert_eq!(map.get("x-api-key").unwrap(), "real-secret");
        // Injected version overrides the stale inbound one (single value).
        assert_eq!(map.get("anthropic-version").unwrap(), "2023-06-01");
        // Passthrough header preserved.
        assert_eq!(map.get("content-type").unwrap(), "application/json");
        // Managed header dropped.
        assert!(map.get("host").is_none());
    }

    #[test]
    fn build_headers_defaults_method_to_post() {
        let (method, _) =
            build_method_and_headers(ProviderKind::Openai, None, "", HashMap::new(), "k").unwrap();
        assert_eq!(method, Method::POST);
    }

    #[test]
    fn build_headers_reject_unsupported_protocol() {
        let err = build_method_and_headers(
            ProviderKind::Deepseek,
            Some(ProviderWireProtocol::AnthropicMessages),
            "POST",
            HashMap::new(),
            "k",
        )
        .unwrap_err();
        assert!(matches!(err, ProxyError::UnsupportedWireProtocol(_)));
    }

    #[test]
    fn generation_endpoints_get_longer_buffered_timeout() {
        assert_eq!(
            buffered_timeout_for_url("https://api.example.com/v1/images/generations"),
            GENERATION_BUFFERED_TIMEOUT_SECS
        );
        assert_eq!(
            buffered_timeout_for_url("https://api.example.com/v1/images/edits"),
            GENERATION_BUFFERED_TIMEOUT_SECS
        );
        assert_eq!(
            buffered_timeout_for_url("https://api.example.com/v1/chat/completions"),
            GENERATION_BUFFERED_TIMEOUT_SECS
        );
        assert_eq!(
            buffered_timeout_for_url("https://api.example.com/v1/responses"),
            GENERATION_BUFFERED_TIMEOUT_SECS
        );
        assert_eq!(
            buffered_timeout_for_url("https://api.example.com/v1/messages"),
            GENERATION_BUFFERED_TIMEOUT_SECS
        );
        assert_eq!(
            buffered_timeout_for_url(
                "https://api.example.com/v1beta/models/gemini:generateContent"
            ),
            GENERATION_BUFFERED_TIMEOUT_SECS
        );
        assert_eq!(
            buffered_timeout_for_url("https://api.example.com/v1/models"),
            DEFAULT_BUFFERED_TIMEOUT_SECS
        );
    }

    #[test]
    fn proxy_error_serializes_to_string() {
        assert_eq!(
            serde_json::to_string(&ProxyError::NoKey).unwrap(),
            "\"no key configured for provider\""
        );
        assert_eq!(
            serde_json::to_string(&ProxyError::DisallowedHost).unwrap(),
            "\"host not allowed for this provider kind\""
        );
    }
}
