# mDNS Listener Advanced

[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/aminekun90/mdns_listener_advanced/graphs/commit-activity) [![version number](https://img.shields.io/npm/v/mdns-listener-advanced?color=green&label=version)](https://github.com/aminekun90/mdns_listener_advanced/releases) [![Actions Status](https://github.com/aminekun90/mdns_listener_advanced/workflows/Test/badge.svg)](https://github.com/aminekun90/mdns_listener_advanced/actions) [![License](https://img.shields.io/github/license/aminekun90/mdns_listener_advanced)](https://github.com/aminekun90/mdns_listener_advanced/blob/master/LICENSE) ![node-current](https://img.shields.io/node/v/mdns-listener-advanced) [![Socket Badge](https://socket.dev/api/badge/npm/package/mdns-listener-advanced)](https://socket.dev/npm/package/mdns-listener-advanced) [![NPM](https://img.shields.io/badge/NPM-%23CB3837.svg?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/mdns-listener-advanced)

> **v4.0.0 — Major Feature Release**
> Multiple service publishing, RFC-compliant goodbye packets, in-memory device registry with TTL expiry, promise-based `discoverOnce()`, typed `on()`/`once()`/`off()` event proxies, IPv6 (AAAA) record parsing, configurable TTL, and network interface selection — all still zero-dependency.

**mDNS Listener Advanced** is a robust, cross-platform Node.js library for Multicast DNS (mDNS/Bonjour/Zeroconf). It lets you:

1. **Listen** for specific `.local` hostnames on the network.
2. **Publish** your own device or service (with heartbeat and proper goodbye packets).
3. **Discover** all services on the network — one-shot or continuous.
4. **Track** devices with automatic TTL-based expiry and join/leave events.

Pure Node.js — no native bindings, no heavy dependencies. Uses only `dgram`, `crypto`, `os`, and `fs`.

---

## Requirements

- **Node.js:** v22 or later.
- **OS:** Windows 11, Ubuntu 20.04+, macOS (Sonoma / Sequoia / Tahoe). All fully tested.
- **Network:** The host machine must have access to the local network (UDP port 5353).
- Not tested inside Docker containers (see [Troubleshooting](#troubleshooting)).

## Installation

```bash
npm install mdns-listener-advanced
# or
yarn add mdns-listener-advanced
```

---

## Features

| | |
|-|-|
| 📦 **Zero Dependencies** | Only Node.js built-ins — lightweight and secure. |
| 🔍 **Targeted Listening** | Watch specific devices by name (e.g. `MyDevice.local`). |
| 📡 **Service Discovery** | Scan for any mDNS service: Chromecast, printers, HomeKit, etc. |
| ⚡ **Promise Discovery** | `discoverOnce()` — async one-shot scan, no EventEmitter boilerplate. |
| 📢 **Multi-Service Publisher** | Announce multiple services simultaneously with independent heartbeats. |
| 👋 **Goodbye Packets** | RFC 6762 compliant — peers evict your service immediately on `stop()` / `unpublish()`. |
| 🗂️ **Device Registry** | Live in-memory registry with TTL-based expiry and `DEVICE_FOUND` / `DEVICE_LOST` events. |
| 🌐 **IPv6 (AAAA)** | Parses and emits AAAA records alongside A records. |
| 🎛️ **Typed Event Proxy** | Strongly-typed `on()` / `once()` / `off()` methods directly on `Core`. |
| 🔧 **Configurable** | Custom TTL, network interface selection, custom logger. |
| 🛡️ **TypeScript** | Full type definitions — CJS + ESM dual output. |

---

## Quick Start

```typescript
import Core, { EmittedEvent } from "mdns-listener-advanced";

const mdns = new Core(["MyDevice"]);

// Typed proxy — no need to keep the emitter reference
mdns.on(EmittedEvent.RESPONSE, (devices) => {
  console.log("Found:", devices);
});

mdns.listen();
```

---

## Usage Examples

### 1. Targeted Listening

Watch for specific hostnames. When a matching mDNS TXT record arrives, `RESPONSE` fires.

```typescript
import Core, { EmittedEvent, Device } from "mdns-listener-advanced";

const mdns = new Core(["LivingRoomTV", "OfficePrinter"], null, { debug: false });

mdns
  .on(EmittedEvent.RESPONSE, (devices: Device[]) => {
    console.log("Found targeted device:", devices);
  })
  .on(EmittedEvent.ERROR, (err) => {
    console.error("Error:", err);
  });

mdns.listen();
```

> **Tip:** You can also pass hostnames via a file — see [Configuration Files](#configuration-files).

---

### 2. Service Discovery — Continuous

Subscribe to `DISCOVERY` then call `scan()` to receive all PTR / SRV / A / AAAA records on the network.

```typescript
import Core, { EmittedEvent, DiscoveredService } from "mdns-listener-advanced";

const mdns = new Core();

mdns.on(EmittedEvent.DISCOVERY, (service: DiscoveredService) => {
  console.log(`[${service.type}] ${service.name} — TTL: ${service.ttl}s`, service.data);
});

mdns.listen();

// Scan for a specific service type
mdns.scan("_googlecast._tcp.local");

// Or discover everything
// mdns.scan("_services._dns-sd._udp.local");
```

---

### 3. Service Discovery — One-Shot (Promise)

`discoverOnce()` collects all responses within a timeout window and resolves with the list.
No need to manage listeners manually.

```typescript
import Core, { DiscoveredService } from "mdns-listener-advanced";

const mdns = new Core();
mdns.listen();

const services: DiscoveredService[] = await mdns.discoverOnce("_airplay._tcp.local", 3000);

console.log(`Found ${services.length} AirPlay devices:`);
services.forEach((s) => console.log(" -", s.name, s.data));

mdns.stop();
```

---

### 4. Publishing a Service

Announce your device to the network. The library sends an immediate packet and then repeats
at the given interval (heartbeat). Custom key/value pairs are encoded in the TXT record.

```typescript
import Core, { EmittedEvent, Device } from "mdns-listener-advanced";

const mdns = new Core(["MyCoolService"]);

// Publish with a 30-second heartbeat
mdns.publish("MyCoolService", { version: "1.0", env: "prod" }, 30_000);

mdns.on(EmittedEvent.RESPONSE, (devices: Device[]) => {
  console.log("Received response from:", devices);
});

mdns.listen();

// Later — stop publishing just this service (sends a goodbye packet)
// mdns.unpublish("MyCoolService");

// Or stop everything (also sends goodbye packets for all services)
// mdns.stop();
```

**Example response payload:**

```json
[
  {
    "name": "MyCoolService.local",
    "type": "TXT",
    "data": {
      "uuid": "\"550e8400-e29b-41d4-a716-446655440000\"",
      "ipv4": "\"192.168.1.102\"",
      "version": "1.0",
      "env": "prod"
    }
  }
]
```

---

### 5. Multiple Service Publishing

Each service has its own independent heartbeat timer. `unpublish()` stops one without affecting others.

```typescript
import Core from "mdns-listener-advanced";

const mdns = new Core();

mdns.publish("my-api",   { port: "3000" }, 30_000);
mdns.publish("my-admin", { port: "8080" }, 60_000);

// Later — remove one service (sends RFC-compliant goodbye packet)
mdns.unpublish("my-api");

// Stop everything cleanly
// mdns.stop();
```

---

### 6. Device Registry — Join / Leave Events

The library maintains an in-memory registry of targeted devices. It emits `DEVICE_FOUND` the
first time a device is seen and `DEVICE_LOST` when its TTL expires or a goodbye packet arrives.

```typescript
import Core, { EmittedEvent, Device } from "mdns-listener-advanced";

const mdns = new Core(["SmartTV", "RaspberryPi"]);

mdns
  .on(EmittedEvent.DEVICE_FOUND, (device: Device) => {
    console.log("Device joined:", device.name);
  })
  .on(EmittedEvent.DEVICE_LOST, (name: string) => {
    console.log("Device left:", name);
  });

mdns.listen();

// Snapshot all currently live devices at any time
const live = mdns.getDiscoveredDevices();
console.log("Currently online:", live.map((d) => d.name));
```

---

### 7. IPv6 (AAAA) Records

AAAA records are parsed and emitted as `DISCOVERY` events with `type: "AAAA"` and the address
in standard colon-separated hex notation.

```typescript
import Core, { EmittedEvent, DiscoveredService } from "mdns-listener-advanced";

const mdns = new Core();

mdns.on(EmittedEvent.DISCOVERY, (service: DiscoveredService) => {
  if (service.type === "AAAA") {
    console.log("IPv6 device:", service.name, "→", service.data);
    // e.g. "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
  }
});

mdns.listen();
mdns.scan();
```

---

### 8. Advanced Options

```typescript
import Core from "mdns-listener-advanced";

const mdns = new Core(
  ["MyDevice"],
  null,
  {
    debug: true,          // Enable verbose logging
    ttl: 300,             // Announce with a 5-minute TTL instead of the default 120s
    interface: "eth0",    // Pin publishing to a specific network interface
    noColor: true,        // Disable ANSI colours in the built-in logger
    disablePublisher: true, // Listen-only mode
  },
);
```

---

## API

### Constructor

```typescript
new Core(hostsList?, mdnsHostsPath?, options?, logger?)
```

| Parameter | Type | Description |
|-|-|-|
| `hostsList` | `string[] \| null` | Hostnames to watch for (e.g. `['MyDevice', 'Printer']`). |
| `mdnsHostsPath` | `string \| null` | Absolute path to a newline-separated hosts file. |
| `options` | `Options` | Configuration object (see below). |
| `logger` | `Logger` | Custom logger — must implement `.info`, `.debug`, `.warn`, `.error`. |

### Options

| Option | Type | Default | Description |
|-|-|-|-|
| `debug` | `boolean` | `false` | Enable verbose debug logging. |
| `ttl` | `number` | `120` | TTL in seconds for published A and TXT records. |
| `interface` | `string` | auto | Network interface name to use for publishing (e.g. `'eth0'`, `'en0'`). Falls back to the first non-internal IPv4. |
| `disableListener` | `boolean` | `false` | Skip binding the UDP socket — publisher-only mode. |
| `disablePublisher` | `boolean` | `false` | Disable `publish()` calls — listener-only mode. |
| `noColor` | `boolean` | `false` | Strip ANSI colour codes from the built-in logger output. |

### Methods

| Method | Returns | Description |
|-|-|-|
| `listen(ref?)` | `EventEmitter` | Binds the UDP socket and joins the mDNS multicast group. `ref` is an optional newline-separated string of hostnames that overrides the constructor list. Returns the internal emitter for backward-compatible `.on()` chaining. |
| `publish(name, data?, interval?)` | `void` | Announces a service on the network. `interval` is the heartbeat in ms (default `30000`). Pass `0` for a one-shot send. Supports multiple simultaneous services. |
| `unpublish(name)` | `void` | Stops the heartbeat for the named service and sends an RFC-compliant goodbye packet (TTL = 0). |
| `scan(serviceType?)` | `void` | Sends a PTR query to the multicast group. Default: `_services._dns-sd._udp.local` (all services). |
| `discoverOnce(serviceType?, timeout?)` | `Promise<DiscoveredService[]>` | One-shot discovery. Sends a query, collects responses for `timeout` ms (default `3000`), then resolves with the list. |
| `stop()` | `void` | Sends goodbye packets for all published services, clears all timers, closes the socket, and removes all listeners. |
| `on(event, listener)` | `this` | Registers a typed event listener. Returns `this` for chaining. |
| `once(event, listener)` | `this` | Registers a one-time typed event listener. Returns `this` for chaining. |
| `off(event, listener)` | `this` | Removes a typed event listener. Returns `this` for chaining. |
| `getDiscoveredDevices()` | `Device[]` | Returns a snapshot of all targeted devices currently in the live registry. |
| `setDisableListener(value)` | `void` | Toggles the listener at runtime. |
| `setDisablePublisher(value)` | `void` | Toggles the publisher at runtime. |
| `info(...args)` | `void` | Logs via the configured logger — useful for external scripts sharing the same log format. |

### Events

| Event | Enum constant | Payload | Description |
|-|-|-|-|
| `response` | `EmittedEvent.RESPONSE` | `Device[]` | A targeted hostname (from your watch list) was found. |
| `discovery` | `EmittedEvent.DISCOVERY` | `DiscoveredService` | Any PTR / SRV / A / AAAA / TXT record observed during a scan. Includes `ttl`. |
| `deviceFound` | `EmittedEvent.DEVICE_FOUND` | `Device` | A targeted device appeared in the registry for the first time. |
| `deviceLost` | `EmittedEvent.DEVICE_LOST` | `string` (name) | A targeted device's TTL expired, or a goodbye packet was received. |
| `rawResponse` | `EmittedEvent.RAW_RESPONSE` | `{ answers: DeviceBuffer[] }` | The full raw parsed packet — useful for debugging or custom record handling. |
| `error` | `EmittedEvent.ERROR` | `Error` | Socket error or initialization failure. |

### Types

```typescript
// Returned by RESPONSE / DEVICE_FOUND events and getDiscoveredDevices()
type Device = {
  name: string;
  type: string;           // "TXT"
  data: Record<string, string> | DeviceData;
};

// Returned by DISCOVERY events and discoverOnce()
type DiscoveredService = {
  name: string;
  type: "PTR" | "SRV" | "A" | "AAAA" | "TXT";
  data: string | SrvData | Record<string, string>;
  ttl: number;
};

type SrvData = {
  priority: number;
  weight: number;
  port: number;
  target: string;
};
```

---

## Configuration Files

Instead of passing `hostsList` to the constructor, you can use a plain-text file.

**Default locations:**
- Linux / macOS: `~/.mdns-hosts`
- Windows: `C:\Users\<username>\.mdns-hosts`

```plaintext
LivingRoomTV
OfficePrinter
# This is a comment — ignored
RaspberryPi
```

Priority order when resolving hostnames:

1. Explicit file path passed to the constructor (`mdnsHostsPath`).
2. Array passed to the constructor (`hostsList`).
3. Default OS file location (`~/.mdns-hosts`).

If none are found, the listener logs a warning but still works — useful for publish-only or scan-only scenarios.

---

## Troubleshooting

**Firewall**
mDNS uses UDP port 5353. Ensure your firewall allows inbound and outbound traffic on this port.

**Windows**
On first run Node.js may prompt you to allow network access through Windows Defender Firewall — approve it.

**Docker**
Multicast packets don't cross the Docker network bridge by default. Use `network_mode: "host"` in your `docker-compose.yml`. Note: this does not work on macOS because Docker Desktop on Mac uses a Linux VM that can't join the host's multicast group.

**Multiple NICs**
If your machine has multiple network interfaces (e.g. `eth0` + Wi-Fi), use the `interface` option to pin publishing to the correct one. The listener receives on all interfaces via the multicast socket.

**Process stays alive**
The UDP socket is an active handle. Call `mdns.stop()` when you are done, or make sure the process exits naturally. The heartbeat timer is created with `.unref()` so it won't keep the process alive on its own — but the socket will.

---

## Support & Contribution

Issues: [Open an issue](https://github.com/aminekun90/mdns_listener_advanced/issues)
Contact: [LinkedIn](https://www.linkedin.com/in/amine-bouzahar/)

### If you appreciate mdns-listener-advanced, consider supporting the project. :coffee:

I have been writing and maintaining this library since 2017. If it saved you time, consider donating!

[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/aminebouzahar)

---

Original credit: Based on concepts from @Richie765, now fully rewritten for modern Node.js and TypeScript.
