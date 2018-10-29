'use strict';

var expect = require('chai').expect;
var mdnsListner = require('../index');
const EventEmitter = require('events');

describe('#Listen', function () {
    it('should return an event emmiter', function () {
        let mdns = new mdnsListner();
        var result = mdns.listen();
        expect(result).to.instanceOf(EventEmitter);
    });
});