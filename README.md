# Trackee Node.js SDK

Trackee's official Node.js and TypeScript SDK, generated from the [Trackee API](https://trackee.dev) OpenAPI contract using [Hey API](https://heyapi.dev/).

## Installation

Available on [npm](https://www.npmjs.com/package/@trackee/node). See [GitHub releases](https://github.com/trackee-API/trackee-node/releases) and the [changelog](./CHANGELOG.md) for versions and known issues.

```bash
npm install @trackee/node
```

Requires Node.js 20.3 or newer. Includes ESM, CommonJS, and TypeScript declarations, with no runtime dependencies.

## Quick start

Set `TRACKEE_API_KEY` in your environment (the SDK does not load `.env` files automatically):

```ts
import Trackee from '@trackee/node';

const client = new Trackee();
// Or: new Trackee({ apiKey: 'your-access-key' })

const { data: result } = await client.brands.list();
console.log(result.data);
```

CommonJS:

```js
const { Trackee } = require('@trackee/node');
const client = new Trackee({ apiKey: process.env.TRACKEE_API_KEY });
```

### Create a scan

Scans consume credits and run asynchronously. Creation returns an ID; subsequent requests retrieve progress and results.

```ts
const { data: scan } = await client.scans.create({
  body: {
    brand: 'Acme',
    domain: 'acme.com',
    prompts: ['What are the best project management tools?'],
    engines: ['chatgpt'],
  },
});

console.log(scan.data.id, scan.credits.charged);

// Call later to check progress; repeat as needed until data.done is true.
const { data: progress } = await client.scans.get({
  path: { id: scan.data.id },
});
console.log(progress.data.done, progress.data.results);
```

## Configuration

```ts
const client = new Trackee({
  apiKey: 'your-access-key', // Defaults to TRACKEE_API_KEY
  baseURL: 'https://api.trackee.dev', // Do not append /v1
  timeout: 60_000,
  maxRetries: 2,
  retryUnsafeRequests: false,
  defaultHeaders: { 'X-Application': 'my-app' },
  // fetch: customFetch,
});

const other = client.withOptions({ apiKey: 'another-access-key' });
```

Each instance owns an isolated HTTP client. Authentication uses `x-access-key`. Public health checks do not send the key by default. `defaultHeaders` accepts an object, `Headers`, or header tuples; supplying it to `withOptions` replaces the previous default headers.

`timeout` applies to each fetch attempt until response headers arrive, excluding response-body parsing and retry delays. Set it to `0` to disable it. `maxRetries` counts additional attempts. GET, HEAD, and OPTIONS requests retry connection failures, timeouts, HTTP 408/409/429, and 5xx responses. The SDK honors `Retry-After` seconds or dates, otherwise waiting 250ms, 500ms, 1s, then up to 2s between attempts.

Other methods are not retried by default: Trackee POSTs can charge credits or create work. Set `retryUnsafeRequests: true` only when you accept that retries may duplicate work or charges. Use `maxRetries: 0` to disable retries entirely.

### Cancellation

Pass a native AbortSignal to any operation. Cancellation also interrupts retry delays:

```ts
const controller = new AbortController();
const request = client.brands.list({ signal: controller.signal });
controller.abort();
await request; // Rejects with APIUserAbortError
```

## Resources

All 50 operations in the current API contract are available:

| Resource                                                                             | Methods                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `health`                                                                             | `check`, `verifyAccessKey`                                          |
| `usage`                                                                              | `get`                                                               |
| `brands`                                                                             | `create`, `list`, `get`, `update`, `delete`, `timeline`, `overview` |
| `brands.prompts`                                                                     | `get`, `set`                                                        |
| `brands.competitors`                                                                 | `get`, `set`                                                        |
| `brands.keywords`                                                                    | `get`, `set`                                                        |
| `trackers`                                                                           | `create`, `list`, `get`, `update`, `delete`, `run`                  |
| `scans`                                                                              | `create`, `list`, `get`                                             |
| `notifications`                                                                      | `create`, `list`, `get`, `update`, `delete`, `rotateSecret`, `test` |
| `prompts`                                                                            | `run`                                                               |
| `models`                                                                             | `list`                                                              |
| `snapshots`                                                                          | `query`                                                             |
| `mentions`                                                                           | `get`, `history`                                                    |
| `rank`, `keywords`, `keywordIdeas`, `aiKeywordVolume`                                | `get`                                                               |
| `visibility`, `alerts`, `recommendations`                                            | `get`                                                               |
| `backlinks`, `domainOverview`, `rankedKeywords`, `audit`, `citations`, `competitors` | `get`                                                               |

Parameters are grouped under `body`, `path`, `query`, and `headers`:

```ts
await client.brands.get({ path: { id: 'brand-id' } });
await client.brands.prompts.set({
  path: { id: 'brand-id' },
  body: { prompts: ['Best CRM for small businesses?'] },
});
await client.scans.list({ query: { limit: 10, offset: 0 } });
await client.rank.get({ body: { keyword: 'project management', domain: 'acme.com' } });
```

Responses expose `{ data, request, response }`. `data` is the complete API response, including its own `data` and credit metadata where present. Use the native `response.headers` for rate-limit and request metadata. The underlying client is available as `client.rawClient` for advanced configuration and interceptors. Per-call `fetch` or `client` overrides bypass the configured transport wrapper.

Generated request and response types are exported from the package root, for example `PostV1ScansData` and `PostV1ScansResponse`:

```ts
import type { PostV1ScansData } from '@trackee/node';
const body: PostV1ScansData['body'] = { brand: 'Acme', prompts: ['Best CRM?'] };
```

## Errors

```ts
import { APIError, PaymentRequiredError, RateLimitError } from '@trackee/node';

try {
  await client.scans.create({ body: { brand: 'Acme', prompts: ['Best CRM?'] } });
} catch (error) {
  if (error instanceof PaymentRequiredError) {
    console.error('Insufficient credits:', error.message);
  } else if (error instanceof RateLimitError) {
    console.error('Retry after:', error.headers.get('retry-after'));
  } else if (error instanceof APIError) {
    console.error(error.status, error.requestId, error.message, error.details);
  } else {
    throw error;
  }
}
```

HTTP errors include `status`, `headers`, `details` (the original response body), and optional `code` and `requestId`. Typed subclasses cover 400, 401, 402, 403, 404, 409, 422, 429, and 5xx responses. Transport failures use `APIConnectionError`, `APIConnectionTimeoutError`, or `APIUserAbortError`. All extend `TrackeeError`.

Errors throw by default; passing `throwOnError: false` returns an `error` field instead.

## Development

```bash
pnpm install
pnpm check
```

`check` regenerates the SDK, checks formatting, lints, typechecks source/tests/examples, runs tests, builds both module formats, exercises the package exports against a local HTTP server, and validates package exports using publint and Are the Types Wrong. CI also checks generated-file drift on Node.js 20, 22, and 24.

### Updating the API contract

The checked-in `openapi.json` was exported from the local Trackee API. Refresh from the deployed API or a local export:

```bash
pnpm spec:fetch
# Or:
pnpm spec:fetch ../../trackee/apps/web/openapi.json
pnpm generate
pnpm check
```

For current local routes, run the API's `generate:openapi` script with an absolute output path, then import that file here. New operation IDs must be assigned a resource path in `openapi-ts.config.ts`; generation fails if any mapping is missing.

`scripts/normalize-spec.ts` converts Fastify's nullable type arrays to OpenAPI 3.0 `nullable` schemas during generation. This preserves useful TypeScript unions without changing the raw contract. Generated files under `src/generated` must not be edited by hand. Keep the contract and generated files together when committing.

### Local package verification and releases

```bash
pnpm check
pnpm pack
# Install the resulting .tgz in a consumer project to try it locally.
```

Before publishing, update `package.json`, `src/version.ts`, and `CHANGELOG.md` together. Publish manually with `npm publish --access public` when ready. There is no automatic release workflow.
