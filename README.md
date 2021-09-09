@alqatech/node-apn-http2
==============

[![Current Version](https://img.shields.io/npm/v/@vlasky/node-apn-http2.svg?style=flat-square)](https://www.npmjs.org/package/@vlasky/node-apn-http2)

> A Node.js module for interfacing with the Apple Push Notification service using *NATIVE* node.js http2 API (requires node v10+)

This package is supposed to be drop-in compatible with [node-apn](https://github.com/node-apn/node-apn), however, only token based credentials are supported (p8).

### Installation

[yarn](https://yarnpkg.com) is the preferred installation method:

```bash
$ yarn add @alqatech/node-apn-http2
```

```bash
$ npm install @alqatech/node-apn-http2
```

### Load in the module

```javascript
var apn = require('@alqatech/node-apn-http2');
```

```javascript
var options = {
  token: {
    key: "path/to/APNsAuthKey_XXXXXXXXXX.p8",
    keyId: "key-id",
    teamId: "developer-team-id"
  },
  production: false,
  pingInterval: 500000, // Change Ping time according to your environment 
                        // Apple may stop responding if Ping interval is too high 
  hideExperimentalHttp2Warning: true // the http2 module in node is experimental and will log 
                                     // ExperimentalWarning: The http2 module is an experimental API. 
                                     // to the console unless this is set to true
};

var apnProvider = new apn.Provider(options);
```

By default, the provider will connect to the sandbox unless the environment variable `NODE_ENV=production` is set.

### Sending a notification
To send a notification you will first need a device token from your app as a string

```javascript
let deviceToken = "a9d0ed10e9cfd022a61cb08753f49c5a0b0dfb383697bf9f9d750a1003da19c7"
```

```javascript
var note = new apn.Notification();

note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
note.badge = 3;
note.sound = "ping.aiff";
note.alert = "\uD83D\uDCE7 \u2709 You have a new message";
note.payload = {'messageFrom': 'John Appleseed'};
note.topic = "<your-app-bundle-id>";
```

Send the notification to the API with `send`, which returns a promise.

```javascript
apnProvider.send(note, deviceToken).then( (result) => {
  // see documentation for an explanation of result
});
```

This will result in the the following notification payload being sent to the device

```json
{"messageFrom":"John Appleseed","aps":{"badge":3,"sound":"ping.aiff","alert":"\uD83D\uDCE7 \u2709 You have a new message"}}
```

You should only create one `Provider` per-process for each certificate/key pair you have. You do not need to create a new `Provider` for each notification. If you are only sending notifications to one app then there is no need for more than one `Provider`. 

If you are constantly creating `Provider` instances in your app, make sure to call `Provider.shutdown()` when you are done with each provider to release its resources and memory. 

## Troubleshooting

You are encouraged to read the extremely informative [Troubleshooting Push Notifications](http://developer.apple.com/library/ios/#technotes/tn2265/_index.html) Tech Note in the first instance, in case your query is answered there.

## History

### v1.2.3

- Ping Interval time is now configurable to avoid connection lost 

### v1.2.2

- Updated dependencies jsonwebtoken to version 8.5.1 and typescript to version 4.2.4

### v1.2.1

Peter Verhage's enhancements:

- Sends an HTTP/2 ping to the APN gateway every 10 minutes to ensure the active session is still open. If not, it will attempt to reconnect.
- Ensures that we are connected before creating requests. This avoids creating excessive listeners.

Vlad Lasky's enhancements:

- Added support for the `apns-push-type` attribute, now required for iOS 13.
- The `apns-priority` attribute value is now correctly set.

### v1.2.0

- return potential error response body as object instead of string (fixes #4) 

### v1.1.0

- add option to hide "ExperimentalWarning: The http2 module is an experimental API." message

### v1.0.1

- fix base64 encoded p8 token string not being correctly identified as a string

### v1.0.0

- returned promise from `.send()` is now compatible with the one that `node-apn` normally returned
