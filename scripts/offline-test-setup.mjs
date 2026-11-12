import { beforeEach } from "vitest";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";

const blocked = () => { throw new Error("OFFLINE_GUARD: network/listeners forbidden; use an explicit mock"); };
net.Socket.prototype.connect = blocked;
net.Server.prototype.listen = blocked;
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
tls.connect = blocked;
dgram.createSocket = blocked;
dns.lookup = blocked;
dns.resolve = blocked;
beforeEach(() => {
  globalThis.fetch = blocked;
  globalThis.EventSource = class { constructor() { blocked(); } };
  globalThis.XMLHttpRequest = class { constructor() { blocked(); } };
});
