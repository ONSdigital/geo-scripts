// Streaming processing of downloaded lookup CSVs (eg. the NSPL, ~800 MB)
import { createReadStream, createWriteStream } from "fs";
import zlib from "zlib";
import readline from "readline";
import { csvParseRows, csvFormatRows } from "d3-dsv";

// Copy a CSV line by line, dropping any byte order mark. With columns
// ({sourceName: newName}), only those columns are kept, renamed and in that order.
// required lists other columns that must be present. addColumns ({name: row => value})
// adds columns at the end, from each row as an object keyed by the output column names.
// Writes gzip if the output ends in .gz. Returns the number of data rows.
export async function writeLookup(input, output, {columns, required = [], addColumns = {}, gzipped = output.endsWith(".gz")} = {}) {
  const out = createWriteStream(output);
  const sink = gzipped ? zlib.createGzip() : out;
  if (gzipped) sink.pipe(out);
  // Listen for errors from the start: an output error (eg. a full disk) would otherwise be
  // an uncaught exception, and a write waiting for "drain" would never finish
  let failed = null;
  const failures = new Set();
  const onError = (err) => {
    failed ??= err;
    for (const reject of failures) reject(err);
  };
  out.on("error", onError);
  if (gzipped) sink.on("error", onError);
  const wait = (event) => new Promise((resolve, reject) => {
    if (failed) return reject(failed);
    const done = () => {
      failures.delete(reject);
      resolve();
    };
    failures.add(reject);
    (event === "drain" ? sink : out).once(event, done);
  });
  const write = (text) => {
    if (failed) throw failed;
    return sink.write(text) ? null : wait("drain");
  };

  try {
    const rows = await copyRows(input, write, {columns, required, addColumns});
    const finished = wait("finish");
    sink.end();
    await finished;
    return rows;
  } catch (err) {
    sink.destroy();
    out.destroy();
    throw err;
  }
}

async function copyRows(input, write, {columns, required, addColumns}) {
  let header = null;
  let indexes = null;
  let names = null;
  const added = Object.entries(addColumns);
  let rows = 0;
  const stream = createReadStream(input);
  try {
    for await (const raw of readline.createInterface({input: stream, crlfDelay: Infinity})) {
      const line = header ? raw : raw.replace(/^\uFEFF/, "");
      if (!line) continue;
      if (!header) {
        header = csvParseRows(line)[0];
        const missing = [...Object.keys(columns || {}), ...required].filter(c => !header.includes(c));
        if (missing.length) throw new Error(`Missing columns ${missing.join(", ")} (found ${header.join(", ")})`);
        if (columns) indexes = Object.keys(columns).map(c => header.indexOf(c));
        names = columns ? Object.values(columns) : header;
        await write(`${columns || added.length ? csvFormatRows([[...names, ...added.map(([name]) => name)]]) : line}\n`);
        continue;
      }
      rows ++;
      if (!indexes && !added.length) {
        await write(`${line}\n`);
        continue;
      }
      const values = csvParseRows(line)[0];
      const kept = indexes ? indexes.map(i => values[i]) : values;
      const row = Object.fromEntries(names.map((name, i) => [name, kept[i]]));
      await write(`${csvFormatRows([[...kept, ...added.map(([, value]) => value(row))]])}\n`);
    }
  } finally {
    stream.destroy();
  }
  return rows;
}

// Columns to add to a lookup from another table (join, from config/source-files.js),
// for writeLookup's addColumns. on is {lookupColumn: tableColumn}, and columns is
// {tableColumn: newName}. Rows whose code isn't in the table take the values in
// fallback for the code's first letter (eg. {W: {rgn22cd: "W92000004"}} for Welsh
// authorities in an English table), and any others are an error.
export function joinColumns(table, {on, columns, fallback = {}}) {
  const [[lookupCol, tableCol]] = Object.entries(on);
  const index = new Map(table.map(d => [d[tableCol], d]));
  return Object.fromEntries(Object.entries(columns).map(([col, name]) => [name, (row) => {
    const code = row[lookupCol];
    const match = index.get(code);
    if (match) return match[col];
    const value = fallback[code?.[0]]?.[name];
    if (value === undefined) throw new Error(`${code} (${lookupCol}) isn't in the joined table, and has no fallback for ${name}`);
    return value;
  }]));
}
