let currentMetrics = null;
let currentPeriod = "7d";

const formatNumber = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const htmlEscapes = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function clampPercent(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 100)) : 0;
}

function safeColor(value) {
  const color = String(value || "");
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#81867f";
}

function setConnection(title, meta, danger = false) {
  document.querySelector("#connectionTitle").textContent = title;
  document.querySelector("#connectionMeta").textContent = meta;
  document.querySelector(".status-dot").classList.toggle("danger", danger);
}

function setNotice(metrics) {
  const notice = document.querySelector("#sourceNotice");

  if (!metrics || metrics.source === "posthog") {
    notice.hidden = true;
    return;
  }

  notice.hidden = false;
  notice.textContent = metrics.source === "posthog_partial"
    ? metrics.error || "PostHog retornou dados reais parciais."
    : metrics.source === "posthog_error"
      ? metrics.error || "PostHog indisponível. Exibindo dados demo."
      : "PostHog ainda não configurado. Exibindo dados demo para prévia do painel.";
}

function setUpdatedAt(metrics) {
  const target = document.querySelector("#updatedAt");

  if (!metrics?.updatedAt) {
    target.textContent = "Aguardando dados";
    return;
  }

  const date = new Date(metrics.updatedAt);
  target.textContent = `Atualizado ${date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function showLoginWall(me) {
  const wall = document.querySelector("#loginWall");
  const hint = document.querySelector("#loginHint");
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("auth");

  wall.hidden = false;
  document.body.classList.add("locked");

  if (!me.discordConfigured) {
    hint.textContent = "Login indisponível.";
  } else if (authError === "denied") {
    hint.textContent = "Sua conta Discord não está na lista de usuários permitidos.";
  } else if (authError === "invalid") {
    hint.textContent = "Sessão OAuth inválida ou expirada.";
  } else if (authError === "failed") {
    hint.textContent = "Falha ao concluir login com Discord.";
  } else {
    hint.textContent = "";
  }
}

function hideLoginWall() {
  document.querySelector("#loginWall").hidden = true;
  document.body.classList.remove("locked");
}

function setUser(user) {
  const chip = document.querySelector("#userChip");
  const avatar = document.querySelector("#userAvatar");

  chip.hidden = false;
  document.querySelector("#userName").textContent = user.globalName || user.username;

  if (user.avatarUrl) {
    avatar.style.backgroundImage = `url("${user.avatarUrl}")`;
    avatar.textContent = "";
  } else {
    avatar.textContent = (user.globalName || user.username || "A").slice(0, 1).toUpperCase();
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function loadSession() {
  const me = await fetchJson("/api/me");

  if (!me.authRequired && !me.authenticated) {
    hideLoginWall();
    setConnection("Dev local", "AUTH_REQUIRED=false");
    return null;
  }

  if (!me.authenticated) {
    setConnection("Login necessário", "Discord OAuth", true);
    showLoginWall(me);
    return null;
  }

  hideLoginWall();
  setUser(me.user);
  setConnection("Sessão ativa", me.user.globalName || me.user.username);
  return me.user;
}

async function loadMetrics(periodKey) {
  try {
    currentPeriod = periodKey;
    currentMetrics = await fetchJson(`/api/metrics?range=${encodeURIComponent(periodKey)}`);
    renderAll();
  } catch (error) {
    if (error.status === 401) {
      showLoginWall(error.payload || { discordConfigured: true });
      setConnection("Login necessário", "Discord OAuth", true);
      return;
    }

    setConnection("API com erro", "falha ao carregar", true);
    document.querySelector("#sourceNotice").hidden = false;
    document.querySelector("#sourceNotice").textContent = "Não consegui carregar métricas.";
  }
}

function renderMetricCards() {
  const target = document.querySelector("#metricCards");
  target.innerHTML = currentMetrics.metrics
    .map(({ label, value, trend }) => `
      <article class="metric-card">
        <div class="metric-top">
          <span>${escapeHtml(label)}</span>
          <span class="metric-icon">total</span>
        </div>
        <div class="metric-value">${formatNumber(value)}</div>
        <span class="trend ${String(trend).startsWith("-") ? "down" : ""}">${escapeHtml(trend)}</span>
      </article>
    `)
    .join("");
}

function renderLineChart() {
  const svg = document.querySelector("#eventsChart");
  const data = currentMetrics.events.values.length ? currentMetrics.events.values : [0];
  const labels = currentMetrics.events.labels.length ? currentMetrics.events.labels : ["sem dados"];
  const max = Math.max(...data, 1) * 1.12;
  const width = 920;
  const height = 300;
  const pad = 38;
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const barWidth = Math.max(10, Math.min(28, step * 0.45 || 22));
  const points = data.map((value, index) => {
    const x = data.length > 1 ? pad + index * step : width / 2;
    const y = height - pad - (value / max) * (height - pad * 2);
    return [x, y, value];
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");

  svg.innerHTML = `
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#bfc2b8" />
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#bfc2b8" />
    ${[0, 1, 2, 3].map((i) => {
      const y = pad + i * ((height - pad * 2) / 3);
      const value = Math.round(max - (i * max / 3));
      return `
        <line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="#ecece7" />
        <text x="${pad - 10}" y="${y + 4}" text-anchor="end" fill="#6b7068" font-size="11">${formatNumber(value)}</text>
      `;
    }).join("")}
    ${points.map(([x, y, value]) => `
      <rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${height - pad - y}" rx="2" fill="#1d4ed8" opacity="0.9">
        <title>${formatNumber(value)} eventos</title>
      </rect>
    `).join("")}
    <polyline points="${line}" fill="none" stroke="#173ea5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map(([x, y, value], index) => `
      <circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="#173ea5" stroke-width="2" />
      ${index % labelEvery === 0 || index === points.length - 1
        ? `<text x="${x}" y="${height - 10}" text-anchor="middle" fill="#5e625d" font-size="11">${escapeHtml(labels[index] || "")}</text>`
        : ""}
    `).join("")}
  `;
}

