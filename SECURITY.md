# Security Policy

## Supported Versions

Only the latest major release receives security fixes. Upgrade promptly — older versions are not patched.

| Version | Supported |
|-|-|
| 4.x (latest) | Yes |
| 3.x | No — end of life |
| < 3.x | No — end of life |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub Security Advisories](https://github.com/aminekun90/mdns_listener_advanced/security/advisories/new) to report privately. You will receive an acknowledgement within 48 hours and a resolution timeline within 7 days.

Include in your report:

- A clear description of the vulnerability and its impact.
- Steps to reproduce or a minimal proof-of-concept.
- The version(s) affected.
- Any suggested mitigation if you have one.

Coordinated disclosure: fixes are released first, then the advisory is published. CVEs are requested for confirmed vulnerabilities when warranted.

---

## Security Model

### What this library does

`mdns-listener-advanced` opens a single UDP socket on port 5353, joins the mDNS multicast group (`224.0.0.251`), and parses incoming DNS packets. It publishes announcements by broadcasting DNS response packets to the same multicast address.

### What this library does NOT do

- No outbound HTTP/HTTPS calls — ever.
- No file system writes.
- No shell execution or `eval`.
- No inter-process communication beyond the UDP socket.
- No authentication or encryption (this is a property of the mDNS protocol itself, not a library limitation).

---

## mDNS Threat Model

mDNS is a **LAN-only, unauthenticated protocol** (RFC 6762). Any device on the same subnet can:

| Threat | Description | Mitigations |
|-|-|-|
| **Spoofing** | A malicious device responds to queries with fake records (wrong IP, forged TXT data). | Never use mDNS data to make authentication or authorization decisions. Treat all received data as untrusted input. |
| **Flooding / DoS** | An attacker floods port 5353 with malformed or high-volume packets. | The library catches and logs parse errors without crashing. Apply OS-level rate-limiting or firewall rules if operating in an adversarial environment. |
| **Information disclosure** | Scanning reveals device names, IP addresses, service types, and TXT metadata of all devices on the subnet. | Only publish data you are comfortable exposing to every device on the LAN. Do not include passwords, tokens, or sensitive identifiers in TXT records. |
| **Replay** | Old mDNS packets replayed to simulate a device being present. | TTL-based expiry (default 120 s) limits the window. Goodbye packets (TTL = 0) are sent on `stop()` / `unpublish()`. |
| **Subnet boundary** | mDNS packets have IP TTL = 1, so they cannot cross routers. | This is enforced by the protocol. The library does not bypass it. |

**mDNS is appropriate for trusted local networks (home, office, IoT lab).** Do not rely on it as a security boundary.

---

## Supply Chain Security

### Zero runtime dependencies

`mdns-listener-advanced` has **no runtime dependencies**. The published package contains only compiled JavaScript and TypeScript declarations generated from this repository. There are no transitive packages that could introduce a compromised dependency at install time.

Verify this yourself:

```bash
# Should show no dependencies field, or an empty object
npm show mdns-listener-advanced dependencies
```

### Verify the published package

Compare what is on npm against your local source at any time:

```bash
npm diff --diff=mdns-listener-advanced@latest
```

Look for unexpected additions to `preinstall`, `postinstall`, or `install` scripts in `package.json`, or changes in the compiled `.js` / `.cjs` files that do not correspond to commits in the repository.

### Dependency audit (dev dependencies only)

Dev dependencies are used only for building and testing — they are never shipped to consumers. Audit them regularly:

```bash
yarn audit
# or
npm audit
```

For supply chain attack detection beyond CVE databases (typosquatting, malicious post-install scripts, unexpected network access):

```bash
npx @socketsecurity/cli scan create
```

The [Socket Security VS Code extension](https://marketplace.visualstudio.com/items?itemName=SocketSecurity.vscode-socket-security) can also flag risky dependency behaviour in real time.

### CI supply chain audit

The repository includes `shai-hulud-audit.sh` — a bash script that runs in CI to detect Copr repository injections and suspicious RPM `POSTIN` scripts on Fedora/RHEL-based runners. It runs automatically on every push via GitHub Actions.

```bash
# Run locally
bash shai-hulud-audit.sh

# Save a report
bash shai-hulud-audit.sh --save-report
```

Exit codes: `0` = clean, `1` = warning (Copr detected), `2` = severe (suspicious scripts found).

---

## Best Practices for Library Users

### 1. Treat all received data as untrusted

TXT record values, device names, and IP addresses come from the network. Never use them directly in:

- SQL queries, shell commands, or file paths.
- Authentication or access control decisions.
- Logging without sanitization if logs are security-sensitive.

```typescript
// BAD — using raw mDNS data in a command
import { exec } from "child_process";
mdns.on(EmittedEvent.RESPONSE, (devices) => {
  exec(`ping ${devices[0].data.ipv4}`); // injection risk
});

// GOOD — validate before use
import { isIP } from "node:net";
mdns.on(EmittedEvent.RESPONSE, (devices) => {
  const ip = String(devices[0].data.ipv4 ?? "").replace(/"/g, "");
  if (isIP(ip)) {
    // safe to use
  }
});
```

### 2. Do not publish sensitive data in TXT records

The `data` object passed to `publish()` is broadcast in plaintext to every device on the subnet. Do not include:

- API keys, tokens, or passwords.
- Internal service names or topology details.
- Personally identifiable information.

### 3. Always call `stop()` when done

Leaving the socket open longer than necessary expands the attack window. Call `mdns.stop()` as soon as the listening or publishing session is complete.

### 4. Restrict port 5353 at the OS level if possible

If your application only needs to publish (not listen), set `disableListener: true`. If you need neither after a one-shot scan, call `stop()` immediately after `discoverOnce()` resolves.

On Linux, you can restrict which processes can bind to port 5353 using `iptables` / `nftables` owner matching if the threat model requires it.

### 5. Do not run on untrusted networks

Do not deploy a service that uses mDNS discovery on a public or shared network (conference Wi-Fi, cloud VMs with shared subnets). Scope it to isolated, trusted LAN segments.

---

## Token & Access Management

If you suspect your npm publish token or machine has been compromised:

1. Go to [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~/tokens) and revoke all existing tokens.
2. Rotate tokens only after the machine is clean and verified.
3. Enable **2FA on publish** in your npm account settings (required for packages with high weekly downloads).
4. Audit recent npm publish activity: `npm access ls-packages` and check the [npm audit log](https://www.npmjs.com/settings/~/audit-log).

---

## Changelog of Security-Relevant Changes

| Version | Change |
|-|-|
| 4.0.0 | RFC-compliant goodbye packets (TTL = 0) sent on `stop()` and `unpublish()`, reducing the replay window. |
| 3.4.0 | Removed all runtime dependencies (`bonjour-service`, `multicast-dns`), eliminating transitive supply chain risk. |
| 3.3.6 | Patched vulnerable transitive dependency `node-tar` (path reservation via Unicode ligature collision). |
