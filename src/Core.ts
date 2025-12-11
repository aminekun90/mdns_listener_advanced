// src/Core.ts
import { randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { MDNS_IP, MDNS_PORT, NPM_URL } from "./const.js";
import { DNSBuffer } from "./protocol/DNSBuffer.js";
import { Device, DeviceBuffer, EmittedEvent, Options } from "./types.js";
import { SimpleLogger } from "./utils/Logger.js";
import { parseTxtRecord } from "./utils/parsers.js";

/**
 * The main mDNS Core class.
 * Handles the UDP socket, packet parsing, publishing, and listening logic.
 * Designed to be zero-dependency and cross-platform.
 */
export class Core {
  private hostnames: string[];
  private mdnsHostsFile?: string;
  private readonly debugEnabled: boolean;
  private publishTimer?: NodeJS.Timeout;
  private disableListener: boolean = false;
  private disablePublisher: boolean;
  private error = false;

  // Track listening state to prevent double-binding
  private isListening = false;

  private readonly socket: dgram.Socket;
  private readonly myEvent: EventEmitter;
  private readonly logger: SimpleLogger;

  /**
   * Creates a new instance of the mDNS Core.
   * @param hostsList - An optional array of specific hostnames to listen for (e.g. ['my-device']).
   * @param mdnsHostsPath - An optional path to a file containing hostnames (newline separated).
   * @param options - Configuration options object (debug, disableListener, disablePublisher, noColor).
   * @param logger - An optional custom logger instance.
   */
  constructor(
    hostsList?: string[] | null,
    mdnsHostsPath?: string | null,
    options?: Options,
    logger?: any,
  ) {
    this.hostnames = hostsList ?? [];
    this.mdnsHostsFile = mdnsHostsPath ?? undefined;
    this.debugEnabled = !!options?.debug;
    this.setDisableListener(!!options?.disableListener);
    this.disablePublisher = !!options?.disablePublisher;

    this.logger =
      logger ??
      new SimpleLogger({
        name: "MDNS ADVANCED",
        noColor: !!options?.noColor,
      });
    this.myEvent = new EventEmitter();

    // Bind to UDP4 with reuseAddr to allow multiple applications to use port 5353
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", (err) => {
      this.logger.error("Socket Error", err);
      this.error = true;
      this.isListening = false; // Reset state on error
    });

    this.socket.on("message", (msg) => this.handleSocketMessage(msg));
  }

  /**
   * Internal helper to log debug messages only if debug mode is enabled.
   * @param args - Arguments to log.
   */
  private debug(...args: unknown[]) {
    if (this.debugEnabled) {
      this.logger.debug(...(args as [unknown, ...unknown[]]));
    }
  }

  /**
   * Dynamically enable or disable the listener functionality.
   * @param value - True to disable, False to enable.
   */
  public setDisableListener(value: boolean): void {
    this.disableListener = value;
  }

  /**
   * Dynamically enable or disable the publisher functionality.
   * @param value - True to disable, False to enable.
   */
  public setDisablePublisher(value: boolean): void {
    this.disablePublisher = value;
  }

  /**
   * Prepares the list of hostnames to listen for.
   * Reads from the file system or uses the provided list.
   */
  private __initListener(): void {
    try {
      const hostsRaw = this.__getHosts();
      this.hostnames = hostsRaw
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*/, "").trim())
        .filter(Boolean);
      if (!this.hostnames.length) {
        this.logger.warn("Hosts are empty");
      }
    } catch (err) {
      this.debug(err as Error);
      this.error = true;
    }
  }

  /**
   * Resolves the source of the hostnames list.
   * Priority:
   * 1. Explicit file path provided in constructor.
   * 2. Array provided in constructor.
   * 3. Default OS file location (~/.mdns-hosts).
   * * @returns The raw string content of hostnames.
   * @throws Error if no hosts are found and no defaults exist.
   */
  private __getHosts(): string {
    if (this.mdnsHostsFile && existsSync(this.mdnsHostsFile)) {
      return readFileSync(this.mdnsHostsFile, { encoding: "utf-8" });
    }

    if (this.hostnames && this.hostnames.length > 0) {
      return this.hostnames.join("\n");
    }

    const defaultFile = join(homedir(), ".mdns-hosts");

    if (existsSync(defaultFile)) {
      this.mdnsHostsFile = defaultFile;
      return readFileSync(defaultFile, { encoding: "utf-8" });
    }

    this.logger.warn(
      "Hostnames or path to hostnames is not provided, listening to a host is compromised!",
    );
    throw new Error(`Provide hostnames or path to hostnames! Report this error ${NPM_URL}`);
  }

  /**
   * helper to find the first non-internal IPv4 address of this machine.
   * Used for publishing the device's location.
   */
  private getLocalIpAddress(): string | undefined {
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const net = ifaces[name];
      if (!net) continue;
      for (const addr of net) {
        if (!addr.internal && addr.family === "IPv4" && !addr.address.startsWith("169.")) {
          return addr.address;
        }
      }
    }
    return undefined;
  }

  /**
   * Broadcasts an mDNS Response packet.
   * This effectively "publishes" a service or device to the network.
   * * @param name - The hostname/service name to publish (e.g. "MyDevice").
   */
  /**
   * Broadcasts an mDNS Response packet.
   * Now supports periodic announcements (Heartbeat).
   * @param name - The hostname/service name to publish.
   * @param interval - (Optional) Time in ms to repeat the broadcast (e.g., 30000). 0 = once.
   */
  public publish(name: string, interval: number = 30000): void {
    if (this.disablePublisher) {
      this.logger.info("Publisher is disabled.");
      return;
    }

    // Generate a consistent UUID for this session
    const uuid = `"${randomUUID()}"`;

    // Define the sending logic
    const sendAnnouncement = () => {
      const ip = this.getLocalIpAddress();
      if (!ip) {
        this.logger.warn("Could not find local IP during publish");
        return;
      }

      const txtData = {
        uuid: uuid,
        ipv4: JSON.stringify(ip),
      };

      const packet = DNSBuffer.createResponse(name, ip, txtData);

      this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
        if (err) this.logger.error("Failed to publish", err);
        else this.logger.debug("Published hostname:", name); // Changed to debug to avoid spam
      });
    };

    // 1. Send immediately
    this.logger.info(`Starting publication for: ${name}`);
    sendAnnouncement();

    // 2. Clear any existing timer to prevent duplicates
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
    }

    // 3. Set up the interval if requested
    if (interval > 0) {
      this.publishTimer = setInterval(sendAnnouncement, interval);
      // Ensure the process doesn't hang if this is the only active handle
      this.publishTimer.unref();
    }
  }

  /**
   * Sends a Discovery Query (PTR) to the network.
   * Used to find all devices of a specific type.
   * @param serviceType - The service to scan for (default: "_services._dns-sd._udp.local").
   */
  public scan(serviceType: string = "_services._dns-sd._udp.local"): void {
    if (this.disableListener) {
      this.logger.warn("Cannot scan because listener is disabled.");
      return;
    }

    // Ensure socket is bound (safe to call multiple times now)
    this.listen();

    this.logger.info(`Scanning network for: ${serviceType}`);

    // Create a Query for PTR records (Type 12)
    const packet = DNSBuffer.createQuery(serviceType, 12);

    this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
      if (err) this.logger.error("Failed to send scan query", err);
    });
  }

  /**
   * Binds the UDP socket to port 5353 and joins the multicast group.
   * Starts receiving mDNS packets.
   * @returns The EventEmitter instance to listen for 'response' or 'discovery' events.
   */
  public listen(): EventEmitter {
    if (this.disableListener) return this.myEvent;

    // FIX: Return immediately if already listening to avoid "Socket already bound" errors
    if (this.isListening) return this.myEvent;

    this.__initListener();
    if (this.error) {
      const errorMessage = `Error in MDNS listener! Report: ${NPM_URL}`;
      process.nextTick(() => this.myEvent.emit(EmittedEvent.ERROR, new Error(errorMessage)));
      return this.myEvent;
    }

    try {
      this.socket.bind(MDNS_PORT, () => {
        // Mark as listening inside the callback (or assuming success if no sync error)
        this.isListening = true;
        try {
          this.socket.addMembership(MDNS_IP);
          this.socket.setMulticastLoopback(true);
          this.logger.info("Looking for hostnames...", this.hostnames);
        } catch (e) {
          this.logger.warn("Failed to add membership", e);
        }
      });

      // Assume listening start success to prevent race conditions with immediate .scan() calls
      this.isListening = true;
    } catch (e) {
      this.isListening = false; // Revert state on sync error
      const errorMessage = `Failed to bind socket! Report: ${NPM_URL}`;
      this.logger.error(errorMessage, e);
    }

    return this.myEvent;
  }

  /**
   * The raw 'message' handler for the UDP socket.
   * Parses the binary DNS buffer into a structured object.
   * @param msg - The raw Buffer received from the network.
   */
  private handleSocketMessage(msg: Buffer) {
    try {
      const parser = new DNSBuffer(msg);

      // Parse Header SKIP ID AND FLAGS
      /**
       * ISSUE FIX:
       * DNSBuffer moves a cursor sequentially through the raw bytes.
       * By commenting out the id and flags reads, the cursor started at byte 0 instead of byte 4,
       * causing qdCount to read the packet ID instead of the question count.
       * Uncommenting those lines realigned the parser so it could correctly identify the Question, Answer, and Additional record counts.
       */
      parser.readUInt16(); // ID
      parser.readUInt16(); // Flags
      const qdCount = parser.readUInt16(); // Questions
      const anCount = parser.readUInt16(); // Answers
      const nsCount = parser.readUInt16(); // Authority (Capture this!)
      const arCount = parser.readUInt16(); // Additional (Capture this!)

      // Skip Questions
      for (let i = 0; i < qdCount; i++) {
        parser.readName();
        parser.readUInt16();
        parser.readUInt16();
      }

      // Read Answers + Authority + Additional
      // FIX: Sum all record counts to ensure we read TXT records in the Additional section
      const answers: DeviceBuffer[] = [];
      const totalRecords = anCount + nsCount + arCount;

      for (let i = 0; i < totalRecords; i++) {
        if (parser.isDone) break;
        answers.push(parser.readAnswer());
      }

      if (answers.length > 0) {
        // Pass to logic orchestrator
        this.handleResponse({ answers } as any);
      }
    } catch (e) {
      this.logger.warn("Failed to parse message", e);
    }
  }

  /**
   * Orchestrates the logic for processed DNS answers.
   * Routes data to either the Targeted Host logic or the Discovery logic.
   * @param response - The structured object containing parsed answers.
   */
  private handleResponse(response: { answers: Array<DeviceBuffer> }): void {
    if (!response.answers?.length) return;

    this.myEvent.emit(EmittedEvent.RAW_RESPONSE, response);

    // 1. Handle targeted host lookups (legacy behavior: "Is 'MyDevice' online?")
    this.checkTargetedHosts(response.answers);

    // 2. Handle general network scanning (Discovery: "What devices are here?")
    this.checkDiscovery(response.answers);
  }

  /**
   * Checks if any of the incoming answers match the specific hostnames
   * provided in the constructor.
   * @param answers - Array of parsed DNS records.
   */
  private checkTargetedHosts(answers: Array<DeviceBuffer>): void {
    const foundDevices = answers
      .filter((a) => this.isMatchingTxtRecord(a))
      .map((a) => this.convertToDevice(a))
      .filter((d): d is Device => d !== null);

    if (foundDevices.length > 0) {
      this.myEvent.emit(EmittedEvent.RESPONSE, foundDevices);
    }
  }

  /**
   * Helper: Determines if an answer is a TXT record (Type 16)
   * and matches one of the monitored hostnames.
   * @param answer DeviceBuffer answer
   */
  private isMatchingTxtRecord(answer: DeviceBuffer): boolean {
    return answer.type === 16 && this.hostnames.some((hostname) => answer.name?.includes(hostname));
  }

  /**
   * Helper: safeguards buffer conversion and maps the answer to a Device object.
   * @param answer DeviceBuffer answer
   */
  private convertToDevice(answer: DeviceBuffer): Device | null {
    let txtBuffer: Buffer | null = null;

    if (Buffer.isBuffer(answer.data)) {
      txtBuffer = answer.data;
    } else if (Array.isArray(answer.data)) {
      txtBuffer = Buffer.concat(answer.data);
    }

    if (!txtBuffer) return null;

    return {
      name: answer.name,
      type: "TXT",
      data: parseTxtRecord(txtBuffer),
    };
  }

  /**
   * Scans incoming answers for Discovery-related records (PTR, SRV, A).
   * Emits a 'discovery' event for each relevant record found.
   * @param answers - Array of parsed DNS records.
   */
  private checkDiscovery(answers: Array<DeviceBuffer>): void {
    for (const a of answers) {
      switch (a.type) {
        case 12: // PTR (Pointer)
          this.emitDiscovery(a, "PTR");
          break;
        case 33: // SRV (Service)
          this.emitDiscovery(a, "SRV");
          break;
        case 1: // A (IPv4)
          this.emitDiscovery(a, "A");
          break;
      }
    }
  }

  /**
   * Helper to normalize and emit discovery events.
   * @param record - The parsed device buffer record.
   * @param type - The standardized type string.
   */
  private emitDiscovery(record: DeviceBuffer, type: "PTR" | "SRV" | "A"): void {
    this.myEvent.emit(EmittedEvent.DISCOVERY, {
      name: record.name,
      type: type,
      data: record.data,
    });
  }

  /**
   * Stops the MDNS service.
   * Closes the UDP socket and removes all event listeners.
   */
  public stop(): void {
    this.socket.close();
    this.myEvent.removeAllListeners();
    this.isListening = false; // Reset listening state
  }

  /**
   * Proxy method to access the internal logger info level.
   * @param args - Arguments to log.
   */
  public info(...args: any[]): void {
    this.logger.info(...args);
  }
}
