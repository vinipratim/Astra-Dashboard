const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URLSearchParams } = require("node:url");
const {
  env,
  getRedirectUri,
  isDiscordConfigured,
  isPostHogConfigured,
  validateRuntimeConfig,
} = require("./config");
const { logger } = require("./logger");
const {
  clearCookie,
  createSessionCookie,
  createStateCookie,
  getSession,
  STATE_COOKIE,
  SESSION_COOKIE,
  validateState,
} = require("./session");
const { getMetrics } = require("./posthog");

const publicDir = path.join(process.cwd(), "public");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' https://cdn.discordapp.com data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    ...securityHeaders,
    Location: location,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end();
}

function getSafePath(urlPathname) {
  const requestedPath = urlPathname === "/" ? "/index.html" : urlPathname;
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    return null;
  }

  const normalized = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(publicDir, normalized);

  return fullPath.startsWith(publicDir) ? fullPath : path.join(publicDir, "index.html");
}

async function serveStatic(req, res, pathname) {
  const filePath = getSafePath(pathname);

  if (!filePath) {
    sendJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  const ext = path.extname(filePath);

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { ok: false, error: "not_found" });
  }
}

function requireAuth(req, res) {
  if (!env.AUTH_REQUIRED) {
    return {
      id: "dev",
      username: "dev",
      globalName: "Dev Local",
      avatar: null,
    };
  }

  const session = getSession(req);

  if (!session?.id) {
    sendJson(res, 401, {
      ok: false,
      error: "unauthorized",
      discordConfigured: isDiscordConfigured(),
    });
    return null;
  }

  return session;
}

function getDiscordAvatarUrl(user) {
  if (!user?.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=128`;
}

function getLoginUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.DISCORD_CLIENT_ID,
    scope: "identify",
    state,
    redirect_uri: getRedirectUri(),
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeDiscordCode(code) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Discord OAuth HTTP ${response.status}`);
  }

  return payload;
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || `Discord user HTTP ${response.status}`);
  }

  return payload;
}

function isAllowedUser(userId) {
  return env.ALLOWED_DISCORD_USER_IDS.includes(userId);
}

async function handleApi(req, res, url, requestId) {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      authRequired: env.AUTH_REQUIRED,
      discordConfigured: isDiscordConfigured(),
      posthogConfigured: isPostHogConfigured(),
      nodeEnv: env.NODE_ENV,
    });
    return true;
  }

  if (url.pathname === "/api/auth/login") {
    if (!isDiscordConfigured()) {
      sendJson(res, 503, { ok: false, error: "discord_not_configured" });
      return true;
    }

    const state = crypto.randomBytes(24).toString("base64url");
    redirect(res, getLoginUrl(state), {
      "Set-Cookie": createStateCookie(state),
    });
    return true;
  }

  if (url.pathname === "/api/auth/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state || !validateState(req, state)) {
      redirect(res, "/?auth=invalid", {
        "Set-Cookie": clearCookie(STATE_COOKIE),
      });
      return true;
    }

    try {
      const token = await exchangeDiscordCode(code);
      const user = await fetchDiscordUser(token.access_token);

      if (!isAllowedUser(user.id)) {
        logger.warn({ event: "discord_login_denied", requestId, discordUserId: user.id }, "discord login denied");
        redirect(res, "/?auth=denied", {
          "Set-Cookie": [clearCookie(STATE_COOKIE), clearCookie(SESSION_COOKIE)],
        });
        return true;
      }

      logger.info({ event: "discord_login_success", requestId, discordUserId: user.id }, "discord login success");
      redirect(res, "/", {
        "Set-Cookie": [clearCookie(STATE_COOKIE), createSessionCookie(user)],
      });
    } catch (error) {
      logger.warn({ event: "discord_login_failed", requestId, error: error.message }, "discord login failed");
      redirect(res, "/?auth=failed", {
        "Set-Cookie": [clearCookie(STATE_COOKIE), clearCookie(SESSION_COOKIE)],
      });
    }

    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    redirect(res, "/", {
      "Set-Cookie": clearCookie(SESSION_COOKIE),
    });
    return true;
  }

  if (url.pathname === "/api/me") {
    const session = getSession(req);

    if (!session?.id) {
      sendJson(res, 200, {
        authenticated: false,
        authRequired: env.AUTH_REQUIRED,
        discordConfigured: isDiscordConfigured(),
      });
      return true;
    }

    sendJson(res, 200, {
      authenticated: true,
      user: {
        id: session.id,
        username: session.username,
        globalName: session.globalName,
        avatarUrl: getDiscordAvatarUrl(session),
      },
    });
    return true;
  }

  if (url.pathname === "/api/metrics") {
    const session = requireAuth(req, res);

    if (!session) {
      return true;
    }

    const range = url.searchParams.get("range") || "7d";
    const metrics = await getMetrics(range, requestId);
    sendJson(res, 200, metrics);
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const startedAt = Date.now();
  const url = new URL(req.url, env.BASE_URL);

  res.setHeader("X-Request-Id", requestId);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url, requestId);

      if (!handled) {
        sendJson(res, 404, { ok: false, error: "not_found" });
      }

      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    logger.error({ event: "request_failed", requestId, error: error.message }, "request failed");
    sendJson(res, 500, { ok: false, error: "internal_error", requestId });
  } finally {
    logger.info({
      event: "http_request",
      requestId,
      method: req.method,
      path: url.pathname,
      durationMs: Date.now() - startedAt,
    }, "http request");
  }
});

const configErrors = validateRuntimeConfig();

if (configErrors.length) {
  logger.error({
    event: "startup_config_invalid",
    errors: configErrors,
  }, "startup config invalid");
  process.exit(1);
}

server.listen(env.PORT, () => {
  logger.info({
    event: "server_started",
    port: env.PORT,
    authRequired: env.AUTH_REQUIRED,
    discordConfigured: isDiscordConfigured(),
    posthogConfigured: isPostHogConfigured(),
  }, "server started");
});
