// src/Core.ts
import { randomUUID } from "node:crypto";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { MDNS_IP, MDNS_PORT, NPM_URL } from "./const.js"; // Ensure this matches your file name (constants.js or const.js)
import { DNSBuffer } from "./protocol/DNSBuffer.js";
import { Device, DeviceBuffer, EmittedEvent, Options } from "./types.js";
import { SimpleLogger } from "./utils/Logger.js";
import { parseTxtRecord } from "./utils/parsers.js";

export class Core {
  private hostnames: string[];
  private mdnsHostsFile?: string;
  private readonly debugEnabled: boolean;
  private disableListener: boolean;
  private disablePublisher: boolean;
  private error = false;

  private readonly socket: dgram.Socket;
  private readonly myEvent: EventEmitter;
  private readonly logger: SimpleLogger;

  constructor(
    hostsList?: string[] | null,
    mdnsHostsPath?: string | null,
    options?: Options,
    logger?: any,
  ) {
    this.hostnames = hostsList ?? [];
    this.mdnsHostsFile = mdnsHostsPath ?? undefined;
    this.debugEnabled = !!options?.debug;
    this.disableListener = !!options?.disableListener;
    this.disablePublisher = !!options?.disablePublisher;

    this.logger = logger ?? new SimpleLogger({ name: "MDNS ADVANCED" });
    this.myEvent = new EventEmitter();

    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('error', (err) => {
      this.logger.error("Socket Error", err);
      this.error = true;
    });

    this.socket.on('message', (msg) => this.handleSocketMessage(msg));
  }

  private debug(...args: unknown[]) {
    if (this.debugEnabled) {
      this.logger.debug(...(args as [unknown, ...unknown[]]));
    }
  }

  public setDisableListener(value: boolean): void {
    this.disableListener = value;
  }

  public setDisablePublisher(value: boolean): void {
    this.disablePublisher = value;
  }

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

  private __getHosts(): string {
    if (this.mdnsHostsFile && existsSync(this.mdnsHostsFile)) {
      return readFileSync(this.mdnsHostsFile, { encoding: "utf-8" });
    }

    if (this.hostnames && this.hostnames.length > 0) {
      return this.hostnames.join("\n");
    }

    const defaultFile = join(homedir(), '.mdns-hosts');

    if (existsSync(defaultFile)) {
      this.mdnsHostsFile = defaultFile;
      return readFileSync(defaultFile, { encoding: "utf-8" });
    }

    this.logger.warn("Hostnames or path to hostnames is not provided, listening to a host is compromised!");
    throw new Error(`Provide hostnames or path to hostnames! Report this error ${NPM_URL}`);
  }

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

  public publish(name: string) {
    if (this.disablePublisher) {
      this.logger.info("Publisher is disabled.");
      return;
    }

    const ip = this.getLocalIpAddress();
    if (!ip) {
      this.logger.warn("Could not find local IP");
      return;
    }

    const txtData = {
      uuid: `"${randomUUID()}"`,
      ipv4: JSON.stringify(ip),
    };

    const packet = DNSBuffer.createResponse(name, ip, txtData);

    this.socket.send(packet, 0, packet.length, MDNS_PORT, MDNS_IP, (err) => {
      if (err) this.logger.error("Failed to publish", err);
      else this.logger.info("Published hostname:", name, txtData);
    });
  }

  public listen(): EventEmitter {
    if (this.disableListener) return this.myEvent;

    this.__initListener();
    if (this.error) {
      const errorMessage = `Error in MDNS listener! Report: ${NPM_URL}`;
      process.nextTick(() => this.myEvent.emit(EmittedEvent.ERROR, new Error(errorMessage)));
      return this.myEvent;
    }

    try {
      this.socket.bind(MDNS_PORT, () => {
        try {
          this.socket.addMembership(MDNS_IP);
          this.socket.setMulticastLoopback(true);
          this.logger.info("Looking for hostnames...", this.hostnames);
        } catch (e) {
          this.logger.warn("Failed to add membership", e);
        }
      });
    } catch (e) {
      const errorMessage = `Failed to bind socket! Report: ${NPM_URL}`;
      this.logger.error(errorMessage, e);
    }

    return this.myEvent;
  }

  private handleSocketMessage(msg: Buffer) {
    try {
      const parser = new DNSBuffer(msg);

      // --- FIX: Read the FULL 12-byte Header ---
      parser.readUInt16(); // ID
      parser.readUInt16(); // Flags
      const qdCount = parser.readUInt16(); // Questions Count
      const anCount = parser.readUInt16(); // Answers Count
      parser.readUInt16(); // NS Count (Authority)  <-- THIS WAS MISSING
      parser.readUInt16(); // AR Count (Additional) <-- THIS WAS MISSING
      // -----------------------------------------

      // Skip Questions
      for (let i = 0; i < qdCount; i++) {
        parser.readName();
        parser.readUInt16(); // Type
        parser.readUInt16(); // Class
      }

      // Read Answers
      const answers: DeviceBuffer[] = [];
      for (let i = 0; i < anCount; i++) {
        if (parser.isDone) break;
        answers.push(parser.readAnswer());
      }

      if (answers.length > 0) {
        this.handleResponse({ answers } as any);
      }
    } catch (e) {
      this.logger.error("Failed to handle socket message", e);
    }
  }

  private handleResponse(response: { answers: Array<DeviceBuffer> }): void {
    const findHosts: Array<Device> = [];

    if (!response.answers?.length) return;

    this.debug("RESPONSE:", response);
    this.myEvent.emit(EmittedEvent.RAW_RESPONSE, response);

    for (const hostname of this.hostnames) {
      for (const a of response.answers) {
        if (a.name && a.name.includes(hostname) && a.type === 16 && Array.isArray(a.data)) {
          const combinedBuffer = Buffer.concat(a.data);
          // Uses the imported Utility function
          findHosts.push({
            name: a.name,
            type: 'TXT',
            data: parseTxtRecord(combinedBuffer),
          });
        }
      }
    }

    if (findHosts.length) {
      this.myEvent.emit(EmittedEvent.RESPONSE, findHosts);
    }
  }

  public stop() {
    this.socket.close();
    this.myEvent.removeAllListeners();
  }

  public info(...args: any[]): void {
    this.logger.info(...args);
  }
}