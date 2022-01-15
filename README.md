# mDNS Listener Advanced

Simple mDNS Listener to add and listen .local hostnames in your network compatible with zeroconf, bonjour, avahi

This script is tested on Windows 10, linux and mac os.

I recommand using python publisher https://github.com/aminekun90/python_zeroconf_publisher since this code is fully compatible with it, if you dont have access to it you can contact me further bellow ;) I can make you an offer.

Note: The original idea was from @Richie765 https://github.com/Richie765/mdns-listener and got updated and enhanced, few parts of the original code still exist.

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
  // mdns.stop(); // you can stop as soon as you find something or leave it runing forever
  // --!
});
```

- Stop Listening

```javascript
mdns.stop();
```

### Details :

| Functions                               | Params          | Type               | Description                                        |
| --------------------------------------- | --------------- | ------------------ | -------------------------------------------------- |
| `new advanced_mdns(list_hosts)`         | list_hosts      | `Array<string>`    | List of hostnames                                  |
| `new advanced_mdns(..,mdns_hosts_path)` | mdns_hosts_path | `string`           | Full path of your .mdns-hosts                      |
| `.listen().on(event,callback(object))`  | event           | `string`           | To catch a response event when set to `"response"` |
|                                         | callback        | `function(object)` | callback to do custome code                        |
|                                         | object          | `object`           | a received object i.e `{MyDevice1:{...}}`          |
| `.stop()`                               |                 |                    | to stop the event listener                         |

### Debug :

If an error occured while initializing the mdns advanced you can open an issue on our github and help us to solve the issue by joining the logs by adding an option param :

```javascript
const advanced_mdns = require("mdns-listener-advanced");
let mdns = new advanced_mdns();
let options = {
  debug:true
};
mdns.listen().on("response", (found_hostnames,false,options) => {
  console.log("found_hostnames", found_hostnames);
  mdns.stop();
});
```

## known / reported issues :

- [x] Not detecting avahi, zeroconf launched in the same machine (fixed)
- [x] The method initialize() does not exist anymore since 2.4.3 (wont-fix)

## Want to contribute or have any suggestions or questions:

Contact me on Linkedin [Here](https://www.linkedin.com/in/mohamed-amine-b-377aa3b8/).

## Buy me a coffee :

Paypal : [HERE](https://www.paypal.me/aminebouzahar)
