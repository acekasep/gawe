
import { requireAdmin } from "../../_lib/require-admin.js";
import { jsonResponse } from "../../_lib/admin-auth.js";

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GiB
const PART_SIZE = 8 * 1024 * 1024; // 8 MiB

function validKey(key) {
  return (
    typeof key === "string" &&
    /^videos\/[a-f0-9-]{36}\.[a-z0-9]{1,10}$/i.test(key)
  );
}

async function authenticate(request, env) {
  const auth = await requireAdmin(request, env);
  return auth.response || null;
}

// POST /api/admin/upload
// action: start, complete, abort
export async function onRequestPost({ request, env }) {
  const denied = await authenticate(request, env);
  if (denied) return denied;

  if (!env.VIDEOS) {
    return jsonResponse(
      { ok: false, error: "Storage R2 belum dikonfigurasi." },
      500
    );
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

  try {
    if (body.action === "start") {
      const name =
        typeof body.filename === "string" ? body.filename : "";
      const size = Number(body.size);
      const contentType =
        typeof body.contentType === "string"
          ? body.contentType
          : "application/octet-stream";

      const extension = name.includes(".")
        ? name.split(".").pop().toLowerCase()
        : "";

      if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_FILE_SIZE
      ) {
        return jsonResponse(
          { ok: false, error: "Ukuran file harus antara 1 byte dan 1 GiB." },
          400
        );
      }

      if (!/^[a-z0-9]{1,10}$/i.test(extension)) {
        return jsonResponse(
          { ok: false, error: "Ekstensi file tidak valid." },
          400
        );
      }

      if (!contentType.toLowerCase().startsWith("video/")) {
        return jsonResponse(
          { ok: false, error: "File harus bertipe video." },
          400
        );
      }

      const key = `videos/${crypto.randomUUID()}.${extension}`;
      const upload = await env.VIDEOS.createMultipartUpload(key, {
        httpMetadata: { contentType },
      });

      return jsonResponse({
        ok: true,
        key,
        uploadId: upload.uploadId,
        partSize: PART_SIZE,
      });
    }

    if (body.action === "complete") {
      const { key, uploadId, parts } = body;

      if (
        !validKey(key) ||
        typeof uploadId !== "string" ||
        !Array.isArray(parts) ||
        parts.length < 1 ||
        parts.length > 10000
      ) {
        return jsonResponse(
          { ok: false, error: "Data penyelesaian upload tidak valid." },
          400
        );
      }

      const normalizedParts = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (
          !part ||
          part.partNumber !== i + 1 ||
          typeof part.etag !== "string" ||
          !/^[a-f0-9]+$/i.test(part.etag)
        ) {
          return jsonResponse(
            { ok: false, error: "Daftar bagian upload tidak valid." },
            400
          );
        }

        normalizedParts.push({
          partNumber: part.partNumber,
          etag: part.etag,
        });
      }

      const upload = env.VIDEOS.resumeMultipartUpload(key, uploadId);
      const object = await upload.complete(normalizedParts);

      return jsonResponse({
        ok: true,
        key: object.key,
        message: "Upload video selesai.",
      });
    }

    if (body.action === "abort") {
      const { key, uploadId } = body;

      if (!validKey(key) || typeof uploadId !== "string") {
        return jsonResponse(
          { ok: false, error: "Data pembatalan upload tidak valid." },
          400
        );
      }

      const upload = env.VIDEOS.resumeMultipartUpload(key, uploadId);
      await upload.abort();

      return jsonResponse({ ok: true, message: "Upload dibatalkan." });
    }

    return jsonResponse(
      { ok: false, error: "Action tidak dikenal." },
      400
    );
  } catch (error) {
    console.error("R2_UPLOAD_ERROR", error?.name || "UnknownError");
    return jsonResponse(
      { ok: false, error: "Operasi upload R2 gagal." },
      500
    );
  }
}

// PUT /api/admin/upload?action=part&key=...&uploadId=...&partNumber=...
export async function onRequestPut({ request, env }) {
  const denied = await authenticate(request, env);
  if (denied) return denied;

  if (!env.VIDEOS) {
    return jsonResponse(
      { ok: false, error: "Storage R2 belum dikonfigurasi." },
      500
    );
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = Number(url.searchParams.get("partNumber"));

  if (
    url.searchParams.get("action") !== "part" ||
    !validKey(key) ||
    !uploadId ||
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > 10000 ||
    !request.body
  ) {
    return jsonResponse(
      { ok: false, error: "Data bagian upload tidak valid." },
      400
    );
  }

  try {
    const upload = env.VIDEOS.resumeMultipartUpload(key, uploadId);
    const part = await upload.uploadPart(partNumber, request.body);

    return jsonResponse({
      ok: true,
      partNumber: part.partNumber,
      etag: part.etag,
    });
  } catch (error) {
    console.error("R2_UPLOAD_PART_ERROR", error?.name || "UnknownError");
    return jsonResponse(
      { ok: false, error: "Gagal mengunggah bagian video." },
      500
    );
  }
}
