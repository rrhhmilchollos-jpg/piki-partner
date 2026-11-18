/// <reference types="node" />
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import type { Context } from "node:vm";
import { build as viteBuild } from "vite";
import { beforeAll, describe, expect, it, vi } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeEntry = fileURLToPath(new URL("./legacyRuntime.ts", import.meta.url));
// An absolute, plugin-only entry; no fixture file is created on disk.
const smokeEntry = fileURLToPath(new URL("./__legacyRuntimeSmoke.virtual.ts", import.meta.url));
const smokeModule = `
  import ${JSON.stringify(runtimeEntry)};
  export { default as PartnerOnboarding } from ${JSON.stringify(fileURLToPath(new URL("./PartnerOnboarding.tsx", import.meta.url)))};
  export { allergenCodeFor, normalizeAllergenValues } from ${JSON.stringify(fileURLToPath(new URL("./allergenCatalog.ts", import.meta.url)))};
`;
let runtimeCode: string;
let smokeCode: string;

async function bundle(entry: string, envDir: string): Promise<string> {
  const result = await viteBuild({
    root: projectRoot,
    // Never inherit release plugins or read the project's environment files.
    configFile: false,
    envDir,
    logLevel: "silent",
    // Library builds preserve this expression; use a literal, not host env.
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: entry === smokeEntry ? [{
      name: "legacy-runtime-offline-smoke",
      resolveId(id) { return id === smokeEntry ? `\0${smokeEntry}` : undefined; },
      load(id) { return id === `\0${smokeEntry}` ? smokeModule : undefined; },
    }] : [],
    build: {
      write: false,
      minify: false,
      target: "chrome62",
      lib: { entry, formats: ["iife"], name: entry === smokeEntry ? "LegacyRuntimeSmoke" : "LegacyRuntimeTest" },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  if (outputs.length !== 1 || !("output" in outputs[0])) {
    throw new Error("Expected a single in-memory IIFE build");
  }
  const chunk = outputs[0].output.find(output => output.type === "chunk" && output.isEntry);
  if (!chunk || chunk.type !== "chunk") throw new Error("Missing executable IIFE entry");
  return chunk.code;
}

beforeAll(async () => {
  // This directory stays empty: both builds are offline and write no artifacts.
  const emptyEnvDir = await mkdtemp(`${tmpdir()}/piki-legacy-runtime-env-`);
  try {
    runtimeCode = await bundle(runtimeEntry, emptyEnvDir);
    smokeCode = await bundle(smokeEntry, emptyEnvDir);
  } finally {
    await rm(emptyEnvDir, { recursive: true, force: true });
  }
}, 30_000);

function evaluate(context: Context, source: string) {
  return runInContext(source, context, { timeout: 2_000 });
}

function browser(nativeConstructors: Record<string, unknown> = {}) {
  const fetch = Object.assign(vi.fn(function fixtureFetch() {
    throw new Error("Offline fixture: fetch must not be called");
  }), { transportSentinel: { kind: "fetch" } });
  const XMLHttpRequest = Object.assign(vi.fn(function FixtureXMLHttpRequest() {
    throw new Error("Offline fixture: XMLHttpRequest must not be constructed");
  }), { transportSentinel: { kind: "xhr" } });
  // Do not inject host Object/Array/Promise/String: their prototypes must belong
  // to the VM, otherwise deleting an API would also damage the Vitest runner.
  const context = createContext({ fetch, XMLHttpRequest });
  evaluate(context, `
    window = this;
    self = this;
    Object.fromEntries = undefined;
    Array.prototype.flat = undefined;
    Array.prototype.flatMap = undefined;
    Promise.prototype.finally = undefined;
    String.prototype.trimStart = undefined;
    String.prototype.trimEnd = undefined;
    AbortController = undefined;
    AbortSignal = undefined;
    globalThis = undefined;
  `);
  Object.assign(context, nativeConstructors);
  return { context, fetch, XMLHttpRequest };
}

function boot(nativeConstructors: Record<string, unknown> = {}) {
  const fixture = browser(nativeConstructors);
  evaluate(fixture.context, runtimeCode);
  return fixture;
}

function expectUntouchedTransports(fixture: ReturnType<typeof browser>) {
  expect(evaluate(fixture.context, "fetch")).toBe(fixture.fetch);
  expect(evaluate(fixture.context, "XMLHttpRequest")).toBe(fixture.XMLHttpRequest);
  expect(evaluate(fixture.context, "fetch.transportSentinel")).toBe(fixture.fetch.transportSentinel);
  expect(evaluate(fixture.context, "XMLHttpRequest.transportSentinel")).toBe(fixture.XMLHttpRequest.transportSentinel);
  expect(fixture.fetch).not.toBe(fixture.XMLHttpRequest);
  expect(fixture.fetch).not.toHaveBeenCalled();
  expect(fixture.XMLHttpRequest).not.toHaveBeenCalled();
}

class NativeAbortSignal {
  readonly marker = "native-signal";
  aborted = false;
}
class NativeAbortController {
  readonly marker = "native-controller";
  readonly signal = new NativeAbortSignal();
  abort() { this.signal.aborted = true; }
}

const hostApis = [
  Object.fromEntries, Array.prototype.flat, Array.prototype.flatMap,
  Promise.prototype.finally, String.prototype.trimStart, String.prototype.trimEnd,
  globalThis, globalThis.AbortController, globalThis.AbortSignal,
];

describe("Legacy runtime (offline, isolated WebView-like VM)", () => {
  it("loads the runtime as the first executable line of main.tsx", async () => {
    const source = await readFile(new URL("./main.tsx", import.meta.url), "utf8");
    const firstLine = source.replace(/^\uFEFF/, "")
      .replace(/^(?:\s|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)*/, "")
      .split(/\r?\n/, 1)[0];
    expect(firstLine).toMatch(/^import\s+["']\.\/legacyRuntime["'];?\s*$/);
  });

  it("starts with missing browser APIs and restores their callable signatures", () => {
    const fixture = browser();
    expect(evaluate(fixture.context, `[
      typeof Object.fromEntries, typeof Array.prototype.flat,
      typeof Array.prototype.flatMap, typeof Promise.prototype.finally,
      typeof String.prototype.trimStart, typeof String.prototype.trimEnd,
      typeof globalThis, typeof AbortController, typeof AbortSignal
    ]`)).toEqual(Array(9).fill("undefined"));
    evaluate(fixture.context, runtimeCode);
    expect(evaluate(fixture.context, `[
      typeof Object.fromEntries, typeof Array.prototype.flat,
      typeof Array.prototype.flatMap, typeof Promise.prototype.finally,
      typeof String.prototype.trimStart, typeof String.prototype.trimEnd,
      typeof globalThis, typeof AbortController, typeof AbortSignal
    ]`)).toEqual(["function", "function", "function", "function", "function", "function", "object", "function", "function"]);
    expect(evaluate(fixture.context, `[
      Object.fromEntries.length, Array.prototype.flat.length,
      Array.prototype.flatMap.length, Promise.prototype.finally.length,
      String.prototype.trimStart.length, String.prototype.trimEnd.length
    ]`)).toEqual([1, 0, 1, 1, 0, 0]);
    expectUntouchedTransports(fixture);
  });

  it("restores globalThis as the same browser global as window and self", () => {
    const { context } = boot();
    expect(evaluate(context, `
      globalThis === this && globalThis === window && globalThis === self &&
      globalThis.Object === Object && globalThis.fetch === fetch
    `)).toBe(true);
  });

  it("creates onboarding-style fields with Object.fromEntries", () => {
    const { context } = boot();
    expect(evaluate(context, `Object.fromEntries([
      ["name", ""], ["email", ""], ["city", "Xàtiva"], ["province", "Valencia"]
    ])`)).toEqual({ name: "", email: "", city: "Xàtiva", province: "Valencia" });
  });

  it("accepts iterable entries, duplicate keys, symbols and a safe __proto__ field", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var key = Symbol("field");
      var fields = Object.fromEntries(new Map([["city", "Xàtiva"], [key, 7]]));
      var record = Object.fromEntries([["name", "old"], ["name", "new"], ["__proto__", "own-value"]]);
      return [fields.city, fields[key], record.name, record.__proto__,
        Object.getPrototypeOf(record) === Object.prototype,
        Object.prototype.hasOwnProperty.call(record, "__proto__")];
    })()`)).toEqual(["Xàtiva", 7, "new", "own-value", true, true]);
  });

  it("flattens one level by default, skips holes and leaves the source intact", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var source = [1, , [2, , [3]]];
      return [source.flat(), source.length, 1 in source, source[2].length, 1 in source[2]];
    })()`)).toEqual([[1, 2, [3]], 3, false, 3, false]);
  });

  it("honors explicit flat depths, including zero and Infinity", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var source = [1, [2, [3, [4]]]];
      return [source.flat(0), source.flat(2), source.flat(Infinity), source.flat() !== source];
    })()`)).toEqual([[1, [2, [3, [4]]]], [1, 2, 3, [4]], [1, 2, 3, 4], true]);
  });

  it("flatMap passes value/index/source and thisArg, skips holes, and flattens only once", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var source = [2, , 4];
      var receiver = { factor: 3 };
      var calls = [];
      var mapped = source.flatMap(function (value, index, array) {
        calls.push([value, index, array === source, this === receiver]);
        return [value * this.factor, [index]];
      }, receiver);
      return [mapped, calls, source];
    })()`)).toEqual([[6, [0], 12, [2]], [[2, 0, true, true], [4, 2, true, true]], [2, , 4]]);
  });

  it("trims Unicode whitespace at the requested end only", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var text = "\\u00a0\\t  PIKI  \\n\\uFEFF";
      return [text.trimStart(), text.trimEnd(), text.trimStart().trimEnd(),
        String.prototype.trimStart.call(42), String.prototype.trimEnd.call(42)];
    })()`)).toEqual(["PIKI  \n\uFEFF", "\u00a0\t  PIKI", "PIKI", "42", "42"]);
  });

  it("finally waits for cleanup, receives no arguments and preserves fulfillment", async () => {
    const { context } = boot();
    await expect(evaluate(context, `(function () {
      var order = [];
      var value = { partnerCode: "PIKI-001" };
      return Promise.resolve(value).finally(function () {
        order.push(["cleanup", arguments.length]);
        return Promise.resolve().then(function () { order.push("cleaned"); });
      }).then(function (result) {
        order.push("fulfilled");
        return [result === value, result.partnerCode, order];
      });
    })()`)).resolves.toEqual([true, "PIKI-001", [["cleanup", 0], "cleaned", "fulfilled"]]);
  });

  it("finally runs on rejection and preserves the original error identity", async () => {
    const { context } = boot();
    await expect(evaluate(context, `(function () {
      var error = new Error("request failed");
      var calls = [];
      return Promise.reject(error).finally(function () {
        calls.push(arguments.length);
        return "ignored";
      }).then(function () { return "unexpected fulfillment"; }, function (reason) {
        return [reason === error, reason.message, calls];
      });
    })()`)).resolves.toEqual([true, "request failed", [0]]);
  });

  it("finally propagates cleanup errors instead of the previous settlement", async () => {
    const { context } = boot();
    await expect(evaluate(context, `Promise.all([
      Promise.resolve("ok").finally(function () { throw new Error("cleanup threw"); })
        .catch(function (error) { return error.message; }),
      Promise.reject("original").finally(function () { return Promise.reject("cleanup rejected"); })
        .catch(function (reason) { return reason; })
    ])`)).resolves.toEqual(["cleanup threw", "cleanup rejected"]);
  });

  it("finally treats non-callable handlers as settlement passthrough", async () => {
    const { context } = boot();
    await expect(evaluate(context, `Promise.all([
      Promise.resolve(17).finally(null),
      Promise.reject("original").finally({}).catch(function (reason) { return reason; })
    ])`)).resolves.toEqual([17, "original"]);
  });

  it("creates an initially active AbortSignal with the expected methods and fields", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var controller = new AbortController();
      var signal = controller.signal;
      return [controller instanceof AbortController, signal instanceof AbortSignal,
        signal === controller.signal, signal.aborted, signal.onabort, signal.reason,
        typeof controller.abort, typeof signal.addEventListener,
        typeof signal.removeEventListener, typeof signal.dispatchEvent];
    })()`)).toEqual([true, true, true, false, null, undefined, "function", "function", "function", "function"]);
  });

  it("sets aborted and dispatches a once listener and onabort with the signal receiver", () => {
    const fixture = boot();
    expect(evaluate(fixture.context, `(function () {
      var controller = new AbortController();
      var signal = controller.signal;
      var events = [];
      var onabort = [];
      signal.addEventListener("abort", function (event) {
        events.push([event.type, this === signal, signal.aborted]);
      }, { once: true });
      signal.onabort = function (event) {
        onabort.push([event.type, this === signal, signal.aborted]);
      };
      controller.abort();
      var defaultReason = [signal.reason.name, signal.reason.message];
      signal.onabort = null;
      // Verify listener removal independently of repeated-abort semantics.
      signal.dispatchEvent({ type: "abort" });
      return [signal.aborted, events, onabort, defaultReason];
    })()`)).toEqual([true, [["abort", true, true]], [["abort", true, true]], ["AbortError", "This operation was aborted"]]);
    expectUntouchedTransports(fixture);
  });

  it("removes abort listeners and keeps a caller-provided abort reason", () => {
    const { context } = boot();
    expect(evaluate(context, `(function () {
      var controller = new AbortController();
      var calls = 0;
      var reason = new Error("cancelled locally");
      function removed() { calls++; }
      controller.signal.addEventListener("abort", removed);
      controller.signal.removeEventListener("abort", removed);
      controller.abort(reason);
      return [calls, controller.signal.aborted, controller.signal.reason === reason];
    })()`)).toEqual([0, true, true]);
  });

  it.each([
    { label: "both constructors", natives: { AbortController: NativeAbortController, AbortSignal: NativeAbortSignal } },
    { label: "only AbortController", natives: { AbortController: NativeAbortController } },
    { label: "only AbortSignal", natives: { AbortSignal: NativeAbortSignal } },
  ])("preserves native $label and installs only missing constructors", ({ natives }) => {
    const fixture = boot(natives);
    for (const name of ["AbortController", "AbortSignal"] as const) {
      const installed = evaluate(fixture.context, name);
      expect(typeof installed).toBe("function");
      if (name in natives) expect(installed).toBe(natives[name]);
      else expect(installed).not.toBe(name === "AbortController" ? NativeAbortController : NativeAbortSignal);
    }
    if ("AbortController" in natives && "AbortSignal" in natives) {
      expect(evaluate(fixture.context, "new AbortController().signal instanceof AbortSignal")).toBe(true);
    }
    expectUntouchedTransports(fixture);
  });

  it("can run twice without replacing installed APIs or touching transports", () => {
    const fixture = boot();
    const apiReferences = `[
      Object.fromEntries, Array.prototype.flat, Array.prototype.flatMap,
      Promise.prototype.finally, String.prototype.trimStart, String.prototype.trimEnd,
      globalThis, AbortController, AbortSignal
    ]`;
    const before = evaluate(fixture.context, apiReferences) as unknown[];
    evaluate(fixture.context, runtimeCode);
    const after = evaluate(fixture.context, apiReferences) as unknown[];
    after.forEach((api, index) => expect(api).toBe(before[index]));
    expectUntouchedTransports(fixture);
  });

  it("isolates each browser realm without changing the host runner's APIs", () => {
    const first = boot();
    const second = browser();
    expect(evaluate(second.context, "typeof Array.prototype.flat")).toBe("undefined");
    evaluate(second.context, runtimeCode);
    expect(evaluate(first.context, "Array.prototype.flat")).not.toBe(evaluate(second.context, "Array.prototype.flat"));
    evaluate(first.context, "Array.prototype.flat = undefined");
    expect(evaluate(second.context, "[1, [2]].flat()")).toEqual([1, 2]);
    [Object.fromEntries, Array.prototype.flat, Array.prototype.flatMap,
      Promise.prototype.finally, String.prototype.trimStart, String.prototype.trimEnd,
      globalThis, globalThis.AbortController, globalThis.AbortSignal,
    ].forEach((api, index) => expect(api).toBe(hostApis[index]));
  });

  it("evaluates real onboarding and allergen static imports after installing missing APIs", () => {
    const fixture = browser();
    // The virtual entry imports the real runtime first, then the real modules;
    // it is deliberately not a hand-written facsimile of their static setup.
    evaluate(fixture.context, smokeCode);
    expect(evaluate(fixture.context, `[
      typeof LegacyRuntimeSmoke.PartnerOnboarding,
      LegacyRuntimeSmoke.allergenCodeFor("Cereales con gluten"),
      LegacyRuntimeSmoke.allergenCodeFor("Sésamo"),
      LegacyRuntimeSmoke.allergenCodeFor("milk"),
      LegacyRuntimeSmoke.allergenCodeFor("not an allergen"),
      LegacyRuntimeSmoke.normalizeAllergenValues(["eggs", "Sésamo", "custom"])
    ]`)).toEqual(["function", "gluten", "sesamo", "leche", null, ["huevo", "sesamo", "custom"]]);
    expectUntouchedTransports(fixture);
  });
});