function renderHealth() {
  document.querySelector("#healthList").innerHTML = currentMetrics.health
    .map(({ name, state, meta }) => `
      <div class="health-item">
        <div>
          <strong>${escapeHtml(name)}</strong>
          <div class="muted">${escapeHtml(meta)}</div>
        </div>
        <span class="status-badge ${state === "demo" || state === "memory" ? "warn" : ""}">${escapeHtml(state)}</span>
      </div>
    `)
    .join("");
}

function renderCommands() {
  const commands = currentMetrics.commands;
  const max = Math.max(...commands.map(({ total }) => total), 1);
  document.querySelector("#commandBars").innerHTML = commands.length
    ? commands.map(({ name, total }) => `
      <div class="bar-row">
        <div class="bar-meta">
          <strong>${escapeHtml(name)}</strong>
          <span class="muted">${formatNumber(total)} usos</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width: ${clampPercent((total / max) * 100)}%"></div></div>
      </div>
    `).join("")
    : `<div class="list-item"><strong>Sem comandos no período</strong><span class="muted">0 usos</span></div>`;

  const errors = commands.filter(({ errors: total }) => total > 0);
  document.querySelector("#errorList").innerHTML = errors.length
    ? errors.map(({ name, errors: total }) => `
      <div class="list-item">
        <strong>${escapeHtml(name)}</strong>
        <span class="status-badge warn">${total} erro${total > 1 ? "s" : ""}</span>
      </div>
    `).join("")
    : `<div class="list-item"><strong>Nenhum erro</strong><span class="status-badge">limpo</span></div>`;
}

function renderFunnel() {
  document.querySelector("#funnel").innerHTML = currentMetrics.funnel
    .map(({ label, total, percent }) => `
      <article class="funnel-step">
        <strong>${escapeHtml(label)}</strong>
        <b>${formatNumber(total)}</b>
        <span class="muted">${formatNumber(clampPercent(percent))}% do início</span>
        <div class="funnel-meter"><span style="width: ${clampPercent(percent)}%"></span></div>
      </article>
    `)
    .join("");
}

