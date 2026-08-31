const crypto = require("node:crypto");
const { env } = require("./config");

const SESSION_COOKIE = "astra_session";
const STATE_COOKIE = "astra_oauth_state";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATE_TTL_SECONDS = 10 * 60;

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSecret() {
  if (env.SESSION_SECRET) {
    return env.SESSION_SECRET;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET é obrigatório em produção.");
  }

  return "dev-only-session-secret-change-me";
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function seal(payload) {
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function unseal(value) {
  const [encoded, signature] = String(value || "").split(".");

  if (!encoded || !signature || !timingSafeEqual(sign(encoded), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encoded));

    if (payload.expiresAt && payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separator = item.indexOf("=");

      if (separator === -1) {
        return cookies;
      }

      cookies[item.slice(0, separator)] = decodeURIComponent(item.slice(separator + 1));
      return cookies;
    }, {});
}

function cookie(name, value, maxAgeSeconds) {
  const secure = env.BASE_URL.startsWith("https://") || env.NODE_ENV === "production";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearCookie(name) {
  return cookie(name, "", 0);
}

function createStateCookie(state) {
  return cookie(STATE_COOKIE, seal({ state, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 }), STATE_TTL_SECONDS);
}

function validateState(req, state) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = unseal(cookies[STATE_COOKIE]);

  return Boolean(payload?.state && payload.state === state);
}

function createSessionCookie(user) {
  return cookie(SESSION_COOKIE, seal({
    id: user.id,
    username: user.username,
    globalName: user.global_name || user.username,
    avatar: user.avatar || null,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  }), SESSION_TTL_SECONDS);
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return unseal(cookies[SESSION_COOKIE]);
}

module.exports = {
  clearCookie,
  createSessionCookie,
  createStateCookie,
  getSession,
  parseCookies,
  STATE_COOKIE,
  SESSION_COOKIE,
  validateState,
};
