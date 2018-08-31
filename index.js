'use strict';
const advanced_mdns = require('./mdns-listener');


advanced_mdns.listen().on('new_hostname', (found_hostnames) => {
    console.log('found_hostnames', found_hostnames)
});