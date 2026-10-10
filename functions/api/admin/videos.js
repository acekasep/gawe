
import { requireAdmin } from "../../_lib/require-admin.js";
import { jsonResponse } from "../../_lib/admin-auth.js";

function validKey(key) {
  return (
    typeof key === "string" &&
    /^(videos|thumbnails)\/[a-f0-9-]{36}\.[a-z0-9]{1,10}$/i.test(key)
  );
}

async function getAuth(request, env) {
  return requireAdmin(request, env);
}

export async function onRequestGet({ request, env }) {
  const auth = await getAuth(request, env);
  if (auth.response) return auth.response;

  try {
    const result = await env.DB.prepare(
      `SELECT id, title, slug, video_key, thumbnail_key,
              description, affiliate, created_at, updated_at
       FROM videos ORDER BY created_at DESC`
    ).all();

    return jsonResponse({ ok: true, videos: result.results || [] });
  } catch (error) {
    console.error("VIDEOS_LIST_ERROR", error?.name || "UnknownError");
    return jsonResponse({ ok: false, error: "Gagal mengambil daftar video." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await getAuth(request, env);
  if (auth.response) return auth.response;

  if (!env.DB || !env.VIDEOS) {
    return jsonResponse({ ok: false, error: "Database atau R2 belum dikonfigurasi." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON tidak valid." }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const videoKey = typeof body.video_key === "string" ? body.video_key.trim() : "";
  const thumbnailKey = typeof body.thumbnail_key === "string" ? body.thumbnail_key.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const affiliate = typeof body.affiliate === "string" ? body.affiliate.trim() : "";

  if (!title || !validKey(videoKey)) {
    return jsonResponse({ ok: false, error: "Judul dan key video tidak valid." }, 400);
  }

  if (thumbnailKey && !/^thumbnails\/[a-f0-9-]{36}\.[a-z0-9]{1,10}$/i.test(thumbnailKey)) {
    return jsonResponse({ ok: false, error: "Key thumbnail tidak valid." }, 400);
  }

  if (title.length > 250 || description.length > 5000 || affiliate.length > 2000) {
    return jsonResponse({ ok: false, error: "Ada kolom yang terlalu panjang." }, 400);
  }

  if (affiliate && !/^https?:\/\/\S+$/i.test(affiliate)) {
    return jsonResponse({ ok: false, error: "Affiliate harus berupa URL HTTP/HTTPS." }, 400);
  }

  try {
    if (!(await env.VIDEOS.head(videoKey))) {
      return jsonResponse({ ok: false, error: "File video tidak ditemukan di R2." }, 400);
    }

    if (thumbnailKey && !(await env.VIDEOS.head(thumbnailKey))) {
      return jsonResponse({ ok: false, error: "Thumbnail tidak ditemukan di R2." }, 400);
    }

    const id = crypto.randomUUID();
    const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 12);

    await env.DB.prepare(
      `INSERT INTO videos
       (id, title, slug, video_key, thumbnail_key, description, affiliate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, title, slug, videoKey, thumbnailKey || null,
      description || null, affiliate || null
    ).run();

    return jsonResponse({
      ok: true,
      message: "Video berhasil disimpan.",
      video: { id, title, slug, video_key: videoKey, thumbnail_key: thumbnailKey || null }
    }, 201);
  } catch (error) {
    console.error("VIDEOS_CREATE_ERROR", error?.name || "UnknownError");
    return jsonResponse({ ok: false, error: "Gagal menyimpan video." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const auth = await getAuth(request, env);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON tidak valid." }, 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!id || !title || title.length > 250) {
    return jsonResponse({ ok: false, error: "ID dan judul wajib valid." }, 400);
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const affiliate = typeof body.affiliate === "string" ? body.affiliate.trim() : "";

  if (description.length > 5000 || affiliate.length > 2000) {
    return jsonResponse({ ok: false, error: "Ada kolom yang terlalu panjang." }, 400);
  }

  if (affiliate && !/^https?:\/\/\S+$/i.test(affiliate)) {
    return jsonResponse({ ok: false, error: "Affiliate harus berupa URL HTTP/HTTPS." }, 400);
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE videos
       SET title = ?, description = ?, affiliate = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(title, description || null, affiliate || null, id).run();

    if (!result.meta?.changes) {
      return jsonResponse({ ok: false, error: "Video tidak ditemukan." }, 404);
    }

    return jsonResponse({ ok: true, message: "Video berhasil diperbarui." });
  } catch (error) {
    console.error("VIDEOS_UPDATE_ERROR", error?.name || "UnknownError");
    return jsonResponse({ ok: false, error: "Gagal memperbarui video." }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await getAuth(request, env);
  if (auth.response) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON tidak valid." }, 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return jsonResponse({ ok: false, error: "ID video wajib diisi." }, 400);

  try {
    const video = await env.DB.prepare(
      "SELECT video_key, thumbnail_key FROM videos WHERE id = ?"
    ).bind(id).first();

    if (!video) {
      return jsonResponse({ ok: false, error: "Video tidak ditemukan." }, 404);
    }

    await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();

    // Hapus file setelah data D1 berhasil dihapus.
    const keys = [video.video_key, video.thumbnail_key].filter(Boolean);
    for (const key of keys) {
      try {
        await env.VIDEOS.delete(key);
      } catch (error) {
        console.error("R2_DELETE_ERROR", error?.name || "UnknownError");
      }
    }

    return jsonResponse({ ok: true, message: "Video berhasil dihapus." });
  } catch (error) {
    console.error("VIDEOS_DELETE_ERROR", error?.name || "UnknownError");
    return jsonResponse({ ok: false, error: "Gagal menghapus video." }, 500);
  }
}
