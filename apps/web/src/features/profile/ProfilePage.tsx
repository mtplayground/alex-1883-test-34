import { useEffect, useMemo, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth, type CurrentUser } from "../auth/AuthContext";
import { CreatePostForm, type ProfilePost } from "./CreatePostForm";
import { EditProfileForm } from "./EditProfileForm";

type ProfileCounts = {
  followers: number;
  following: number;
  posts: number;
};

type ProfileUser = {
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  id: string;
  updatedAt: string;
  username: string;
};

type ProfileResponse = {
  counts: ProfileCounts;
  user: ProfileUser;
};

type ProfileLoadState =
  | {
      error: null;
      profile: null;
      status: "loading";
    }
  | {
      error: string;
      profile: null;
      status: "error";
    }
  | {
      error: null;
      profile: ProfileResponse;
      status: "loaded";
    };

type PostsResponse = {
  nextCursor: string | null;
  posts: ProfilePost[];
};

type PostsLoadState =
  | {
      error: null;
      posts: null;
      status: "loading";
    }
  | {
      error: string;
      posts: null;
      status: "error";
    }
  | {
      error: null;
      posts: ProfilePost[];
      status: "loaded";
    };

const emptyGridSlots = Array.from({ length: 9 }, (_, index) => index);

function initialsForUsername(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? "compact" : "standard"
  }).format(value);
}

function ProfileAvatar({ user }: { user: ProfileUser }) {
  if (user.avatarUrl) {
    return (
      <img
        alt={`${user.username} avatar`}
        className="h-24 w-24 rounded-full border border-slate-800 object-cover sm:h-32 sm:w-32"
        referrerPolicy="no-referrer"
        src={user.avatarUrl}
      />
    );
  }

  return (
    <span className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-800 bg-cyan-300 text-4xl font-semibold text-slate-950 sm:h-32 sm:w-32">
      {initialsForUsername(user.username)}
    </span>
  );
}

