#!/usr/bin/env node --use_strict

const mdns = require('multicast-dns')()
const dns = require('dns');
const os = require('os');
const fs = require('fs');

// Config

const mdns_hosts = ".mdns-hosts";
const interval = 60;

// Set process name

process.title = process.title = 'mdns-listener';

// Get hostnames

const hosts = fs.readFileSync(mdns_hosts, {
  encoding: 'utf-8'
});

// console.log(hosts);

const hostnames = hosts.split("\n")
  .map(name => name.replace(/\#.*/, '')) // Remove comments
  .map(name => name.trim()) // Trim lines
  .filter(name => name.length > 0); // Remove empty lines

console.log("Serving hostnames:", hostnames.join(', '));

// Get our ip

var ip;
var all_ips = [];

function getMyIp() {
  // const hostname = os.hostname();
  let ifaces = os.networkInterfaces();
  // let adresses = [];
  Object.keys(ifaces).forEach(function (ifname) {
    var alias = 0;

    ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }

      if (alias >= 1) {
        // this single interface has multiple ipv4 addresses
        console.log(ifname + ':' + alias, iface.address);
      } else {
        // this interface has only one ipv4 adress
        // console.log(ifname, iface.address);
      }
      if (all_ips.find(thisip => thisip === iface.address) !== undefined) {
        all_ips.push(iface.address);
      }

      ++alias;
    });
  });
  // // console.log(adresses)
  // dns.lookup(hostname, (err, addr, fam) => {

  //   if (ip !== addr) {
  //     console.log('addr: ', addr);
  //     // ip = addr;
  //     ip = '192.168.1.103'
  //   }
  // });
}

getMyIp();

setInterval(getMyIp, interval * 1000);

// Wait and respond to queries
all_ips.forEach(ip => {
  console.log('wait on ip :', ip);
  mdns.on('query', function (query) {
    console.log('got a query packet:', query)

    if (query.questions[0] && query.questions[0].type === 'A') {
      const name = query.questions[0].name;

      if (hostnames.indexOf(name) >= 0) {
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


// find

let overall_found = [];
mdns.on('response', function (response) {
  hostnames.forEach(hostname => {
    // console.log('start looking for', hostname)

    let findHost = response.answers.find(answer => answer.name === hostname);
    if (findHost !== undefined) {
      let find = response.answers.find(answer => answer.name === 'connection.local' && answer.type === 'A');
      if (find !== undefined) {
        let playeradress = find.data;
        if (overall_found.find(adress => playeradress === adress) === undefined)
          overall_found.push(playeradress)
        console.log('Found a ', hostname, ' on addresses', overall_found);

      }

    }
  });

})

// lets query for an A record
// mdns.query({
//   questions: [{
//     name: '_Gymix-player._tcp.local',
//     type: 'A'
//   }]
// })