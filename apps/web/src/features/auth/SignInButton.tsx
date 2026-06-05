import { useAuth } from "./AuthContext";

export function SignInButton() {
  const { isAuthenticated, signIn, signOut } = useAuth();

  if (isAuthenticated) {
    return (
      <button
        className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
        onClick={signOut}
        type="button"
      >
        Sign out
      </button>
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
