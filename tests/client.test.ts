import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Trackee, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PaymentRequiredError,
  PermissionDeniedError,
  RateLimitError,
  TrackeeError,
  UnprocessableEntityError,
  VERSION,
} from '../src/index';
import { operationPaths } from '../openapi-ts.config';
import specification from '../openapi.json';

const json = (body: unknown, status = 200, headers?: HeadersInit): Response => {
  const result = new Headers(headers);
  result.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers: result });
};
const makeClient = (fetch: typeof globalThis.fetch, options = {}) =>
  new Trackee({ apiKey: 'test-key', fetch, maxRetries: 0, ...options });

beforeEach(() => vi.stubEnv('TRACKEE_API_KEY', ''));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('client and API contract', () => {
  it('requires a non-empty API key', () => {
    expect(() => new Trackee()).toThrow(TrackeeError);
    expect(() => new Trackee({ apiKey: '  ' })).toThrow(TrackeeError);
  });
  it('reads environment credentials and leaves public health unauthenticated', async () => {
    vi.stubEnv('TRACKEE_API_KEY', 'env-key');
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ ok: true }));
    const client = new Trackee({ fetch });
    await client.health.verifyAccessKey();
    await client.health.check();
    expect((fetch.mock.calls[0]![0] as Request).headers.get('x-access-key')).toBe('env-key');
    expect((fetch.mock.calls[1]![0] as Request).headers.get('x-access-key')).toBeNull();
  });
  it('exposes every operation through an explicitly mapped resource', () => {
    const client = makeClient(vi.fn());
    const ids = Object.values(specification.paths).flatMap((path) =>
      Object.values(path).map((op) => op.operationId),
    );
    expect(Object.keys(operationPaths).sort()).toEqual(ids.sort());
    for (const path of Object.values(operationPaths)) {
      let resource: unknown = client;
      for (const segment of path) resource = (resource as Record<string, unknown>)[segment];
      expect(resource).toBeTypeOf('function');
    }
  });
  it('keeps credentials, base URLs and cloned clients isolated', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json({ success: true, data: [] }));
    const first = makeClient(fetch, { baseURL: 'https://first.example' });
    const second = first.withOptions({ apiKey: 'other-key', baseURL: 'https://second.example' });
    await Promise.all([first.brands.list(), second.brands.list()]);
    const requests = fetch.mock.calls.map(([request]) => request as Request);
    expect(requests.map((r) => r.headers.get('x-access-key'))).toEqual(['test-key', 'other-key']);
    expect(requests.map((r) => new URL(r.url).host)).toEqual(['first.example', 'second.example']);
    expect(first.apiKey).toBe('test-key');
  });
  it.each([new Headers({ 'x-app': 'test' }), [['x-app', 'test']], { 'x-app': 'test' }])(
    'accepts HeadersInit: %j',
    async (headers) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({ ok: true }));
      await makeClient(fetch, { defaultHeaders: headers }).health.verifyAccessKey({
        headers: { 'x-request': 'one' },
      });
      const request = fetch.mock.calls[0]![0] as Request;
      expect(request.headers.get('x-app')).toBe('test');
      expect(request.headers.get('x-request')).toBe('one');
      expect(request.headers.get('user-agent')).toBe(`trackee-node/${VERSION}`);
    },
  );
  it('serializes bodies, paths, query parameters and preserves response metadata', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json({ success: true, data: [] }, 200, { 'x-request-id': '123' }));
    const client = makeClient(fetch);
    await client.brands.create({ body: { name: 'Acme', domain: 'acme.com' } });
    const result = await client.brands.get({ path: { id: 'a/b ?' } });
    await client.scans.list({ query: { limit: 5, offset: 10 } });
    expect(await (fetch.mock.calls[0]![0] as Request).json()).toEqual({ name: 'Acme', domain: 'acme.com' });
    expect((fetch.mock.calls[1]![0] as Request).url).toContain('/v1/brands/a%2Fb%20%3F');
    const query = new URL((fetch.mock.calls[2]![0] as Request).url).searchParams;
    expect(query.get('limit')).toBe('5');
    expect(query.get('offset')).toBe('10');
    expect(result.response.headers.get('x-request-id')).toBe('123');
    expect(result.data.success).toBe(true);
    expect(result.request).toBeInstanceOf(Request);
  });
  it.each([-1, 1.5, NaN, Infinity])('rejects invalid options: %s', (value) => {
    expect(() => makeClient(vi.fn(), { maxRetries: value })).toThrow(TrackeeError);
    expect(() => makeClient(vi.fn(), { timeout: value })).toThrow(TrackeeError);
  });
});

