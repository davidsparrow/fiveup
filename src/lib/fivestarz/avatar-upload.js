// Browser-side avatar pipeline: resize to a square, keep transparency when
// the source has any, upload to the public `avatars` bucket under the
// member's own id, and point user_profiles.avatar_url at it.
//
// Objects live at <uid>/avatar.<ext> and are upserted, so nothing accumulates;
// the stored URL carries ?v=<timestamp> so the CDN serves the new file.

const AVATARS_BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

function hasTransparency(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);
  // Sampling every 16th pixel is plenty to spot a cut-out.
  for (let i = 3; i < data.length; i += 4 * 16) {
    if (data[i] < 255) return true;
  }
  return false;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image."))), type, quality);
  });
}

/**
 * Decode, cover-crop to a centred square of `size`, and re-encode. A source
 * with any alpha stays PNG (JPEG would flatten a cut-out onto black);
 * everything else becomes JPEG.
 */
export async function prepareAvatar(file, { size = 512 } = {}) {
  if (!file || !ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Please choose a PNG, JPEG or WebP image.");
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image couldn't be read. Try a PNG or JPEG.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close?.();

  const keepAlpha = file.type !== "image/jpeg" && hasTransparency(ctx, size);
  const type = keepAlpha ? "image/png" : "image/jpeg";
  const blob = await toBlob(canvas, type, keepAlpha ? undefined : 0.86);
  if (blob.size > MAX_BYTES) {
    throw new Error("That image is still over 2 MB after resizing. Try a smaller one.");
  }
  return { blob, ext: keepAlpha ? "png" : "jpg", contentType: type };
}

const candidatePaths = (userId) => [`${userId}/avatar.png`, `${userId}/avatar.jpg`];

/** Prepare, upload, point the profile at it. Returns the public URL. */
export async function uploadAvatar(supabase, userId, file) {
  const { blob, ext, contentType } = await prepareAvatar(file);
  const path = `${userId}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, blob, { contentType, upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;

  // Best effort: drop the other extension so a format switch leaves one file.
  const sibling = candidatePaths(userId).filter((p) => p !== path);
  await supabase.storage.from(AVATARS_BUCKET).remove(sibling).catch(() => {});

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error: rpcErr } = await supabase.rpc("update_my_profile", { p_avatar_url: url });
  if (rpcErr) throw rpcErr;
  return url;
}

/** Remove the stored files and clear avatar_url. */
export async function clearAvatar(supabase, userId) {
  await supabase.storage.from(AVATARS_BUCKET).remove(candidatePaths(userId)).catch(() => {});
  const { error } = await supabase.rpc("update_my_profile", { p_clear_avatar_url: true });
  if (error) throw error;
}
