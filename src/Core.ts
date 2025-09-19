import { Bonjour, ServiceConfig } from "bonjour-service";
import { EventEmitter } from "events";
import { existsSync, readFileSync } from "fs";
import mDNS from "multicast-dns";
import { networkInterfaces, platform } from "os";
import { Logger } from "tslog";
import { v4 as uuidv4 } from "uuid";
import { Device, DeviceBuffer, DeviceData, EmittedEvent, NPM_URL, Options } from "./types";

/**
 * MDNS Advanced Core Class
 */
export class Core {
  private hostnames: string[];
  private mdnsHostsFile?: string;
  private debugEnabled: boolean;
  private disableListener: boolean;
  private disablePublisher: boolean;
  private error: boolean = false;

  /**
   * Constructor
   * @param hostsList
   * @param mdnsHostsPath
   * @param options
   * @param logger
   * @param mdns
   * @param myEvent
   */
  constructor(
    hostsList?: string[] | null,
    mdnsHostsPath?: string | null,
    options?: Options,
    private logger: Logger<any> = new Logger({ name: "MDNS ADVANCED" }),
    private mdns = mDNS(),
    private myEvent = new EventEmitter(),
    private publisher = new Bonjour(),
  ) {
    this.hostnames = hostsList ?? [];
    this.mdnsHostsFile = mdnsHostsPath ?? undefined;
    this.debugEnabled = !!options?.debug;
    this.disableListener = !!options?.disableListener;
    this.disablePublisher = !!options?.disablePublisher;
  }

  /**
   * Console debugging function
   * @param  {...any} args
   */
  private debug(...args: unknown[]): void {
    if (this.debugEnabled) {
      this.logger.debug(...args);
    }
  }

  /**
   * Initialize mdns listener
   * @private
   */
  private __initListener(): void {
    try {
      this.hostnames = this.__getHosts()
        .split("\n")
        .map((name) => name.replace(/#.*/, "").trim()) // Remove comments and trim lines
        .filter((name) => name.length > 0); // Remove empty lines
      if (!this.hostnames.length) {
        this.logger.warn("Hosts are empty");
      }
    } catch (error) {
      this.debug(error as Error);
      this.error = true;
    }
  }

  /**
   * Get Hosts and validate constructor params
   * @return {string}
   * @private
   */
  private __getHosts(): string {
    if (this.mdnsHostsFile && existsSync(this.mdnsHostsFile)) {
      return readFileSync(this.mdnsHostsFile, { encoding: "utf-8" });
    } else if (this.hostnames.length) {
      return this.hostnames.join("\r\n");
    } else {
      this.mdnsHostsFile = platform().startsWith("win")
        ? `${process.env.HOMEPATH}\\.mdns-hosts`
        : `${process.env.HOME}/.mdns-hosts`;
      if (existsSync(this.mdnsHostsFile)) {
        return this.__getHosts();
      }
      this.logger.warn("Hostnames or path to hostnames is not provided, listening to a host is compromised!");
      throw new Error(`Provide hostnames or path to hostnames! Report this error ${NPM_URL}`);
    }
  }

  /**
   * Get Current Device IP
   * @return {string | undefined}
   * @private
   */
  private getLocalIpAddress(): string | undefined {
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const networkInterface = ifaces[name];
      if (networkInterface) {
        for (const address of networkInterface) {
          if (!address.internal && address.family === "IPv4" && !address.address.startsWith("169.")) {
            return address.address;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Publish a host using bonjour protocol
   * @param name
   */
  public publish(name: string) {
    if (this.disablePublisher) {
      this.logger.info(
        "Publisher is disabled unset 'Options.disablePublisher' or set it to 'false' to enable hosts publication !",
      );
      return;
    }
    const options: ServiceConfig = {
      port: 3000,
      name: name,
      type: "TXT",
      txt: {
        uuid: `"${uuidv4()}"`,
        ipv4: JSON.stringify(this.getLocalIpAddress()),
      },
    };
    const bonjourService = this.publisher.publish(options);
    this.logger.info("A hostname has been published with options", options);
    this.debug(bonjourService);
    return bonjourService;
  }

  /**
   * Unpublish all hosts
   */
  public unpublishAll(): void {
    this.publisher.unpublishAll();
    this.logger.info("All hostnames have been unpublished");
  }

  /**
   * Listen to the network for hostnames
   * @return {EventEmitter}
   * @public
   */
  public listen(): EventEmitter {
    if (this.disableListener) {
      this.logger.info("Listener is disabled");
      return this.myEvent;
    }

    this.__initListener();
    if (this.error) {
      this.myEvent.on(EmittedEvent.ERROR, (e) => {
        this.logger.info(e.message);
      });
      const errorMessage = `An error occurred while trying to listen to mdns! Report this error ${NPM_URL}`;
      this.myEvent.emit(EmittedEvent.ERROR, new Error(errorMessage));
      return this.myEvent;
    }
    this.logger.info("Looking for hostnames...", this.hostnames);

    this.mdns.on(EmittedEvent.RESPONSE, this.handleResponse.bind(this));
    return this.myEvent;
  }

  /**
   * Handle buffer data and transform them to a JSON object
   * @param dataBuffer
   * @returns
   */
  private handleBufferData(dataBuffer: Buffer): { [key: string]: string } {
    const str = dataBuffer.toString("utf8");
    const properties: { [key: string]: string } = {};

    // Regex to match key=value where value can be quoted with escaped quotes
    const regex = /([^=\s]+)=("((?:\\.|[^"\\])*)"|[^\s"]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      const key = match[1];
      let value = match[3] !== undefined ? match[3] : match[2]; // match[3] exists if quoted
      // Unescape any \" inside quoted strings
      value = value.replace(/\\"/g, '"');
      properties[key] = value;
    }

    return properties;
  }

  /**
   * Handle mdns response
   * @param response
   */
  private handleResponse(response: { answers: Array<DeviceBuffer> }): void {
    const findHosts: Array<Device> = [];
    this.debug("RESPONSE:", response);
    this.myEvent.emit(EmittedEvent.RAW_RESPONSE, response);
    this.hostnames.forEach((hostname) => {
      response.answers
        .filter((a) => a.data && Array.isArray(a.data) && a.name.includes(hostname))
        .forEach((a) => {
          findHosts.push({
            name: a.name,
            type: a.type,
            data: this.handleBufferData(a.data) as DeviceData,
          });
        });

      if (findHosts.length) {
        this.myEvent.emit(EmittedEvent.RESPONSE, findHosts);
      }
    });
  }

  /**
   * Stop listening and remove all listeners
   * @public
   */
  public stop(): void {
    this.logger.info("Stopping mdns listener...");
    if (this.mdns?.removeAllListeners) {
      this.mdns.removeAllListeners();
    }
    if (this.myEvent?.removeAllListeners) {
      this.myEvent.removeAllListeners();
    }
  }
}
