import { MDNS_IP, MDNS_PORT, NPM_URL } from "@/const.js";
import { DNSBuffer } from "@/protocol/DNSBuffer.js";
import {
  Device,
  DeviceBuffer,
  DeviceRegistryEntry,
  DiscoveredService,
  EmittedEvent,
  Options,
  SrvData,
} from "@/types.js";
import { SimpleLogger } from "@/utils/Logger.js";
import { parseTxtRecord } from "@/utils/parsers.js";
import { randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";

interface Logger {
  info(...args: any[]): void;
  warn(...args: any[]): void;
  debug(...args: any[]): void;
  error(...args: any[]): void;
}

/**
 * The main mDNS Core class.
 *
 * Handles low-level UDP socket operations, implements the mDNS protocol (RFC 6762)
 * for packet parsing and generation, and manages the lifecycle of publishing and
 * listening for services on the local network.
 *
 * Features:
 * - Zero-dependency: uses only Node.js built-ins (dgram, crypto, os, fs).
 * - Cross-platform: Windows, macOS, and Linux.
 * - Multi-service publishing with per-service heartbeat timers.
 * - RFC-compliant goodbye packets on stop / unpublish.
 * - In-memory device registry with TTL-based expiry events.
 * - Promise-based `discoverOnce()` for one-shot scans.
 * - Typed `on()` / `once()` / `off()` event proxy methods.
 * - AAAA (IPv6) record parsing.
 * - Configurable TTL and network interface selection.
 */
export class Core {
  private hostnames: string[];
  private mdnsHostsFile?: string;
  private readonly debugEnabled: boolean;
  private readonly options: Options;

  // Per-service heartbeat timers (name → timer)
  private readonly publishTimers = new Map<string, NodeJS.Timeout>();
  // Last known IP per published service, needed to send goodbye packets
  private readonly publishedIPs = new Map<string, string>();

  // In-memory registry of discovered targeted devices
  private readonly deviceRegistry = new Map<string, DeviceRegistryEntry>();
  private readonly registryTimers = new Map<string, NodeJS.Timeout>();

  private disableListener: boolean = false;
  private disablePublisher: boolean;
  private error = false;
  private isListening = false;

  private socket!: dgram.Socket;
  private readonly myEvent: EventEmitter;
  private readonly logger: Logger;

  /**
   * @param hostsList     - Hostnames to listen for (e.g. `['MyDevice', 'Printer']`).
   * @param mdnsHostsPath - Path to a newline-separated file of hostnames.
   * @param options       - Configuration: debug, disableListener, disablePublisher,
   *                        noColor, ttl, interface.
   * @param logger        - Optional custom logger (must implement info/warn/debug/error).
   */
  constructor(
    hostsList?: string[] | null,
    mdnsHostsPath?: string | null,
    options?: Options,
    logger?: Logger,
  ) {
    this.hostnames = hostsList ?? [];
    this.mdnsHostsFile = mdnsHostsPath ?? undefined;
    this.options = options ?? {};
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
    this.initSocket();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Binds the UDP socket to port 5353 and joins the mDNS multicast group.
   * Returns the internal EventEmitter for backward-compatible `.on()` chaining.
   * Prefer the typed `core.on(EmittedEvent.X, handler)` proxy instead.
   *
   * @param ref - Optional newline-separated hostnames to override the constructor list.
   */
  public listen(ref?: string): EventEmitter {
    if (this.disableListener) return this.myEvent;
    if (this.isListening) return this.myEvent;

    this.initSocket();
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
        this.isListening = true;
        try {
          this.socket.addMembership(MDNS_IP);
          this.socket.setMulticastLoopback(true);
          this.logger.info("Looking for hostnames...", this.hostnames);
        } catch (e) {
          this.logger.warn("Failed to add membership", e);
        }
      });

      // Optimistically mark as listening to prevent race conditions with immediate scan() calls
      this.isListening = true;
    } catch (e: any) {
      if (e.code === "ERR_SOCKET_ALREADY_BOUND") {
        this.isListening = true;
        return this.myEvent;
      }
      this.isListening = false;
      this.logger.error(`Failed to bind socket! Report: ${NPM_URL}`, e);
    }

    return this.myEvent;
  }

  /**
   * Broadcasts an mDNS Response packet for the given service name.
   * Supports multiple simultaneous services — each gets its own heartbeat timer.
   *
   * @param name     - Service / hostname to announce (e.g. `"MyDevice.local"`).
   * @param data     - Extra key/value pairs to include in the TXT record.
   * @param interval - Heartbeat interval in ms (default 30 000). Use `0` for one-shot.
   */
  public publish<T extends Record<string, string>>(
    name: string,
    data?: T,
    interval: number = 30_000,
  ): void {
    if (this.disablePublisher) {
      this.logger.info("Publisher is disabled.");
      return;
    }

    const uuid = `"${randomUUID()}"`;
    const ttl = this.options.ttl ?? 120;

    const sendAnnouncement = () => {
      if (!this.socket) return;

      const ip = this.getLocalIpAddress();
      if (!ip) {
        this.logger.warn("Could not find local IP during publish");
        return;
      }

      // Track the last-used IP so we can address goodbye packets correctly
      this.publishedIPs.set(name, ip);

      const txtData: Record<string, string> = {
        uuid,
        ipv4: JSON.stringify(ip),
        ...(data ?? {}),
      };

      const packet = DNSBuffer.createResponse(name, ip, txtData, ttl);

      try {
        this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
          if (err) this.logger.error("Failed to publish", err);
          else this.logger.debug("Published hostname:", name);
        });
      } catch (err) {
        this.logger.warn("Socket send failed (socket likely closed)", err);
      }
    };

    this.logger.info(`Starting publication for: ${name}`);
    sendAnnouncement();

    // Replace any existing timer for this name without affecting others
    const existing = this.publishTimers.get(name);
    if (existing) clearInterval(existing);

    if (interval > 0) {
      const timer = setInterval(sendAnnouncement, interval);
      timer.unref();
      this.publishTimers.set(name, timer);
    }
  }

  /**
   * Sends an mDNS Discovery Query (PTR) to the multicast group.
   * Use `discoverOnce()` for a promise-based one-shot variant.
   *
   * @param serviceType - Service type to query (default: everything via `_services._dns-sd._udp.local`).
   */
  public scan(serviceType: string = "_services._dns-sd._udp.local"): void {
    if (this.disableListener) {
      this.logger.warn("Cannot scan because listener is disabled.");
      return;
    }

    this.listen();

    this.logger.info(`Scanning network for: ${serviceType}`);
    const packet = DNSBuffer.createQuery(serviceType, 12);

    this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
      if (err) this.logger.error("Failed to send scan query", err);
    });
  }

  /**
   * Performs a one-shot mDNS discovery scan and resolves with all services
   * observed within the given timeout window.
   *
   * @param serviceType - Service type to query (default: all services).
   * @param timeout     - How long to collect responses in ms (default: 3000).
   */
  public discoverOnce(
    serviceType: string = "_services._dns-sd._udp.local",
    timeout: number = 3000,
  ): Promise<DiscoveredService[]> {
    if (this.disableListener) {
      this.logger.warn("Cannot call discoverOnce because listener is disabled.");
      return Promise.resolve([]);
    }

    return new Promise((resolve) => {
      const discovered: DiscoveredService[] = [];
      const handler = (service: DiscoveredService) => discovered.push(service);

      this.myEvent.on(EmittedEvent.DISCOVERY, handler);
      this.scan(serviceType);

      setTimeout(() => {
        this.myEvent.off(EmittedEvent.DISCOVERY, handler);
        resolve(discovered);
      }, timeout);
    });
  }

  /**
   * Stops the heartbeat for a single published service and sends a goodbye packet
   * (TTL = 0) so peers evict it from their caches immediately.
   */
  public unpublish(name: string): void {
    const timer = this.publishTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.publishTimers.delete(name);
    }
    this.sendGoodbye(name);
  }

  /**
   * Stops the entire mDNS service:
   * 1. Sends goodbye packets for every published service.
   * 2. Clears all heartbeat and registry expiry timers.
   * 3. Closes the UDP socket.
   * 4. Removes all event listeners and resets state.
   */
  public stop(): void {
    // Stop all heartbeat timers
    for (const timer of this.publishTimers.values()) clearInterval(timer);
    this.publishTimers.clear();

    // Send goodbye for every tracked service (includes interval=0 one-shot publishes)
    const servicesToFarewell = [...this.publishedIPs.keys()];
    for (const name of servicesToFarewell) {
      this.sendGoodbye(name);
    }

    // Clear device-registry expiry timers
    for (const timer of this.registryTimers.values()) clearTimeout(timer);
    this.registryTimers.clear();
    this.deviceRegistry.clear();

    this.closeSocket();
  }

  // ─── Typed event proxy ────────────────────────────────────────────────────

  public on(event: EmittedEvent.RESPONSE, listener: (devices: Device[]) => void): this;
  public on(event: EmittedEvent.DISCOVERY, listener: (service: DiscoveredService) => void): this;
  public on(
    event: EmittedEvent.RAW_RESPONSE,
    listener: (response: { answers: DeviceBuffer[] }) => void,
  ): this;
  public on(event: EmittedEvent.ERROR, listener: (error: Error) => void): this;
  public on(event: EmittedEvent.DEVICE_FOUND, listener: (device: Device) => void): this;
  public on(event: EmittedEvent.DEVICE_LOST, listener: (name: string) => void): this;
  public on(event: EmittedEvent, listener: (...args: any[]) => void): this {
    this.myEvent.on(event, listener);
    return this;
  }

  public once(event: EmittedEvent.RESPONSE, listener: (devices: Device[]) => void): this;
  public once(event: EmittedEvent.DISCOVERY, listener: (service: DiscoveredService) => void): this;
  public once(
    event: EmittedEvent.RAW_RESPONSE,
    listener: (response: { answers: DeviceBuffer[] }) => void,
  ): this;
  public once(event: EmittedEvent.ERROR, listener: (error: Error) => void): this;
  public once(event: EmittedEvent.DEVICE_FOUND, listener: (device: Device) => void): this;
  public once(event: EmittedEvent.DEVICE_LOST, listener: (name: string) => void): this;
  public once(event: EmittedEvent, listener: (...args: any[]) => void): this {
    this.myEvent.once(event, listener);
    return this;
  }

  public off(event: EmittedEvent.RESPONSE, listener: (devices: Device[]) => void): this;
  public off(event: EmittedEvent.DISCOVERY, listener: (service: DiscoveredService) => void): this;
  public off(
    event: EmittedEvent.RAW_RESPONSE,
    listener: (response: { answers: DeviceBuffer[] }) => void,
  ): this;
  public off(event: EmittedEvent.ERROR, listener: (error: Error) => void): this;
  public off(event: EmittedEvent.DEVICE_FOUND, listener: (device: Device) => void): this;
  public off(event: EmittedEvent.DEVICE_LOST, listener: (name: string) => void): this;
  public off(event: EmittedEvent, listener: (...args: any[]) => void): this {
    this.myEvent.off(event, listener);
    return this;
  }

  // ─── Registry / state accessors ──────────────────────────────────────────

  /**
   * Returns a snapshot of all targeted devices currently in the live registry.
   * Entries expire automatically when their mDNS TTL elapses.
   */
  public getDiscoveredDevices(): Device[] {
    return Array.from(this.deviceRegistry.values()).map((e) => e.device);
  }

  // ─── Runtime toggles ─────────────────────────────────────────────────────

  public setDisableListener(value: boolean): void {
    this.disableListener = value;
  }

  public setDisablePublisher(value: boolean): void {
    this.disablePublisher = value;
  }

  /** Convenience pass-through so external scripts can log via the same logger. */
  public info(...args: any[]): void {
    this.logger.info(...args);
  }

  // ─── Private: socket lifecycle ────────────────────────────────────────────

  private initSocket(): void {
    if (this.socket && typeof this.socket.address === "function") {
      try {
        this.socket.address();
        return;
      } catch {
        // Socket is closed, fall through to recreate
      }
    }

    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket.on("error", (err) => {
      this.logger.error("Socket Error", err);
      this.error = true;
      this.isListening = false;
    });

    this.socket.on("message", (msg) => this.handleSocketMessage(msg));
  }

  private closeSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        this.logger.debug("Socket already closed");
      }
    }
    this.myEvent.removeAllListeners();
    this.isListening = false;
  }

  // ─── Private: message handling ────────────────────────────────────────────

  private handleSocketMessage(msg: Buffer): void {
    try {
      const parser = new DNSBuffer(msg);
      parser.readUInt16(); // ID
      parser.readUInt16(); // Flags
      const qdCount = parser.readUInt16();
      const anCount = parser.readUInt16();
      const nsCount = parser.readUInt16();
      const arCount = parser.readUInt16();

      for (let i = 0; i < qdCount; i++) {
        parser.readName();
        parser.readUInt16();
        parser.readUInt16();
      }

      const answers: DeviceBuffer[] = [];
      const totalRecords = anCount + nsCount + arCount;

      for (let i = 0; i < totalRecords; i++) {
        if (parser.isDone) break;
        answers.push(parser.readAnswer() as DeviceBuffer);
      }

      if (answers.length > 0) {
        this.handleResponse({ answers });
      }
    } catch (e) {
      this.logger.warn("Failed to parse message", e);
    }
  }

  private handleResponse(response: { answers: DeviceBuffer[] }): void {
    if (!response.answers?.length) return;
    this.myEvent.emit(EmittedEvent.RAW_RESPONSE, response);
    this.checkTargetedHosts(response.answers);
    this.checkDiscovery(response.answers);
  }

  private checkTargetedHosts(answers: DeviceBuffer[]): void {
    const foundDevices: Device[] = [];

    for (const answer of answers) {
      if (!this.isMatchingTxtRecord(answer)) continue;
      const device = this.convertToDevice(answer);
      if (!device) continue;
      foundDevices.push(device);
      this.updateRegistry(device, answer.ttl);
    }

    if (foundDevices.length > 0) {
      this.myEvent.emit(EmittedEvent.RESPONSE, foundDevices);
    }
  }

  private checkDiscovery(answers: DeviceBuffer[]): void {
    for (const answer of answers) {
      switch (answer.type) {
        case 1:
          this.emitDiscovery(answer, "A");
          break;
        case 12:
          this.emitDiscovery(answer, "PTR");
          break;
        case 16:
          this.emitDiscovery(answer, "TXT");
          break;
        case 28:
          this.emitDiscovery(answer, "AAAA");
          break;
        case 33:
          this.emitDiscovery(answer, "SRV");
          break;
      }
    }
  }

  // ─── Private: helpers ────────────────────────────────────────────────────

  private isMatchingTxtRecord(answer: DeviceBuffer): boolean {
    return answer.type === 16 && this.hostnames.some((h) => answer.name?.includes(h));
  }

  private convertToDevice(answer: DeviceBuffer): Device | null {
    let txtBuffer: Buffer | null = null;

    if (Buffer.isBuffer(answer.data)) {
      txtBuffer = answer.data as unknown as Buffer;
    } else if (Array.isArray(answer.data)) {
      txtBuffer = Buffer.concat(answer.data as Buffer[]);
    }

    if (!txtBuffer) return null;

    return {
      name: answer.name,
      type: "TXT",
      data: parseTxtRecord(txtBuffer),
    };
  }

  private emitDiscovery(
    record: DeviceBuffer,
    type: "PTR" | "SRV" | "A" | "AAAA" | "TXT",
  ): void {
    const service: DiscoveredService = {
      name: record.name,
      type,
      data: record.data as DiscoveredService["data"],
      ttl: record.ttl,
    };
    this.myEvent.emit(EmittedEvent.DISCOVERY, service);
  }

  /**
   * Adds or refreshes a device in the in-memory registry.
   * Emits DEVICE_FOUND for new entries and schedules DEVICE_LOST after TTL elapses.
   * A TTL of 0 (goodbye packet) removes the entry immediately.
   */
  private updateRegistry(device: Device, ttlSeconds: number): void {
    const { name } = device;
    const isNew = !this.deviceRegistry.has(name);

    // Clear any existing expiry timer
    const existing = this.registryTimers.get(name);
    if (existing) clearTimeout(existing);

    if (ttlSeconds <= 0) {
      // Goodbye packet — evict immediately
      if (this.deviceRegistry.has(name)) {
        this.deviceRegistry.delete(name);
        this.registryTimers.delete(name);
        this.myEvent.emit(EmittedEvent.DEVICE_LOST, name);
      }
      return;
    }

    this.deviceRegistry.set(name, { device, expiresAt: Date.now() + ttlSeconds * 1000 });

    const timer = setTimeout(() => {
      this.deviceRegistry.delete(name);
      this.registryTimers.delete(name);
      this.myEvent.emit(EmittedEvent.DEVICE_LOST, name);
    }, ttlSeconds * 1000);
    timer.unref();
    this.registryTimers.set(name, timer);

    if (isNew) {
      this.myEvent.emit(EmittedEvent.DEVICE_FOUND, device);
    }
  }

  private sendGoodbye(name: string): void {
    const ip = this.publishedIPs.get(name) ?? this.getLocalIpAddress();
    if (!ip || !this.socket) return;

    const packet = DNSBuffer.createGoodbye(name, ip);
    try {
      this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
        if (err) this.logger.error("Failed to send goodbye", err);
        else this.logger.debug("Sent goodbye for:", name);
      });
    } catch (err) {
      this.logger.warn("Socket send failed during goodbye", err);
    }

    this.publishedIPs.delete(name);
  }

  // ─── Private: network helpers ─────────────────────────────────────────────

  /**
   * Returns the IPv4 address for the configured interface, or the first
   * non-internal, non-link-local IPv4 address found on the machine.
   */
  private getLocalIpAddress(): string | undefined {
    const ifaces = networkInterfaces();
    const preferredIface = this.options.interface;

    if (preferredIface) {
      const net = ifaces[preferredIface];
      if (net) {
        const addr = net.find((a) => !a.internal && a.family === "IPv4");
        if (addr) return addr.address;
      }
    }

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

  // ─── Private: host list helpers ───────────────────────────────────────────

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
  }

  private debug(...args: unknown[]): void {
    if (this.debugEnabled) {
      this.logger.debug(...(args as [unknown, ...unknown[]]));
    }
  }
}

export default Core;
