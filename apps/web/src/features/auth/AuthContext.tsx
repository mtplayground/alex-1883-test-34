import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { apiUrl } from "../../lib/api";

const AUTH_TOKEN_STORAGE_KEY = "auth.token";

type AuthContextValue = {
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  signIn: () => void;
  signOut: () => void;
  token: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function readTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const searchToken = url.searchParams.get("token");
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hashToken = hashParams.get("token");
  const token = searchToken ?? hashToken;

  if (!token) {
    return null;
  }

  url.searchParams.delete("token");
  url.searchParams.delete("tokenType");
  hashParams.delete("token");
  hashParams.delete("tokenType");

  const remainingHash = hashParams.toString();
  url.hash = remainingHash ? `#${remainingHash}` : "";
  window.history.replaceState({}, document.title, url.toString());

  return token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => readStoredToken());

  const setToken = useCallback((nextToken: string | null) => {
    setTokenState(nextToken);
    persistToken(nextToken);
  }, []);

  useEffect(() => {
    const callbackToken = readTokenFromUrl();

    if (callbackToken) {
      setToken(callbackToken);
    }
  }, [setToken]);

  const signIn = useCallback(() => {
    window.location.assign(apiUrl("/api/auth/google"));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(token),
      setToken,
      signIn,
      signOut,
      token
    }),
    [setToken, signIn, signOut, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
