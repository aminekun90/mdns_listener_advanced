// import Core, { EmittedEvent } from "mdns-listener-advanced";
// // import Core, { EmittedEvent } from "./index.ts";
// // use this line instead when running the example outside the repo
// const ref = "MyDevice2";

// // 1. Initialize
// const mdns = new Core([ref], null, {
//   debug: false,
//   disableListener: false,
//   disablePublisher: false,
// });

// // 2. Start Listener
// const event = mdns.listen();

// // --- HANDLERS ---

// event.on(EmittedEvent.RESPONSE, (found_hostnames) => {
//   mdns.info("✅ Found TARGETED Host:", found_hostnames);
// });

// event.on(EmittedEvent.DISCOVERY, (device) => {
//   mdns.info(`🔎 Discovered [${device.type}]: ${device.name}`, device.data);
// });

// event.on(EmittedEvent.ERROR, (error) => {
//   mdns.info("❌ Error:", error.message);
// });

// // --- ACTIONS (Immediate) ---

// // Publish immediately
// mdns.info(`📢 Publishing ${ref}...`);
// mdns.publish(ref);

// // Scan immediately (You can run multiple scans at once)
// mdns.info("🚀 Scanning for ALL Services...");
// mdns.scan("_services._dns-sd._udp.local");

// // --- GRACEFUL SHUTDOWN (Ctrl + C) ---
// process.on("SIGINT", () => {
//   mdns.info("\n🛑 Ctrl+C detected. Stopping mDNS Service...");

//   // This closes the socket and removes listeners
//   mdns.stop();

//   // Optional: Force exit if needed
//   process.exit(0);
// });
