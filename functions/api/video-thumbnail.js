
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return new Response("Slug tidak valid", { status: 400 });
  }

  const video = await env.DB.prepare(`
    SELECT thumbnail_key
    FROM videos
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (!video?.thumbnail_key) {
    return new Response("Thumbnail tidak ditemukan", { status: 404 });
  }

  const object = await env.VIDEOS.get(video.thumbnail_key);

  if (!object) {
    return new Response("File thumbnail tidak ditemukan", {
      status: 404
    });
  }

  const extension = video.thumbnail_key.split(".").pop().toLowerCase();
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };

  return new Response(object.body, {
    headers: {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
