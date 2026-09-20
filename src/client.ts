import { createClient, type Client } from './generated/client';
import { Trackee as GeneratedTrackee } from './generated/sdk.gen';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  createAPIError,
  TrackeeError,
} from './errors';
import { VERSION } from './version';

export interface ClientOptions {
  /** Defaults to `process.env.TRACKEE_API_KEY`. */
  apiKey?: string;
  /** @default "https://api.trackee.dev" */
  baseURL?: string;
  /** Timeout per fetch attempt in milliseconds; 0 disables it. @default 60000 */
  timeout?: number;
  /** Number of retries after the first attempt. @default 2 */
  maxRetries?: number;
  /** Retry writes and credit-consuming POSTs. May duplicate charges or work. @default false */
  retryUnsafeRequests?: boolean;
  defaultHeaders?: HeadersInit;
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.trackee.dev';
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_TIMER = 2_147_483_647;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const validateNonNegativeInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TrackeeError(`${name} must be a non-negative safe integer.`);
  }
};

const retryDelay = (attempt: number, response?: Response): number => {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const ms = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, MAX_TIMER);
  }
  return Math.min(250 * 2 ** attempt, 2_000);
};

const waitForRetry = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new APIUserAbortError({ cause: signal.reason }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new APIUserAbortError({ cause: signal.reason }));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const createTrackeeFetch = ({
  fetchImplementation,
  maxRetries,
  timeout,
  retryUnsafeRequests,
}: {
  fetchImplementation: typeof globalThis.fetch;
  maxRetries: number;
  timeout: number;
  retryUnsafeRequests: boolean;
}): typeof globalThis.fetch => {
  return async (input, init) => {
    const template = new Request(input, init);
    const retries = retryUnsafeRequests || SAFE_METHODS.has(template.method) ? maxRetries : 0;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (template.signal.aborted) throw new APIUserAbortError({ cause: template.signal.reason });
      const timeoutController = new AbortController();
      const timer = timeout > 0 ? setTimeout(() => timeoutController.abort(), timeout) : undefined;
      const signal = AbortSignal.any([template.signal, timeoutController.signal]);
      let response: Response | undefined;

      try {
        response = await fetchImplementation(new Request(template.clone(), { signal }));
      } catch (error) {
        if (template.signal.aborted) throw new APIUserAbortError({ cause: error });
        if (attempt >= retries) {
          if (timeoutController.signal.aborted) throw new APIConnectionTimeoutError({ cause: error });
          throw new APIConnectionError('Connection failed.', { cause: error });
        }
      } finally {
        clearTimeout(timer);
      }

      if (template.signal.aborted) {
        void response?.body?.cancel().catch(() => {});
        throw new APIUserAbortError({ cause: template.signal.reason });
      }
      if (response) {
        const retryable = RETRYABLE_STATUS_CODES.has(response.status) || response.status >= 500;
        if (attempt >= retries || !retryable) return response;
        // Release the connection before retrying; do not wait for a discarded stream.
        void response.body?.cancel().catch(() => {});
      }
      await waitForRetry(retryDelay(attempt, response), template.signal);
    }

    throw new APIConnectionError('Connection failed.');
  };
};

/** The Node.js client for the Trackee API. */
export class Trackee extends GeneratedTrackee {
  static readonly DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;
  static readonly DEFAULT_MAX_RETRIES = DEFAULT_MAX_RETRIES;

  readonly apiKey: string;
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly retryUnsafeRequests: boolean;
  readonly rawClient: Client;
  readonly #options: ClientOptions;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env['TRACKEE_API_KEY'];
    if (!apiKey?.trim()) {
      throw new TrackeeError(
        "The TRACKEE_API_KEY environment variable is missing or empty. Set it or pass new Trackee({ apiKey: 'your-key' }).",
      );
    }
    const baseURL = options.baseURL ?? DEFAULT_BASE_URL;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryUnsafeRequests = options.retryUnsafeRequests ?? false;
    validateNonNegativeInteger('timeout', timeout);
    validateNonNegativeInteger('maxRetries', maxRetries);
    if (timeout > MAX_TIMER) throw new TrackeeError(`timeout must be at most ${MAX_TIMER}.`);

    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!fetchImplementation) {
      throw new TrackeeError('No Fetch API implementation is available. Pass one with the fetch option.');
    }
    const headers = new Headers(options.defaultHeaders);
    if (!headers.has('User-Agent')) headers.set('User-Agent', `trackee-node/${VERSION}`);
    const client = createClient({
      auth: apiKey,
      baseUrl: baseURL,
      fetch: createTrackeeFetch({ fetchImplementation, maxRetries, timeout, retryUnsafeRequests }),
      headers,
      throwOnError: true,
    });
    client.interceptors.error.use((error, response) => {
      if (error instanceof TrackeeError) return error;
      if (!response) return new APIConnectionError('Connection failed.', { cause: error });
      return createAPIError(response, error);
    });

    super({ client });
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.retryUnsafeRequests = retryUnsafeRequests;
    this.rawClient = client;
    this.#options = {
      ...options,
      apiKey,
      baseURL,
      timeout,
      maxRetries,
      retryUnsafeRequests,
      defaultHeaders: headers,
    };
  }

  /** Create an isolated client; supplied defaultHeaders replace the previous headers. */
  withOptions(options: Partial<ClientOptions>): Trackee {
    return new Trackee({ ...this.#options, ...options });
  }
}

export default Trackee;
