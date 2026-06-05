const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${apiBaseUrl}${normalizedPath}`;
}

export async function apiJson<TResponse>(
  path: string,
  init?: RequestInit
): Promise<TResponse> {
  const response = await fetch(apiUrl(path), init);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Keep the generic status message if the response is not JSON.
    }

    throw new ApiError(response.status, message);
  }

  return (await response.json()) as TResponse;
}
