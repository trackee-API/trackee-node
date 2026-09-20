import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// Accept a local API export or an explicitly selected server for contract updates.
const source = process.argv[2] ?? 'https://api.trackee.dev/openapi.json';
let specification;
if (/^https?:\/\//.test(source)) {
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Unable to fetch ${source}: ${response.status} ${response.statusText}`);
  specification = await response.json();
} else {
  specification = JSON.parse(await readFile(resolve(source), 'utf8'));
}
if (
  !specification.openapi?.startsWith('3.') ||
  specification.info?.title !== 'Trackee API' ||
  !specification.paths ||
  !Object.keys(specification.paths).length
) {
  throw new Error('Expected a non-empty Trackee OpenAPI 3 specification; existing contract was not changed.');
}
const ids = new Set();
for (const item of Object.values(specification.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
    const operation = item[method];
    if (!operation) continue;
    if (!operation.operationId || ids.has(operation.operationId)) {
      throw new Error(`Missing or duplicate operationId: ${operation.operationId}`);
    }
    ids.add(operation.operationId);
  }
}
const destination = new URL('../openapi.json', import.meta.url);
const temporary = new URL(`../openapi.${process.pid}.tmp`, import.meta.url);
try {
  await writeFile(temporary, `${JSON.stringify(specification, null, 2)}\n`);
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}
console.log(`Updated openapi.json from ${source} (${ids.size} operations)`);
