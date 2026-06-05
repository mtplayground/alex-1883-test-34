import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { ApiError, apiJson, apiUrl } from "../../lib/api";

const AUTH_TOKEN_STORAGE_KEY = "auth.token";

type CurrentUser = {
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  email: string;
  id: string;
  updatedAt: string;
  username: string;
};

type AuthStatus = "anonymous" | "authenticated" | "error" | "loading";

type AuthContextValue = {
  error: string | null;
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  signIn: () => void;
  signOut: () => void;
  status: AuthStatus;
  token: string | null;
  user: CurrentUser | null;
};

type MeResponse = {
  user: CurrentUser;
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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(token ? "loading" : "anonymous");
  const [error, setError] = useState<string | null>(null);

  const setToken = useCallback((nextToken: string | null) => {
    setTokenState(nextToken);
    persistToken(nextToken);

    if (!nextToken) {
      setUser(null);
      setStatus("anonymous");
      setError(null);
    }
  }, []);

  useEffect(() => {
    const callbackToken = readTokenFromUrl();

    if (callbackToken) {
      setToken(callbackToken);
    }
  }, [setToken]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const abortController = new AbortController();

    setStatus("loading");
    setError(null);

    void apiJson<MeResponse>("/me", {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: abortController.signal
    })
      .then((response) => {
        setUser(response.user);
        setStatus("authenticated");
      })
      .catch((requestError: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setUser(null);

        if (requestError instanceof ApiError && requestError.status === 401) {
          setToken(null);
          return;
        }

        setStatus("error");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load current user"
        );
      });

    return () => {
      abortController.abort();
    };
  }, [setToken, token]);

  const signIn = useCallback(() => {
    window.location.assign(apiUrl("/api/auth/google"));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      isAuthenticated: status === "authenticated" && Boolean(user),
      setToken,
      signIn,
      signOut,
      status,
      token,
      user
    }),
    [error, setToken, signIn, signOut, status, token, user]
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
