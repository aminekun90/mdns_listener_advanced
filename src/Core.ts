import { platform, networkInterfaces } from 'os';
import { existsSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { Device, DeviceBuffer, DeviceData, NPM_URL, Options, emittedEvent } from './types';
import mDNS from 'multicast-dns';
import { Bonjour, ServiceConfig } from 'bonjour-service';
import logdown from 'logdown';

import { v4 as uuidv4 } from 'uuid';

/**
 * MDNS Advanced Core Class
 */
export class Core {
  private hostnames: Array<string>;
  private mdnsHostsFile: string | null | undefined;
  private debugEnabled: boolean = false;
  private disableListener: boolean = false;
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
    private logger: logdown.Logger = logdown('MDNS ADVANCED'),
    private mdns = mDNS(),
    private myEvent = new EventEmitter(),
    private publisher = new Bonjour(),
  ) {
    this.hostnames = hostsList ?? [];
    this.mdnsHostsFile = mdnsHostsPath;
    this.logger.state.isEnabled = true;
    this.debugEnabled = !!options?.debug;
    this.disableListener = !!options?.disableListener;
  }

  /**
   * Console debugging function
   * @param  {...any} args
   */
  debug(...args: unknown[]) {
    if (this.debugEnabled) {
      this.logger.debug(...args);
    }
  }

  /**
   * Console info function
   * @param  {...any} args
   */
  info(...args: unknown[]) {
    this.logger.info(...args);
  }

  /**
   * Initialize mdns
   * @private
   */
  private __initListener() {
    try {
      this.hostnames = this.__getHosts()
        .split('\n')
        .map((name) => name.replace(/#.*/, '')) // Remove comments
        .map((name) => name.trim()) // Trim lines
        .filter((name) => name.length > 0); // Remove empty lines
      if (!this.hostnames.length) {
        this.logger.warn('Hosts are empty');
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
      return readFileSync(this.mdnsHostsFile, {
        encoding: 'utf-8',
      });
    } else if (this.hostnames?.length) {
      return this.hostnames?.join('\r\n');
    } else {
      this.mdnsHostsFile = platform().startsWith('win')
        ? process.env.HOMEPATH + '\\' + '.mdns-hosts'
        : process.env.HOME + '/' + '.mdns-hosts';
      if (existsSync(this.mdnsHostsFile)) {
        return this.__getHosts();
      }
      this.logger.warn('Hostnames or path to hostnames is not provided, listening to a host is compromised!');
      throw new Error(`Provide hostnames or path to hostnames! Report this error ${NPM_URL}`);
    }
  }

  /**
   * Get Current Device IP
   * @return {Array<string>}
   * @private
   */
  private getLocalIpAddress(): string | undefined {
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const networkInterface = ifaces[name];
      if (networkInterface) {
        for (const address of networkInterface) {
          if (!address.internal && address.family === 'IPv4' && !address.address.startsWith('169.')) {
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
    const options = {
      port: 3000,
      name: name,
      type: 'TXT',
      txt: {
        uuid: `"${uuidv4()}"`,
        ipv4: JSON.stringify(this.getLocalIpAddress()),
      },
    } as ServiceConfig;
    const bonjourService = this.publisher.publish(options);
    this.info('A hostname have been published with options', options);
    this.debug(bonjourService);
    return bonjourService;
  }

  /**
   * Unpublish the publisher
   */
  public unpublishAll() {
    this.publisher.unpublishAll();
    this.info('All hostnames have been unpublished');
  }

  /**
   * Listen to the network for hostnames
   * @return {EventEmitter}
   * @public
   */
  public listen(): EventEmitter {
    if (this.disableListener) {
      this.info('Listener is disabled');
      return this.myEvent;
    }

    this.__initListener();
    if (this.error) {
      this.myEvent.on(emittedEvent.ERROR, (e) => {
        this.info(e.message);
      });
      const errorMessage = `An error occurred while trying to listen to mdns ! Report this error ${NPM_URL}`;
      this.myEvent.emit(emittedEvent.ERROR, new Error(errorMessage));
      return this.myEvent;
    }
    this.info('Looking for hostnames...', this.hostnames);

    this.mdns.on(emittedEvent.RESPONSE, this.handleResponse.bind(this));
    return this.myEvent;
  }

  /**
   * Handle buffer data and transform them to a json object
   * @param dataBuffer
   * @returns
   */
  private handleBufferData(dataBuffer: Buffer) {
    const str = dataBuffer.toString('utf8');
    const propertiesMatch = str.match(/(\w+)=("[^"]*"|\S+)/g);
    const properties: { [key: string]: string } = {};
    if (propertiesMatch) {
      propertiesMatch.forEach((prop) => {
        const [key, value] = prop.split('=');
        properties[key] = value.replace(/"/g, '');
      });
    }
    return properties;
  }

  /**
   * Handle mdns response
   *
   * @param response
   */
  private handleResponse(response: { answers: Array<DeviceBuffer> }) {
    const findHosts: Array<Device> = [];
    this.debug('RESPONSE:', response);
    this.myEvent.emit(emittedEvent.RAW_RESPONSE, response);
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
        this.myEvent.emit(emittedEvent.RESPONSE, findHosts);
      }
    });
  }

  /**
   * Stop listening and kills the emmiter
   * @public
   */
  public stop() {
    this.info('Stopping mdns listener...');
    // fix mdns undefined sometimes
    if (this.mdns?.removeAllListeners) {
      this.mdns.removeAllListeners();
    }
    // fix myEvent undefined
    if (this.myEvent?.removeAllListeners) {
      this.myEvent.removeAllListeners();
    }
  }
}
