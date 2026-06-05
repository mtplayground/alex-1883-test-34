import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth } from "../auth/AuthContext";

type PostDetail = {
  caption: string | null;
  counts: {
    likes: number;
  };
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

type PostComment = {
  body: string;
  createdAt: string;
  id: string;
  postId: string;
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

type CommentsResponse = {
  comments: PostComment[];
  nextCursor: string | null;
};

type CreateCommentResponse = {
  comment: PostComment;
};

type LikeResponse = {
  counts: {
    likes: number;
  };
  liked: boolean;
  postId: string;
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

type CommentsLoadState =
  | {
      comments: [];
      error: null;
      nextCursor: null;
      status: "loading";
    }
  | {
      comments: PostComment[];
      error: string;
      nextCursor: string | null;
      status: "error";
    }
  | {
      comments: PostComment[];
      error: null;
      nextCursor: string | null;
      status: "loaded";
    };

function initialsForUsername(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

function authHeaders(token: string | null): HeadersInit | undefined {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : undefined;
}

function jsonAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
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

function CommentAvatar({ comment }: { comment: PostComment }) {
  if (comment.user.avatarUrl) {
    return (
      <img
        alt={`${comment.user.username} avatar`}
        className="h-8 w-8 rounded-full object-cover"
        referrerPolicy="no-referrer"
        src={comment.user.avatarUrl}
      />
    );
  }

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
      {initialsForUsername(comment.user.username)}
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
  const { signIn, token } = useAuth();
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [commentsState, setCommentsState] = useState<CommentsLoadState>({
    comments: [],
    error: null,
    nextCursor: null,
    status: "loading"
  });
  const [loadState, setLoadState] = useState<PostDetailLoadState>({
    error: null,
    post: null,
    status: "loading"
  });

  useEffect(() => {
    const abortController = new AbortController();

    setLiked(false);
    setLikeError(null);
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

  useEffect(() => {
    const abortController = new AbortController();

    setCommentsState({
      comments: [],
      error: null,
      nextCursor: null,
      status: "loading"
    });

    void apiJson<CommentsResponse>(
      `/posts/${encodeURIComponent(postId)}/comments?limit=40`,
      {
        signal: abortController.signal
      }
    )
      .then((response) => {
        setCommentsState({
          comments: response.comments,
          error: null,
          nextCursor: response.nextCursor,
          status: "loaded"
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setCommentsState({
          comments: [],
          error: error instanceof Error ? error.message : "Unable to load comments",
          nextCursor: null,
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

    return formatDate(loadState.post.createdAt);
  }, [loadState]);

  function updateLikeCount(nextLikeState: LikeResponse): void {
    setLiked(nextLikeState.liked);
    setLoadState((currentLoadState) => {
      if (currentLoadState.status !== "loaded") {
        return currentLoadState;
      }

      return {
        error: null,
        post: {
          ...currentLoadState.post,
          counts: {
            ...currentLoadState.post.counts,
            likes: nextLikeState.counts.likes
          }
        },
        status: "loaded"
      };
    });
  }

  function handleLikeClick(): void {
    if (!token) {
      signIn();
      return;
    }

    if (loadState.status !== "loaded" || isLiking) {
      return;
    }

    setIsLiking(true);
    setLikeError(null);

    void apiJson<LikeResponse>(`/posts/${encodeURIComponent(postId)}/like`, {
      headers: authHeaders(token),
      method: liked ? "DELETE" : "POST"
    })
      .then(updateLikeCount)
      .catch((error: unknown) => {
        setLikeError(error instanceof Error ? error.message : "Unable to update like");
      })
      .finally(() => {
        setIsLiking(false);
      });
  }

  function handleCommentSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!token) {
      signIn();
      return;
    }

    const body = commentBody.trim();

    if (!body || isSubmittingComment) {
      return;
    }

    setCommentError(null);
    setIsSubmittingComment(true);

    void apiJson<CreateCommentResponse>(
      `/posts/${encodeURIComponent(postId)}/comments`,
      {
        body: JSON.stringify({
          body
        }),
        headers: jsonAuthHeaders(token),
        method: "POST"
      }
    )
      .then((response) => {
        setCommentBody("");
        setCommentsState((currentCommentsState) => ({
          comments:
            currentCommentsState.status === "loaded" ||
            currentCommentsState.status === "error"
              ? [...currentCommentsState.comments, response.comment]
              : [response.comment],
          error: null,
          nextCursor:
            currentCommentsState.status === "loaded" ||
            currentCommentsState.status === "error"
              ? currentCommentsState.nextCursor
              : null,
          status: "loaded"
        }));
      })
      .catch((error: unknown) => {
        setCommentError(
          error instanceof Error ? error.message : "Unable to add comment"
        );
      })
      .finally(() => {
        setIsSubmittingComment(false);
      });
  }

  function loadMoreComments(): void {
    if (
      commentsState.status !== "loaded" ||
      !commentsState.nextCursor ||
      isLoadingMoreComments
    ) {
      return;
    }

    setIsLoadingMoreComments(true);
    setCommentError(null);

    const params = new URLSearchParams({
      cursor: commentsState.nextCursor,
      limit: "40"
    });

    void apiJson<CommentsResponse>(
      `/posts/${encodeURIComponent(postId)}/comments?${params.toString()}`
    )
      .then((response) => {
        setCommentsState((currentCommentsState) => {
          const currentComments =
            currentCommentsState.status === "loaded" ||
            currentCommentsState.status === "error"
              ? currentCommentsState.comments
              : [];
          const seenCommentIds = new Set(currentComments.map((comment) => comment.id));
          const nextComments = response.comments.filter(
            (comment) => !seenCommentIds.has(comment.id)
          );

          return {
            comments: [...currentComments, ...nextComments],
            error: null,
            nextCursor: response.nextCursor,
            status: "loaded"
          };
        });
      })
      .catch((error: unknown) => {
        setCommentError(
          error instanceof Error ? error.message : "Unable to load more comments"
        );
      })
      .finally(() => {
        setIsLoadingMoreComments(false);
      });
  }

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
          <img
            alt={post.caption ?? `${post.user.username} post`}
            className="max-h-[calc(100vh-10rem)] w-full object-contain"
            src={post.imageUrl}
          />
        </div>

        <aside className="rounded-md border border-slate-800 bg-slate-900/70">
          <div className="border-b border-slate-800 p-5">
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

            <div className="mt-5 flex items-center gap-3">
              <button
                className={`rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                  liked
                    ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                    : "border border-slate-700 text-slate-100 hover:border-slate-500 hover:bg-slate-800"
                }`}
                disabled={isLiking}
                onClick={handleLikeClick}
                type="button"
              >
                {liked ? "Liked" : "Like"}
              </button>
              <span className="text-sm text-slate-400">
                {post.counts.likes} {post.counts.likes === 1 ? "like" : "likes"}
              </span>
            </div>
            {likeError ? (
              <p className="mt-2 text-sm text-rose-200">{likeError}</p>
            ) : null}
          </div>

          <div className="p-5">
            <h2 className="text-sm font-semibold uppercase text-slate-400">Comments</h2>

            {commentsState.status === "loading" ? (
              <p className="mt-4 text-sm text-slate-500">Loading comments</p>
            ) : null}

            {commentsState.status === "error" ? (
              <p className="mt-4 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                {commentsState.error}
              </p>
            ) : null}

            {(commentsState.status === "loaded" || commentsState.status === "error") &&
            commentsState.comments.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No comments yet.</p>
            ) : null}

            {(commentsState.status === "loaded" || commentsState.status === "error") &&
            commentsState.comments.length > 0 ? (
              <div className="mt-4 space-y-4">
                {commentsState.comments.map((comment) => (
                  <div className="flex gap-3" key={comment.id}>
                    <CommentAvatar comment={comment} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-slate-100">
                          {comment.user.username}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {commentsState.status === "loaded" && commentsState.nextCursor ? (
              <button
                className="mt-5 w-full rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                disabled={isLoadingMoreComments}
                onClick={loadMoreComments}
                type="button"
              >
                {isLoadingMoreComments ? "Loading" : "Load more"}
              </button>
            ) : null}

            <form className="mt-6" onSubmit={handleCommentSubmit}>
              <label
                className="mb-2 block text-sm font-medium text-slate-300"
                htmlFor="comment-body"
              >
                Add a comment
              </label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40"
                id="comment-body"
                maxLength={1000}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder={token ? "Write a comment" : "Sign in to comment"}
                value={commentBody}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {commentBody.trim().length}/1000
                </span>
                <button
                  className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    token
                      ? isSubmittingComment || commentBody.trim().length === 0
                      : false
                  }
                  type="submit"
                >
                  {token ? (isSubmittingComment ? "Posting" : "Post") : "Sign in"}
                </button>
              </div>
              {commentError ? (
                <p className="mt-2 text-sm text-rose-200">{commentError}</p>
              ) : null}
            </form>
          </div>
        </aside>
      </div>
    </article>
  );
}
