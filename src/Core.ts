// src/Core.ts
import { MDNS_IP, MDNS_PORT, NPM_URL } from "@/const.js";
import { DNSBuffer } from "@/protocol/DNSBuffer.js";
import { Device, DeviceBuffer, EmittedEvent, Options } from "@/types.js";
import { SimpleLogger } from "@/utils/Logger.js";
import { parseTxtRecord } from "@/utils/parsers.js";
import { randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";

// Define a minimal Logger interface to avoid 'any' usage
interface Logger {
  info(...args: any[]): void;
  warn(...args: any[]): void;
  debug(...args: any[]): void;
  error(...args: any[]): void;
}

/**
 * The main mDNS Core class.
 *
 * This class handles the low-level UDP socket operations, implements the mDNS protocol
 * (RFC 6762) for packet parsing and generation, and manages the lifecycle of
 * publishing and listening for services on the local network.
 *
 * It is designed to be:
 * - **Zero-Dependency:** Uses native Node.js modules (dgram, crypto, etc.).
 * - **Cross-Platform:** Compatible with Windows, macOS, and Linux.
 * - **Resilient:** Handles socket errors, re-binding, and resource cleanup.
 */
export class Core {
  private hostnames: string[];
  private mdnsHostsFile?: string;
  private readonly debugEnabled: boolean;
  private publishTimer?: NodeJS.Timeout;
  private disableListener: boolean = false;
  private disablePublisher: boolean;
  private error = false;

  // Track listening state to prevent double-binding or race conditions
  private isListening = false;

  private socket!: dgram.Socket;
  private readonly myEvent: EventEmitter;
  private readonly logger: Logger;

  /**
   * Creates a new instance of the mDNS Core.
   *
   * @param hostsList - An optional array of specific hostnames to listen for (e.g. `['MyDevice', 'Printer']`).
   * @param mdnsHostsPath - An optional absolute path to a file containing hostnames (newline separated).
   * @param options - Configuration options object (debug, disableListener, disablePublisher, noColor).
   * @param logger - An optional custom logger instance conforming to the Logger interface.
   */
  constructor(
    hostsList?: string[] | null,
    mdnsHostsPath?: string | null,
    options?: Options,
    logger?: Logger,
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

    // Initialize the UDP socket immediately
    this.initSocket();
  }

  /**
   * Initializes or re-initializes the UDP socket.
   *
   * @remarks
   * This method ensures that we don't accidentally overwrite an active socket.
   * If the socket is closed or undefined, it creates a new `udp4` socket with `reuseAddr` enabled,
   * allowing multiple mDNS applications to coexist on port 5353.
   */
  private initSocket(): void {
    // If socket exists and is active, do nothing to prevent unnecessary churn
    if (this.socket && typeof this.socket.address === "function") {
      try {
        this.socket.address(); // Will throw if closed
        return;
      } catch {
        // Socket is closed, proceed to re-create
      }
    }

    // Bind to UDP4 with reuseAddr to allow multiple applications to use port 5353
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", (err) => {
      this.logger.error("Socket Error", err);
      this.error = true;
      this.isListening = false;
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
   * @param value - `true` to disable listening, `false` to enable.
   */
  public setDisableListener(value: boolean): void {
    this.disableListener = value;
  }

  /**
   * Dynamically enable or disable the publisher functionality.
   * @param value - `true` to disable publishing, `false` to enable.
   */
  public setDisablePublisher(value: boolean): void {
    this.disablePublisher = value;
  }

  /**
   * Prepares the internal list of hostnames to listen for.
   *
   * @remarks
   * Reads from the file system (if a path is provided) or uses the provided list.
   * Parses the input to remove comments (lines starting with #) and empty lines.
   *
   * @param ref - Optional string containing hostnames separated by newlines `\n`. Overrides other sources if provided.
   */
  private __initListener(ref?: string): void {
    try {
      const hostsRaw = ref ?? this.__getHosts();
      this.hostnames = hostsRaw
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*/, "").trim())
        .filter(Boolean);
      if (!this.hostnames.length) {
        this.logger.debug("init listener -> Hosts are empty or not provided");
        return;
      }
    } catch (err) {
      this.debug(err as Error);
      this.error = true;
    }
  }

  /**
   * Resolves the source of the hostnames list.
   *
   * Priority Order:
   * 1. Explicit file path provided in constructor (`mdnsHostsPath`).
   * 2. Array provided in constructor (`hostsList`).
   * 3. Default OS file location (`~/.mdns-hosts`).
   *
   * @returns The raw string content of hostnames.
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
      "Hostnames or path to hostnames is not provided, listening to a host might be compromised!",
    );
    return "";
    // throw new Error(`Provide hostnames or path to hostnames! Report this error ${NPM_URL}`);
  }

  /**
   * Finds the first non-internal IPv4 address of the local machine.
   *
   * @remarks
   * This is crucial for the "Publish" feature, as we need to announce where other devices
   * can reach us. It filters out internal (localhost) and link-local (169.x.x.x) addresses.
   *
   * @returns The IPv4 address string (e.g., "192.168.1.50") or `undefined` if none found.
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
   * Broadcasts an mDNS Response packet (Announce).
   *
   * This method "publishes" a service or device to the network by sending a generic
   * DNS response containing its IP and optional TXT data. It supports a heartbeat
   * mechanism to keep the service alive in the cache of other devices.
   *
   * @param name - The hostname/service name to publish (e.g. "MyDevice").
   * @param data - Optional object to include in the TXT record (e.g. `{ version: "1.0" }`).
   * @param interval - Time in ms to repeat the broadcast (Heartbeat). Default: `30000` (30s). Set to `0` for a single shot.
   */
  public publish(name: string, data: any = {}, interval: number = 30000): void {
    if (this.disablePublisher) {
      this.logger.info("Publisher is disabled.");
      return;
    }

    // Generate a consistent UUID for this session
    const uuid = `"${randomUUID()}"`;

    const sendAnnouncement = () => {
      // Safety check: Don't try to send if socket is closed
      if (!this.socket) return;

      const ip = this.getLocalIpAddress();
      if (!ip) {
        this.logger.warn("Could not find local IP during publish");
        return;
      }

      const txtData = {
        uuid: uuid,
        ipv4: JSON.stringify(ip),
        ...data,
      };

      const packet = DNSBuffer.createResponse(name, ip, txtData);

      try {
        this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
          if (err) this.logger.error("Failed to publish", err);
          else this.logger.debug("Published hostname:", name);
        });
      } catch (err) {
        this.logger.warn("Socket send failed (socket likely closed)", err);
      }
    };

    // 1. Send immediately
    this.logger.info(`Starting publication for: ${name}`);
    sendAnnouncement();

    // 2. Clear any existing timer to avoid overlaps
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
    }

    // 3. Set up the interval heartbeat
    if (interval > 0) {
      this.publishTimer = setInterval(sendAnnouncement, interval);
      // Ensure the process doesn't hang if this is the only active handle
      this.publishTimer.unref();
    }
  }

  /**
   * Sends a Discovery Query (PTR) to the network.
   *
   * This is an "Active" scan. It sends a DNS query asking "Who has this service?".
   * All devices on the network matching the type should respond.
   *
   * @param serviceType - The service to scan for. Default: `_services._dns-sd._udp.local` (Everything).
   * Common types: `_googlecast._tcp.local`, `_airplay._tcp.local`.
   */
  public scan(serviceType: string = "_services._dns-sd._udp.local"): void {
    if (this.disableListener) {
      this.logger.warn("Cannot scan because listener is disabled.");
      return;
    }
    // Ensure socket is bound
    this.listen();

    this.logger.info(`Scanning network for: ${serviceType}`);
    const packet = DNSBuffer.createQuery(serviceType, 12);

    this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
      if (err) this.logger.error("Failed to send scan query", err);
    });
  }

  /**
   * Binds the UDP socket to port 5353 and joins the multicast group.
   * Starts receiving mDNS packets.
   * @param ref - (Optional) The hostname(s) to target separated by newlines "\n".
   * @returns The EventEmitter instance to listen for 'response' or 'discovery' events.
   */
  public listen(ref?: string): EventEmitter {
    if (this.disableListener) return this.myEvent;

    // FIX: Return immediately if already listening to avoid "Socket already bound" errors
    if (this.isListening) return this.myEvent;

    this.initSocket();

    // 🔴 Reset error state before trying again this will remove all previous errors flag
    this.error = false;

    this.__initListener(ref);

    if (this.error) {
      const errorMessage = `Problem in MDNS listener! Report: ${NPM_URL}`;
      process.nextTick(() => {
        this.myEvent.emit(EmittedEvent.ERROR, new Error(errorMessage));
      });
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
    } catch (e: any) {
      // Handle race condition where socket binds between the check and the call
      if (e.code === "ERR_SOCKET_ALREADY_BOUND") {
        this.isListening = true;
        return this.myEvent;
      }
      this.isListening = false;
      const errorMessage = `Failed to bind socket! Report: ${NPM_URL}`;
      this.logger.error(errorMessage, e);
    }

    return this.myEvent;
  }

  /**
   * The raw 'message' handler for the UDP socket.
   *
   * Parses the binary DNS buffer into a structured object using `DNSBuffer`.
   * It extracts Questions, Answers, Authorities, and Additional records.
   *
   * @param msg - The raw binary Buffer received from the network.
   */
  private handleSocketMessage(msg: Buffer) {
    try {
      const parser = new DNSBuffer(msg);
      // We read these fields to advance the internal cursor of the parser
      parser.readUInt16(); // ID
      parser.readUInt16(); // Flags
      const qdCount = parser.readUInt16(); // Questions count
      const anCount = parser.readUInt16(); // Answers count
      const nsCount = parser.readUInt16(); // Authority count
      const arCount = parser.readUInt16(); // Additional count

      // Skip Questions section to get to Answers
      for (let i = 0; i < qdCount; i++) {
        parser.readName();
        parser.readUInt16();
        parser.readUInt16();
      }

      const answers: DeviceBuffer[] = [];
      const totalRecords = anCount + nsCount + arCount;

      for (let i = 0; i < totalRecords; i++) {
        if (parser.isDone) break;
        answers.push(parser.readAnswer());
      }

      if (answers.length > 0) {
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
    this.checkTargetedHosts(response.answers);
    this.checkDiscovery(response.answers);
  }

  /**
   * Checks if any of the incoming answers match the specific hostnames
   * provided in the constructor. Emits `RESPONSE` if a match is found.
   *
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
   */
  private isMatchingTxtRecord(answer: DeviceBuffer): boolean {
    return answer.type === 16 && this.hostnames.some((hostname) => answer.name?.includes(hostname));
  }

  /**
   * Helper: Safeguards buffer conversion and maps the answer to a Device object.
   * Handles both Buffer and Array<Buffer> data types.
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
   * Emits a `DISCOVERY` event for each relevant record found.
   */
  private checkDiscovery(answers: Array<DeviceBuffer>): void {
    for (const a of answers) {
      switch (a.type) {
        case 12:
          this.emitDiscovery(a, "PTR");
          break;
        case 33:
          this.emitDiscovery(a, "SRV");
          break;
        case 1:
          this.emitDiscovery(a, "A");
          break;
      }
    }
  }

  /**
   * Helper to normalize and emit discovery events.
   */
  private emitDiscovery(record: DeviceBuffer, type: "PTR" | "SRV" | "A"): void {
    this.myEvent.emit(EmittedEvent.DISCOVERY, {
      name: record.name,
      type: type,
      data: record.data,
    });
  }

  /**
   * Stops the MDNS service completely.
   *
   * Actions taken:
   * 1. Stops the heartbeat publisher timer.
   * 2. Closes the UDP socket.
   * 3. Removes all event listeners.
   * 4. Resets internal state (`isListening = false`).
   */
  public stop(): void {
    // 1. Stop the heartbeat timer!
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
    }

    // 2. Close socket
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        this.logger.debug("Socket already closed");
      }
    }

    // 3. Reset state
    this.myEvent.removeAllListeners();
    this.isListening = false;
  }

  /**
   * Proxy method to access the internal logger's info level.
   * Useful for external scripts to log using the same format.
   * @param args - Arguments to log.
   */
  public info(...args: any[]): void {
    this.logger.info(...args);
  }
}

export default Core;
