# mDNS Listener Advanced
 
[![npm package](https://img.shields.io/badge/npm%20i-mdns--listener--advanced-brightgreen)](https://www.npmjs.com/package/mdns-listener-advanced) [![version number](https://img.shields.io/npm/v/mdns-listener-advanced?color=green&label=version)](https://github.com/aminekun90/mdns_listener_advanced/releases) [![Actions Status](https://github.com/aminekun90/mdns_listener_advanced/workflows/Test/badge.svg)](https://github.com/aminekun90/mdns_listener_advanced/actions) [![License](https://img.shields.io/github/license/aminekun90/mdns_listener_advanced)](https://github.com/aminekun90/mdns_listener_advanced/blob/master/LICENSE)

[![Release & Publish](https://github.com/aminekun90/mdns_listener_advanced/actions/workflows/publish.yml/badge.svg?branch=master)](https://github.com/aminekun90/mdns_listener_advanced/actions/workflows/publish.yml)

**:warning: This is a Major update** Since version 3.0.0 this package is using a Typescript Implementation and it is fully tested on Mac OS 13.2 and windows 11 and ubuntu
If you have any issue feel free to open an issue [here](https://github.com/aminekun90/mdns_listener_advanced/issues) 

Advanced mDNS Listener to add and listen .local hostnames in your network compatible with zeroconf, bonjour, avahi

I recommand using this python publisher https://github.com/aminekun90/python_zeroconf_publisher since this code is fully compatible with it, if you dont have access to it you can contact me further bellow :wink: I can make you an offer.

- **Note that `mdns-listener-advanced` includes a bonjour publisher since `version 3.1.0`**

Note: The original idea was from @Richie765 https://github.com/Richie765/mdns-listener and got updated and enhanced, few parts of the original code still exist, and since version 3.0.0 it updated to typescript.

## Installation
`npm install mdns-listener-advanced`
## Usage

![JS](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E)

Fully tested on windows 11, ubuntu 18 and Mac OS 13.

```javascript
var mdnsListenerAdvanced = require("mdns-listener-advanced");
const mdns = new mdnsListenerAdvanced.Core(['MyDevice2']);
const event = mdns.listen();
event.on('response', (found_hostnames) => {
  console.log('found_hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on('error', (error) => {
  console.log('error', error);
  // mdns.stop();// To stop the listener
});

```
**:white_check_mark: Fully tested**

![ts](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white) 

```typescript
import { Core } from "mdns-listener-advanced";
const mdns = new Core(['MyDevice2']);
const event = mdns.listen();
event.on('response', (found_hostnames) => {
  console.log('found_hostnames', found_hostnames);
  // mdns.stop();// To stop the listener
});
event.on('error', (error) => {
  console.log('error', error);
  // mdns.stop();// To stop the listener
});

```

- To Stop listening to the event use :

```javascript
mdns.stop();
```

## Configuration

### Method 1
Provide hostnames list in the constructor like this :

```javascript
var mdnsListenerAdvanced = require("mdns-listener-advanced");
const mdns = new mdnsListenerAdvanced.Core(['MyDevice1','MyDevice2']);
```
The file .mdns-hosts is created automatically.

#### Method 2
Add and Edit the file named .mdns-hosts, this file must be in your HOME directory for windows ``[HDD]:\Users\<username>\.mdns-hosts`` and for linux/Mac ``~/.mdns-hosts``, place hostnames ending on separate lines like so:
```
myhost1
myhost2
```
You can specify the hostnames that you want to detect !

Whenever you change this file, you should restart the service.

### Publish and Unpublish a hostname

To publish a hostname you can use this example :

```typescript
import { Core } from "mdns-listener-advanced";
const ref = "MyDevice2";
const mdns = new Core();
mdns.publish(ref);
mdns.unpublishAll();// You can unpublish using this function
```

Output:

```bash
ℹ️ MDNS ADVANCED A hostname have been published with options {
  port: 3000,
  name: 'MyDevice2',
  type: 'TXT',
  txt: {
    id: '"510f56fb-cb61-45d6-8e01-be4ed49405bb"',
    ipv4: '"192.168.2.11"'
  }
}
```
Note that a warning will appear if you initialise the Core of mdns-listener-advanced without provifing a hosname list or .hostnames file path.

```bash
⚠️ MDNS ADVANCED Hostnames or path to hostnames is not provided, listening to a host is compromised!
```

- At the moment you cannot unpublish services undividually or by hostname and there might be a way using the included bonjour library.
### Details :

| Functions                                      | Params          | Type               | Description                                        |
|------------------------------------------------|-----------------|--------------------|----------------------------------------------------|
| `new mdnsListenerAdvanced.Core(['MyDevice2']);`| hostsList       | `Array<string>`    | List of hostnames                                  |
| `new advanced_mdns(..,mdnsHostsPath)`          | mdnsHostsPath   | `string`           | Full path of your .mdns-hosts  (not available)     |
| `new advanced_mdns(..,..,options)`             | options         | `{debug:boolean}`  | Enable debug                                       |
| `.listen().on(event,callback(object))`         | event           | `string`           | To catch a response event when set to `"response"` |
|                                                | callback        | `function(object)` | callback to do custome code                        |
|                                                | object          | `object`           | a received object i.e `{MyDevice1:{...}}`          |
| `.stop()`                                      |                 |                    | to stop the event listener                         |
| `.publish(hostname)`                           | hostname        | `string`           | to publish an mdns host protocol                   |
| `.unpublishAll()`                              |                 |                    | to unpublish all mdns host protocol                |

## known / reported issues :

- Issue on version 3.0.9 module not found (Fixed since 3.0.11)
- Keeping eye on some Security issues ( will be patched when patched new version of those packages is available): 
  - <span style="color:red;">Prototype Pollution in lodash **Critical** : Will not fix because lodash team are stuborn and insist that [npm audit is broken](https://github.com/gulpjs/gulp/issues/2201#issuecomment-401614368)</span>
  - glob-parent before 5.1.2 vulnerable to Regular Expression Denial of Service in enclosure regex High (Fixed)
  - yargs-parser Vulnerable to Prototype Pollution Moderate (Fixed)
  - Memory Exposure in concat-stream Moderate (Fixed)
  - Regular Expression Denial of Service (ReDoS) in braces Low (Fixed)
  - Regular Expression Denial of Service in braces Low (Fixed)

#### Want to contribute or have any suggestions or questions?

Contact me on Linkedin [Here](https://www.linkedin.com/in/amine-bouzahar/).
