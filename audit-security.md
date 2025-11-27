# Security Audit: NPM Project (mdns-listener-advanced)

This guide helps you verify whether your NPM package or its dependencies have been compromised, either through a system infection (such as Shai-Hulud) or a direct attack on the NPM supply chain.

## Step 1: Verify the integrity of the published package

If an attacker has infected your machine, they may have modified the published code without affecting your local source code (Git). You must compare what is on NPM with your local code.

Run this command in your project folder:

```sh
# Compare the published version from the registry with your local folder
npm diff --diff=mdns-listener-advanced@latest
```

What you are looking for: Unexpected modifications in `.js` files or `package.json` that you did not commit to Git.

Red Alert: If you see `preinstall` or `postinstall` scripts added in the remote `package.json` that are not in your local one.

## Step 2: Audit dependencies (The supply chain)

Your library uses other packages (multicast-dns, bonjour-service, etc.). If one of them is infected, your library is also infected transitively.

1. Basic audit:

```sh
npm audit
```

Fix all critical vulnerabilities.

2. Advanced audit (Malware/Typosquatting detection):

The `npm audit` tool only detects known vulnerabilities (CVEs). To detect malicious packages (supply chain attacks), use Socket (free for open source).

```sh
npx @socketsecurity/cli scan create
```

or use socket extension for VS Code: <https://marketplace.visualstudio.com/items?itemName=SocketSecurity.vscode-socket-security>

This tool analyzes dependency behavior: does a sub-dependency suddenly try to access the network, read system files, or execute shell scripts?

## Step 3: Verify tokens and access

If you suspect an infection on your machine (Shai-Hulud or something else):

Revoke your NPM tokens:

Go to npmjs.com > Profile > Access Tokens, and delete existing tokens.

Regenerate them only after cleaning/verifying your machine.

Enable 2FA for publishing (if not already enabled).

## Step 4: Verify the local build

Make sure your build tools (if using TypeScript/tsc or Babel) have not been tampered with on your machine.

Delete `node_modules` and `dist` (or your build folder).

Reinstall cleanly: `npm ci` (uses strict package-lock.json).

Rebuild: `npm run build`.

Inspect generated files in `dist/` to check for obfuscated or suspicious code (often a long single-line block at the bottom of a file).

## Summary for mdns-listener-advanced

Based on your NPM link, your package has few direct dependencies (`bonjour-service`, `multicast-dns`, `tslog`, `uuid`).

Low risk: These are established packages.

Verification: Check manually in your `package-lock.json` if the version of `multicast-dns` or `bonjour-service` points to a strange URL or an unknown Git fork.
