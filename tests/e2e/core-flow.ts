import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { resolve } from "node:path";
import { PrismaClient, type User } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET || "e2e-core-flow-secret";
const runId = `e2e${Date.now().toString(36)}`;
const authorUsername = `${runId}_a`;
const viewerUsername = `${runId}_v`;

type AuthenticatedUserResponse = {
  user: {
    id: string;
    username: string;
  };
};

type PostSummary = {
  caption: string | null;
  counts: {
    likes: number;
  };
  id: string;
  imageUrl: string;
  user: {
    id: string;
    username: string;
  };
  userId: string;
};

type PostResponse = {
  post: PostSummary;
};

type PostsResponse = {
  nextCursor: string | null;
  posts: PostSummary[];
};

type LikeResponse = {
  counts: {
    likes: number;
  };
  liked: boolean;
  postId: string;
};

type CommentResponse = {
  comment: {
    body: string;
    id: string;
    postId: string;
    user: {
      username: string;
    };
  };
};

type CommentsResponse = {
  comments: Array<{
    body: string;
    id: string;
    postId: string;
    user: {
      username: string;
    };
  }>;
  nextCursor: string | null;
};

type FollowResponse = {
  counts: {
    followers: number;
    following: number;
  };
  followed: boolean;
  user: {
    id: string;
    username: string;
  };
};

type FollowListResponse = {
  nextCursor: string | null;
  users: Array<{
    id: string;
    username: string;
  }>;
};

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function authHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`
  };
}

function issueTestJwt(user: Pick<User, "id" | "username">): string {
  return jwt.sign(
    {
      username: user.username
    },
    jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: "1h",
      subject: user.id
    }
  );
}

async function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }

        reject(new Error("Unable to allocate a local port for E2E API server"));
      });
    });
  });
}

async function waitForApi(baseUrl: string, processOutput: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`API server did not become healthy. Output:\n${processOutput()}`);
}

function startApi(port: number): ChildProcessWithoutNullStreams {
  const command =
    process.platform === "win32"
      ? resolve("node_modules/.bin/tsx.cmd")
      : resolve("node_modules/.bin/tsx");

  return spawn(command, ["apps/api/src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      JWT_SECRET: jwtSecret,
      NODE_ENV: "test",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function stopApi(api: ChildProcessWithoutNullStreams): Promise<void> {
  if (api.exitCode !== null || api.signalCode !== null) {
    return;
  }

  api.kill("SIGTERM");

  const forceKillTimeout = setTimeout(() => {
    api.kill("SIGKILL");
  }, 3_000);

  try {
    await once(api, "exit");
  } finally {
    clearTimeout(forceKillTimeout);
  }
}

async function apiJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  expectedStatus = 200
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} for ${path}, got ${response.status}: ${text}`
    );
  }

  return body as T;
}

async function createUsers() {
  const [author, viewer] = await Promise.all([
    prisma.user.create({
      data: {
        bio: "E2E author",
        email: `${authorUsername}@example.test`,
        googleId: `${runId}-author-google`,
        username: authorUsername
      }
    }),
    prisma.user.create({
      data: {
        bio: "E2E viewer",
        email: `${viewerUsername}@example.test`,
        googleId: `${runId}-viewer-google`,
        username: viewerUsername
      }
    })
  ]);

  return {
    author,
    viewer
  };
}

function hasObjectStorageConfig(): boolean {
  return Boolean(
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID &&
    process.env.OBJECT_STORAGE_BUCKET &&
    process.env.OBJECT_STORAGE_ENDPOINT &&
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY
  );
}

async function createPost(baseUrl: string, token: string, author: User) {
  const caption = `Core flow post ${runId}`;

  if (hasObjectStorageConfig()) {
    const formData = new FormData();
    const pngBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
      0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
      0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
      0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01,
      0x00, 0xc9, 0xfe, 0x92, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82
    ]);

    formData.set("caption", caption);
    formData.set(
      "image",
      new Blob([pngBytes], {
        type: "image/png"
      }),
      `${runId}.png`
    );

    return apiJson<PostResponse>(
      baseUrl,
      "/posts",
      {
        body: formData,
        headers: authHeader(token),
        method: "POST"
      },
      201
    );
  }

  const post = await prisma.post.create({
    data: {
      caption,
      imageUrl: `https://example.test/${runId}.png`,
      userId: author.id
    },
    include: {
      _count: {
        select: {
          likes: true
        }
      },
      user: {
        select: {
          avatarUrl: true,
          id: true,
          username: true
        }
      }
    }
  });

  console.log("Object storage is not configured; seeded post metadata directly.");

  return {
    post: {
      caption: post.caption,
      counts: {
        likes: post._count.likes
      },
      id: post.id,
      imageUrl: post.imageUrl,
      user: post.user,
      userId: post.userId
    }
  };
}

