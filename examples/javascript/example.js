import { Core } from "mdns-listener-advanced";

const mdns = new Core(['MyDevice2'],null,{
  debug:false
});
const event = mdns.listen();
event.on('response', (found_hostnames) => {
  console.log('found_hostnames', found_hostnames);
  // mdns.stop();
});
event.on('error', (error) => {
  console.log('error', error);
  // mdns.stop();
});
