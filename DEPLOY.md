# Deploy do Astra Dashboard

## Tokens e segredos

Nao use o token do bot neste site.

Use estes dados no dashboard:

- `DISCORD_CLIENT_ID`: OAuth2 > General > Client ID da aplicacao Discord.
- `DISCORD_CLIENT_SECRET`: OAuth2 > General > Client Secret da aplicacao Discord.
- `DISCORD_REDIRECT_URI`: URL publica do site + `/api/auth/callback`.
- `ALLOWED_DISCORD_USER_IDS`: seu ID Discord e outros admins, separados por virgula.
- `SESSION_SECRET`: string longa e aleatoria para assinar cookies.
- `POSTHOG_PROJECT_ID`: ID do projeto no PostHog.
- `POSTHOG_PERSONAL_API_KEY`: chave pessoal do PostHog com permissao de leitura/query.

Use estes dados no bot:

- `POSTHOG_ENABLED=true`
- `POSTHOG_KEY`: project API key do PostHog, normalmente `phc_...`.
- `POSTHOG_HOST=https://us.i.posthog.com`
- `POSTHOG_SALT`: string longa para gerar hashes dos IDs.

## Antes de subir

```bash
npm run check
npm run doctor
```

O `doctor` deve passar sem bloqueios. Se o PostHog nao estiver configurado, o site sobe, mas mostra dados demo.

## Discord OAuth

No Discord Developer Portal, abra a mesma aplicacao do bot e adicione o redirect:

```text
https://seu-dominio.com/api/auth/callback
```

O valor precisa ser exatamente igual ao `DISCORD_REDIRECT_URI`.

## Vercel

O projeto tem um `server.js` na raiz. A Vercel detecta esse entrypoint Node.js e roteia as requisicoes para ele.

1. Importe `viniprati/Astra-Dashboard` na Vercel.
2. Em Framework Preset, use `Other`.
3. Build Command: `npm run build`.
4. Install Command: `npm install`.
5. Configure as variaveis de ambiente.
6. Depois do primeiro deploy, copie a URL final da Vercel.
7. Configure `DISCORD_REDIRECT_URI` com `https://sua-url.vercel.app/api/auth/callback`.
8. Adicione o mesmo redirect no Discord Developer Portal.
9. Redeploy.

Se `BASE_URL` nao for definido, o app usa `VERCEL_URL` automaticamente na Vercel. Mesmo assim, em producao com dominio proprio, prefira definir `BASE_URL`.

## Railway

O projeto tem `Dockerfile`, entao o Railway consegue subir como container.

1. Crie um novo projeto pelo GitHub.
2. Selecione `viniprati/Astra-Dashboard`.
3. Configure as variaveis de ambiente.
4. Gere ou conecte um dominio.
5. Atualize `BASE_URL` e `DISCORD_REDIRECT_URI` com a URL final.

## Render

O projeto tem `render.yaml` para Blueprint.

1. Crie um Blueprint no Render usando `viniprati/Astra-Dashboard`.
2. Preencha as variaveis marcadas como secret/sync manual.
3. Configure `BASE_URL` com a URL publica.
4. Configure o mesmo redirect no Discord Developer Portal.

## Health check

Depois de subir, acesse:

```text
https://seu-dominio.com/api/health
```

O retorno esperado deve ter `ok: true`, `authRequired: true`, `discordConfigured: true` e `posthogConfigured: true`.
