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
mdns.listen().on("new_hostname", (found_hostnames) => {
  console.log("found_hostnames", found_hostnames);
  // -- MORE CODE Here !

  // --!
});
```

- Stop Listening

```javascript
mdns.stop();
```

<!-- ## Autmatic startup on login (macOS)

```bash
cp mdns-listener.plist-sample mdns-listener.plist

# edit mdns-listener.plist to match the paths on your system

cp mdns-listener.plist ~/Library/LaunchAgents/

launchctl load ~/Library/LaunchAgents/mdns-listener.plist
```

Logfiles are available in

- /tmp/mdns-listener-error.log
- /tmp/mdns-listener.log -->

### Todo :

- [ ] Remove a hostname if it's not available anymore
<!-- - [ ] Automatic startup on login (Windows) -->

## SOME NOTES

Some notes that may be useful when changing the script.

QUERY from macOS

```javascript
{ id: 0,
  type: 'query',
  flags: 0,
  questions:
   [ { name: 'myhost.local', type: 'A', class: 1 },
     { name: 'myhost.local', type: 'AAAA', class: 1 } ],
  answers: [],
  authorities: [],
  additionals: [] }
```

RESPONSE from macOS

```javascript
{ id: 0,
  type: 'response',
  flags: 1024,
  questions: [],
  answers:
   [ { name: 'myhost.local',
       type: 'AAAA',
       class: 1,
       ttl: 120,
       flush: true,
       data: 'fe80::xxxx:xxxx:xxxx:xxxx' },
     { name: 'myhost.local',
       type: 'A',
       class: 1,
       ttl: 120,
       flush: true,
       data: '192.168.0.10' } ],
  authorities: [],
  additionals:
   [ { name: 'myhost.local',
       type: 'NSEC',
       class: 1,
       ttl: 120,
       flush: true,
       data: <Buffer ....> } ] }
```

RESPONSE from this script

```javascript
{ id: 0,
  type: 'response',
  flags: 0,
  questions: [],
  answers:
   [ { name: 'myhost.local',
       type: 'A',
       class: 1,
       ttl: 0,
       flush: false,
       data: '192.168.0.10' } ],
  authorities: [],
  additionals: [] }
```

## Next feature

- custom type

## known / reported issues :

- [x] Not detecting avahi, zeroconf launched in the same machine (fixed)
