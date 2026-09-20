export { Trackee, Trackee as default, type ClientOptions } from './client';
export {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  PaymentRequiredError,
  TrackeeError,
  RateLimitError,
  UnprocessableEntityError,
} from './errors';
export type * from './generated/types.gen';
export { VERSION } from './version';
