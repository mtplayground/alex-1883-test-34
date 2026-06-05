import { SignInButton } from "./features/auth/SignInButton";
import { useAuth } from "./features/auth/AuthContext";
import { ProfilePage } from "./features/profile/ProfilePage";

export default function App() {
  const { error, status, user } = useAuth();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="fixed inset-x-0 top-0 z-10 border-b border-slate-900/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <a className="text-sm font-semibold text-slate-100" href="/">
            Profile
          </a>
          <SignInButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-28">
        {user ? (
          <ProfilePage username={user.username} />
        ) : (
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-6">
            <h1 className="text-2xl font-semibold text-slate-100">Profile</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              {status === "error" && error ? error : "Sign in to view your profile."}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
