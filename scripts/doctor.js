const {
  env,
  getRedirectUri,
  isDiscordConfigured,
  isPostHogConfigured,
  validateRuntimeConfig,
} = require("../src/config");

const checks = [];

function addCheck(name, ok, message) {
  checks.push({ name, ok, message });
}

addCheck("NODE_ENV", env.NODE_ENV === "production", `atual: ${env.NODE_ENV}`);
addCheck("BASE_URL", /^https:\/\//.test(env.BASE_URL), `atual: ${env.BASE_URL}`);
addCheck("Discord redirect HTTPS", !env.DISCORD_REDIRECT_URI || /^https:\/\//.test(env.DISCORD_REDIRECT_URI), `atual: ${getRedirectUri()}`);
addCheck("SESSION_SECRET", env.SESSION_SECRET.length >= 32, "valor ausente ou curto");
addCheck("Discord OAuth", isDiscordConfigured(), "credenciais ausentes");
addCheck("Usuários permitidos", env.ALLOWED_DISCORD_USER_IDS.length > 0, "lista vazia");
addCheck("PostHog query", isPostHogConfigured(), "credenciais ausentes");

console.log("Astra Metrics check\n");

for (const check of checks) {
  const marker = check.ok ? "OK " : "ERR";
  console.log(`${marker} ${check.name} - ${check.message}`);
}

console.log(`\nDiscord redirect URI: ${getRedirectUri()}`);
console.log("Bot token: ausente do dashboard.");

const errors = validateRuntimeConfig();

if (errors.length) {
  console.error("\nBloqueios para subir em producao:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

if (!isPostHogConfigured()) {
  console.warn("\nAviso: sem PostHog configurado, o painel sobe mas mostra dados demo.");
}
