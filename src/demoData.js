const eventCatalog = [
  ["bot_started", "Processo do bot iniciou com guild_count, command_count e shard_id."],
  ["command_executed", "Comando usado, duração, status, guild_hash e user_hash."],
  ["command_rate_limited", "Usuário bateu cooldown em um comando."],
  ["partnership_modal_opened", "Usuário abriu o modal de parceria."],
  ["partnership_preview_created", "Embed passou pela validação e virou prévia."],
  ["partnership_sent", "Parceria enviada no canal configurado."],
  ["partnership_blocked", "Blacklist impediu envio com tipo bloqueado."],
  ["partnership_invalid_link", "Modal enviado com link fora do padrão aceito."],
  ["partnership_invalid_color", "Modal enviado com cor fora do padrão hexadecimal aceito."],
  ["blacklist_item_added", "Admin adicionou item na blacklist."],
  ["blacklist_item_removed", "Admin removeu item da blacklist."],
  ["blacklist_checked", "Admin consultou se um item estava presente na blacklist."],
  ["config_updated", "Canal, cargo, cor ou ping automático foi alterado."],
  ["guild_joined", "Bot entrou em um novo servidor."],
  ["guild_left", "Bot saiu de um servidor."],
  ["bot_error", "Erro capturado sem tokens nem conteúdo sensível."],
  ["sync_completed", "Comandos do Discord sincronizados com escopo e resultado."],
];

function demoMetrics(range = "7d") {
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const multiplier = days / 7;
  const labels = days === 7
    ? ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
    : Array.from({ length: 12 }, (_, index) => days === 30 ? String(1 + index * 3) : `S${index + 1}`);
  const values = labels.map((_, index) => Math.round((86 + index * 24 + Math.sin(index) * 18) * multiplier));
  const commands = [
    { name: "/embed", total: Math.round(482 * multiplier), errors: 2 },
    { name: "/ranking", total: Math.round(338 * multiplier), errors: 1 },
    { name: "/contador", total: Math.round(286 * multiplier), errors: 0 },
    { name: "/blacklist", total: Math.round(92 * multiplier), errors: 4 },
    { name: "/painel", total: Math.round(51 * multiplier), errors: 1 },
    { name: "/config", total: Math.round(35 * multiplier), errors: 1 },
  ];

  return {
    source: "demo",
    range,
    updatedAt: new Date().toISOString(),
    metrics: [
      { label: "Comandos", value: Math.round(1284 * multiplier), trend: "+18%", icon: "⌘" },
      { label: "Parcerias", value: Math.round(312 * multiplier), trend: "+11%", icon: "↗" },
      { label: "Bloqueios", value: Math.round(27 * multiplier), trend: "-4%", icon: "!" },
      { label: "Servidores", value: 14 + Math.floor(multiplier), trend: "+2", icon: "◇" },
    ],
    events: { labels, values },
    commands,
    health: [
      { name: "PostHog", state: "demo", meta: "configure as variáveis" },
      { name: "Discord OAuth", state: "ok", meta: "sessão ativa" },
      { name: "API dashboard", state: "online", meta: "Node HTTP" },
      { name: "Fonte", state: "demo", meta: "sem token PostHog" },
    ],
    funnel: [
      { label: "Modal aberto", total: Math.round(520 * multiplier), percent: 100 },
      { label: "Prévia criada", total: Math.round(478 * multiplier), percent: 92 },
      { label: "Enviado", total: Math.round(312 * multiplier), percent: 60 },
      { label: "Cancelado", total: Math.round(139 * multiplier), percent: 27 },
      { label: "Bloqueado", total: Math.round(27 * multiplier), percent: 5 },
    ],
    blacklistReasons: [
      { reason: "Servidor banido", total: Math.round(14 * multiplier) },
      { reason: "Convite bloqueado", total: Math.round(8 * multiplier) },
      { reason: "Domínio suspeito", total: Math.round(3 * multiplier) },
      { reason: "Link completo", total: Math.round(2 * multiplier) },
    ],
    blacklistTypes: [
      { type: "server_id", value: 42, color: "#52a8ff" },
      { type: "invite_link", value: 31, color: "#22d3ee" },
      { type: "domain", value: 18, color: "#33d69f" },
      { type: "link", value: 9, color: "#f8c14a" },
    ],
    servers: [
      { name: "Guild a1f9", status: "Ativo", commands: Math.round(428 * multiplier), partnerships: Math.round(144 * multiplier), blocks: 12 },
      { name: "Guild b7c2", status: "Ativo", commands: Math.round(310 * multiplier), partnerships: Math.round(98 * multiplier), blocks: 7 },
      { name: "Guild c451", status: "Ativo", commands: Math.round(224 * multiplier), partnerships: Math.round(52 * multiplier), blocks: 2 },
      { name: "Guild d983", status: "Atenção", commands: Math.round(89 * multiplier), partnerships: Math.round(18 * multiplier), blocks: 6 },
    ],
    eventCatalog,
  };
}

module.exports = {
  demoMetrics,
  eventCatalog,
};
