import { useEffect, useMemo, useState } from "react";
import { ApiError, apiJson } from "../../lib/api";

type PostDetail = {
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

type PostDetailResponse = {
  post: PostDetail;
};

type PostDetailLoadState =
  | {
      error: null;
      post: null;
      status: "loading";
    }
  | {
      error: string;
      post: null;
      status: "error";
    }
  | {
      error: null;
      post: PostDetail;
      status: "loaded";
    };

function initialsForUsername(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

function AuthorAvatar({ post }: { post: PostDetail }) {
  if (post.user.avatarUrl) {
    return (
      <img
        alt={`${post.user.username} avatar`}
        className="h-11 w-11 rounded-full object-cover"
        referrerPolicy="no-referrer"
        src={post.user.avatarUrl}
      />
    );
  }

  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-300 text-base font-semibold text-slate-950">
      {initialsForUsername(post.user.username)}
    </span>
  );
}

function PostDetailSkeleton() {
  return (
    <section className="animate-pulse">
      <div className="mb-6 h-9 w-32 rounded bg-slate-900" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="aspect-square rounded-md bg-slate-900" />
        <div className="space-y-4">
          <div className="h-12 rounded bg-slate-900" />
          <div className="h-28 rounded bg-slate-900" />
        </div>
      </div>
    </section>
  );
}

export function PostDetailPage({ postId }: { postId: string }) {
  const [loadState, setLoadState] = useState<PostDetailLoadState>({
    error: null,
    post: null,
    status: "loading"
  });

  useEffect(() => {
    const abortController = new AbortController();

    setLoadState({
      error: null,
      post: null,
      status: "loading"
    });

    void apiJson<PostDetailResponse>(`/posts/${encodeURIComponent(postId)}`, {
      signal: abortController.signal
    })
      .then((response) => {
        setLoadState({
          error: null,
          post: response.post,
          status: "loaded"
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        const message =
          error instanceof ApiError && error.status === 404
            ? "Post not found"
            : error instanceof Error
              ? error.message
              : "Unable to load post";

        setLoadState({
          error: message,
          post: null,
          status: "error"
        });
      });

    return () => {
      abortController.abort();
    };
  }, [postId]);

  const createdDate = useMemo(() => {
    if (loadState.status !== "loaded") {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(loadState.post.createdAt));
  }, [loadState]);

  if (loadState.status === "loading") {
    return <PostDetailSkeleton />;
  }

  if (loadState.status === "error") {
    return (
      <section className="rounded-md border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-xl font-semibold text-slate-100">{loadState.error}</h1>
      </section>
    );
  }

  const { post } = loadState;

  return (
    <article>
      <div className="mb-6">
        <a
          className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          href="/"
        >
          Back
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
          <img
            alt={post.caption ?? `${post.user.username} post`}
            className="max-h-[calc(100vh-10rem)] w-full object-contain"
            src={post.imageUrl}
          />
        </div>

        <aside className="rounded-md border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center gap-3">
            <AuthorAvatar post={post} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-100">
                {post.user.username}
              </h1>
              {createdDate ? (
                <p className="text-sm text-slate-500">{createdDate}</p>
              ) : null}
            </div>
          </div>

          <p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-slate-200">
            {post.caption || "No caption."}
          </p>
        </aside>
      </div>
    </article>
  );
}
