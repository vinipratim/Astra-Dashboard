# Astra Metrics

Dashboard web do AstraBot com login via Discord OAuth2 e métricas reais via PostHog.

## Como rodar

```bash
cp .env.example .env
npm start
```

Para prévia local sem login:

```bash
AUTH_REQUIRED=false npm start
```

Depois abra `http://localhost:3000`.

## Antes de publicar

```bash
npm run check
npm run doctor
```

Veja o passo a passo completo em [DEPLOY.md](./DEPLOY.md).

## Variáveis principais

- `BASE_URL`: URL pública do dashboard.
- `DISCORD_CLIENT_ID`: client ID da aplicação Discord.
- `DISCORD_CLIENT_SECRET`: client secret da aplicação Discord.
- `DISCORD_REDIRECT_URI`: normalmente `${BASE_URL}/api/auth/callback`.
- `ALLOWED_DISCORD_USER_IDS`: IDs Discord permitidos, separados por vírgula.
- `SESSION_SECRET`: segredo longo para assinar cookies.
- `POSTHOG_HOST`: host da API PostHog, por exemplo `https://us.posthog.com`.
- `POSTHOG_PROJECT_ID`: ID do projeto no PostHog.
- `POSTHOG_PERSONAL_API_KEY`: chave pessoal com permissão de query/read.

## Qual token usar?

O token do bot nao entra neste projeto.

- Bot: usa `POSTHOG_KEY` para enviar eventos e continua usando o token Discord do bot somente na host do bot.
- Site: usa `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` para login e `POSTHOG_PERSONAL_API_KEY` para consultar métricas.

## Eventos esperados do bot

- `command_executed`
- `command_rate_limited`
- `partnership_preview_created`
- `partnership_sent`
- `partnership_blocked`
- `partnership_invalid_link`
- `blacklist_item_added`
- `blacklist_item_removed`
- `config_updated`
- `guild_joined`
- `guild_left`
- `bot_error`
- `sync_completed`

## Segurança

O frontend nunca recebe `DISCORD_CLIENT_SECRET` nem `POSTHOG_PERSONAL_API_KEY`. O backend cria sessão em cookie `HttpOnly` e consulta o PostHog server-side.
