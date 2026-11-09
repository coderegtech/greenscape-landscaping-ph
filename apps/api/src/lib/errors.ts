/** Throw from handlers/services; the error middleware turns it into the standard ErrorBody. */
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
  static badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
  static unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
  static forbidden = (msg = 'Not allowed') => new AppError(403, 'FORBIDDEN', msg);
  static notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
  static conflict = (msg: string) => new AppError(409, 'CONFLICT', msg);
}
