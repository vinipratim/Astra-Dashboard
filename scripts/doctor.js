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
addCheck("SESSION_SECRET", env.SESSION_SECRET.length >= 32, "use uma string longa e aleatória");
addCheck("Discord OAuth", isDiscordConfigured(), "configure DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET");
addCheck("Usuários permitidos", env.ALLOWED_DISCORD_USER_IDS.length > 0, "configure ALLOWED_DISCORD_USER_IDS");
addCheck("PostHog query", isPostHogConfigured(), "configure POSTHOG_PROJECT_ID e POSTHOG_PERSONAL_API_KEY");

console.log("Astra Metrics deploy doctor\n");

for (const check of checks) {
  const marker = check.ok ? "OK " : "ERR";
  console.log(`${marker} ${check.name} - ${check.message}`);
}

console.log(`\nDiscord redirect URI: ${getRedirectUri()}`);
console.log("Bot token: nao use aqui; ele fica somente no bot.");

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
