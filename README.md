# mDNS Listener Advanced Typescript Implementation v3.0.0

Advanced mDNS Listener to add and listen .local hostnames in your network compatible with zeroconf, bonjour, avahi
 
**:warning: Major update :** This script is not tested yet currentely in dev on Mac OS 12.6 

I recommand using python publisher https://github.com/aminekun90/python_zeroconf_publisher since this code is fully compatible with it, if you dont have access to it you can contact me further bellow ;) I can make you an offer.

Note: The original idea was from @Richie765 https://github.com/Richie765/mdns-listener and got updated and enhanced, few parts of the original code still exist, recently updated to typescript.

## Installation

`npm install mdns-listener-advanced`

## Configuration

TBD

## Usage

**TBD**
### Details :

**TBD**

**Deprecated since version 3.0.0**

| Functions                               | Params          | Type               | Description                                        |
| --------------------------------------- | --------------- | ------------------ | -------------------------------------------------- |
| `new advanced_mdns(list_hosts)`         | list_hosts      | `Array<string>`    | List of hostnames                                  |
| `new advanced_mdns(..,mdns_hosts_path)` | mdns_hosts_path | `string`           | Full path of your .mdns-hosts                      |
| `.listen().on(event,callback(object))`  | event           | `string`           | To catch a response event when set to `"response"` |
|                                         | callback        | `function(object)` | callback to do custome code                        |
|                                         | object          | `object`           | a received object i.e `{MyDevice1:{...}}`          |
| `.stop()`                               |                 |                    | to stop the event listener                         |

### Debug :

**TBD**

## known / reported issues :

**TBD**

## Want to contribute or have any suggestions or questions:

Contact me on Linkedin [Here](https://www.linkedin.com/in/amine-bouzahar/).
