import { platform, networkInterfaces } from 'os';
import { existsSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { NPM_URL, Options } from '@mdns-listener/types';
import mDNS from 'multicast-dns';
import logdown from 'logdown';


/**
 * MDNS Advanced Core Class
 */
export class Core {
  private hostnames: Array<string>;
  private mdnsHostsFile: string | null | undefined;
  private debugEnabled: boolean = false;
  private error: boolean = false;
  /**
   * Constructor
   * 
   * @param hostsList 
   * @param mdnsHostsPath 
   * @param options 
   * @param logger 
   * @param mdns 
   * @param myEvent 
   */
  constructor(
    hostsList: string[],
    mdnsHostsPath?: string | null,
    options?: Options,
    private logger: logdown.Logger = logdown("MDNS ADVANCED"),
    private mdns = mDNS(),
    private myEvent = new EventEmitter()
  ) {
    this.hostnames = hostsList || [];
    this.mdnsHostsFile = mdnsHostsPath;
    this.logger.state.isEnabled = true;
    this.debugEnabled = !!options?.debug;
    this.__initialize();
  }

  /**
   * Console debugging function
   * @param  {...any} args
   */
  debug(...args: any[]) {
    if (this.debugEnabled) {
      this.logger.debug.apply(this.logger, args);
    }
  }

  /**
   * Console info function
   * @param  {...any} args
   */
  info(...args: any[]) {
    this.logger.info.apply(this.logger, args);
  }

  /**
   * Initialize mdns
   * @private
   */
  private __initialize() {
    try {
      this.hostnames = this.__getHosts()
        .split('\n')
        .map((name) => name.replace(/\#.*/, '')) // Remove comments
        .map((name) => name.trim()) // Trim lines
        .filter((name) => name.length > 0); // Remove empty lines
    } catch (error) {
      this.debug(error);
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
    } else if (this.hostnames && this.hostnames.length) {
      return this.hostnames && this.hostnames.join('\r\n');
    } else {
      this.mdnsHostsFile = platform().startsWith('win')
        ? process.env.HOMEPATH + '\\' + '.mdns-hosts'
        : process.env.HOME + '/' + '.mdns-hosts';
      if (existsSync(this.mdnsHostsFile)) {
        return this.__getHosts();
      }
      throw new Error(`Provide hostnames or path to hostnames ! Report this error ${NPM_URL}`);
    }
  }

  /**
   * Get Current Device IP
   * Not used after version 2.3.1
   * @return {Array<string>}
   * @deprecated
   * @private
   */
  private __getMyIp(): Array<string> {
    const allIPs: string[] = [];
    const ifaces = networkInterfaces();

    Object.keys(ifaces).forEach((ifname) => {
      ifaces[ifname]?.forEach((iface: any) => {
        if ('IPv4' !== iface.family || iface.internal !== false) {
          // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
          return;
        }
        if (allIPs.find((thisip) => thisip === iface.address) !== undefined) {
          allIPs.push(iface.address);
        }
      });
    });
    return allIPs;
  }

  /**
   * Listen to the network for hostnames
   * @return {EventEmitter}
   * @public
   */
  public listen(): EventEmitter {
    if (this.error) {
      this.myEvent.on('error', (e) => {
        this.logger.info(e.message);
      });
      const errorMessage = `An error occurred while initializing mdns advanced ! Report this error ${NPM_URL}`;
      this.myEvent.emit('error', new Error(errorMessage));
      return this.myEvent;
    }
    this.logger.info('Looking for hostnames...', this.hostnames);

    this.mdns.on('response', this.handleResponse.bind(this));
    return this.myEvent;
  }

  /**
   * Handle mdns response 
   * 
   * @param response 
   */
  private handleResponse(response: any) {
    this.hostnames.forEach((hostname) => {
      const findHost = response.answers.filter((answer: any) =>
        answer.name === `_${hostname}._tcp.local` || answer.name === `_${hostname}._udp.local`
      );

      if (findHost.length > 0) {
        const find = response.answers.find((answer: any) =>
          (answer.name === `_${hostname}._tcp.local` || answer.name === `_${hostname}._udp.local`) &&
          answer.type === 'TXT'
        );

        if (find) {
          const deviceData = find.data;
          const object = { [hostname]: {} as any };

          deviceData.forEach((buffer: any) => {
            const [key, value] = buffer.toString('utf8').split('=');
            object[hostname][key] = value;
          });

          this.myEvent.emit('response', object);
        }
      }
    });
  }
  /**
   * Stop listening and kills the emmiter
   * @public
   */
  public stop() {
    this.logger.info('Stopping mdns listener...');
    // fix mdns undefined sometimes
    if (this.mdns && this.mdns.removeAllListeners instanceof Function) {
      this.mdns.removeAllListeners();
    }
    // fix myEvent undefined
    if (this.myEvent && this.myEvent.removeAllListeners instanceof Function) {
      this.myEvent.removeAllListeners();
    }
  }
}

export default Core;
