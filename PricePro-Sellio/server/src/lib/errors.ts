export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource", code = "FORBIDDEN") =>
  new AppError(403, code, message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const tooMany = (message: string, details?: unknown) =>
  new AppError(429, "LIMIT_REACHED", message, details);
/** A required external integration is not configured. Never replaced by fake results. */
export const notConfigured = (service: string, message: string) =>
  new AppError(503, "SERVICE_NOT_CONFIGURED", message, { service });
export const upstreamError = (service: string, message: string) =>
  new AppError(502, "UPSTREAM_ERROR", message, { service });
