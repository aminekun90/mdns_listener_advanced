# mDNS Listener Advanced

[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/aminekun90/mdns_listener_advanced/graphs/commit-activity) [![version number](https://img.shields.io/npm/v/mdns-listener-advanced?color=green&label=version)](https://github.com/aminekun90/mdns_listener_advanced/releases) [![Actions Status](https://github.com/aminekun90/mdns_listener_advanced/workflows/Test/badge.svg)](https://github.com/aminekun90/mdns_listener_advanced/actions) [![License](https://img.shields.io/github/license/aminekun90/mdns_listener_advanced)](https://github.com/aminekun90/mdns_listener_advanced/blob/master/LICENSE) ![node-current](https://img.shields.io/node/v/mdns-listener-advanced)[![Socket Badge](https://socket.dev/api/badge/npm/package/mdns-listener-advanced)](https://socket.dev/npm/package/mdns-listener-advanced) [![NPM](https://img.shields.io/badge/NPM-%23CB3837.svg?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/mdns-listener-advanced)

> **🚀 Major Update v3.4.0+**: This package has been re-architected to be **Zero-Dependency**. It now uses native Node.js modules (`dgram`, `crypto`) for maximum performance, security, and compatibility. No more heavy dependencies like `bonjour-service` or `multicast-dns`.

**mDNS Listener Advanced** is a robust, cross-platform Node.js library for Multicast DNS (mDNS) operations. It allows you to:

1. **Listen** for specific `.local` hostnames.
2. **Publish** your own device/service to the network.
3. **Scan/Discover** all devices and services on the network (Service Discovery).

Compatible with mdns, Avahi, Bonjour, and Zeroconf.

## Requirements

- **Node.js:** v22 or later (Recommended).
- **OS:** Fully tested on Windows 11, Ubuntu 20.04+, and macOS (Sonoma/Sequoia/Tahoe).
- Not tested on Docker containers.

## Installation

```bash
npm install mdns-listener-advanced
# or preferred way
yarn add mdns-listener-advanced
```

## Features

- 📦 Zero Dependencies: Lightweight and secure.
- 🔍 Targeted Listening: Detect specific devices by name (e.g., MyDevice.local).
- 📡 Service Discovery: Scan the network for all services (e.g., Google Cast, Printers).
- 📢 Native Publisher: Announce your presence without external tools.
- 🛡️ TypeScript: Written in TypeScript with full type definitions included.

## Usage Examples

### 1. Basic Listener (JavaScript)

Listen for specific devices defined in your constructor or hosts file.

```javascript
import Core, { EmittedEvent } from "mdns-listener-advanced";

// Look for a device named "MyDevice2"
const mdns = new Core(["MyDevice2"], null, {
  debug: false
});

const event = mdns.listen();

// 1. Handle targeted response
event.on(EmittedEvent.RESPONSE, (found_hostnames) => {
  console.log("✅ Found Target:", found_hostnames);
  // mdns.stop(); // Stop listening if needed
});

// 2. Handle errors
event.on(EmittedEvent.ERROR, (error) => {
  console.error("❌ Error:", error);
});
```

### 2. Service Discovery / Scanning (TypeScript)

New in v3.4.0: actively query the network to find devices (Printers, Chromecast, HomeKit, etc.).

```typescript
import { Core, EmittedEvent, Device } from 'mdns-listener-advanced';
// or import Core,{ EmittedEvent, Device } from 'mdns-listener-advanced';

const mdns = new Core();
const event = mdns.listen();

event.on(EmittedEvent.DISCOVERY, (device: Device) => {
  console.log(`🔎 Discovered [${device.type}]:`, device.name, device.data);
});

// Scan for Google Cast devices
mdns.scan("_googlecast._tcp.local");

// OR Scan for EVERYTHING
// mdns.scan("_services._dns-sd._udp.local");
```

### 3. Publishing a Host

Announce your service to the network.

```javascript
import { Core } from "mdns-listener-advanced";
// or import Core,{ EmittedEvent, Device } from 'mdns-listener-advanced';

const mdns = new Core();

// Publish "MyCoolService.local"
const customData = { hello: "world" };
mdns.publish("MyCoolService",customData, 30000); // 30000 ms = 30 seconds by default

// Your device is now visible to other mDNS scanners!

// // 2. Start Listener
const event = mdns.listen();

// // --- HANDLERS ---

event.on(EmittedEvent.RESPONSE, (found_hostnames: Device[]) => {
  mdns.info("✅ Found TARGETED Host:", found_hostnames);
});
// stop
```

output:

```shell
[MDNS ADVANCED] INFO: ✅ Found TARGETED Host: [
  {
    name: 'MyDevice2',
    type: 'TXT',
    data: {
      uuid: '"eec91263-de12-4525-ba08-81adad17-ceb3"',
      ipv4: '"192.168.1.102"',
      hello: 'world'
    }
  }
]
```

### 4. Run the provided example

Clone the repository and run the following command:

```bash
# optional install (no dependencies required to run the example)
# yarn install
yarn start
```

## API Documentation

Class: `Core`

### Constructor

```typescript
// All args are optional
new Core(hostsList, mdnsHostsPath, options, logger)
```

| Parameter     | Type     | Description                                                                               |
|---------------|----------|-------------------------------------------------------------------------------------------|
| hostsList     | string[] | Optional array of hostnames to listen for (e.g. ['device1']).                             |
| mdnsHostsPath | string   | Optional absolute path to a custom hosts file.                                            |
| options       | Options  | "Config object: { debug: boolean, disableListener: boolean, disablePublisher: boolean }." |
| logger        | any      | "Custom logger instance (must have .info, .debug, .warn, .error)."                        |

### Methods

| Method                       | Description                                                                                                                                                |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| listen(ref)                  | Starts the UDP socket and joins the Multicast group. Returns the EventEmitter, you can provide a string to listen for a specific host check example.ts.    |
| publish(name,data, interval) | "Broadcasts an mDNS response, announcing name.local with your IP address. add data to the TXT record, personalize the interval by default set to 30000ms." |
| scan(serviceType)            | (New) Sends a query to the network. Default serviceType is _services._dns-sd._udp.local.                                                                   |
| stop()                       | Closes the socket and removes all event listeners.                                                                                                         |

### Events (EmittedEvent)

| Event Name         | Enum                      | Payload Type | Description                                                    |
|--------------------|---------------------------|--------------|----------------------------------------------------------------|
| """response"""     | EmittedEvent.RESPONSE     | Device[]     | Fired when a Targeted Host (from your list) is found.          |
| """discovery"""    | EmittedEvent.DISCOVERY    | Device       | "Fired when scan() finds ANY device (PTR, SRV, or A records)." |
| """raw_response""" | EmittedEvent.RAW_RESPONSE | object       | The full raw packet structure (advanced debugging).            |
| """error"""        | EmittedEvent.ERROR        | Error        | Fired on socket errors or configuration issues.                |

---

### Configuration Files

You can optionally use a file to manage the list of devices you want to detect (Targeted Listening).

Location:

- Windows: `C:\Users\<username>\.mdns-hosts`
- Linux/macOS: `~/.mdns-hosts`

```plaintext
LivingRoomTV
OfficePrinter
RaspberryPi
```

If you do not provide a constructor list or this file, the listener will warn you but still function (useful if you only want to use scan() or publish())

---

### Troubleshooting

- Firewall: mDNS uses UDP port 5353. Ensure your firewall allows traffic on this port.
- Docker: If running in Docker, you must use network_mode: "host" so the container can receive Multicast packets from the physical network.
- Windows: You might need to allow Node.js through the Windows Defender Firewall on the first run.
- macOS + Docker limitations : running docker in host mode might not work on macOS, since the container is not able to access the host network.

## Support & Contribution

Issues: [Open an issue here](https://github.com/aminekun90/mdns_listener_advanced/issues)
Contact: [Connect on LinkedIn](https://www.linkedin.com/in/amine-bouzahar/)

### If you appreciate mdns-listener-advanced, consider supporting the project. :coffee:

I dedicate time and effort on writing and maintaining this library since 2017 and I'm grateful for your support.

If this library saved you time, consider Donating!

[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/aminebouzahar)

---

Original Credit: Based on concepts from @Richie765, now fully rewritten for modern Node.js and TypeScript.
