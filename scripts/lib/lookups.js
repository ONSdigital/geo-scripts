// Streaming processing of downloaded lookup CSVs (eg. the NSPL, ~800 MB)
import { createReadStream, createWriteStream } from "fs";
import zlib from "zlib";
import readline from "readline";
import { csvParseRows, csvFormatRows } from "d3-dsv";

// Copy a CSV line by line, dropping any byte order mark. With columns
// ({sourceName: newName}), only those columns are kept, renamed and in that order.
// required lists other columns that must be present. Writes gzip if the output ends
// in .gz. Returns the number of data rows.
export async function writeLookup(input, output, {columns, required = [], gzipped = output.endsWith(".gz")} = {}) {
  const out = createWriteStream(output);
  const sink = gzipped ? zlib.createGzip() : out;
  if (gzipped) sink.pipe(out);
  const write = (text) => sink.write(text) ? null : new Promise(resolve => sink.once("drain", resolve));

  let header = null;
  let indexes = null;
  let rows = 0;
  for await (const raw of readline.createInterface({input: createReadStream(input), crlfDelay: Infinity})) {
    const line = header ? raw : raw.replace(/^\uFEFF/, "");
    if (!line) continue;
    if (!header) {
      header = csvParseRows(line)[0];
      const missing = [...Object.keys(columns || {}), ...required].filter(c => !header.includes(c));
      if (missing.length) throw new Error(`Missing columns ${missing.join(", ")} (found ${header.join(", ")})`);
      if (columns) indexes = Object.keys(columns).map(c => header.indexOf(c));
      await write(`${columns ? csvFormatRows([Object.values(columns)]) : line}\n`);
      continue;
    }
    rows ++;
    await write(`${indexes ? csvFormatRows([indexes.map(i => csvParseRows(line)[0][i])]) : line}\n`);
  }
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
    sink.end();
  });
  return rows;
}
