import {
  sha256Hex,
  jsonResponse,
  readCookie,
} from "../../_lib/admin-auth.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return jsonResponse(
      { ok: false, error: "Database belum dikonfigurasi." },
      500
    );
  }

  const token = readCookie(request, "__Host-gawe_session");

  if (!token) {
    return jsonResponse(
      { ok: false, error: "Belum login." },
      401
    );
  }

  try {
    const tokenHash = await sha256Hex(token);
    const now = new Date().toISOString();

    const admin = await env.DB
      .prepare(
        `SELECT admins.id, admins.username
         FROM sessions
         JOIN admins ON admins.id = sessions.admin_id
         WHERE sessions.id = ?
           AND sessions.expires_at > ?
         LIMIT 1`
      )
      .bind(tokenHash, now)
      .first();

    if (!admin) {
      return jsonResponse(
        { ok: false, error: "Sesi tidak valid atau sudah kedaluwarsa." },
        401
      );
    }

    return jsonResponse({
      ok: true,
      admin: {
        id: admin.id,
        username: admin.username,
      },
    });
  } catch (error) {
    console.error("ADMIN_ME_ERROR", error?.name || "UnknownError");

    return jsonResponse(
      { ok: false, error: "Terjadi kesalahan pada server." },
      500
    );
  }
}
