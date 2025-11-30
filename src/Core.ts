// src/Core.ts
import { Bonjour, ServiceConfig } from "bonjour-service";
import multicastDns, { ResponsePacket } from "multicast-dns";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import { Device, DeviceBuffer, EmittedEvent, NPM_URL, Options } from "./types.js";

export class Core {
  private hostnames: string[];
  private mdnsHostsFile?: string;
  private readonly debugEnabled: boolean;
  private disableListener: boolean;
  private disablePublisher: boolean;
  private error = false;

  private readonly mdnsInstance: ReturnType<typeof multicastDns>;
  private readonly publisher: Bonjour;
  private readonly myEvent: EventEmitter;
  private readonly logger: Logger<any>;

  constructor(
    hostsList?: string[] | null,
    mdnsHostsPath?: string | null,
    options?: Options,
    logger?: Logger<any>,
    mdnsInstance?: ReturnType<typeof multicastDns>,
    myEvent?: EventEmitter,
    publisher?: Bonjour,
  ) {
    this.hostnames = hostsList ?? [];
    this.mdnsHostsFile = mdnsHostsPath ?? undefined;
    this.debugEnabled = !!options?.debug;
    this.disableListener = !!options?.disableListener;
    this.disablePublisher = !!options?.disablePublisher;

    this.logger = logger ?? new Logger({ name: "MDNS ADVANCED" });
    this.mdnsInstance = mdnsInstance ?? multicastDns();
    this.myEvent = myEvent ?? new EventEmitter();
    this.publisher = publisher ?? new Bonjour();
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
      this.logger.info(
        "Publisher is disabled unset 'Options.disablePublisher' or set it to 'false' to enable hosts publication !",
      );
      return;
    }
    const options: ServiceConfig = {
      port: 3000,
      name,
      type: "TXT",
      txt: {
        uuid: `"${uuidv4()}"`,
        ipv4: JSON.stringify(this.getLocalIpAddress() ?? ""),
      },
    };
    const bonjourService = this.publisher.publish(options);
    this.logger.info("A hostname has been published with options", options);
    this.debug(bonjourService);
    return bonjourService;
  }

  public unpublishAll(): void {
    try {
      this.publisher.unpublishAll();
      this.logger.info("All hostnames have been unpublished");
    } catch (err) {
      this.debug("unpublishAll error", err);
    }
  }

  public listen(): EventEmitter {
    if (this.disableListener) {
      this.logger.info("Listener is disabled");
      return this.myEvent;
    }

    this.__initListener();
    if (this.error) {
      const errorMessage = `An error occurred while trying to listen to mdns! Report this error ${NPM_URL}`;
      process.nextTick(() => this.myEvent.emit(EmittedEvent.ERROR, new Error(errorMessage)));
      return this.myEvent;
    }
    this.logger.info("Looking for hostnames...", this.hostnames);

    this.mdnsInstance.on(EmittedEvent.RESPONSE, this.handleResponse.bind(this));
    return this.myEvent;
  }

  private handleBufferData(dataBuffer: Buffer): { [key: string]: string } {
    const str = dataBuffer.toString("utf8");
    const props: { [key: string]: string } = {};
    const regex = /([^=\s]+)=("((?:\\.|[^"\\])*)"|[^\s"]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      const key = match[1];
      // if group 3 exists it's the inner quoted capture
      let value = match[3] ?? match[2];
      value = value.replaceAll(String.raw`\"`, '"');
      // strip surrounding quotes if still present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      props[key] = value;
    }
    return props;
  }

  private handleResponse(response: { answers: Array<DeviceBuffer> } | ResponsePacket): void {
    const findHosts: Array<Device> = [];
    this.debug("RESPONSE:", response);
    this.myEvent.emit(EmittedEvent.RAW_RESPONSE, response);

    const answers = Array.isArray((response as any).answers) ? (response as any).answers : [];

    for (const hostname of this.hostnames) {
      for (const a of answers) {
        if (a.data && Array.isArray(a.data) && a?.name?.includes(hostname)) {
          findHosts.push({
            name: a.name,
            type: a.type,
            data: this.handleBufferData(Buffer.concat((a.data as Buffer[]).map((d: any) => Buffer.from(d)))),
          });
        }
      }

      if (findHosts.length) {
        this.myEvent.emit(EmittedEvent.RESPONSE, findHosts);
      }
    }
  }
  public info(...args: any[]): void {
    this.logger.info(...args);
  }
  public stop(): void {
    this.logger.info("Stopping mdns listener...");
    try {
      if (this.mdnsInstance?.removeAllListeners) this.mdnsInstance.removeAllListeners();
      if (this.myEvent?.removeAllListeners) this.myEvent.removeAllListeners();
    } catch (err) {
      this.debug("stop error", err);
    }
  }
}
