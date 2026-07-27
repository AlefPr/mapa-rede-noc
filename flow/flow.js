const API = '/api/flow';

const state = {
  autenticado: false,
  usuario: null,
  viewAtual: 'dashboard',
  pollTimers: []
};

async function authVerify() {
  try {
    const res = await fetch('/api/auth/verificar');
    if (!res.ok) throw new Error('nao autenticado');
    const data = await res.json();
    state.usuario = data.usuario;
    state.autenticado = true;
    document.getElementById('user-indicator').textContent = data.usuario.username;
    return true;
  } catch {
    window.location.href = '/mapa/';
    return false;
  }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
  if (res.status === 401) { window.location.href = '/mapa/'; throw new Error('401'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function $(id) { return document.getElementById(id); }

// ── Navigation ──
function initNav() {
  document.querySelectorAll('.sbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sbtn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const v = $('view-' + btn.dataset.view);
      if (v) v.classList.add('active');
      state.viewAtual = btn.dataset.view;
      renderView(state.viewAtual);
    });
  });
}

function renderView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = $('view-' + name);
  if (el) el.classList.add('active');
  const handlers = {
    dashboard: renderDashboard,
    'top-talkers': renderTopTalkers,
    investigar: renderInvestigar,
    geo: renderGeo,
    ataques: renderAtaques
  };
  if (handlers[name]) handlers[name]();
}

// ── Helpers ──
function protoName(n) {
  const map = { 6: 'TCP', 17: 'UDP', 1: 'ICMP', 2: 'IGMP', 47: 'GRE', 50: 'ESP', 51: 'AH' };
  return map[n] || n;
}

function protoBadge(n) {
  const map = { 6: 'badge-tcp', 17: 'badge-udp', 1: 'badge-icmp' };
  return `<span class="badge ${map[n] || ''}">${protoName(n)}</span>`;
}

function formatBps(v) {
  if (!v || v <= 0) return '--';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' Gbps';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' Mbps';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + ' Kbps';
  return v.toFixed(0) + ' bps';
}

