// HTTP helpers built on Node's global fetch, with timeouts and retries.
// Downloads are written to a ".part" file and only renamed into place once complete,
// so an interrupted run never leaves a file that looks finished.
import { createWriteStream, renameSync, rmSync } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    // Client errors (other than rate limiting) won't succeed on a retry
    this.retryable = status >= 500 || status === 429;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry(fn, {retries = 3, backoff = 2000, label = "Request"} = {}) {
  for (let attempt = 0; ; attempt ++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (err.retryable === false || attempt >= retries) throw err;
      const wait = backoff * 2 ** attempt;
      console.warn(`${label} failed (${err.message}). Retrying in ${wait / 1000}s...`);
      await sleep(wait);
    }
  }
}

async function fetchOk(url, timeout) {
  const res = await fetch(url, {signal: AbortSignal.timeout(timeout)});
  if (!res.ok) throw new HttpError(`HTTP ${res.status} ${res.statusText} for ${url}`, res.status);
  return res;
}

export function fetchText(url, {timeout = 120_000, ...opts} = {}) {
  return withRetry(async () => (await fetchOk(url, timeout)).text(), opts);
}

export async function fetchJSON(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error(`Expected JSON from ${url} but received: ${text.slice(0, 200)}`);
    throw err;
  }
}

export function downloadToFile(url, dest, {timeout = 30 * 60_000, ...opts} = {}) {
  const part = `${dest}.part`;
  return withRetry(async () => {
    try {
      const res = await fetchOk(url, timeout);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
      renameSync(part, dest);
    } catch (err) {
      rmSync(part, {force: true});
      throw err;
    }
  }, {label: `Download of ${url}`, ...opts});
}
