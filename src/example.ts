import { Core } from "./Core";
const ref = "MyDevice2";
const mdns = new Core([ref], null, {
  debug: false
});

const event = mdns.listen();
mdns.publish(ref);
event.on('response', (found_hostnames: any) => {
  mdns.info('found_hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on('error', (error: any) => {
  mdns.info('error', error);
  // mdns.stop();// To stop the listener
});