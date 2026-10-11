function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);

  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createPlayToken(slug, secret) {
  const payload = {
    slug,
    exp: Math.floor(Date.now() / 1000) + 21600
  };

  const encoded = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const key = await getKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded)
  );

  return `${encoded}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyPlayToken(token, slug, secret) {
  if (!token || !secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  try {
    const key = await getKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(parts[1]),
      new TextEncoder().encode(parts[0])
    );

    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(parts[0]))
    );

    return payload.slug === slug &&
      Number.isFinite(payload.exp) &&
      payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
