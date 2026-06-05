import { useAuth } from "./AuthContext";

function initialsForUsername(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

export function SignInButton() {
  const { isAuthenticated, signIn, signOut, status, user } = useAuth();

  if (status === "loading") {
    return (
      <button
        className="rounded-md border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-400"
        disabled
        type="button"
      >
        Loading
      </button>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex min-w-0 items-center gap-3 rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 shadow-sm">
        {user.avatarUrl ? (
          <img
            alt={`${user.username} avatar`}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
            src={user.avatarUrl}
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-300 text-sm font-semibold text-slate-950">
            {initialsForUsername(user.username)}
          </span>
        )}
        <div className="hidden min-w-0 text-left sm:block">
          <p className="max-w-40 truncate text-sm font-semibold text-slate-100">
            {user.username}
          </p>
          <p className="max-w-48 truncate text-xs text-slate-400">{user.email}</p>
        </div>
        <button
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-100 focus:ring-offset-2 focus:ring-offset-slate-950"
      onClick={signIn}
      type="button"
    >
      Sign in
    </button>
  );
}
