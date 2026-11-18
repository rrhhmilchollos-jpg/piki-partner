// Evaluate before App and its static imports. WebView 62 parses the bundle but
// lacks these APIs used by onboarding, allergen lookup, tickets and requests.
import "core-js/es/object/from-entries";
import "core-js/es/array/flat";
import "core-js/es/array/flat-map";
import "core-js/es/promise/finally";
import "core-js/es/global-this";
import "core-js/es/string/trim-start";
import "core-js/es/string/trim-end";
import {
  AbortController as CompatibleAbortController,
  AbortSignal as CompatibleAbortSignal,
} from "abortcontroller-polyfill/dist/abortcontroller.js";

// Install only missing constructors. Do not use polyfill-patch-fetch or the
// package's global installer: native HTTP, SSE and uploads keep their transports.
if (typeof globalThis.AbortController === "undefined") {
  globalThis.AbortController = CompatibleAbortController;
}
if (typeof globalThis.AbortSignal === "undefined") {
  globalThis.AbortSignal = CompatibleAbortSignal;
}
