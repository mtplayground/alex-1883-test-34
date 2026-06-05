import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth } from "../auth/AuthContext";

type FeedMode = "followed" | "global";

type FeedPost = {
  caption: string | null;
  createdAt: string;
  id: string;
  imageUrl: string;
  updatedAt: string;
  user: {
    avatarUrl: string | null;
    id: string;
    username: string;
  };
  userId: string;
};

type FeedResponse = {
  nextCursor: string | null;
  posts: FeedPost[];
};

type FeedLoadState =
  | {
      error: null;
      nextCursor: null;
      posts: [];
      status: "loading";
    }
  | {
      error: string;
      nextCursor: null;
      posts: FeedPost[];
      status: "error";
    }
  | {
      error: null;
      nextCursor: string | null;
      posts: FeedPost[];
      status: "loaded";
    };

const FEED_PAGE_LIMIT = 12;
const skeletonPosts = Array.from({ length: 4 }, (_, index) => index);

function feedPath(mode: FeedMode, cursor: string | null): string {
  const params = new URLSearchParams({
    limit: String(FEED_PAGE_LIMIT)
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/feed/${mode}?${params.toString()}`;
}

function initialsForUsername(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

function formatPostDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function requestInit(token: string | null, signal?: AbortSignal): RequestInit {
  return {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined,
    signal
  };
}

function mergePosts(currentPosts: FeedPost[], nextPosts: FeedPost[]): FeedPost[] {
  const seenPostIds = new Set(currentPosts.map((post) => post.id));
  const uniqueNextPosts = nextPosts.filter((post) => !seenPostIds.has(post.id));

  return [...currentPosts, ...uniqueNextPosts];
}

function AuthorAvatar({ post }: { post: FeedPost }) {
  if (post.user.avatarUrl) {
    return (
      <img
        alt={`${post.user.username} avatar`}
        className="h-10 w-10 rounded-full object-cover"
        referrerPolicy="no-referrer"
        src={post.user.avatarUrl}
      />
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-300 text-sm font-semibold text-slate-950">
      {initialsForUsername(post.user.username)}
    </span>
  );
}

function FeedPostCard({ post }: { post: FeedPost }) {
  const postDate = useMemo(() => formatPostDate(post.createdAt), [post.createdAt]);

  return (
    <article className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/70">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <a
          className="flex min-w-0 items-center gap-3 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          href={`/users/${post.user.username}`}
        >
          <AuthorAvatar post={post} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-100">
              {post.user.username}
            </span>
            <span className="block text-xs text-slate-500">{postDate}</span>
          </span>
        </a>
        <a
          className="shrink-0 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          href={`/posts/${post.id}`}
        >
          Open
        </a>
      </div>

      <a
        className="block bg-slate-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-300"
        href={`/posts/${post.id}`}
      >
        <img
          alt={post.caption ?? `${post.user.username} post`}
          className="max-h-[42rem] w-full object-contain"
          loading="lazy"
          src={post.imageUrl}
        />
      </a>

      <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-slate-200">
        {post.caption || "No caption."}
      </p>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {skeletonPosts.map((slot) => (
        <article
          className="animate-pulse overflow-hidden rounded-md border border-slate-800 bg-slate-900/70"
          key={slot}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 rounded-full bg-slate-800" />
            <div className="space-y-2">
              <div className="h-4 w-28 rounded bg-slate-800" />
              <div className="h-3 w-20 rounded bg-slate-800" />
            </div>
          </div>
          <div className="aspect-[4/3] bg-slate-800" />
          <div className="space-y-2 px-4 py-4">
            <div className="h-4 rounded bg-slate-800" />
            <div className="h-4 w-2/3 rounded bg-slate-800" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function FeedPage() {
  const { isAuthenticated, signIn, token } = useAuth();
  const [feedMode, setFeedMode] = useState<FeedMode>("global");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadState, setLoadState] = useState<FeedLoadState>({
    error: null,
    nextCursor: null,
    posts: [],
    status: "loading"
  });
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    loadMoreAbortRef.current?.abort();
    setIsLoadingMore(false);

    if (feedMode === "followed" && !isAuthenticated) {
      setLoadState({
        error: null,
        nextCursor: null,
        posts: [],
        status: "loaded"
      });
      return () => {
        abortController.abort();
      };
    }

    setLoadState({
      error: null,
      nextCursor: null,
      posts: [],
      status: "loading"
    });

    void apiJson<FeedResponse>(
      feedPath(feedMode, null),
      requestInit(feedMode === "followed" ? token : null, abortController.signal)
    )
      .then((response) => {
        setLoadState({
          error: null,
          nextCursor: response.nextCursor,
          posts: response.posts,
          status: "loaded"
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        const message =
          error instanceof ApiError && error.status === 401
            ? "Sign in to view posts from people you follow."
            : error instanceof Error
              ? error.message
              : "Unable to load feed";

        setLoadState({
          error: message,
          nextCursor: null,
          posts: [],
          status: "error"
        });
      });

    return () => {
      abortController.abort();
    };
  }, [feedMode, isAuthenticated, token]);

  const loadMore = useCallback(() => {
    if (
      isLoadingMore ||
      loadState.status !== "loaded" ||
      !loadState.nextCursor ||
      (feedMode === "followed" && !isAuthenticated)
    ) {
      return;
    }

    const abortController = new AbortController();
    loadMoreAbortRef.current = abortController;
    setIsLoadingMore(true);

    void apiJson<FeedResponse>(
      feedPath(feedMode, loadState.nextCursor),
      requestInit(feedMode === "followed" ? token : null, abortController.signal)
    )
      .then((response) => {
        setLoadState((currentLoadState) => {
          if (currentLoadState.status !== "loaded") {
            return currentLoadState;
          }

          return {
            error: null,
            nextCursor: response.nextCursor,
            posts: mergePosts(currentLoadState.posts, response.posts),
            status: "loaded"
          };
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setLoadState((currentLoadState) => ({
          error: error instanceof Error ? error.message : "Unable to load more posts",
          nextCursor: null,
          posts: currentLoadState.status === "loaded" ? currentLoadState.posts : [],
          status: "error"
        }));
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingMore(false);
        }
      });
  }, [feedMode, isAuthenticated, isLoadingMore, loadState, token]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (
      !sentinel ||
      loadState.status !== "loaded" ||
      !loadState.nextCursor ||
      isLoadingMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      {
        rootMargin: "320px 0px"
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [isLoadingMore, loadMore, loadState]);

  useEffect(() => {
    return () => {
      loadMoreAbortRef.current?.abort();
    };
  }, []);

  const emptyMessage =
    feedMode === "followed"
      ? isAuthenticated
        ? "No followed posts yet."
        : "Sign in to view posts from people you follow."
      : "No posts yet.";

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-100">Feed</h1>
          <p className="mt-2 text-sm text-slate-400">Latest posts, newest first.</p>
        </div>

        <div className="inline-flex rounded-md border border-slate-800 bg-slate-900/70 p-1">
          <button
            className={`rounded px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
              feedMode === "global"
                ? "bg-cyan-300 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            onClick={() => setFeedMode("global")}
            type="button"
          >
            Global
          </button>
          <button
            className={`rounded px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
              feedMode === "followed"
                ? "bg-cyan-300 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            onClick={() => setFeedMode("followed")}
            type="button"
          >
            Following
          </button>
        </div>
      </div>

      {loadState.status === "loading" ? <FeedSkeleton /> : null}

      {loadState.status === "error" ? (
        <div className="rounded-md border border-rose-900/60 bg-rose-950/40 p-4">
          <p className="text-sm text-rose-200">{loadState.error}</p>
        </div>
      ) : null}

      {loadState.status === "loaded" && loadState.posts.length === 0 ? (
        <div className="rounded-md border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm leading-6 text-slate-300">{emptyMessage}</p>
          {feedMode === "followed" && !isAuthenticated ? (
            <button
              className="mt-4 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"
              onClick={signIn}
              type="button"
            >
              Sign in
            </button>
          ) : null}
        </div>
      ) : null}

      {(loadState.status === "loaded" || loadState.status === "error") &&
      loadState.posts.length > 0 ? (
        <div className="space-y-6">
          {loadState.posts.map((post) => (
            <FeedPostCard key={post.id} post={post} />
          ))}
        </div>
      ) : null}

      <div ref={sentinelRef} />

      {isLoadingMore ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading more posts</p>
      ) : null}

      {loadState.status === "loaded" &&
      loadState.posts.length > 0 &&
      !loadState.nextCursor ? (
        <p className="py-6 text-center text-sm text-slate-500">End of feed</p>
      ) : null}
    </section>
  );
}
