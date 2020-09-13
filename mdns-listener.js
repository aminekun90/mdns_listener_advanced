#!/usr/bin/env node --use_strict

"use strict";
const mdns = require("multicast-dns")();
// const dns = require('dns'); // not used anymore
const os = require("os");
const fs = require("fs");
const { EventEmitter } = require("events");

function getMyIp() {
  let all_ips = [];
  let ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (ifname) {
    // var alias = 0;
    ifaces[ifname].forEach(function (iface) {
      if ("IPv4" !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }
      if (all_ips.find((thisip) => thisip === iface.address) !== undefined) {
        all_ips.push(iface.address);
      }

      // ++alias;
    });
  });
  return all_ips;
}

class Core {
  /**
   * COnstructor
   * @param {*} list_hosts List of hosts to find ['myhost1.local','myhost2.local']
   * @param {*} mdns_hosts_path .mdns-hosts file path if not provided will be created in HOME directory
   * @param {*} refresh_interval interval
   */
  constructor(
    list_hosts = [],
    mdns_hosts_path = os.platform().startsWith("win")
      ? process.env.HOMEPATH + "\\" + ".mdns-hosts"
      : process.env.HOME + "/" + ".mdns-hosts",
    refresh_interval = 60
  ) {
    this.mdns_hosts = mdns_hosts_path;
    this.interval = refresh_interval;
    this.all_ips = [];
    this.overall_found = {};
    this.myEvent = new EventEmitter();
    console.log(list_hosts);
    this.hostnames = list_hosts;
    this.initialize();
  }

  /**
   * Initialize mdns
   */
  initialize() {
    // Get hostnames
    // console.log('os', os.platform())

    // console.log('Process.env', process.env.HOMEPATH)
    let hosts;

    if (!fs.existsSync(this.mdns_hosts) || this.hostnames.length) {
      if (this.hostnames.filter((hostname) => hostname.length > 15).length) {
        throw "ZeroConf limitations : Name must be <= 15 ";
      }
      hosts = this.hostnames.join("\r\n");
      console.log("hosts", hosts, this.hostnames);

      fs.writeFile(this.mdns_hosts, hosts, (err) => {
        if (err) {
          console.error(err);
          throw Error("Cannot write file ! ");
        }
      });
    } else {
      hosts = fs.readFileSync(this.mdns_hosts, {
        encoding: "utf-8",
      });
      try {
        this.hostnames = hosts
          .split("\n")
          .map((name) => name.replace(/\#.*/, "")) // Remove comments
          .map((name) => name.trim()) // Trim lines
          .filter((name) => name.length > 0); // Remove empty lines
      } catch (e) {
        console.debug(e);
        throw "File poorly formated or incompatible !! :";
      }
    }
    console.log("HOST NAMES ", this.hostnames);

    console.log("looking for hostnames:", this.hostnames.join(", "));
    this.all_ips = getMyIp();
    setInterval(getMyIp, this.interval * 1000);
    // Wait and respond to queries
    this.all_ips.forEach((ip) => {
      console.log("wait on ip :", ip);
      mdns.on("query", (query) => {
        console.log("got a query packet:", query);

        if (query.questions[0] && query.questions[0].type === "A") {
          const name = query.questions[0].name;

          if (this.hostnames.indexOf(name) >= 0) {
            console.log(name, " => ", ip);
            mdns.respond([
              {
                name: name,
                type: "A",
                data: ip,
                ttl: 120,
              },
            ]); // Seconds
          }
        }
      });
    });
  }

  /**
   * Listen to the network for hostnames
   * @return {EventEmitter}
   */
  listen() {
    mdns.on("response", (response) => {
      //   console.log("Response found ! ", response.answers);
      this.hostnames.forEach((hostname) => {
        let findHost = response.answers.filter((answer) => {
          return (
            answer.name === "_" + hostname + "._tcp.local" ||
            answer.name === "_" + hostname + "._udp.local"
          );
        });
        if (findHost !== undefined) {
          let find = response.answers.find((answer) => {
            return (
              (answer.name === "_" + hostname + "._tcp.local" ||
                answer.name === "_" + hostname + "._udp.local") &&
              answer.type === "TXT"
            );
          });
          if (find !== undefined) {
            let deviceData = find.data;
            let object = {};
            object[hostname] = {};
            deviceData.forEach((buffer) => {
              let elem = buffer.toString("utf8").split("=");
              object[hostname][elem[0]] = elem[1];
            });
            this.myEvent.emit("new_hostname", object);
          }
        }
      });
    });
    return this.myEvent;
  }

  /**
   * Stop listening and kills the emmiter
   */
  stop() {
    this.overall_found = {};
    // fix mdns undefined sometimes
    if (mdns && mdns.removeAllListeners instanceof Function) {
      mdns.removeAllListeners();
    }
    // fix myEvent undefined
    if (this.myEvent && this.myEvent.removeAllListeners instanceof Function) {
      this.myEvent.removeAllListeners();
    }
  }
}
module.exports = Core;
