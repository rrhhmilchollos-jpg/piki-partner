declare module "abortcontroller-polyfill/dist/abortcontroller.js" {
  export const AbortController: typeof globalThis.AbortController;
  export const AbortSignal: typeof globalThis.AbortSignal;
}
