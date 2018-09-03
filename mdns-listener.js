#!/usr/bin/env node --use_strict

'use strict';
const EventEmitter = require('events');
const mdns = require('multicast-dns')()
// const dns = require('dns'); // not used anymore
const os = require('os');
const fs = require('fs');

function getMyIp() {
  let all_ips = [];
  let ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (ifname) {
    var alias = 0;

    ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }
      // Not needed !!------
      // if (alias >= 1) {
      //   // this single interface has multiple ipv4 addresses
      //   // console.log(ifname + ':' + alias, iface.address);
      // } else {
      //   // this interface has only one ipv4 adress
      //   // console.log(ifname, iface.address);
      // }
      // -----
      if (all_ips.find(thisip => thisip === iface.address) !== undefined) {
        all_ips.push(iface.address);
      }

      ++alias;
    });
  });
  return all_ips;
};


class Core {
  /**
   * 
   * @param {*} mdns_hosts_path .mdns-fosts file path
   * @param {*} refresh_interval interval
   */
  constructor(mdns_hosts_path = os.platform().startsWith('win') ?
    process.env.HOMEPATH + '\\' + '.mdns-hosts' : process.env.HOME + '/' + '.mdns-hosts', refresh_interval = 60) {
    this.mdns_hosts = mdns_hosts_path;
    this.interval = refresh_interval;
    this.all_ips = []
    this.overall_found = {};
    this.myEvent = new EventEmitter();
    this.hostnames = [];
  }
  initialize() {
    // Get hostnames
    console.log('os', os.platform())

    console.log('Process.env', process.env.HOMEPATH)
    const hosts = fs.readFileSync(this.mdns_hosts, {
      encoding: 'utf-8'
    });

    this.hostnames = hosts.split("\n")
      .map(name => name.replace(/\#.*/, '')) // Remove comments
      .map(name => name.trim()) // Trim lines
      .filter(name => name.length > 0); // Remove empty lines

    console.log("Serving hostnames:", this.hostnames.join(', '));
    this.all_ips = getMyIp();
    setInterval(getMyIp, this.interval * 1000);


    // Wait and respond to queries
    this.all_ips.forEach(ip => {
      console.log('wait on ip :', ip);
      mdns.on('query', (query) => {
        console.log('got a query packet:', query)

        if (query.questions[0] && query.questions[0].type === 'A') {
          const name = query.questions[0].name;

          if (this.hostnames.indexOf(name) >= 0) {
            console.log(name, ' => ', ip);
            mdns.respond([{
              name: name,
              type: 'A',
              data: ip,
              ttl: 120
            }]); // Seconds
          }
        }
      })
    });
  }

  /**
   * Listen to the network for hostnames
   */
  listen() {
    mdns.on('response', (response) => {
      // console.log('Response found ! ', response.answers);
      this.hostnames.forEach(hostname => {
        if (this.overall_found[hostname] === undefined) {
          this.overall_found[hostname] = [];
        }
        let findHost = response.answers.find(answer => answer.name === hostname);
        if (findHost !== undefined) {
          let find = response.answers.find(answer => (answer.name === 'connection.local' || answer.name === 'ash-2.local') && answer.type === 'A');
          if (find !== undefined) {
            let playeradress = find.data;
            // if hostname doesnt exist push it
            if (this.overall_found[hostname].find(adress => playeradress === adress) === undefined) {
              this.overall_found[hostname].push(playeradress);
              let object = {};
              object[hostname] = playeradress;
              this.myEvent.emit('new_hostname', object);
            }
            // console.log('Found a ', hostname, ' on addresses', overall_found);


          }
        }

      });

    });
    return this.myEvent;
  }
  stop() {
    this.overall_found = {};
    this.mdns.removeAllListeners();
    this.myEvent.removeAllListeners();
  }

}
module.exports = Core;