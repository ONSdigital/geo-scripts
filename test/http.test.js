import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { withRetry, fetchJSON, downloadToFile, HttpError } from "../scripts/lib/http.js";

// Replace the global fetch with a queue of canned responses
const realFetch = globalThis.fetch;
let responses, calls;
beforeEach(() => {
  responses = [];
  calls = 0;
  globalThis.fetch = async () => {
    calls ++;
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const fast = {backoff: 1};

test("withRetry retries failures and returns the first success", async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    if (++ attempts < 3) throw new Error("flaky");
    return "ok";
  }, {retries: 3, ...fast});
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry gives up after the retry limit, and at once for non-retryable errors", async () => {
  let attempts = 0;
  await assert.rejects(withRetry(async () => {
    attempts ++;
    throw new Error("down");
  }, {retries: 2, ...fast}), /down/);
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(withRetry(async () => {
    attempts ++;
    throw new HttpError("not found", 404);
  }, {retries: 2, ...fast}), /not found/);
  assert.equal(attempts, 1);
});

test("fetchJSON retries server errors and reports non-JSON responses", async () => {
  responses.push(new Response("busy", {status: 503}), new Response('{"count": 4}'));
  assert.deepEqual(await fetchJSON("https://example.test/a", fast), {count: 4});
  assert.equal(calls, 2);

  responses.push(new Response("<html>Service unavailable</html>"));
  await assert.rejects(fetchJSON("https://example.test/b", fast), /Expected JSON .* <html>/);
});

test("downloadToFile writes the file only once complete", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-scripts-"));
  try {
    const dest = join(dir, "data.csv");
    responses.push(new Response("a,b\n1,2\n"));
    await downloadToFile("https://example.test/data.csv", dest, fast);
    assert.equal(readFileSync(dest, "utf8"), "a,b\n1,2\n");

    // A failed download leaves neither the file nor a partial file behind
    const failed = join(dir, "failed.csv");
    responses.push(new Response("gone", {status: 404}));
    await assert.rejects(downloadToFile("https://example.test/failed.csv", failed, fast), /404/);
    assert.equal(existsSync(failed), false);
    assert.deepEqual(readdirSync(dir), ["data.csv"]);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
