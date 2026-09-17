# Astra Metrics

Dashboard web do AstraBot com login via Discord OAuth2 e métricas via PostHog.

## Eventos esperados do bot

- `bot_started`
- `command_executed`
- `command_rate_limited`
- `partnership_modal_opened`
- `partnership_preview_created`
- `partnership_sent`
- `partnership_blocked`
- `partnership_canceled`
- `partnership_invalid_link`
- `partnership_invalid_color`
- `blacklist_item_added`
- `blacklist_item_removed`
- `blacklist_checked`
- `config_updated`
- `guild_joined`
- `guild_left`
- `bot_error`
- `sync_completed`

## Segurança

O frontend nunca recebe `DISCORD_CLIENT_SECRET` nem `POSTHOG_PERSONAL_API_KEY`. O backend cria sessão em cookie `HttpOnly` e consulta o PostHog server-side.
