
import { requireAdmin } from "../../_lib/require-admin.js";
import { jsonResponse } from "../../_lib/admin-auth.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;

  if (!env.VIDEOS) {
    return jsonResponse(
      { ok: false, error: "Storage R2 belum dikonfigurasi." },
      500
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(
        { ok: false, error: "File thumbnail tidak ditemukan." },
        400
      );
    }

    if (!file.type.startsWith("image/")) {
      return jsonResponse(
        { ok: false, error: "Thumbnail harus berupa gambar." },
        400
      );
    }

    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      return jsonResponse(
        { ok: false, error: "Ukuran thumbnail maksimal 5 MB." },
        400
      );
    }

    const bytes = await file.arrayBuffer();

    // Validasi sederhana terhadap format gambar yang didukung.
    const data = new Uint8Array(bytes);
    const isJpeg =
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff;
    const isPng =
      data.length >= 8 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47;
    const isWebp =
      data.length >= 12 &&
      String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...data.slice(8, 12)) === "WEBP";

    if (!isJpeg && !isPng && !isWebp) {
      return jsonResponse(
        { ok: false, error: "Format gambar harus JPEG, PNG, atau WebP." },
        400
      );
    }

    const extension = isJpeg ? "jpg" : isPng ? "png" : "webp";
    const key = `thumbnails/${crypto.randomUUID()}.${extension}`;

    await env.VIDEOS.put(key, bytes, {
      httpMetadata: {
        contentType: isJpeg
          ? "image/jpeg"
          : isPng
            ? "image/png"
            : "image/webp",
      },
    });

    return jsonResponse({ ok: true, key });
  } catch (error) {
    console.error("THUMBNAIL_UPLOAD_ERROR", error?.name || "UnknownError");
    return jsonResponse(
      { ok: false, error: "Gagal mengunggah thumbnail." },
      500
    );
  }
}
