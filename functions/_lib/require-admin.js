
import {
  sha256Hex,
  jsonResponse,
  readCookie,
} from "./admin-auth.js";

export async function requireAdmin(request, env) {
  if (!env.DB) {
    return {
      admin: null,
      response: jsonResponse(
        { ok: false, error: "Database belum dikonfigurasi." },
        500
      ),
    };
  }

  const token = readCookie(request, "__Host-gawe_session");

  if (!token) {
    return {
      admin: null,
      response: jsonResponse(
        { ok: false, error: "Silakan login terlebih dahulu." },
        401
      ),
    };
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
      return {
        admin: null,
        response: jsonResponse(
          { ok: false, error: "Sesi tidak valid atau kedaluwarsa." },
          401
        ),
      };
    }

    return {
      admin,
      response: null,
    };
  } catch (error) {
    console.error(
      "REQUIRE_ADMIN_ERROR",
      error?.name || "UnknownError"
    );

    return {
      admin: null,
      response: jsonResponse(
        { ok: false, error: "Terjadi kesalahan pada server." },
        500
      ),
    };
  }
}
