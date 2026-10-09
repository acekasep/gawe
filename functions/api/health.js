
export async function onRequest(context) {
  const { env } = context;

  try {
    const result = await env.DB
      .prepare("SELECT 1 AS ok")
      .first();

    return Response.json({
      ok: true,
      database: result?.ok === 1,
      storageConfigured: Boolean(env.VIDEOS),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "Database belum tersambung atau terjadi kesalahan.",
      },
      { status: 500 }
    );
  }
}
