const fs = require("node:fs");
const path = require("node:path");

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function boolean(name, defaultValue) {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function number(name, defaultValue) {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Variável de ambiente inválida: ${name}`);
  }

  return parsed;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

loadDotEnv();

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: number("PORT", 3000),
  BASE_URL: process.env.BASE_URL || `http://localhost:${number("PORT", 3000)}`,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || "",
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || "",
  DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI || "",
  ALLOWED_DISCORD_USER_IDS: splitList(process.env.ALLOWED_DISCORD_USER_IDS),
  SESSION_SECRET: process.env.SESSION_SECRET || "",
  POSTHOG_HOST: (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/+$/, ""),
  POSTHOG_PROJECT_ID: process.env.POSTHOG_PROJECT_ID || "",
  POSTHOG_PERSONAL_API_KEY: process.env.POSTHOG_PERSONAL_API_KEY || "",
  AUTH_REQUIRED: boolean("AUTH_REQUIRED", true),
};

function getRedirectUri() {
  return env.DISCORD_REDIRECT_URI || `${env.BASE_URL.replace(/\/+$/, "")}/api/auth/callback`;
}

function isDiscordConfigured() {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}

function isPostHogConfigured() {
  return Boolean(env.POSTHOG_PROJECT_ID && env.POSTHOG_PERSONAL_API_KEY);
}

function validateRuntimeConfig() {
  const errors = [];

  if (env.NODE_ENV === "production" && env.SESSION_SECRET.length < 32) {
    errors.push("SESSION_SECRET deve ter pelo menos 32 caracteres em produção.");
  }

  if (env.NODE_ENV === "production" && !env.BASE_URL.startsWith("https://")) {
    errors.push("BASE_URL deve ser a URL publica HTTPS do dashboard em produção.");
  }

  if (env.AUTH_REQUIRED && !isDiscordConfigured()) {
    errors.push("DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET são obrigatórios quando AUTH_REQUIRED=true.");
  }

  if (env.AUTH_REQUIRED && env.ALLOWED_DISCORD_USER_IDS.length === 0) {
    errors.push("ALLOWED_DISCORD_USER_IDS precisa ter pelo menos um ID Discord permitido.");
  }

  return errors;
}

module.exports = {
  env,
  getRedirectUri,
  isDiscordConfigured,
  isPostHogConfigured,
  validateRuntimeConfig,
};
