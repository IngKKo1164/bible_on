import { createReadStream } from 'node:fs';
import readline from 'node:readline';

export async function* readJsonLines(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${lineNumber}: invalid JSON`, { cause: error });
    }
  }
}

export async function loadJsonLines(filePath) {
  const records = [];
  for await (const record of readJsonLines(filePath)) records.push(record);
  return records;
}
