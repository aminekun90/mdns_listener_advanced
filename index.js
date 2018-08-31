const advanced_mdns = require('./mdns-listener');


advanced_mdns.getAllHostnames().on('new_hostname', (found_hostnames) => {
    console.log('found_hostnames', found_hostnames)
});