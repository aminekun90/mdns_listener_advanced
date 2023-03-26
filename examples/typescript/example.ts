import { Core } from "mdns-listener-advanced";
const mdns = new Core(['MyDevice2']);
const event = mdns.listen();
event.on('response', (found_hostnames:any) => {
  console.log('found_hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on('error', (error:any) => {
  console.log('error', error);
  // mdns.stop();// To stop the listener
});