function formatBytes(v) {
  if (!v || v <= 0) return '--';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + ' TB';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' GB';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' MB';
  return v.toFixed(0) + ' B';
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// ── Dashboard ──
let dashChart = null;
async function renderDashboard() {
  const el = $('view-dashboard');
  try {
    const [resumo, topIp, series] = await Promise.all([
      apiFetch('/resumo?periodo=1h'),
      apiFetch('/top-talkers?tipo=ip&limite=10&periodo=1h'),
      apiFetch('/series-trafego?periodo=6h&intervalo=5m')
    ]);

    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Tráfego Inbound</div>
          <div class="kpi-value" style="color:#34d399">${formatBps(resumo.in_bps)}</div>
          <div class="kpi-sub">última hora</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Tráfego Outbound</div>
          <div class="kpi-value" style="color:#60a5fa">${formatBps(resumo.out_bps)}</div>
          <div class="kpi-sub">última hora</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Top IP Ativo</div>
          <div class="kpi-value" style="font-size:18px;color:#fbbf24">${topIp[0]?.ip_src || '--'}</div>
          <div class="kpi-sub">${topIp[0] ? formatBps(topIp[0].bps) + ' / ' + topIp[0].total_flows + ' flows' : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Flows Totais</div>
          <div class="kpi-value" style="font-size:20px;color:#a78bfa">${(resumo.total_flows || 0).toLocaleString()}</div>
          <div class="kpi-sub">na última hora</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Tráfego (últimas 6h)</div>
        <div id="dash-chart" style="height:200px;"></div>
      </div>
      <div class="card">
        <div class="card-title">Top 10 IPs Origem</div>
        ${topTable(topIp, 'ip_src', 'ip_dst')}
      </div>
    `;

    if (dashChart) dashChart.destroy();
    if (series && series.length > 0) {
      const inS = series.map(d => ({ x: d.t, y: d.in_bps }));
      const outS = series.map(d => ({ x: d.t, y: d.out_bps }));
      dashChart = new ApexCharts($('dash-chart'), {
        series: [
          { name: 'IN', data: inS },
          { name: 'OUT', data: outS }
        ],
        chart: { type: 'area', height: 200, zoom: { enabled: true },
          toolbar: { show: false }, animations: { enabled: false } },
        stroke: { curve: 'smooth', width: 1.5 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05 } },
        colors: ['#34d399', '#60a5fa'],
        xaxis: { type: 'datetime', labels: { style: { colors: '#475569' } } },
        yaxis: { labels: { style: { colors: '#475569' }, formatter: v => formatBps(v) } },
        tooltip: { theme: 'dark', y: { formatter: v => formatBps(v) } },
        grid: { borderColor: '#1e293b' }
      });
      dashChart.render();
    }
  } catch (e) {
    el.innerHTML = `<div class="loading">Erro ao carregar dashboard: ${e.message}</div>`;
  }
}

function topTable(data, srcKey, dstKey) {
  if (!data || data.length === 0) return '<div class="loading">Aguardar dados de flow...</div>';
  return `
    <table>
      <thead><tr>
        <th>#</th><th>IP Origem</th><th>IP Destino</th><th>Tráfego</th><th>Flows</th><th>Portas</th>
      </tr></thead>
      <tbody>
        ${data.map((d, i) => `<tr>
          <td style="color:#475569">${i + 1}</td>
          <td style="color:#38bdf8">${d.ip_src || '--'}</td>
          <td style="color:#fbbf24">${d.ip_dst || '--'}</td>
          <td style="color:#34d399">${formatBps(d.bps || d.bytes_total)}</td>
          <td>${(d.total_flows || 0).toLocaleString()}</td>
          <td>${protoBadge(d.proto)} ${d.port_src || ''}:${d.port_dst || ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Top Talkers ──
let topPeriodo = '1h';
async function renderTopTalkers() {
  const el = $('view-top-talkers');
  el.innerHTML = `
    <div class="period-bar">
      ${['30m','1h','6h','24h'].map(p =>
        `<button class="period-btn ${p === topPeriodo ? 'active' : ''}" data-p="${p}">${p}</button>`
      ).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card"><div class="card-title">Top IPs Origem</div><div id="top-src"></div></div>
      <div class="card"><div class="card-title">Top IPs Destino</div><div id="top-dst"></div></div>
      <div class="card"><div class="card-title">Top Portas</div><div id="top-portas"></div></div>
      <div class="card"><div class="card-title">Protocolos</div><div id="top-proto"></div></div>
    </div>
  `;
  el.querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', async () => {
    topPeriodo = b.dataset.p;
    el.querySelectorAll('.period-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    await loadTopTables();
  }));
  await loadTopTables();
}

async function loadTopTables() {
  const p = topPeriodo;
  try {
    const [src, dst, portas, proto] = await Promise.all([
      apiFetch(`/top-talkers?tipo=ip_src&limite=20&periodo=${p}`),
      apiFetch(`/top-talkers?tipo=ip_dst&limite=20&periodo=${p}`),
      apiFetch(`/top-talkers?tipo=porta&limite=10&periodo=${p}`),
      apiFetch(`/top-talkers?tipo=proto&limite=10&periodo=${p}`)
    ]);
    $('top-src').innerHTML = topTableSimple(src, 'ip_src', 'bps');
    $('top-dst').innerHTML = topTableSimple(dst, 'ip_dst', 'bps');
    $('top-portas').innerHTML = portTable(portas);
    $('top-proto').innerHTML = protoTable(proto);
  } catch (e) {
    document.querySelectorAll('#top-src,#top-dst,#top-portas,#top-proto').forEach(el => el.innerHTML = `<div class="loading">Erro</div>`);
  }
}

function topTableSimple(data, key, valKey) {
  if (!data || data.length === 0) return '<div class="loading">Sem dados</div>';
  return `<table>
    <thead><tr><th>#</th><th>${key}</th><th>Tráfego</th><th>Flows</th></tr></thead>
    <tbody>${data.map((d, i) => `<tr>
      <td style="color:#475569">${i+1}</td>
      <td style="color:#38bdf8">${d[key]}</td>
      <td style="color:#34d399">${formatBps(d[valKey] || d.bytes_total)}</td>
      <td>${(d.total_flows || 0).toLocaleString()}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function portTable(data) {
  if (!data || data.length === 0) return '<div class="loading">Sem dados</div>';
  return `<table>
    <thead><tr><th>#</th><th>Porta</th><th>Tráfego</th><th>Flows</th></tr></thead>
    <tbody>${data.map((d, i) => `<tr>
      <td style="color:#475569">${i+1}</td>
      <td>${protoBadge(d.proto)} ${d.port_dst || d.port_src || '--'}</td>
      <td style="color:#34d399">${formatBps(d.bps)}</td>
      <td>${(d.total_flows || 0).toLocaleString()}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function protoTable(data) {
  if (!data || data.length === 0) return '<div class="loading">Sem dados</div>';
  const total = data.reduce((a, d) => a + (d.bytes_total || 0), 0);
  return `<table>
    <thead><tr><th>Protocolo</th><th>Tráfego</th><th>%</th></tr></thead>
    <tbody>${data.map(d => `<tr>
      <td>${protoBadge(d.proto)} ${protoName(d.proto)}</td>
      <td style="color:#34d399">${formatBps(d.bps || d.bytes_total)}</td>
      <td>${total > 0 ? ((d.bytes_total / total) * 100).toFixed(1) : 0}%</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ── Investigar IP ──
async function renderInvestigar() {
  $('view-investigar').innerHTML = `
    <div class="card">
      <div class="card-title">Investigar IP</div>
      <div class="search-box">
        <input id="invest-ip-input" type="text" placeholder="191.168.x.x ou 10.x.x.x" spellcheck="false">
        <button id="invest-btn">Buscar</button>
      </div>
      <div class="period-bar">
        ${['1h','6h','24h','7d'].map(p =>
          `<button class="period-btn" data-p="${p}">${p}</button>`
        ).join('')}
      </div>
    </div>
    <div id="invest-result"></div>
  `;
  let investPeriodo = '6h';
  $('invest-btn').addEventListener('click', () => buscarIP(investPeriodo));
  $('invest-ip-input').addEventListener('keydown', e => { if (e.key === 'Enter') buscarIP(investPeriodo); });
  $('view-investigar').querySelectorAll('.period-btn').forEach(b => b.addEventListener('click', () => {
    investPeriodo = b.dataset.p;
    $('view-investigar').querySelectorAll('.period-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if ($('invest-ip-input').value.trim()) buscarIP(investPeriodo);
  }));
}

async function buscarIP(periodo) {
  const ip = $('invest-ip-input').value.trim();
  if (!ip) return;
  const el = $('invest-result');
  el.innerHTML = '<div class="loading">Buscando...</div>';
  try {
    const data = await apiFetch(`/buscar?ip=${encodeURIComponent(ip)}&periodo=${periodo}`);
    if (!data || data.length === 0) {
      el.innerHTML = '<div class="card"><div class="loading">Nenhum tráfego encontrado para este IP no período.</div></div>';
      return;
    }
    const totalBytes = data.reduce((a, d) => a + (d.bytes_total || 0), 0);
    const totalFlows = data.reduce((a, d) => a + (d.total_flows || 0), 0);
    const periodoSeg = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 }[periodo] || 21600;
    const bps = totalBytes * 8 / periodoSeg;
    el.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">IP Investigado</div>
          <div class="kpi-value" style="font-size:18px;color:#38bdf8">${ip}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Tráfego Total</div>
          <div class="kpi-value" style="color:#34d399">${formatBps(bps)}</div>
          <div class="kpi-sub">${formatBytes(totalBytes)} em ${periodo}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Conexões</div>
          <div class="kpi-value" style="color:#a78bfa">${totalFlows}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Conexões</div>
        <table>
          <thead><tr><th>IP Par</th><th>Porta</th><th>Proto</th><th>Tráfego</th><th>Flows</th></tr></thead>
          <tbody>${data.map(d => `<tr>
            <td style="color:#fbbf24">${d.ip_par || '--'}</td>
            <td>${d.port_src || '--'}:${d.port_dst || '--'}</td>
            <td>${protoBadge(d.proto)}</td>
            <td style="color:#34d399">${formatBytes(d.bytes_total)}</td>
            <td>${(d.total_flows || 0).toLocaleString()}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="loading">Erro: ${e.message}</div></div>`;
  }
}

// ── Geo Mapa ──
function renderGeo() {
  $('view-geo').innerHTML = `
    <div class="card">
      <div class="card-title">Distribuição Geográfica</div>
      <div style="text-align:center;padding:60px 20px;color:#475569">
        <div style="font-size:48px;margin-bottom:16px">🌍</div>
        <div>Mapa geo será implementado após configurar GeoIP no servidor.</div>
        <div style="font-size:12px;margin-top:8px">Requer: apt install geoip-database + maxminddb</div>
      </div>
    </div>
  `;
}

// ── Ataques ──
let ataquesTimer = null;
async function renderAtaques() {
  const el = $('view-ataques');
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="font-size:16px;font-weight:600">Detecção de Ataques</h2>
      <button id="ataques-refresh" style="padding:6px 14px;border-radius:6px;background:#1e293b;border:1px solid #334155;color:#94a3b8;cursor:pointer;font-size:12px">Atualizar</button>
    </div>
    <div id="ataques-list"></div>
  `;
  await loadAtaques();
  $('ataques-refresh').addEventListener('click', loadAtaques);
}

async function loadAtaques() {
  const el = $('ataques-list');
  try {
    const data = await apiFetch('/ataques');
    if (!data || data.length === 0) {
      el.innerHTML = '<div class="card"><div class="loading">Nenhum ataque detectado.</div></div>';
      return;
    }
    el.innerHTML = `
      <div class="card" style="padding:0">
        <table>
          <thead><tr><th>IP</th><th>Tráfego</th><th>Alvos</th><th>Status</th><th>Detectado</th></tr></thead>
          <tbody>${data.map(d => `<tr>
            <td style="color:#ef4444;font-weight:600">${d.ip_src}</td>
            <td style="color:#fbbf24">${formatBps(d.bps)}</td>
            <td>${d.alvos}</td>
            <td>${statusBadge(d.status)}</td>
            <td style="color:#475569">${timeAgo(d.timestamp)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="loading">Erro: ${e.message}</div></div>`;
  }
}

function statusBadge(s) {
  const map = { ativo: 'sev-critico', mitigado: 'sev-moderado', encerrado: 'sev-baixo' };
  return `<span class="${map[s] || 'sev-baixo'}">${s || '--'}</span>`;
}

// ── Init ──
async function init() {
  const ok = await authVerify();
  if (!ok) return;
  initNav();
  renderView('dashboard');
  const now = new Date().toLocaleTimeString('pt-BR');
  $('last-update').textContent = now;
}

init();
