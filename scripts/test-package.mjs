import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import Trackee, { PaymentRequiredError } from '@trackee/node';

const require = createRequire(import.meta.url);
const commonjs = require('@trackee/node');
const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.headers['x-access-key'] !== 'package-test-key') {
    response.writeHead(401).end(JSON.stringify({ message: 'Missing API key' }));
  } else if (request.url === '/v1/health/auth') {
    response.end(JSON.stringify({ ok: true }));
  } else {
    response.writeHead(402).end(JSON.stringify({ message: 'Insufficient credits' }));
  }
});
server.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const options = {
    apiKey: 'package-test-key',
    baseURL: `http://127.0.0.1:${server.address().port}`,
    maxRetries: 0,
  };
  for (const Client of [Trackee, commonjs.Trackee, commonjs.default]) {
    const client = new Client(options);
    const { data, response } = await client.health.verifyAccessKey();
    assert.equal(data.ok, true);
    assert.equal(response.status, 200);
  }
  const client = new Trackee(options);
  await assert.rejects(
    client.scans.create({ body: { brand: 'Acme', prompts: ['Best CRM?'] } }),
    PaymentRequiredError,
  );
  console.log('ESM and CommonJS package exports passed local HTTP smoke tests.');
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
