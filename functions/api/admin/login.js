import {
  verifyPassword,
  sha256Hex,
  jsonResponse,
  sessionCookie,
} from "../../_lib/admin-auth.js";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return jsonResponse(
      { ok: false, error: "Database belum dikonfigurasi." },
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

  const username =
    typeof body?.username === "string"
      ? body.username.trim().toLowerCase()
      : "";

  const password =
    typeof body?.password === "string"
      ? body.password
      : "";

  if (!username || !password) {
    return jsonResponse(
      { ok: false, error: "Username dan password wajib diisi." },
      400
    );
  }

  try {
    const admin = await env.DB
      .prepare(
        `SELECT id, username, password_hash
         FROM admins
         WHERE username = ?
         LIMIT 1`
      )
      .bind(username)
      .first();

    if (!admin) {
      return jsonResponse(
        { ok: false, error: "Username atau password salah." },
        401
      );
    }

    const passwordIsValid = await verifyPassword(
      password,
      admin.password_hash
    );

    if (!passwordIsValid) {
      return jsonResponse(
        { ok: false, error: "Username atau password salah." },
        401
      );
    }

    // Token acak; token asli hanya dikirim ke browser melalui cookie.
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);

    const token = Array.from(randomBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const tokenHash = await sha256Hex(token);

    const now = Date.now();
    const expiresAt = new Date(
      now + SESSION_DURATION_SECONDS * 1000
    ).toISOString();

    // Hapus sesi kedaluwarsa milik admin ini.
    await env.DB
      .prepare(
        `DELETE FROM sessions
         WHERE admin_id = ?
         AND expires_at <= ?`
      )
      .bind(admin.id, new Date(now).toISOString())
      .run();

    await env.DB
      .prepare(
        `INSERT INTO sessions (id, admin_id, expires_at)
         VALUES (?, ?, ?)`
      )
      .bind(tokenHash, admin.id, expiresAt)
      .run();

    return jsonResponse(
      {
        ok: true,
        message: "Login berhasil."
      },
      200,
      {
        "Set-Cookie": sessionCookie(
          token,
          SESSION_DURATION_SECONDS
        )
      }
    );
  } catch (error) {
    console.error("ADMIN_LOGIN_ERROR", error?.name || "UnknownError");

    return jsonResponse(
      { ok: false, error: "Terjadi kesalahan pada server." },
      500
    );
  }
}
```