function renderBlacklist() {
  document.querySelector("#blacklistReasons").innerHTML = currentMetrics.blacklistReasons.length
    ? currentMetrics.blacklistReasons.map(({ reason, total }) => `
      <div class="list-item">
        <strong>${escapeHtml(reason)}</strong>
        <span>${formatNumber(total)}</span>
      </div>
    `).join("")
    : `<div class="list-item"><strong>Sem bloqueios categorizados</strong><span>0</span></div>`;

  const types = currentMetrics.blacklistTypes.length
    ? currentMetrics.blacklistTypes
    : [{ type: "sem dados", value: 100, color: "#81867f" }];
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  document.querySelector("#blacklistDonut").innerHTML = `
    <circle cx="110" cy="110" r="${radius}" fill="none" stroke="#ecece7" stroke-width="28" />
    ${types.map(({ value, color }) => {
      const length = (clampPercent(value) / 100) * circumference;
      const dash = `${length} ${circumference - length}`;
      const circle = `<circle cx="110" cy="110" r="${radius}" fill="none" stroke="${safeColor(color)}" stroke-width="28" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)" />`;
      offset += length;
      return circle;
    }).join("")}
    <text x="110" y="104" text-anchor="middle" fill="#1f211f" font-size="28" font-weight="800">${formatNumber(currentMetrics.metrics.find((item) => item.label === "Bloqueios")?.value || 0)}</text>
    <text x="110" y="128" text-anchor="middle" fill="#5e625d" font-size="12">bloqueios</text>
  `;

  document.querySelector("#blacklistLegend").innerHTML = types
    .map(({ type, value, color }) => `
      <div class="legend-item">
        <span><i class="legend-swatch" style="background:${safeColor(color)}"></i> ${escapeHtml(type)}</span>
        <strong>${formatNumber(clampPercent(value))}%</strong>
      </div>
    `)
    .join("");
}

function renderServers() {
  document.querySelector("#serverRows").innerHTML = currentMetrics.servers.length
    ? currentMetrics.servers.map(({ name, status, commands, partnerships, blocks }) => `
      <tr>
        <td>
          <span class="server-name"><span class="server-avatar">${escapeHtml(String(name || "A").slice(0, 1))}</span>${escapeHtml(name)}</span>
        </td>
        <td><span class="status-badge ${status === "Atenção" ? "warn" : ""}">${escapeHtml(status)}</span></td>
        <td>${formatNumber(commands)}</td>
        <td>${formatNumber(partnerships)}</td>
        <td>${formatNumber(blocks)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Sem servidores com eventos no período.</td></tr>`;
}

function renderEventCatalog() {
  document.querySelector("#eventCatalog").innerHTML = currentMetrics.eventCatalog
    .map(([event, description]) => `
      <article class="event-card">
        <code>${escapeHtml(event)}</code>
        <p>${escapeHtml(description)}</p>
      </article>
    `)
    .join("");
}

function renderAll() {
  setNotice(currentMetrics);
  setUpdatedAt(currentMetrics);
  renderMetricCards();
  renderLineChart();
  renderHealth();
  renderCommands();
  renderFunnel();
  renderBlacklist();
  renderServers();
  renderEventCatalog();
}

function setPeriod(periodKey) {
  document.querySelectorAll(".period-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.period === periodKey);
  });

  loadMetrics(periodKey);
}

function bindNavigation() {
  const links = document.querySelectorAll("[data-section-link]");
  const sections = [...links].map((link) => document.querySelector(`#${link.dataset.sectionLink}`));

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) {
      return;
    }

    links.forEach((link) => {
      link.classList.toggle("active", link.dataset.sectionLink === visible.target.id);
    });
  }, { threshold: 0.35 });

  sections.filter(Boolean).forEach((section) => observer.observe(section));
}

document.querySelectorAll(".period-btn").forEach((button) => {
  button.addEventListener("click", () => setPeriod(button.dataset.period));
});

document.querySelector("#refreshButton").addEventListener("click", () => loadMetrics(currentPeriod));
document.querySelector("#refreshInlineButton").addEventListener("click", () => loadMetrics(currentPeriod));

loadSession().then((user) => {
  if (user || !document.body.classList.contains("locked")) {
    setPeriod("7d");
  }
});
bindNavigation();
