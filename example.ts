import { Core, Device, EmittedEvent } from "@/index.js";
import { EventEmitter } from "node:events";
// check README examples
const ref = "MyDevice2";
// 1. Initialize
const mdns = new Core([], null, {
  debug: false,
  disableListener: false,
  disablePublisher: false,
});
mdns.info(`📢 Publishing ${ref}...`);
mdns.publish(ref, { hello: "world" });
// // 2. Start Listener
const event: EventEmitter = mdns.listen();
mdns.stop();

mdns.listen("MyDevice1\nMyDevice2");
// // --- HANDLERS ---

event.on(EmittedEvent.RESPONSE, (found_hostnames: Device[]) => {
  mdns.info("✅ Found TARGETED Host:", found_hostnames);
});

event.on(EmittedEvent.DISCOVERY, (device: Device) => {
  mdns.info(`🔎 Discovered [${device.type}]: ${device.name}`, device.data);
});

event.on(EmittedEvent.ERROR, (error: Error) => {
  mdns.info("❌ Error:", error.message);
});

// Scan immediately (You can run multiple scans at once)
// mdns.info("🚀 Scanning for ALL Services...");
// mdns.scan("_services._dns-sd._udp.local");

// --- GRACEFUL SHUTDOWN (Ctrl + C) ---
process.on("SIGINT", () => {
  mdns.info("🛑 Stopping mDNS Service...");

  // This closes the socket and removes listeners
  mdns.stop();

  // Optional: Force exit if needed
  process.exit(0);
});
