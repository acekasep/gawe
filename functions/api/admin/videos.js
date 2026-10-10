
import { requireAdmin } from "../../_lib/require-admin.js";
import { jsonResponse } from "../../_lib/admin-auth.js";

function makeId() {
  return crypto.randomUUID();
}

function makeSlug() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

// GET /api/admin/videos
// Mengambil daftar video dari D1.
export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await env.DB
      .prepare(
        `SELECT
           id,
           title,
           slug,
           video_key,
           thumbnail_key,
           description,
           affiliate,
           created_at,
           updated_at
         FROM videos
         ORDER BY created_at DESC`
      )
      .all();

    return jsonResponse({
      ok: true,
      videos: result.results || [],
    });
  } catch (error) {
    console.error("VIDEOS_LIST_ERROR", error?.name || "UnknownError");

    return jsonResponse(
      { ok: false, error: "Gagal mengambil daftar video." },
      500
    );
  }
}

// POST /api/admin/videos
// Menyimpan metadata video ke D1.
// File video harus sudah diunggah ke R2.
export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: "Format permintaan tidak valid." },
      400
    );
  }

  const title =
    typeof body?.title === "string" ? body.title.trim() : "";

  const videoKey =
    typeof body?.video_key === "string" ? body.video_key.trim() : "";

  const thumbnailKey =
    typeof body?.thumbnail_key === "string"
      ? body.thumbnail_key.trim()
      : "";

  const description =
    typeof body?.description === "string"
      ? body.description.trim()
      : "";

  const affiliate =
    typeof body?.affiliate === "string"
      ? body.affiliate.trim()
      : "";

  if (!title || !videoKey) {
    return jsonResponse(
      { ok: false, error: "Judul dan video_key wajib diisi." },
      400
    );
  }

  if (
    title.length > 250 ||
    videoKey.length > 500 ||
    thumbnailKey.length > 500 ||
    description.length > 5000 ||
    affiliate.length > 2000
  ) {
    return jsonResponse(
      { ok: false, error: "Ada kolom yang melebihi batas panjang." },
      400
    );
  }

  // Key harus berupa nama objek R2, bukan URL arbitrer.
  if (
    videoKey.startsWith("/") ||
    videoKey.includes("..") ||
    videoKey.includes("\\") ||
    (thumbnailKey &&
      (thumbnailKey.startsWith("/") ||
        thumbnailKey.includes("..") ||
        thumbnailKey.includes("\\")))
  ) {
    return jsonResponse(
      { ok: false, error: "Key file tidak valid." },
      400
    );
  }

  if (
    affiliate &&
    !/^https?:\/\/\S+$/i.test(affiliate)
  ) {
    return jsonResponse(
      { ok: false, error: "Affiliate link harus berupa URL HTTP/HTTPS." },
      400
    );
  }

  const id = makeId();
  const slug = makeSlug();

  try {
    // Pastikan objek video memang ada di bucket R2.
    if (!env.VIDEOS) {
      return jsonResponse(
        { ok: false, error: "Storage R2 belum dikonfigurasi." },
        500
      );
    }

    const videoObject = await env.VIDEOS.head(videoKey);

    if (!videoObject) {
      return jsonResponse(
        { ok: false, error: "File video tidak ditemukan di R2." },
        400
      );
    }

    if (thumbnailKey) {
      const thumbnailObject = await env.VIDEOS.head(thumbnailKey);

      if (!thumbnailObject) {
        return jsonResponse(
          { ok: false, error: "Thumbnail tidak ditemukan di R2." },
          400
        );
      }
    }

    await env.DB
      .prepare(
        `INSERT INTO videos (
           id,
           title,
           slug,
           video_key,
           thumbnail_key,
           description,
           affiliate
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        title,
        slug,
        videoKey,
        thumbnailKey || null,
        description || null,
        affiliate || null
      )
      .run();

    return jsonResponse(
      {
        ok: true,
        message: "Video berhasil disimpan.",
        video: {
          id,
          title,
          slug,
          video_key: videoKey,
          thumbnail_key: thumbnailKey || null,
          description: description || null,
          affiliate: affiliate || null,
        },
      },
      201
    );
  } catch (error) {
    console.error("VIDEOS_CREATE_ERROR", error?.name || "UnknownError");

    return jsonResponse(
      { ok: false, error: "Gagal menyimpan video." },
      500
    );
  }
}
