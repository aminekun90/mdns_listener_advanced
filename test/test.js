'use strict';

var expect = require('chai').expect;
var mdnsListner = require('../index');
const EventEmitter = require('events');

describe('#Listen', function () {
    it('should return an event emmiter', function () {
        var result = mdnsListner.listen();
        expect(result).to.instanceOf(EventEmitter);
    });
});