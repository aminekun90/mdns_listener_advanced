const advanced_mdns = require("./index");
let mdns = new advanced_mdns(null);
// mdns.initialize(); // deprecated
mdns.listen().on("response", (found_hostnames) => {
  console.log("found_hostnames", found_hostnames);
  mdns.stop();
});
