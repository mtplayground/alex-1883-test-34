export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "HTTP_ERROR"
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

type ErrorWithStatus = {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

export type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
  };
};

function errorWithStatus(error: unknown): ErrorWithStatus | null {
  return typeof error === "object" && error !== null ? error : null;
}

function statusFromError(error: unknown): number | null {
  const candidate = errorWithStatus(error);
  const status =
    typeof candidate?.statusCode === "number"
      ? candidate.statusCode
      : typeof candidate?.status === "number"
        ? candidate.status
        : null;

  if (!status || status < 400 || status > 599) {
    return null;
  }

  return status;
}

function isJsonParseError(error: unknown): boolean {
  return errorWithStatus(error)?.type === "entity.parse.failed";
}

export function statusCodeForError(error: unknown): number {
  if (isHttpError(error)) {
    return error.statusCode;
  }

  return statusFromError(error) ?? 500;
}

export function codeForError(error: unknown): string {
  if (isHttpError(error)) {
    return error.code;
  }

  if (isJsonParseError(error)) {
    return "INVALID_JSON";
  }

  const statusCode = statusCodeForError(error);

  if (statusCode === 413) {
    return "PAYLOAD_TOO_LARGE";
  }

  return statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR";
}

export function messageForError(error: unknown): string {
  const statusCode = statusCodeForError(error);

  if (statusCode >= 500) {
    return "Internal server error";
  }

  if (isJsonParseError(error)) {
    return "Invalid JSON request body";
  }

  return error instanceof Error ? error.message : "Request failed";
}

export function errorResponseBody(error: unknown): ErrorResponseBody {
  return {
    error: {
      code: codeForError(error),
      message: messageForError(error)
    }
  };
}
