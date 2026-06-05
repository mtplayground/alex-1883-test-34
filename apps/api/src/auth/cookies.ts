export function readCookieValue(
  cookieHeader: string | undefined,
  cookieName: string
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === cookieName) {
      const rawValue = rawValueParts.join("=");

      return rawValue ? decodeURIComponent(rawValue) : "";
    }
  }

  return undefined;
}
