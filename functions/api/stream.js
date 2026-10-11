
import { verifyPlayToken } from "../_lib/play-token.js";
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");


  const token = url.searchParams.get("token");

  const { verifyPlayToken } = await import("../_lib/play-token.js");

  if (
    !env.PLAY_TOKEN_SECRET ||
    !(await verifyPlayToken(token, slug, env.PLAY_TOKEN_SECRET))
  ) {
    return new Response("Akses ditolak atau token kedaluwarsa", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return new Response("Slug tidak valid", { status: 400 });
  }

  const video = await env.DB.prepare(`
    SELECT video_key
    FROM videos
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (!video?.video_key) {
    return new Response("Video tidak ditemukan", { status: 404 });
  }

  const object = await env.VIDEOS.head(video.video_key);

  if (!object) {
    return new Response("File video tidak ditemukan di R2", {
      status: 404
    });
  }

  const size = object.size;
  const rangeHeader = request.headers.get("Range");
  let file;
  let status = 200;

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType || "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff"
  });

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

    if (!match || (!match[1] && !match[2])) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` }
      });
    }

    let start;
    let end;

    if (!match[1]) {
      const suffixLength = Number(match[2]);

      if (!suffixLength) {
        return new Response(null, { status: 416 });
      }

      start = Math.max(0, size - suffixLength);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    }

    if (start >= size || end < start) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` }
      });
    }

    end = Math.min(end, size - 1);

    file = await env.VIDEOS.get(video.video_key, {
      range: { offset: start, length: end - start + 1 }
    });

    if (!file) {
      return new Response("File tidak ditemukan", { status: 404 });
    }

    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
  } else {
    file = await env.VIDEOS.get(video.video_key);

    if (!file) {
      return new Response("File tidak ditemukan", { status: 404 });
    }

    headers.set("Content-Length", String(size));
  }

  if (request.method === "HEAD") {
    return new Response(null, { status, headers });
  }

  return new Response(file.body, { status, headers });
}
