import { platform, networkInterfaces } from 'os';
import { existsSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { Options } from '@mdns-listener/types/types';
import mDNS from 'multicast-dns';
import logdown from 'logdown';


/**
 * MDNS Advanced Core Class
 */
export class Core {
  private static NPMURL = 'https://www.npmjs.com/package/mdns-listener-advanced';
  private hostnames;
  private mdnsHostsFile;
  private debug = false;
  private error = false;
  private myEvent = new EventEmitter();
  private mdns = mDNS();
  private logger = logdown("MDNS ADVANCED");

  /**
   * Constructor
   * @param {string[]} hostsList List of hosts to find ['myhost1','myhost2']
   * @param {string} mdnsHostsPath .mdns-hosts file path if not provided will be created in HOME directory
   * @param {Options} [options] more options
   * @public
   */
  constructor(hostsList: string[], mdnsHostsPath?: string, options?: Options) {
    this.hostnames = hostsList ? hostsList : [];
    this.mdnsHostsFile = mdnsHostsPath;
    this.logger.state.isEnabled = true;
    this.debug = !!options && !!options.debug;
    this.__initialize();
  }

  /**
   * Console debugging function
   * @param  {...any} str
   */
  consoleDebug(...str: any[]) {
    if (this.debug) {
      this.logger.debug.apply(this.logger, str);
    }
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
      this.consoleDebug(error);
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
      throw new Error(`Provide hostnames or path to hostnames ! More at ${Core.NPMURL}`);
    }
  }

  /**
   * Get Current Device IP
   * Not used For this version 2.3.1
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
      this.myEvent.emit(
        'error',
        new Error(`An error occured while initializing mdns advanced ! More at ${Core.NPMURL}`),
      );
      return this.myEvent;
    }
    this.logger.info('Looking for hostnames...', this.hostnames);
    this.mdns.on('response', (response: any) => {
      this.hostnames.forEach((hostname) => {
        const findHost = response.answers.filter((answer: any) => {
          return answer.name === '_' + hostname + '._tcp.local' || answer.name === '_' + hostname + '._udp.local';
        });
        if (findHost !== undefined) {
          const find = response.answers.find((answer: any) => {
            return (
              (answer.name === '_' + hostname + '._tcp.local' || answer.name === '_' + hostname + '._udp.local') &&
              answer.type === 'TXT'
            );
          });
          if (find !== undefined) {
            const deviceData = find.data;
            const object: any = {};
            object[hostname] = {};
            deviceData.forEach((buffer: any) => {
              const elem = buffer.toString('utf8').split('=');
              object[hostname][elem[0]] = elem[1];
            });
            this.myEvent.emit('response', object);
          }
        }
      });
    });
    return this.myEvent;
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
