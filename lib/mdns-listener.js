#!/usr/bin/env node --use_strict

"use strict";
const mdns = require("multicast-dns")();
const os = require("os");
const fs = require("fs");
const { EventEmitter } = require("events");

class Core {
  /**
   * Constructor
   * @param {Array<string>} list_hosts List of hosts to find ['myhost1','myhost2']
   * @param {boolean} usePath List of hosts to find ['myhost1','myhost2']
   * @param {string} mdns_hosts_path .mdns-hosts file path if not provided will be created in HOME directory
   * @public
   */
  constructor(list_hosts = [], mdns_hosts_path) {
    this.hostnames = list_hosts;
    this.mdns_hosts_file = mdns_hosts_path;

    this.overall_found = {};
    this.myEvent = new EventEmitter();
    this.__initialize();
  }

  /**
   * Initialize mdns
   * @private
   */
  __initialize() {
    try {
      this.hostnames = this.__getHosts()
        .split("\n")
        .map((name) => name.replace(/\#.*/, "")) // Remove comments
        .map((name) => name.trim()) // Trim lines
        .filter((name) => name.length > 0); // Remove empty lines
    } catch (e) {
      console.debug(e);
      this.error = true;
    }
  }

  /**
   * Get Hosts and validate constructor params
   * @return {string}
   * @private
   */
  __getHosts() {
    if (this.mdns_hosts_file && fs.existsSync(this.mdns_hosts_file)) {
      return fs.readFileSync(this.mdns_hosts_file, {
        encoding: "utf-8",
      });
    } else if (this.hostnames && this.hostnames.length) {
      return this.hostnames && this.hostnames.join("\r\n");
    } else {
      this.mdns_hosts_file = os.platform().startsWith("win")
        ? process.env.HOMEPATH + "\\" + ".mdns-hosts"
        : process.env.HOME + "/" + ".mdns-hosts";
      if (fs.existsSync(this.mdns_hosts_file)) {
        return this.__getHosts();
      }
      throw "Provide hostnames or path to hostnames !";
    }
  }

  /**
   * Get Current Device IP
   * Not used For this version 2.3.1
   * @return {Array<string>}
   * @private
   */
  __getMyIp() {
    let all_ips = [];
    let ifaces = os.networkInterfaces();
    Object.keys(ifaces).forEach(function (ifname) {
      ifaces[ifname].forEach(function (iface) {
        if ("IPv4" !== iface.family || iface.internal !== false) {
          // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
          return;
        }
        if (all_ips.find((thisip) => thisip === iface.address) !== undefined) {
          all_ips.push(iface.address);
        }
      });
    });
    return all_ips;
  }
  /**
   * Listen to the network for hostnames
   * @return {EventEmitter}
   * @public
   */
  listen() {
    if (this.error) {
      this.myEvent.emit(
        "exception",
        new Error("An error occured while initializing mdns advanced")
      );
      return this.myEvent;
    }
    console.log("Looking for hostnames...", this.hostnames);
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
            this.myEvent.emit("response", object);
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
  stop() {
    console.log("Stopping mdns listener...");
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
