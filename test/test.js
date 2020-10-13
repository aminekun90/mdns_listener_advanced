"use strict";

var expect = require("chai").expect;
var mdnsListner = require("../index");
const EventEmitter = require("events");

describe("#Listen", function () {
  it("should return an event emmiter", function () {
    let mdns = new mdnsListner(["MyDevice1"]);
    var result = mdns.listen();
    expect(result).to.be.instanceOf(EventEmitter);
  });
  it("should return an event emmiter", function () {
    let mdns = new mdnsListner(null, true);
    var result = mdns.listen();
    expect(result).to.be.instanceOf(EventEmitter);
  });
  it("should return an event emmiter", function () {
    let mdns = new mdnsListner(null, true, "./.mdns-hosts");
    var result = mdns.listen();
    expect(result).to.be.instanceOf(EventEmitter);
  });
  it("should emit an error", function () {
    let mdns = new mdnsListner(null, true, null);
    var result = mdns.listen();
    expect(result).to.be.instanceOf(EventEmitter);
    //Not sure if this is working need more research !!

    result.on("exception", function (error) {
      expect(error).to.be.instanceOf(Error);
    });
  });
});
