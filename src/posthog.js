const { env, isPostHogConfigured } = require("./config");
const { demoMetrics, eventCatalog } = require("./demoData");
const { logger } = require("./logger");

const colors = ["#52a8ff", "#22d3ee", "#33d69f", "#f8c14a", "#ff5c7a", "#a78bfa"];
const ranges = new Map([
  ["7d", 7],
  ["30d", 30],
  ["90d", 90],
]);

function safeRange(range) {
  return ranges.has(range) ? range : "7d";
}

function intervalSql(range) {
  return `timestamp >= now() - interval ${ranges.get(safeRange(range))} day`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function eventCatalogSqlList() {
  return eventCatalog.map(([event]) => sqlString(event)).join(", ");
}

async function posthogQuery(query, name, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.POSTHOG_QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.POSTHOG_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
        },
        name,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload.detail || payload.error || `PostHog HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload.results || [];
  } finally {
    clearTimeout(timeout);
  }
}

async function posthogQueryOrEmpty(query, name, requestId) {
  try {
    return {
      rows: await posthogQuery(query, name, requestId),
      error: null,
    };
  } catch (error) {
    logger.warn({
      event: "posthog_query_part_failed",
      requestId,
      queryName: name,
      error: error.message,
    }, "posthog query part failed");

    return {
      rows: [],
      error: error.message,
    };
  }
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowMap(rows, keyIndex = 0, valueIndex = 1) {
  return new Map(rows.map((row) => [row[keyIndex], toNumber(row[valueIndex])]));
}

function formatDayLabel(value) {
  if (!value) {
    return "--";
  }

  const [year, month, day] = String(value).slice(0, 10).split("-");

  return day && month ? `${day}/${month}` : String(value);
}

async function getMetrics(range, requestId) {
  const safe = safeRange(range);

  if (!isPostHogConfigured()) {
    return demoMetrics(safe);
  }

  try {
    const where = intervalSql(safe);
    const results = await Promise.all([
      posthogQueryOrEmpty(`
        select event, count()
        from events
        where ${where}
          and event in (
            'command_executed',
            'partnership_sent',
            'partnership_blocked',
            'guild_joined',
            'guild_left'
          )
        group by event
      `, `astra totals ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select toDate(timestamp) as day, count()
        from events
        where ${where}
          and event in (${eventCatalogSqlList()})
        group by day
        order by day asc
      `, `astra series ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select properties.command as command, count()
        from events
        where ${where}
          and event = 'command_executed'
          and properties.command is not null
        group by command
        order by count() desc
        limit 10
      `, `astra commands ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select properties.command as command, count()
        from events
        where ${where}
          and event = 'command_executed'
          and properties.status = 'error'
          and properties.command is not null
        group by command
      `, `astra command errors ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select event, count()
        from events
        where ${where}
          and event in (
            'partnership_modal_opened',
            'partnership_preview_created',
            'partnership_sent',
            'partnership_canceled',
            'partnership_blocked'
          )
        group by event
      `, `astra partnership funnel ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select properties.blocked_type as type, count()
        from events
        where ${where}
          and event = 'partnership_blocked'
          and properties.blocked_type is not null
        group by type
        order by count() desc
      `, `astra blacklist types ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select properties.reason_category as reason, count()
        from events
        where ${where}
          and event = 'partnership_blocked'
          and properties.reason_category is not null
        group by reason
        order by count() desc
        limit 8
      `, `astra blacklist reasons ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select count(distinct properties.guild_hash)
        from events
        where ${where}
          and event in (${eventCatalogSqlList()})
          and properties.guild_hash is not null
      `, `astra active guild count ${safe}`, requestId),
      posthogQueryOrEmpty(`
        select
          properties.guild_hash as guild,
          countIf(event = 'command_executed') as commands,
          countIf(event = 'partnership_sent') as partnerships,
          countIf(event = 'partnership_blocked') as blocks
        from events
        where ${where}
          and properties.guild_hash is not null
        group by guild
        order by commands desc
        limit 20
      `, `astra guilds ${safe}`, requestId),
    ]);

    const errors = results.filter((result) => result.error);

    if (errors.length === results.length) {
      throw new Error(errors[0]?.error || "Todas as consultas ao PostHog falharam.");
    }

    const [
      totalsRows,
      seriesRows,
      commandRows,
      commandErrorRows,
      funnelRows,
      blacklistTypeRows,
      blacklistReasonRows,
      activeGuildRows,
      serverRows,
    ] = results.map((result) => result.rows);

    const totals = rowMap(totalsRows);
    const commandErrors = rowMap(commandErrorRows);
    const funnelTotals = rowMap(funnelRows);
    const modalTotal = funnelTotals.get("partnership_modal_opened") || 0;
    const blockedTotal = totals.get("partnership_blocked") || 0;
    const blacklistRawTotal = blacklistTypeRows.reduce((sum, row) => sum + toNumber(row[1]), 0);
    const joined = totals.get("guild_joined") || 0;
    const activeGuilds = toNumber(activeGuildRows[0]?.[0]);

    return {
      source: errors.length ? "posthog_partial" : "posthog",
      error: errors.length ? "Algumas consultas ao PostHog falharam temporariamente. Exibindo dados reais parciais." : null,
      range: safe,
      updatedAt: new Date().toISOString(),
      metrics: [
        { label: "Comandos", value: totals.get("command_executed") || 0, trend: "PostHog", icon: "⌘" },
        { label: "Parcerias", value: totals.get("partnership_sent") || 0, trend: "enviadas", icon: "↗" },
        { label: "Bloqueios", value: blockedTotal, trend: blockedTotal > 0 ? "monitorar" : "limpo", icon: "!" },
        { label: "Guilds", value: activeGuilds, trend: `${joined} entradas`, icon: "◇" },
      ],
      events: {
        labels: seriesRows.map((row) => formatDayLabel(row[0])),
        values: seriesRows.map((row) => toNumber(row[1])),
      },
      commands: commandRows.map((row) => ({
        name: row[0] || "desconhecido",
        total: toNumber(row[1]),
        errors: commandErrors.get(row[0]) || 0,
      })),
      health: [
        { name: "PostHog", state: "online", meta: env.POSTHOG_HOST },
        { name: "Discord OAuth", state: "ok", meta: "sessão ativa" },
        { name: "API dashboard", state: "online", meta: "Node HTTP" },
        { name: "Fonte", state: "real", meta: `range ${safe}` },
      ],
      funnel: [
        ["partnership_modal_opened", "Modal aberto"],
        ["partnership_preview_created", "Prévia criada"],
        ["partnership_sent", "Enviado"],
        ["partnership_canceled", "Cancelado"],
        ["partnership_blocked", "Bloqueado"],
      ].map(([event, label]) => {
        const total = funnelTotals.get(event) || 0;
        return {
          label,
          total,
          percent: modalTotal ? Math.round((total / modalTotal) * 100) : 0,
        };
      }),
      blacklistReasons: blacklistReasonRows.map((row) => ({
        reason: row[0] || "Sem categoria",
        total: toNumber(row[1]),
      })),
      blacklistTypes: blacklistTypeRows.map((row, index) => {
        const value = toNumber(row[1]);
        return {
          type: row[0] || "unknown",
          value: blacklistRawTotal ? Math.round((value / blacklistRawTotal) * 100) : 0,
          color: colors[index % colors.length],
        };
      }),
      servers: serverRows.map((row) => ({
        name: `Guild ${String(row[0]).slice(0, 8)}`,
        status: toNumber(row[3]) > 5 ? "Atenção" : "Ativo",
        commands: toNumber(row[1]),
        partnerships: toNumber(row[2]),
        blocks: toNumber(row[3]),
      })),
      eventCatalog,
    };
  } catch (error) {
    logger.warn({
      event: "posthog_query_failed",
      requestId,
      error: error.message,
      range: safe,
    }, "posthog query failed");

    return {
      ...demoMetrics(safe),
      source: "posthog_error",
      error: "Não consegui consultar o PostHog. Exibindo dados demo.",
    };
  }
}

module.exports = {
  getMetrics,
};
