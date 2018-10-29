const advanced_mdns = require('./index');
let mdns = new advanced_mdns(['_Gymix-player._tcp.local', '_vqpass._tcp.local']);
// mdns.initialize(); // deprecated
mdns.listen().on('new_hostname', (found_hostnames) => {
    console.log('found_hostnames', found_hostnames)
});