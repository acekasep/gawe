
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return Response.json(
      { ok: false, error: "Slug tidak valid" },
      { status: 400 }
    );
  }

  const video = await env.DB.prepare(`
    SELECT id, title, slug, video_key, thumbnail_key, affiliate
    FROM videos
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (!video) {
    return Response.json(
      { ok: false, error: "Video tidak ditemukan" },
      { status: 404 }
    );
  }

  return Response.json({
    ok: true,
    video: {
      id: video.id,
      title: video.title,
      slug: video.slug,
      video: `/api/stream?slug=${encodeURIComponent(video.slug)}`,
      thumbnail: video.thumbnail_key
        ? `/api/video-thumbnail?slug=${encodeURIComponent(video.slug)}`
        : null,
      affiliate: video.affiliate || ""
    }
  }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
