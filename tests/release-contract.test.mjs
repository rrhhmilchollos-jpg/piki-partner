import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const text = (path) => readFile(new URL(path, root), "utf8");

test("partner release metadata matches the current package version", async () => {
  const release = JSON.parse(await text("public/release.json"));
  const manifest = JSON.parse(await text("public/manifest.json"));
  const packageJson = JSON.parse(await text("package.json"));

  assert.equal(release.version, packageJson.version);
  assert.equal(release.minimumVersion, packageJson.version);
  assert.equal(release.surface, "partner");
  assert.equal(manifest.version, packageJson.version);
});

test("service worker has a partner-scoped cache and bypasses API/auth/release caching", async () => {
  const worker = await text("public/sw.js");

  assert.match(worker, /CACHE_PREFIX = "piki-partner-"/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /CONTROL_PATHS.*release\.json/s);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/auth\/"\)/);
  assert.match(worker, /CACHE_PREFIX = "piki-partner-"/);
});

test("release check is same-origin, no-store, and guards the partner surface", async () => {
  const releaseCode = await text("src/release.ts");

  assert.match(releaseCode, /PARTNER_RELEASE_VERSION = "0\.3\.1"/);
  assert.match(releaseCode, /fetch\("\/release\.json"/);
  assert.match(releaseCode, /cache: "no-store"/);
  assert.match(releaseCode, /credentials: "same-origin"/);
  assert.match(releaseCode, /manifest\.surface !== PARTNER_SURFACE/);
  assert.match(releaseCode, /sessionStorage\.getItem\(key\)/);
});
