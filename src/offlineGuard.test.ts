/// <reference types="node" />
import { describe, expect, it } from "vitest";
import net from "node:net";
import http from "node:http";
import https from "node:https";

describe("Offline test safety guard", () => {
  it("blocks unstubbed fetch", () => {
    expect(() => fetch("https://fixture.invalid")).toThrow("OFFLINE_GUARD");
  });
  it("blocks raw sockets and HTTP clients before any connection", () => {
    expect(() => new net.Socket().connect(443, "fixture.invalid")).toThrow("OFFLINE_GUARD");
    expect(() => http.get("http://fixture.invalid")).toThrow("OFFLINE_GUARD");
    expect(() => https.get("https://fixture.invalid")).toThrow("OFFLINE_GUARD");
  });
  it("blocks listeners", () => {
    expect(() => net.createServer().listen(0)).toThrow("OFFLINE_GUARD");
  });
});
