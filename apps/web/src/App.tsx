import { SignInButton } from "./features/auth/SignInButton";
import { useAuth } from "./features/auth/AuthContext";
import { FeedPage } from "./features/feed/FeedPage";
import { PostDetailPage } from "./features/posts/PostDetailPage";
import { ProfilePage } from "./features/profile/ProfilePage";

function postIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/posts\/([^/]+)\/?$/);

  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function usernameFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/users\/([^/]+)\/?$/);

  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default function App() {
  const { user } = useAuth();
  const postId = postIdFromPathname(window.location.pathname);
  const username = usernameFromPathname(window.location.pathname);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="fixed inset-x-0 top-0 z-10 border-b border-slate-900/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <nav className="flex items-center gap-4">
            <a className="text-sm font-semibold text-slate-100" href="/">
              Feed
            </a>
            {user ? (
              <a
                className="text-sm font-medium text-slate-400 transition hover:text-slate-100"
                href={`/users/${user.username}`}
              >
                Profile
              </a>
            ) : null}
          </nav>
          <SignInButton />
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-28">
        {postId ? (
          <PostDetailPage postId={postId} />
        ) : username ? (
          <ProfilePage username={username} />
        ) : (
          <FeedPage />
        )}
      </section>
    </main>
  );
}
