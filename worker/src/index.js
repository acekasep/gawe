
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname === "/api/health") {
        const db = await env.DB.prepare("SELECT 1 AS ok").first();

        return json({
          ok: true,
          worker: "gawe-api",
          database: db?.ok === 1,
          storageConfigured: Boolean(env.VIDEOS),
        });
      }

      return json(
        {
          ok: false,
          error: "Endpoint tidak ditemukan",
          path: url.pathname,
        },
        404
      );
    } catch (error) {
      return json(
        {
          ok: false,
          error: "Terjadi kesalahan pada Worker",
        },
        500
      );
    }
  },
};
