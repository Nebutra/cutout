# VPS Claude Proxy 31120 Trace Report

## Scope

Target proxy: `http://123.207.210.89:31120`

Working control: `http://123.207.210.89:31368`

Primary TLS target: `api.anthropic.com:443` (`160.79.104.10` during the
test).

## Result

The failure is not caused by local loopback or the local `127.0.0.1:7897`
proxy. The client reaches the VPS and the listener on port `31120`. That
listener accepts HTTP CONNECT, but the tunnel closes after the TLS ClientHello
and before any TLS ServerHello is returned.

The remaining fault domain is the server-side path owned by the `31120`
listener: its outbound dial, outbound ACL/NAT, chained upstream proxy, or the
port-specific upstream account/node. Client-side tests cannot distinguish
those server-side alternatives without VPS logs or a packet capture.

## Layer Trace

| Layer | 31120 | 31368 control | Evidence |
| --- | --- | --- | --- |
| Local route | Pass | Pass | Destination routes through `en0`, gateway `172.16.0.1` |
| Internet path | Pass | Pass | Traceroute leaves via `172.16.0.1`; TCP reaches both VPS ports |
| TCP listener | Pass | Pass | Connection established to `123.207.210.89` |
| HTTP CONNECT | Pass | Pass | `HTTP/1.1 200 Connection established` |
| ClientHello sent | Pass | Pass | curl records outbound TLS ClientHello |
| ServerHello received | Fail | Pass | `31120`: `SSL_ERROR_SYSCALL`/reset; `31368`: TLS 1.3 succeeds |
| Anthropic HTTP | Not reached | Pass | `31368` receives HTTP 404 from Anthropic |

## Loopback Exclusion

- `route -n get 123.207.210.89` selects `en0` and gateway `172.16.0.1`, not
  `lo0` or a loopback address.
- macOS system proxy configuration is empty.
- The shell does contain proxy variables pointing at `127.0.0.1:7897`, but
  the failing command used an explicit `--proxy
  http://123.207.210.89:31120`.
- The decisive retest removed all upper- and lower-case proxy variables. It
  still connected to remote IP `123.207.210.89` and failed at TLS in 0.68s.
- With those same variables removed, a direct Anthropic connection completed
  TLS and returned HTTP 403.

Therefore local loopback is not in the failing request path.

## Isolation Tests

- Anthropic, OpenAI, GitHub, and Cloudflare HTTPS all fail through `31120`.
  This excludes an Anthropic-only outage.
- Connecting through `31120` to the literal Anthropic IP still fails after
  CONNECT. This excludes proxy-side DNS as the primary cause.
- Forcing TLS 1.2 still fails at the same point. This excludes a TLS 1.3-only
  compatibility issue.
- A CONNECT tunnel through `31120` to port 80 carries an HTTP request and
  returns a Tencent DNSPod web-block redirect. The listener can relay some
  non-TLS traffic; it is not completely dead.
- Through `31368`, the normal hostname path completes TLS and receives an
  Anthropic response. The target and the local TLS stack are healthy.

## Failure Boundary

```text
Mac curl
  -> en0 / 172.16.0.1                         OK
  -> Internet / Tencent VPS                   OK
  -> 123.207.210.89:31120 TCP listener        OK
  -> HTTP CONNECT handler                     OK (returns 200)
  -> TLS ClientHello enters CONNECT tunnel    OK
  -> 31120 outbound/upstream -> target:443    FAILS OR IS RESET
  <- TLS ServerHello                          NOT RECEIVED
```

The CONNECT `200` does not prove that the listener successfully connected to
the requested target. Some proxy implementations acknowledge CONNECT before
the chained upstream connection is fully usable.

## VPS-Side Checks

Run these on `123.207.210.89` while reproducing one request through `31120`:

```bash
sudo ss -lntp | grep -E ':31120|:31368'
sudo lsof -nP -iTCP:31120 -sTCP:LISTEN
sudo lsof -nP -iTCP:31368 -sTCP:LISTEN
```

Identify the service/PID for each port, then compare its configuration and
logs. For a systemd service:

```bash
sudo journalctl -u <proxy-service> --since '-10 minutes' --no-pager
```

Test the VPS host's own outbound path independently:

```bash
curl -sv --max-time 15 https://api.anthropic.com/ -o /dev/null
openssl s_client -connect api.anthropic.com:443 \
  -servername api.anthropic.com -brief
```

Capture whether the `31120` process actually opens an outbound connection and
whether the reset comes from the VPS, a chained upstream, or the target:

```bash
sudo tcpdump -ni any \
  'tcp port 31120 or (host 160.79.104.10 and tcp port 443)'
```

Also compare port-specific outbound mappings, upstream credentials, expiry or
quota state, and ACL/NAT rules:

```bash
sudo nft list ruleset
sudo iptables -S
sudo iptables -t nat -S
```

If the VPS can directly complete TLS but traffic triggered through `31120`
does not create a healthy outbound `:443` flow, the root cause is the `31120`
service configuration or its chained upstream. If the VPS direct TLS test also
fails, the root cause is the VPS egress/network policy rather than Claude or
the local Mac.
