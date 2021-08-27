import { APNNotification } from './APNNotification';
import { AuthToken } from './Token';
import { TokenOptions } from './TokenOptions';
import { Http2Session, ClientHttp2Session } from 'http2';

// workaround to disable experimental http2 warning via options below
import * as http2Type from 'http2';
var http2: typeof http2Type; 
// end workaround

export interface APNProviderOptions {
  token: TokenOptions,
  production?: boolean,
  hideExperimentalHttp2Warning?: boolean,
  requestTimeout?: number,
  pingInterval?: number,
}

export interface APNSendResult {
  sent: Array<string>,
  failed: Array<{
    device: string,
    status?: string,
    response?: any,
    error?: any
  }>
}

interface APNPostRequestResult {
  status?: string, 
  body?: string, 
  device?: string, 
  error?: Error 
}

let AuthorityAddress = {
  production: "https://api.push.apple.com:443",
  development: "https://api.development.push.apple.com:443"
};

export class APNPushProvider {
  private authToken: AuthToken;
  private session: ClientHttp2Session;
  private _lastToken: string;
  private _lastTokenTime: number;
  private _pingInterval;
  
  constructor(private options: APNProviderOptions) {
    this.authToken = new AuthToken(options.token);
    if (typeof options.production == 'undefined' || options.production === null) {
      options.production = process.env.NODE_ENV === "production";
    }
    
    if (typeof options.requestTimeout == 'undefined' || options.requestTimeout === null) {
      options.requestTimeout = 10000;
    }

    if (typeof options.pingInterval == 'undefined' || options.pingInterval === null) {
      options.pingInterval = 200000;
    }

    // workaround to disable experimental http2 warning via options
    if (options.hideExperimentalHttp2Warning) {
      let _emitWarning = process.emitWarning;
      process.emitWarning = () => {};
      try {
        http2 = require('http2');
      } finally {
        process.emitWarning = _emitWarning;
      }
    } else {
      http2 = require('http2');
    }
    // end workaround
  }

  private ensureConnected(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.session || this.session.destroyed) {
        this.session = http2.connect(this.options.production ? AuthorityAddress.production : AuthorityAddress.development);
        
        // set default error handler, else the emitter will throw an error that the error event is not handled
        this.session.on('error', (err) => {
          // if the error happens during a request, the request will receive the error as well
          // otherwise the connection will be destroyed and will be reopened the next time this
          // method is called
        });
        
        this.session.on('close', (err) => {
          clearInterval(this._pingInterval);
          this._pingInterval = null;
        });      
  
        this._pingInterval = setInterval(() => {
          this.ping();
        }, this.options.pingInterval); // every 10m
      }
      
      if (this.session.connecting) {
        this.session.on('connect', resolve);
        this.session.on('error', reject); // will only fire if resolve was never called
      } else {
        resolve();
      }      
    });
  }
  
  private ping() {
    if (this.session && !this.session.destroyed) {
      this.session.ping(null, (err, duration, payload) => {
        if (err) {
          this.ensureConnected();
        }
      });
    }
  }

  private getAuthToken() {
    // return the same token for 3000 seconds
    if (this._lastTokenTime > Date.now() - 3000 * 1000) {
      return this._lastToken;
    }
    this._lastTokenTime = Date.now();
    this._lastToken = this.authToken.generate();
    return this._lastToken;
  }

  send(notification: APNNotification, deviceTokens: string[] | string): Promise<APNSendResult> {

    let authToken = this.getAuthToken();
    
    return this.ensureConnected().then(() => {
      return this.allPostRequests(authToken, notification, deviceTokens);
    }).then(results => {
      let sent = results.filter(res => res.status === "200").map(res => res.device);
      let failed = results.filter(res => res.status !== "200").map(res => {
        if (res.error) return { device: res.device, error: res.error };
        return {
          device: res.device,
          status: res.status,
          response: JSON.parse(res.body)
        }
      });
      return { sent, failed };
    });
  }
  
  private allPostRequests(authToken: string, notification: APNNotification, deviceTokens: string[] | string): Promise<Array<APNPostRequestResult>> {

    if (!Array.isArray(deviceTokens)) {
      deviceTokens = [deviceTokens];
    }

    return Promise.all(deviceTokens.map(deviceToken => {
      var headers = {
        ':method': 'POST',
        ':path': '/3/device/' + deviceToken,
        'authorization': 'bearer ' + authToken,
      };

      headers = Object.assign(headers, notification.headers());

      return this.sendPostRequest(headers, notification.compile(), deviceToken);
    }));    
  }

  private sendPostRequest(headers, payload, deviceToken): Promise<APNPostRequestResult> {
    return new Promise((resolve, reject) => {
      var req = this.session.request(headers);

      req.setEncoding('utf8');
      
      req.setTimeout(this.options.requestTimeout, () => req.close(http2.constants.NGHTTP2_CANCEL));

      req.on('response', (headers) => {
        let status = headers[http2.constants.HTTP2_HEADER_STATUS].toString();
        // ...
        let data = '';
        req.on('data', (chunk) => {
          data += chunk;
        });
        req.on('end', () => {
          resolve({ status: status, body: data, device: deviceToken });
        })
      });

      req.on('error', (err) => {
        resolve({ error: err, device: deviceToken });
      });

      req.write(payload);
      req.end();
    });
  }

  shutdown() {
    this.session.destroy();
  }
}