function ProfileStats({ counts }: { counts: ProfileCounts }) {
  const stats = [
    ["Posts", counts.posts],
    ["Followers", counts.followers],
    ["Following", counts.following]
  ] as const;

  return (
    <dl className="grid grid-cols-3 gap-2 text-center sm:max-w-md">
      {stats.map(([label, value]) => (
        <div
          className="rounded-md border border-slate-800 bg-slate-900/70 p-3"
          key={label}
        >
          <dt className="text-xs uppercase text-slate-500">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-slate-100">
            {formatCount(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyPostGrid() {
  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-2">
      {emptyGridSlots.map((slot) => (
        <div
          aria-hidden="true"
          className="aspect-square rounded-sm border border-dashed border-slate-800 bg-slate-900/35"
          key={slot}
        />
      ))}
    </div>
  );
}

function PostGrid({ posts }: { posts: ProfilePost[] }) {
  if (posts.length === 0) {
    return <EmptyPostGrid />;
  }

  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-2">
      {posts.map((post) => (
        <a
          className="group relative block aspect-square overflow-hidden rounded-sm bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          href={`/posts/${post.id}`}
          key={post.id}
        >
          <img
            alt={post.caption ?? `${post.user.username} post`}
            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            loading="lazy"
            src={post.imageUrl}
          />
        </a>
      ))}
    </div>
  );
}

function PostGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-2">
      {emptyGridSlots.map((slot) => (
        <div
          className="aspect-square animate-pulse rounded-sm bg-slate-900"
          key={slot}
        />
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <section className="animate-pulse">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="h-24 w-24 rounded-full bg-slate-900 sm:h-32 sm:w-32" />
        <div className="flex-1">
          <div className="h-8 w-48 rounded bg-slate-900" />
          <div className="mt-4 grid max-w-md grid-cols-3 gap-2">
            <div className="h-20 rounded-md bg-slate-900" />
            <div className="h-20 rounded-md bg-slate-900" />
            <div className="h-20 rounded-md bg-slate-900" />
          </div>
          <div className="mt-5 h-5 max-w-lg rounded bg-slate-900" />
        </div>
      </div>
      <div className="mt-10 grid grid-cols-3 gap-1 sm:gap-2">
        {emptyGridSlots.map((slot) => (
          <div className="aspect-square rounded-sm bg-slate-900" key={slot} />
        ))}
      </div>
    </section>
  );
}

export function ProfilePage({ username }: { username: string }) {
  const { user: authenticatedUser } = useAuth();
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadState, setLoadState] = useState<ProfileLoadState>({
    error: null,
    profile: null,
    status: "loading"
  });
  const [postsState, setPostsState] = useState<PostsLoadState>({
    error: null,
    posts: null,
    status: "loading"
  });

  useEffect(() => {
    const abortController = new AbortController();

    setLoadState({
      error: null,
      profile: null,
      status: "loading"
    });

    void apiJson<ProfileResponse>(`/users/${encodeURIComponent(username)}`, {
      signal: abortController.signal
    })
      .then((profile) => {
        setLoadState({
          error: null,
          profile,
          status: "loaded"
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        const message =
          error instanceof ApiError && error.status === 404
            ? "Profile not found"
            : error instanceof Error
              ? error.message
              : "Unable to load profile";

        setLoadState({
          error: message,
          profile: null,
          status: "error"
        });
      });

    return () => {
      abortController.abort();
    };
  }, [username]);

  useEffect(() => {
    const abortController = new AbortController();

    setPostsState({
      error: null,
      posts: null,
      status: "loading"
    });

    void apiJson<PostsResponse>(`/users/${encodeURIComponent(username)}/posts`, {
      signal: abortController.signal
    })
      .then((response) => {
        setPostsState({
          error: null,
          posts: response.posts,
          status: "loaded"
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setPostsState({
          error: error instanceof Error ? error.message : "Unable to load posts",
          posts: null,
          status: "error"
        });
      });

    return () => {
      abortController.abort();
    };
  }, [username]);

  function handleProfileSaved(updatedUser: CurrentUser): void {
    setIsEditing(false);
    setLoadState((currentLoadState) => {
      if (currentLoadState.status !== "loaded") {
        return currentLoadState;
      }

      return {
        error: null,
        profile: {
          counts: currentLoadState.profile.counts,
          user: {
            avatarUrl: updatedUser.avatarUrl,
            bio: updatedUser.bio,
            createdAt: updatedUser.createdAt,
            id: updatedUser.id,
            updatedAt: updatedUser.updatedAt,
            username: updatedUser.username
          }
        },
        status: "loaded"
      };
    });
  }

  function handlePostCreated(post: ProfilePost): void {
    setIsCreatingPost(false);
    setPostsState((currentPostsState) => {
      if (currentPostsState.status !== "loaded") {
        return {
          error: null,
          posts: [post],
          status: "loaded"
        };
      }

      return {
        error: null,
        posts: [post, ...currentPostsState.posts],
        status: "loaded"
      };
    });
    setLoadState((currentLoadState) => {
      if (currentLoadState.status !== "loaded") {
        return currentLoadState;
      }

      return {
        error: null,
        profile: {
          counts: {
            ...currentLoadState.profile.counts,
            posts: currentLoadState.profile.counts.posts + 1
          },
          user: currentLoadState.profile.user
        },
        status: "loaded"
      };
    });
  }

  const joinedDate = useMemo(() => {
    if (loadState.status !== "loaded") {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric"
    }).format(new Date(loadState.profile.user.createdAt));
  }, [loadState]);

  if (loadState.status === "loading") {
    return <ProfileSkeleton />;
  }

  if (loadState.status === "error") {
    return (
      <section className="rounded-md border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-xl font-semibold text-slate-100">{loadState.error}</h1>
      </section>
    );
  }

  const { counts, user } = loadState.profile;
  const canEditProfile = authenticatedUser?.id === user.id;

  return (
    <section>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <ProfileAvatar user={user} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-3xl font-semibold text-slate-100 sm:text-4xl">
              {user.username}
            </h1>
            {canEditProfile ? (
              <button
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                onClick={() => setIsEditing((current) => !current)}
                type="button"
              >
                {isEditing ? "Close" : "Edit"}
              </button>
            ) : null}
            {joinedDate ? (
              <span className="rounded-md border border-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400">
                Joined {joinedDate}
              </span>
            ) : null}
          </div>
          <div className="mt-5">
            <ProfileStats counts={counts} />
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            {user.bio || "No bio yet."}
          </p>
        </div>
      </div>

      {isEditing && authenticatedUser ? (
        <div className="mt-8">
          <EditProfileForm
            onCancel={() => setIsEditing(false)}
            onSaved={handleProfileSaved}
            user={authenticatedUser}
          />
        </div>
      ) : null}

      {isCreatingPost && authenticatedUser ? (
        <div className="mt-8">
          <CreatePostForm
            onCancel={() => setIsCreatingPost(false)}
            onCreated={handlePostCreated}
          />
        </div>
      ) : null}

      <div className="mt-10 border-t border-slate-800 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-slate-400">Posts</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{formatCount(counts.posts)}</span>
            {canEditProfile ? (
              <button
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                onClick={() => setIsCreatingPost((current) => !current)}
                type="button"
              >
                {isCreatingPost ? "Close" : "New"}
              </button>
            ) : null}
          </div>
        </div>
        {postsState.status === "loading" ? <PostGridSkeleton /> : null}
        {postsState.status === "error" ? (
          <p className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {postsState.error}
          </p>
        ) : null}
        {postsState.status === "loaded" ? <PostGrid posts={postsState.posts} /> : null}
      </div>
    </section>
  );
}
