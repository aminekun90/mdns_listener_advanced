# mDNS Listener Advanced

Simple mDNS Listener to add and listen .local hostnames in your network compatible with zeroconf, bonjour, avahi

This script is tested on Windows 10, linux and mac os.

This code is fully compatible with https://github.com/aminekun90/python_zeroconf_publisher you broadcast your device as you like with additional data

Note: Core code credits goes to @Richie765 : https://github.com/Richie765/mdns-listener upgraded and edited to be compatible with a python publisher by @aminekun90

## Installation

`npm install mdns-listener-advanced`

## Configuration

### Method 1

Provide hostnames list in the constructor like this :

```javascript
const advanced_mdns = require("mdns-listener-advanced");
let mdns = new advanced_mdns(["myhost1", "myhost2"]);
```

The file `.mdns-hosts` is created automatically.

### Method 2

Add and Edit the file named `.mdns-hosts`, this file must be in your HOME directory for windows `[HDD]:\Users\<username>\.mdns-hosts` and for linux `~/.mdns-hosts`, place hostnames ending on separate lines like so:

```
myhost1
myhost2
```

You can specify the hostnames that you want to detect !

Whenever you change this file, you should restart the service.

## Usage

You can use the function `mdns.listen()` like this:

- Start listening

```javascript
const advanced_mdns = require("mdns-listener-advanced");
let mdns = new advanced_mdns();
// If you don't have the file already created provide the hosts-----------------
// let mdns = new advanced_mdns(['myhost1.local','myhost2.local']);          // |
//------------------------------------------------------------------------------
// mdns.initialize(); // deprecated
//------------------------------------------------------------------------------
mdns.listen().on("response", (found_hostnames) => {
  console.log("found_hostnames", found_hostnames);
  // -- MORE CODE Here !

  // --!
});
```

- Stop Listening

```javascript
mdns.stop();
```

### Details :

| Functions                              | Params           | Type                | Description                                                                                  |
| -------------------------------------- | ---------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `new advanced_mdns(1)`                 | list_hosts       | `Array<string>`     | List of hostnames                                                                            |
| `new advanced_mdns(,2)`                | usePath          | `boolean`           | Force use of path instead of provided list                                                   |
| `new advanced_mdns(...,3)`             | mdns_hosts_path  | `string`            | Full path of your .mdns-hosts                                                                |
| `new advanced_mdns(...,4)`             | refresh_interval | `number`            | Not used                                                                                     |
| `.listen().on(event,callback(object))` | event            | `string`            | To catch a response event when set to `"response"`<br/> or error event when set to `"error"` |
|                                        | callback         | `function(object)`  | callback to do custome code                                                                  |
|                                        | object           | `object` or `Error` | a received object i.e `{MyDevice1:{...}}` or Error object containing a message               |
| `.stop()`                              |                  |                     | to stop the event listener                                                                   |

### Todo :

(Nothing for now)

## known / reported issues :

- [x] Not detecting avahi, zeroconf launched in the same machine (fixed)
