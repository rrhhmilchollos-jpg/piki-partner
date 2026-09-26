import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (path) => readFile(new URL(path, root), "utf8");

test("partner release metadata is pinned to 0.2.2", async () => {
  const release = JSON.parse(await text("public/release.json"));
  const manifest = JSON.parse(await text("public/manifest.json"));
  const packageJson = JSON.parse(await text("package.json"));

  assert.deepEqual(release, { version: "0.2.2", minimumVersion: "0.2.2", surface: "partner" });
  assert.equal(manifest.version, "0.2.2");
  assert.equal(packageJson.version, "0.2.2");
});

test("service worker has a partner-scoped cache and bypasses API/auth/release caching", async () => {
  const worker = await text("public/sw.js");

  assert.match(worker, /piki-partner-v0\.2\.2/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /url\.pathname === "\/release\.json"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/auth\/"\)/);
  assert.match(worker, /OWN_CACHE_PREFIXES/);
});

test("release check is same-origin, no-store, and guards the partner surface", async () => {
  const releaseCode = await text("src/release.ts");

  assert.match(releaseCode, /PARTNER_RELEASE_VERSION = "0\.2\.2"/);
  assert.match(releaseCode, /fetch\("\/release\.json"/);
  assert.match(releaseCode, /cache: "no-store"/);
  assert.match(releaseCode, /credentials: "same-origin"/);
  assert.match(releaseCode, /manifest\.surface !== PARTNER_SURFACE/);
  assert.match(releaseCode, /sessionStorage\.getItem\(key\)/);
});
