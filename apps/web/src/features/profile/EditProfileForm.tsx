import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import { ApiError, apiJson } from "../../lib/api";
import { useAuth, type CurrentUser } from "../auth/AuthContext";

type AvatarUploadResponse = {
  avatarUrl: string;
  objectKey: string;
};

type ProfileUpdateResponse = {
  user: CurrentUser;
};

const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
const acceptedAvatarTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function initialsForUsername(username: string): string {
  return username.slice(0, 1).toUpperCase();
}

function errorMessageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function EditProfileForm({
  onCancel,
  onSaved,
  user
}: {
  onCancel: () => void;
  onSaved: (user: CurrentUser) => void;
  user: CurrentUser;
}) {
  const { token, updateUser } = useAuth();
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  const previewUrl = (avatarPreviewUrl ?? avatarUrl) || null;
  const isDirty = useMemo(
    () =>
      username.trim() !== user.username ||
      bio.trim() !== (user.bio ?? "") ||
      avatarUrl.trim() !== (user.avatarUrl ?? "") ||
      Boolean(avatarFile),
    [avatarFile, avatarUrl, bio, user.avatarUrl, user.bio, user.username, username]
  );

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0] ?? null;

    setError(null);

    if (!nextFile) {
      setAvatarFile(null);
      return;
    }

    if (!acceptedAvatarTypes.has(nextFile.type)) {
      setAvatarFile(null);
      setError("Avatar must be a GIF, JPEG, PNG, or WebP image.");
      return;
    }

    if (nextFile.size > MAX_AVATAR_FILE_SIZE) {
      setAvatarFile(null);
      setError("Avatar must be 5 MB or smaller.");
      return;
    }

    setAvatarFile(nextFile);
  }

  function clearAvatar(): void {
    setAvatarFile(null);
    setAvatarUrl("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function uploadAvatar(file: File): Promise<string> {
    if (!token) {
      throw new Error("Sign in before uploading an avatar.");
    }

    const response = await apiJson<AvatarUploadResponse>("/me/avatar", {
      body: file,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type
      },
      method: "POST"
    });

    return response.avatarUrl;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!token) {
      setError("Sign in before saving profile changes.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const uploadedAvatarUrl = avatarFile ? await uploadAvatar(avatarFile) : null;
      const nextAvatarUrl = uploadedAvatarUrl ?? (avatarUrl.trim() || null);
      const response = await apiJson<ProfileUpdateResponse>("/me", {
        body: JSON.stringify({
          avatarUrl: nextAvatarUrl,
          bio: bio.trim() || null,
          username: username.trim()
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      updateUser(response.user);
      onSaved(response.user);
    } catch (requestError) {
      setError(errorMessageFor(requestError, "Unable to save profile changes."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="rounded-md border border-slate-800 bg-slate-900/70 p-4 sm:p-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-start gap-3">
          {previewUrl ? (
            <img
              alt="Avatar preview"
              className="h-24 w-24 rounded-full border border-slate-800 object-cover"
              referrerPolicy="no-referrer"
              src={previewUrl}
            />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-800 bg-cyan-300 text-3xl font-semibold text-slate-950">
              {initialsForUsername(username || user.username)}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus-within:ring-2 focus-within:ring-cyan-300">
              Upload
              <input
                accept="image/gif,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleAvatarFileChange}
                ref={fileInputRef}
                type="file"
              />
            </label>
            <button
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              onClick={clearAvatar}
              type="button"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Username</span>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              maxLength={24}
              minLength={3}
              pattern="[A-Za-z0-9_]+"
              required
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-200">Bio</span>
            <textarea
              className="min-h-28 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              maxLength={500}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>

          {error ? (
            <p className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              disabled={isSaving}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              disabled={!isDirty || isSaving}
              type="submit"
            >
              {isSaving ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
