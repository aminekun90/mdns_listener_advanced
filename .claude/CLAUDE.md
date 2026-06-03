# mdns_listener_advanced — Claude Context

## Project Overview
Zero-dependency TypeScript library for mDNS (Multicast DNS) service discovery and announcement on local networks. Discovers `.local` hostnames, publishes services, and works without any native bindings — pure Node.js `dgram` and `crypto`.

**Published as:** `@aminekun90/mdns-listener-advanced` | **Node:** `>=22.21.1`

## Tech Stack
- **Language:** TypeScript (es2022 target)
- **Build:** `tsup` (esbuild-based, outputs CJS + ESM + types)
- **Testing:** Vitest with v8 coverage
- **Linting:** ESLint + Prettier
- **Git hooks:** Husky (pre-commit lint)
- **No runtime dependencies** — only Node.js built-ins (`dgram`, `crypto`)

## Key Files
| File | Purpose |
|------|---------|
| `src/index.ts` | Main library entry, all exports |
| `tsup.config.ts` | Build config (CJS + ESM dual output) |
| `vitest.config.ts` | Test config (node env, v8 coverage) |
| `example.ts` | Usage example (run with `yarn start`) |
| `dist/` | Built output (CJS + ESM + `.d.ts`) |

## Commands
```bash
yarn test           # Run tests
yarn test:cov       # Tests with coverage
yarn lint           # ESLint check
yarn format         # Prettier format
yarn build          # tsup: CJS + ESM + types
yarn release        # clean → build → test (pre-publish)
yarn pack           # build + npm pack
yarn start          # Run example.ts with tsx
```

## Conventions
- **Zero dependencies** — NEVER add runtime dependencies; use only Node.js built-ins
- **Dual CJS/ESM output** — `tsup.config.ts` builds both; test both in `tests_npm/`
- **Strict TypeScript** — no `any`, full type annotations, generic types where applicable
- **No non-null assertions (`!`)** — use optional chaining (`?.`) or explicit null checks
- **Husky pre-commit** will run lint — don't bypass with `--no-verify`
- **Network tests** require a real mDNS environment — mock network operations for unit tests
- **`dgram` sockets** must be properly closed in test teardown to avoid hanging processes

## Build Output (tsup)
```
dist/
├── index.js       # CJS bundle
├── index.mjs      # ESM bundle
├── index.d.ts     # TypeScript declarations
└── index.d.mts    # ESM type declarations
```

## mDNS Protocol Notes
- Multicast address: `224.0.0.251` (IPv4), port `5353`
- DNS packet format — any changes to packet parsing must handle both big-endian/little-endian byte order
- Service discovery uses PTR, SRV, TXT, A record types
- Announcement requires periodic re-sends (TTL management)

## Testing Network Code
```bash
# Run example to test on real network
yarn start

# Unit tests (mocked network)
yarn test

# Check coverage gaps
yarn test:cov
```
