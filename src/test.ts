import { Core } from "@mdns-listener/Core";

const mdns = new Core(['MyDevice2'],null,{debug:true});
const event = mdns.listen();
event.on('response', (found_hostnames:any) => {
  mdns.info('found_hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on('error', (error:any) => {
  mdns.info('error', error);
  // mdns.stop();// To stop the listener
});