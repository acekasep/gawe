
const ITERATIONS = 310000;

function toHex(bytes) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function fromHex(hex) {
  if (
    typeof hex !== "string" ||
    !/^(?:[0-9a-f]{2})+$/i.test(hex)
  ) {
    throw new Error("Invalid hex");
  }

  return new Uint8Array(
    hex.match(/.{2}/g).map((byte) => parseInt(byte, 16))
  );
}

async function derivePassword(password, salt, iterations) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API tidak tersedia");
  }

  const encoder = new TextEncoder();

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(
    new Uint8Array(16)
  );

  const hash = await derivePassword(
    password,
    salt,
    ITERATIONS
  );

  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterationText, saltHex, hashHex] =
      stored.split("$");

    if (algorithm !== "pbkdf2") return false;

    const iterations = Number(iterationText);

    if (
      !Number.isInteger(iterations) ||
      iterations < 100000 ||
      iterations > 1000000
    ) {
      return false;
    }

    const salt = fromHex(saltHex);
    const expected = fromHex(hashHex);

    if (expected.length !== 32) return false;

    const actual = await derivePassword(
      password,
      salt,
      iterations
    );

    if (actual.length !== expected.length) return false;

    let difference = 0;

    for (let i = 0; i < actual.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

export async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return toHex(new Uint8Array(digest));
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function readCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");

    if (separator < 0) continue;

    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    if (key === name) return value;
  }

  return null;
}

export function sessionCookie(token, maxAge) {
  return `__Host-gawe_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return "__Host-gawe_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}
