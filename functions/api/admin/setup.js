
import {
  hashPassword,
  jsonResponse,
} from "../../_lib/admin-auth.js";

export async function onRequestPost({ request, env }) {
  // 1. Pastikan konfigurasi tersedia.
  if (!env.DB || !env.ADMIN_SETUP_KEY) {
    return jsonResponse(
      {
        ok: false,
        error: "Konfigurasi server belum lengkap.",
      },
      500
    );
  }

  // 2. Validasi kunci setup.
  const suppliedKey =
    request.headers.get("X-Admin-Setup-Key") || "";

  if (
    suppliedKey.length !== env.ADMIN_SETUP_KEY.length ||
    suppliedKey !== env.ADMIN_SETUP_KEY
  ) {
    return jsonResponse(
      {
        ok: false,
        error: "Kunci setup tidak valid.",
      },
      403
    );
  }

  // 3. Baca JSON request.
  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: "Body harus berupa JSON yang valid.",
      },
      400
    );
  }

  // 4. Validasi username dan password.
  const username =
    typeof body?.username === "string"
      ? body.username.trim().toLowerCase()
      : "";

  const password =
    typeof body?.password === "string"
      ? body.password
      : "";

  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Username harus 3–32 karakter: huruf kecil, angka, atau underscore.",
      },
      400
    );
  }

  if (password.length < 12 || password.length > 128) {
    return jsonResponse(
      {
        ok: false,
        error: "Password harus 12–128 karakter.",
      },
      400
    );
  }

  // 5. Jalankan proses setup dan catat tahap kegagalan.
  let stage = "cek-admin";

  try {
    const existing = await env.DB
      .prepare("SELECT id FROM admins LIMIT 1")
      .first();

    if (existing) {
      return jsonResponse(
        {
          ok: false,
          error: "Admin sudah terdaftar. Pendaftaran awal ditutup.",
        },
        409
      );
    }

    stage = "hash-password";

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    stage = "simpan-admin";

    const result = await env.DB
      .prepare(
        `INSERT INTO admins (id, username, password_hash)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM admins)`
      )
      .bind(id, username, passwordHash)
      .run();

    if (!result.meta || result.meta.changes !== 1) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Admin tidak dibuat. Mungkin admin sudah terdaftar.",
        },
        409
      );
    }

    return jsonResponse(
      {
        ok: true,
        message:
          "Admin pertama berhasil dibuat. Simpan username dan password dengan aman.",
      },
      201
    );
 } catch (error) {
    console.error(
      "ADMIN_SETUP_ERROR",
      JSON.stringify({
        stage,
        name: error?.name || "UnknownError",
        message: error?.message || String(error),
        stack: error?.stack || null,
      })
    );

    return jsonResponse(
      {
        ok: false,
        error: "Pendaftaran gagal.",
        stage,
        reason: error?.message || "Unknown error",
        errorType: error?.name || "UnknownError",
      },
      500
    );
  }
}