async function runCoreFlow(): Promise<void> {
  assertCondition(process.env.DATABASE_URL, "DATABASE_URL is required for E2E tests");

  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const api = startApi(port);
  let apiOutput = "";

  api.stdout.on("data", (chunk: Buffer) => {
    apiOutput += chunk.toString();
  });
  api.stderr.on("data", (chunk: Buffer) => {
    apiOutput += chunk.toString();
  });

  const createdUserIds: string[] = [];

  try {
    await waitForApi(baseUrl, () => apiOutput);

    const { author, viewer } = await createUsers();
    createdUserIds.push(author.id, viewer.id);

    const authorToken = issueTestJwt(author);
    const viewerToken = issueTestJwt(viewer);

    const me = await apiJson<AuthenticatedUserResponse>(baseUrl, "/me", {
      headers: authHeader(authorToken)
    });
    assertCondition(me.user.username === author.username, "JWT login returned author");

    const postResponse = await createPost(baseUrl, authorToken, author);
    const { post } = postResponse;
    assertCondition(post.userId === author.id, "Post belongs to author");

    const globalFeed = await apiJson<PostsResponse>(baseUrl, "/feed/global?limit=10");
    assertCondition(
      globalFeed.posts.some((feedPost) => feedPost.id === post.id),
      "Global feed includes created post"
    );

    const userPosts = await apiJson<PostsResponse>(
      baseUrl,
      `/users/${author.username}/posts?limit=10`
    );
    assertCondition(
      userPosts.posts.some((userPost) => userPost.id === post.id),
      "Profile post list includes created post"
    );

    const like = await apiJson<LikeResponse>(baseUrl, `/posts/${post.id}/like`, {
      headers: authHeader(viewerToken),
      method: "POST"
    });
    assertCondition(like.liked === true, "Like endpoint marks post as liked");
    assertCondition(like.counts.likes === 1, "Like count increments");

    const comment = await apiJson<CommentResponse>(
      baseUrl,
      `/posts/${post.id}/comments`,
      {
        body: JSON.stringify({
          body: `Core flow comment ${runId}`
        }),
        headers: {
          ...authHeader(viewerToken),
          "Content-Type": "application/json"
        },
        method: "POST"
      },
      201
    );
    assertCondition(
      comment.comment.user.username === viewer.username,
      "Comment author"
    );

    const comments = await apiJson<CommentsResponse>(
      baseUrl,
      `/posts/${post.id}/comments?limit=10`
    );
    assertCondition(
      comments.comments.some((item) => item.id === comment.comment.id),
      "Comment list includes new comment"
    );

    const followed = await apiJson<FollowResponse>(
      baseUrl,
      `/users/${author.username}/follow`,
      {
        headers: authHeader(viewerToken),
        method: "POST"
      }
    );
    assertCondition(followed.followed === true, "Follow endpoint follows author");
    assertCondition(followed.counts.followers === 1, "Follower count increments");

    const followers = await apiJson<FollowListResponse>(
      baseUrl,
      `/users/${author.username}/followers?limit=10`
    );
    assertCondition(
      followers.users.some((user) => user.id === viewer.id),
      "Follower list includes viewer"
    );

    const following = await apiJson<FollowListResponse>(
      baseUrl,
      `/users/${viewer.username}/following?limit=10`
    );
    assertCondition(
      following.users.some((user) => user.id === author.id),
      "Following list includes author"
    );

    const followedFeed = await apiJson<PostsResponse>(
      baseUrl,
      "/feed/followed?limit=10",
      {
        headers: authHeader(viewerToken)
      }
    );
    assertCondition(
      followedFeed.posts.some((feedPost) => feedPost.id === post.id),
      "Followed feed includes followed author's post"
    );

    const postDetail = await apiJson<PostResponse>(baseUrl, `/posts/${post.id}`);
    assertCondition(postDetail.post.counts.likes === 1, "Post detail has like count");
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds
          }
        }
      });
    }

    await prisma.$disconnect();
    await stopApi(api);
  }
}

await runCoreFlow();

console.log("Core E2E flow passed: login, post, feed, like, comment, follow.");