describe('errors', () => {
  it.each([
    [400, BadRequestError],
    [401, AuthenticationError],
    [402, PaymentRequiredError],
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [409, ConflictError],
    [422, UnprocessableEntityError],
    [429, RateLimitError],
    [500, InternalServerError],
    [418, APIError],
  ] as const)('maps HTTP %i to a typed error', async (status, ErrorType) => {
    const body = { success: false, message: 'Failure', code: 'test_code' };
    const client = makeClient(async () => json(body, status, { 'x-request-id': 'req_1' }));
    const error = await client.health.check().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ErrorType);
    expect(error).toMatchObject({
      status,
      name: ErrorType.name,
      message: 'Failure',
      code: 'test_code',
      details: body,
      requestId: 'req_1',
    });
  });
  it('handles non-JSON gateway errors', async () => {
    const client = makeClient(async () => new Response('Bad gateway', { status: 502 }));
    await expect(client.health.check()).rejects.toMatchObject({ status: 502, message: 'Bad gateway' });
  });
  it('preserves the connection failure cause', async () => {
    const cause = new TypeError('offline');
    const client = makeClient(async () => {
      throw cause;
    });
    await expect(client.health.check()).rejects.toMatchObject({ name: 'APIConnectionError', cause });
  });
  it('allows explicit nonthrowing requests', async () => {
    const client = makeClient(async () => json({ message: 'missing' }, 404));
    const result = await client.brands.get({ path: { id: 'missing' }, throwOnError: false });
    expect(result.error).toBeInstanceOf(NotFoundError);
  });
});

describe('retries and cancellation', () => {
  it('retries transient reads and releases discarded response bodies', async () => {
    vi.useFakeTimers();
    const transient = json({ message: 'busy' }, 503);
    const cancel = vi.spyOn(transient.body!, 'cancel');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(transient)
      .mockResolvedValueOnce(json({ ok: true }));
    const promise = makeClient(fetch, { maxRetries: 2 }).health.check();
    await vi.runAllTimersAsync();
    expect((await promise).data.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(['seconds', 'date'])('honors Retry-After: %s', async (format) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const retryAfter = format === 'seconds' ? '2' : new Date(Date.now() + 2_000).toUTCString();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': retryAfter }))
      .mockResolvedValueOnce(json({ ok: true }));
    const promise = makeClient(fetch, { maxRetries: 1 }).health.check();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('stops when the retry budget is exhausted', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'));
    const rejection = expect(makeClient(fetch, { maxRetries: 2 }).health.check()).rejects.toBeInstanceOf(
      APIConnectionError,
    );
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not retry authentication errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => json({}, 401));
    await expect(makeClient(fetch, { maxRetries: 2 }).health.verifyAccessKey()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['response', 'connection'])('does not replay a charged POST after a %s failure', async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      if (kind === 'connection') throw new Error('offline');
      return json({}, 503);
    });
    await expect(
      makeClient(fetch, { maxRetries: 2 }).scans.create({ body: { brand: 'Acme', prompts: ['Best CRM?'] } }),
    ).rejects.toBeInstanceOf(TrackeeError);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('replays identical JSON bodies when unsafe retries are explicitly enabled', async () => {
    vi.useFakeTimers();
    const bodies: unknown[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (request) => {
      bodies.push(await (request as Request).json());
      return json({}, bodies.length === 1 ? 503 : 200);
    });
    const body = { brand: 'Acme', prompts: ['Best CRM?'] };
    const promise = makeClient(fetch, { maxRetries: 1, retryUnsafeRequests: true }).scans.create({ body });
    await vi.runAllTimersAsync();
    await promise;
    expect(bodies).toEqual([body, body]);
  });
  const pendingFetch = () =>
    vi.fn<typeof globalThis.fetch>(
      (request) =>
        new Promise((_resolve, reject) => {
          const signal = (request as Request).signal;
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
  it('times out and retries read attempts', async () => {
    vi.useFakeTimers();
    const fetch = pendingFetch();
    const rejection = expect(
      makeClient(fetch, { timeout: 25, maxRetries: 1 }).health.check(),
    ).rejects.toBeInstanceOf(APIConnectionTimeoutError);
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('supports disabling timeouts', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(json({ ok: true })), 100)));
    const promise = makeClient(fetch, { timeout: 0 }).health.check();
    await vi.runAllTimersAsync();
    expect((await promise).data.ok).toBe(true);
  });
  it('rejects pre-aborted requests without making a call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(makeClient(fetch).health.check({ signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      APIUserAbortError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels an in-flight request without retrying', async () => {
    vi.useFakeTimers();
    const fetch = pendingFetch();
    const controller = new AbortController();
    const rejection = expect(
      makeClient(fetch, { maxRetries: 2 }).health.check({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(APIUserAbortError);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await rejection;
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('cancels while waiting for Retry-After', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json({}, 429, { 'retry-after': '60' }));
    const controller = new AbortController();
    const rejection = expect(
      makeClient(fetch, { maxRetries: 2 }).health.check({ signal: controller.signal }),
    ).rejects.toBeInstanceOf(APIUserAbortError);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await rejection;
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
