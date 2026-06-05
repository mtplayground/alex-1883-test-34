import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth } from "../auth/AuthContext";

export type ProfilePost = {
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

type CreatePostResponse = {
  post: ProfilePost;
};

const MAX_CAPTION_LENGTH = 2_200;
const MAX_POST_IMAGE_SIZE = 10 * 1024 * 1024;
const acceptedPostImageTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function errorMessageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function CreatePostForm({
  onCancel,
  onCreated
}: {
  onCancel: () => void;
  onCreated: (post: ProfilePost) => void;
}) {
  const { token } = useAuth();
  const [caption, setCaption] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0] ?? null;

    setError(null);

    if (!nextFile) {
      setImageFile(null);
      return;
    }

    if (!acceptedPostImageTypes.has(nextFile.type)) {
      setImageFile(null);
      setError("Image must be a GIF, JPEG, PNG, or WebP file.");
      return;
    }

    if (nextFile.size > MAX_POST_IMAGE_SIZE) {
      setImageFile(null);
      setError("Image must be 10 MB or smaller.");
      return;
    }

    setImageFile(nextFile);
  }

  function clearImage(): void {
    setImageFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token) {
      setError("Sign in before creating a post.");
      return;
    }

    if (!imageFile) {
      setError("Choose an image before creating a post.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      const normalizedCaption = caption.trim();

      formData.append("image", imageFile);

      if (normalizedCaption) {
        formData.append("caption", normalizedCaption);
      }

      const response = await apiJson<CreatePostResponse>("/posts", {
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "POST"
      });

      setCaption("");
      onCreated(response.post);
    } catch (requestError) {
      setError(errorMessageFor(requestError, "Unable to create post."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="rounded-md border border-slate-800 bg-slate-900/70 p-4 sm:p-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,16rem)_1fr]">
        <div>
          {imagePreviewUrl ? (
            <img
              alt="Post preview"
              className="aspect-square w-full rounded-md border border-slate-800 object-cover"
              src={imagePreviewUrl}
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-950 text-sm text-slate-500">
              Image
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus-within:ring-2 focus-within:ring-cyan-300">
              Upload
              <input
                accept="image/gif,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleImageChange}
                ref={fileInputRef}
                type="file"
              />
            </label>
            <button
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              onClick={clearImage}
              type="button"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Caption</span>
            <textarea
              className="min-h-40 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              maxLength={MAX_CAPTION_LENGTH}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              {caption.length.toLocaleString()} / {MAX_CAPTION_LENGTH.toLocaleString()}
            </span>
          </div>

          {error ? (
            <p className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              disabled={!imageFile || isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Posting" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
