# Changelog

This file contains a list of all the changes made to this project.

## v3.4.5

- Fixed security issue with a vulnerability in vite
- Updated Dev dependecies
- Add changelog.md file to track changes

Miscellaneous : kept 0 prod dependencies Goal. 🎉

## v3.4.4

- Be able to listen for a host by providing one or multiple hosts

```typescript
// Before this PR
const ref = "Mydevice1";
const mdns = new Core([ref,"Device2"]);// with an empty array an error is triggered
mdns.listen();
```

```typescript
// After This PR you can listen for one or multiple hosts separated with "\n"
const mdns = new Core();
mdns.listen("Mydevice1\nDevice2");
// Without any param it will show an error !! 
mdns.listen();
// output : [MDNS ADVANCED] INFO: ❌ Error: Error in MDNS listener! Report: https://www.npmjs.com/package/mdns-listener-advanced
```

- Add unit tests for all files in the project

| File            | % Stmts   | % Branch   | % Funcs   | % Lines   | Uncovered Line #s                                     |
|-----------------|-----------|------------|-----------|-----------|-------------------------------------------------------|
| All files       | 91.18     | 81.89      | 95.83     | 93.87     |                                                       |
| src             | 86.84     | 80         | 93.93     | 90.34     |                                                       |
| Core.ts         | 86.18     | 79.51      | 93.75     | 89.88     | 105-107,262,272-273,344,385-387,450,471-475,515,530   |
| const.ts        | 100       | 100        | 100       | 100       |                                                       |
| types.ts        | 100       | 100        | 100       | 100       |                                                       |
| src/protocol    | 99.03     | 91.3       | 100       | 100       |                                                       |
| DNSBuffer.ts    | 99.03     | 91.3       | 100       | 100       | 24,29                                                 |
| src/utils       | 91.42     | 75         | 100       | 94.11     |                                                       |
| Logger.ts       | 100       | 100        | 100       | 100       |                                                       |
| parsers.ts      | 82.35     | 50         | 100       | 87.5      | 23-24                                                 |

- Fix for mDNS discovery does not work as documented #43

## v3.4.3

- Clean up workflows
- Better workflow on tag release basically I'm reversing the current release-main.yml
- Create Tag from remote or from GitHub UI
- Triggers Release & Build workflow
- publish to Npm and GitHub packages.
- A running example you can now do a yarn start it will run an example inside example.ts file using npx and tsx
- Possibility to import using import {Core} from "mdns-listener-advanced"; and also import Core from "mdns-listener-advanced";
- update Dev dependencies and remove deprecated packages
- We always have 0 Prod dependencies 🎉

## v3.4.2

- Removing rimraf dependency because it includes glob which is a nightmare of CVE security issues
- Add interval for publish to be able to detect the published devices if the listener starts after publish
- Add and fix eslint issues.

## v3.4.0 and v3.4.1

This Release is a refining of the complete rewrite of the core architecture in 3.4.0. The library has moved from being a wrapper around external libraries to a Zero-Dependency, Native Node.js implementation using typescript.

### Overview

We have replaced bonjour-service and multicast-dns with a custom, lightweight DNS packet parser/encoder using native dgram sockets. This significantly reduces the bundle size, improves security, and gives us low-level control over the mDNS protocol.

lets celebrate our 70th tag/ 56th release with all these exciting changes 🎉

### ✨ Key Features

1. Active Service Discovery (Scanning)

   - New Method: Added core.scan(serviceType).
   - Functionality: Unlike the passive listener, this allows the library to actively query the network.
   - Use Cases: Find all Google Casts (_googlecast._tcp.local), Printers (_ipp._tcp.local), or AirPlay devices (_airplay._tcp.local).

2. Expanded Protocol Support
    - SRV Records: Now parses Service records to extract Ports, Priority, and Weights.
    - PTR Records: Now follows Pointers to discover service instances.
    - A Records: improved IPv4 address extraction.

3. New Event: EmittedEvent.DISCOVERY

- A new event type tailored for scanning results.
- Returns a normalized Device object containing type (PTR/SRV/A) and parsed data.

### Other

- Stability & Logic Improvements
- Documentation update Readme refactoring Done

### ⚠️ Breaking Changes

- Internal: The mdnsInstance and publisher properties no longer exist on the Core class (as we removed the libraries they relied on).
- Output: The RAW_RESPONSE event now returns the structure from our custom parser, which may differ slightly from the old library's format.

## Before v3.4.0

Old library with bonjour and mdns dependencies if you want to use it check the old mdns-listener-advanced library [changes here](https://github.com/aminekun90/mdns_listener_advanced/releases)
