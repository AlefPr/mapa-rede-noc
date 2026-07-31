const API = '/api/flow';

const state = {
  autenticado: false, usuario: null, viewAtual: 'visao-geral',
  periodo: '30m', pollTimer: null, healthTimer: null, chart: null,
  appsChart: null, protoChart: null, atkChart: null, cmpCharts: [null, null], globalMap: null, globalMarkers: [],
  socket: null, liveFlows: [], cmpPeriods: ['30m', '6h'],
  equipamentos: [], equipamentoAtivo: null,
  clientes: [], clienteAtivo: null,
  hiddenCards: [],
  dashboards: [], dashboardAtivo: null, editandoLayout: false, gs: null
};

const PREFS_KEY = 'flow-prefs';

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (p.periodo && ['30m', '1h', '6h', '24h', '7d'].includes(p.periodo)) state.periodo = p.periodo;
    if (p.equipamentoAtivo) state.equipamentoAtivo = String(p.equipamentoAtivo);
    if (p.clienteAtivo) state.clienteAtivo = String(p.clienteAtivo);
    if (Array.isArray(p.hiddenCards)) state.hiddenCards = p.hiddenCards;
  } catch {}
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      periodo: state.periodo,
      equipamentoAtivo: state.equipamentoAtivo,
      clienteAtivo: state.clienteAtivo,
      hiddenCards: state.hiddenCards
    }));
  } catch {}
}

function cardKeyOf(gridItem) {
  if (gridItem.dataset.card) return gridItem.dataset.card;
  const inner = gridItem.querySelector('.card[data-card]');
  return inner ? inner.dataset.card : null;
}

function applyHiddenCards() {
  document.querySelectorAll('#view-visao-geral .dash-grid > *').forEach(el => {
    const key = cardKeyOf(el);
    el.style.display = (key && state.hiddenCards.includes(key)) ? 'none' : '';
  });
}

function toggleCardHidden(key) {
  if (state.hiddenCards.includes(key)) {
    state.hiddenCards = state.hiddenCards.filter(k => k !== key);
  } else {
    state.hiddenCards.push(key);
  }
  savePrefs();
  applyHiddenCards();
}

async function authVerify() {
  try {
    const res = await fetch('/api/auth/verificar');
    if (!res.ok) throw new Error('nao autenticado');
    const data = await res.json();
    state.usuario = data.usuario;
    state.autenticado = true;
    const avatar = document.getElementById('user-avatar');
    const name = data.usuario.username || data.usuario.email || 'U';
    avatar.textContent = name.charAt(0).toUpperCase();
    return true;
  } catch {
    window.location.href = '/';
    return false;
  }
}

async function apiFetch(path, opts = {}) {
  let finalPath = opts.raw ? path : API + path;
  if (state.equipamentoAtivo && !opts.skipEqFilter) {
    const sep = finalPath.includes('?') ? '&' : '?';
    finalPath += `${sep}equipamento_id=${state.equipamentoAtivo}`;
  }
  if (state.clienteAtivo && !opts.skipClienteFilter) {
    const sep = finalPath.includes('?') ? '&' : '?';
    finalPath += `${sep}cliente_id=${state.clienteAtivo}`;
  }
  const res = await fetch(finalPath, opts);
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function $(id) { return document.getElementById(id); }

function fmtBps(v) {
  if (!v || v === 0) return '0 bps';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' Gbps';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' Mbps';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' Kbps';
  return Math.round(v) + ' bps';
}

function fmtBytes(v) {
  if (!v || v === 0) return '0 B';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + ' TB';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' GB';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' MB';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' KB';
  return Math.round(v) + ' B';
}

function fmtNum(n) {
  if (!n) return '0';
  return Number(n).toLocaleString('pt-BR');
}

function fmtProto(p) {
  const map = { 6: 'TCP', 17: 'UDP', 1: 'ICMP', 2: 'IGMP', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 89: 'OSPF', 132: 'SCTP' };
  if (p == null || p === '') return '';
  const key = typeof p === 'number' ? p : parseInt(p, 10);
  if (map[key]) return map[key];
  return String(p).toUpperCase();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function ipCell(ip, className, tipo) {
  const e = esc(ip || '—');
  const tag = tipo ? `<span class="tipo-tag tipo-${tipo}">${tipo}</span>` : '';
  return `<td class="${className}"><span class="ip-cell"><span class="ip-text">${e}${tag}</span><span class="ip-acts"><button class="ip-act-btn" data-action="copy" data-ip="${e}" title="Copiar"><i class="ph ph-copy-simple"></i></button><button class="ip-act-btn" data-action="search" data-ip="${e}" title="Buscar"><i class="ph ph-magnifying-glass"></i></button></span></span></td>`;
}

function goToBuscar(ip) {
  document.querySelector('.sb-btn[data-view="buscar"]').click();
  $('buscar-input').value = ip;
  $('buscar-btn').click();
}

function exportCsv(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(r => headers.map(h => {
      const v = r[h];
      return typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','))
  ].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Sidebar Nav ──
function setView(view) {
  if (view === state.viewAtual) { renderView(view); return; }
  state.viewAtual = view;
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.sb-btn[data-view="${view}"]`);
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = $(`view-${view}`);
  if (el) el.classList.add('active');
  updatePageHead(view);
  renderView(view);
}

function initNav() {
  document.querySelectorAll('.sb-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

function updatePageHead(view) {
  const titles = {
    'visao-geral': 'Dashboard', 'top-talkers': 'Top Talkers',
    'buscar': 'Buscar IP', 'ataques': 'Ataques',
    'global': 'Mapa Global', 'comparar': 'Comparar Períodos',
    'asn': 'ASN / Redes',
    'subnets': 'Sub-redes',
    'matriz': 'Matriz ASN',
    'equipamentos': 'Equipamentos',
    'clientes': 'Clientes'
  };
  const subs = {
    'visao-geral': 'monitoramento de tráfego em tempo real',
    'top-talkers': 'análise detalhada de tráfego por IP, porta, protocolo e aplicação',
    'buscar': 'investigue o tráfego de um IP específico',
    'ataques': 'detecção automática de ameaças',
    'global': 'distribuição geográfica do tráfego',
    'comparar': 'compare o tráfego entre dois períodos',
    'asn': 'análise por sistema autônomo',
    'subnets': 'agrupamento por prefixo de rede',
    'matriz': 'tráfego entre sistemas autônomos',
    'equipamentos': 'dispositivos de rede por agent_id (multi-vendor)',
    'clientes': 'clientes com múltiplos blocos de IP e uso vs contratado'
  };
  $('view-title').textContent = titles[view] || view;
  $('view-subtitle').textContent = subs[view] || '';
}

function renderView(view) {
  if (view === 'visao-geral') renderVisaoGeral();
  else if (view === 'top-talkers') renderTopTalkers();
  else if (view === 'buscar') {}
  else if (view === 'ataques') renderAtaques();
  else if (view === 'global') renderGlobal();
  else if (view === 'comparar') renderComparar();
  else if (view === 'asn') renderAsnView();
  else if (view === 'subnets') renderSubnetsView();
  else if (view === 'matriz') renderMatrizView();
  else if (view === 'equipamentos') renderEquipamentosView();
  else if (view === 'clientes') renderClientesView();
}

// ── Health ──
async function pollHealth() {
  try {
    const res = await fetch('/mapa/health');
    const data = await res.json();
    const cpu = data.cpu || 0;
    const mem = data.memory || 0;
    document.getElementById('cpu-bar').querySelector('.sys-fill').style.width = cpu + '%';
    document.getElementById('cpu-val').textContent = cpu + '%';
    document.getElementById('mem-bar').querySelector('.sys-fill').style.width = mem + '%';
    document.getElementById('mem-val').textContent = mem + '%';
  } catch {}
}

// ── Theme ──
function initTheme() {
  const btn = $('theme-toggle');
  const stored = localStorage.getItem('flow-theme');
  if (stored === 'light') {
    document.getElementById('app').classList.add('light');
    btn.innerHTML = '<i class="ph ph-moon"></i>';
  }
  btn.addEventListener('click', () => {
    document.getElementById('app').classList.toggle('light');
    const isLight = document.getElementById('app').classList.contains('light');
    localStorage.setItem('flow-theme', isLight ? 'light' : 'dark');
    btn.innerHTML = isLight ? '<i class="ph ph-moon"></i>' : '<i class="ph ph-sun-dim"></i>';
  });
}

function initFullscreen() {
  $('ph-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); }
    else { document.exitFullscreen(); }
  });
}

function initTopbarSearch() {
  $('tb-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const ip = e.target.value.trim();
      if (ip) {
        document.querySelector('.sb-btn[data-view="buscar"]').click();
        $('buscar-input').value = ip;
        const evt = new KeyboardEvent('keydown', { key: 'Enter' });
        $('buscar-input').dispatchEvent(evt);
      }
    }
  });
}

// ── ASN enrichment ──
const asnCache = {};
async function fetchAsn(ips) {
  const missing = ips.filter(ip => !(ip in asnCache));
  if (!missing.length) return;
  try {
    const res = await fetch(API + '/asn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips: missing })
    });
    const data = await res.json();
    for (const [ip, info] of Object.entries(data)) asnCache[ip] = info;
  } catch {}
}

function enrichWithAsn(containerId, ipField) {
  const rows = $(containerId).querySelectorAll('.asn-ready');
  const ips = [];
  rows.forEach(r => {
    const ip = r.dataset[ipField];
    if (ip && ip !== '—') ips.push(ip);
  });
  if (!ips.length) return;
  fetchAsn(ips).then(() => {
    rows.forEach(r => {
      const ip = r.dataset[ipField];
      const info = asnCache[ip];
      if (!info) return;
      const cell = r.querySelector('.' + ipField + '-cell .ip-text');
      if (!cell) return;
      const tag = document.createElement('span');
      tag.className = 'asn-tag';
      tag.textContent = `AS${info.asn}`;
      tag.title = info.org || '';
      cell.parentNode.insertBefore(tag, cell.nextSibling);
    });
  });
}

// ── Visao Geral ──
async function renderVisaoGeral() {
  try {
    const [resumo, talkers, series, ataques] = await Promise.all([
      apiFetch(`/resumo?periodo=${state.periodo}`),
      apiFetch(`/top-talkers?tipo=ip&limite=10&periodo=${state.periodo}`),
      apiFetch(`/series-trafego?periodo=6h&intervalo=5m`),
      apiFetch('/ataques').catch(() => null)
    ]);

    if ($('vg-kpis')) $('vg-kpis').innerHTML = `
      <div class="mkpi in">
        <span class="mkpi-label">Inbound</span>
        <span class="mkpi-value">${fmtBps(resumo.in_bps)}</span>
        <span class="mkpi-sub">${fmtBytes(resumo.in_bytes || resumo.in_bps * (3600/8))} total</span>
      </div>
      <div class="mkpi out">
        <span class="mkpi-label">Outbound</span>
        <span class="mkpi-value">${fmtBps(resumo.out_bps)}</span>
        <span class="mkpi-sub">${fmtBytes(resumo.out_bytes || resumo.out_bps * (3600/8))} total</span>
      </div>
      <div class="mkpi top">
        <span class="mkpi-label">Top IP</span>
        <span class="mkpi-value">${talkers && talkers[0] ? esc(talkers[0].ip_src || talkers[0].ip_dst) : '—'}</span>
        <span class="mkpi-sub">${talkers && talkers[0] ? fmtBps(talkers[0].bps) : '—'}</span>
      </div>
      <div class="mkpi flows">
        <span class="mkpi-label">Flows</span>
        <span class="mkpi-value">${fmtNum(resumo.total_flows)}</span>
        <span class="mkpi-sub">no período</span>
      </div>
      <div class="mkpi cliente">
        <span class="mkpi-label">Cliente</span>
        <span class="mkpi-value">${fmtBps(resumo.cliente_bps)}</span>
        <span class="mkpi-sub">tráfego clientes</span>
      </div>
      <div class="mkpi transito">
        <span class="mkpi-label">Trânsito</span>
        <span class="mkpi-value">${fmtBps(resumo.transito_bps)}</span>
        <span class="mkpi-sub">tráfego trânsito</span>
      </div>`;

    const banner = $('vg-banner');
    const atkList = $('vg-ataques-list');
    const sbAtk = $('sb-ataques');
    const notifBadge = $('notif-badge');

    if (banner) {
      if (ataques && Array.isArray(ataques)) {
      const ativos = ataques.filter(a => a.status === 'ativo');
      if (ativos.length > 0) {
        banner.className = 'vg-banner';
        banner.innerHTML = `<strong>${ativos.length}</strong> ataque(s) ativo(s) — ${esc(ativos[0].ip_src)} @ ${fmtBps(ativos[0].bps)} <a href="#" class="b-link" id="banner-link">ver todos</a>`;
        banner.onclick = e => {
          if (e.target.id === 'banner-link') { e.preventDefault(); document.querySelector('.sb-btn[data-view="ataques"]').click(); }
        };
        atkList.innerHTML = ativos.slice(0, 3).map(a => {
          const t = a.tipo || 'suspeito';
          const tl = { ddos: 'DDoS', portscan: 'Scan', bruteforce: 'Brute', amplification: 'Ampl' }[t] || '?';
          const tc = { ddos: 'atk-ddos', portscan: 'atk-scan', bruteforce: 'atk-brute', amplification: 'atk-ampl' }[t] || 'atk-suspeito';
          return `<div class="tt-row">
            <span class="atk-tipo ${tc}" style="font-size:8px;padding:0 4px;">${tl}</span>
            <span class="tt-src" style="color:var(--red);">${esc(a.ip_src)}</span>
            <span class="tt-arrow">→</span>
            <span class="tt-dst">${esc(a.alvos || '—')}</span>
            <span class="tt-val" style="color:var(--yellow);">${fmtBps(a.bps)}</span>
          </div>`;
        }).join('');
        if (sbAtk) sbAtk.innerHTML = '<i class="ph ph-shield-warning"></i>';
        if (notifBadge) { notifBadge.textContent = ativos.length; notifBadge.classList.remove('hidden'); }
      } else {
        banner.className = 'vg-banner hidden';
        atkList.innerHTML = '<div class="atk-empty">nenhum ataque ativo</div>';
        if (sbAtk) sbAtk.innerHTML = '<i class="ph ph-shield-slash"></i>';
        if (notifBadge) notifBadge.classList.add('hidden');
      }
    } else {
      banner.className = 'vg-banner hidden';
      atkList.innerHTML = '<div class="atk-empty">nenhum ataque ativo</div>';
      if (sbAtk) sbAtk.innerHTML = '<i class="ph ph-shield-slash"></i>';
      if (notifBadge) notifBadge.classList.add('hidden');
    }
    }

    renderChart(series);
    renderProtocolos();
    renderMetricas();
    renderComparativoSemanal();

    const body = $('vg-talkers');
    if (body) {
      if (!Array.isArray(talkers) || !talkers.length) {
        body.innerHTML = '<div style="padding:12px 0;color:var(--text-muted);font-style:italic;text-align:center;">sem dados</div>';
      } else {
        body.innerHTML = talkers.slice(0, 8).map((t, i) => {
          const src = esc(t.ip_src || '—');
          const dst = esc(t.ip_dst || '—');
          return `<div class="tt-row">
            <span class="tt-num">${i + 1}</span>
            <span class="tt-src">${src}</span>
            <span class="tt-arrow">→</span>
            <span class="tt-dst">${dst}</span>
            <span class="tt-val">${fmtBps(t.bps)}</span>
          </div>`;
        }).join('');
      }
    }

  } catch (e) {
    const k = $('vg-kpis');
    if (k) k.innerHTML = `<div style="grid-column:1/-1;padding:20px 0;text-align:center;color:var(--text-muted);">Erro ao carregar: ${esc(e.message)}</div>`;
  }
}

function renderChart(series) {
  if (!$('vg-chart')) return;
  if (!series || !series.length) {
    $('vg-chart').innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);">sem dados de tráfego</div>';
    return;
  }
  const inData = series.map(s => ({ x: (s.t || s.timestamp * 1000) / 1, y: (s.in_bps || 0) / 1e6 }));
  const outData = series.map(s => ({ x: (s.t || s.timestamp * 1000) / 1, y: (s.out_bps || 0) / 1e6 }));

  const opts = {
    chart: { type: 'area', height: 200, toolbar: { show: false }, zoom: { enabled: true }, fontFamily: 'Inter, system-ui, sans-serif', foreColor: '#64748b', background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 800, animateGradually: { enabled: false }, dynamicAnimation: { speed: 800 } } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 1.5, lineCap: 'round' },
    fill: { type: 'gradient', gradient: { shadeIntensity: 0.8, opacityFrom: 0.2, opacityTo: 0.02, stops: [0, 90, 100] } },
    markers: { size: 0, strokeWidth: 0, hover: { size: 4, strokeWidth: 0 } },
    xaxis: { type: 'datetime', labels: { format: 'HH:mm', style: { fontSize: '10px', colors: '#475569' } }, axisBorder: { show: false }, axisTicks: { show: false }, crosshairs: { show: true, width: 1, stroke: { color: '#1e293b', dashArray: 3 } } },
    yaxis: { labels: { formatter: v => v.toFixed(1), style: { fontSize: '10px', colors: '#475569' } }, forceNiceScale: true, axisBorder: { show: false }, axisTicks: { show: false }, min: 0 },
    grid: { borderColor: 'rgba(255,255,255,0.03)', strokeDashArray: 4, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { left: 4, right: 4 } },
    tooltip: { theme: 'dark', x: { format: 'dd/MM HH:mm' }, y: { formatter: v => v.toFixed(2) + ' Mbps' }, style: { fontSize: '11px' }, marker: { show: true }, fixed: { enabled: true, position: 'topRight', offsetX: 0, offsetY: 0 } },
    colors: ['#34d399', '#60a5fa'],
    legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#64748b' }, fontSize: '10px', itemMargin: { horizontal: 8, vertical: 0 } },
    series: [
      { name: 'Inbound', data: inData },
      { name: 'Outbound', data: outData }
    ]
  };

  if (state.chart) { state.chart.destroy(); }
  state.chart = new ApexCharts(document.getElementById('vg-chart'), opts);
  state.chart.render();
}

// ── Top Talkers ──
async function renderTopTalkers() {
  try {
    const [src, dst, port, proto, apps] = await Promise.all([
      apiFetch(`/top-talkers?tipo=ip_src&limite=20&periodo=${state.periodo}`),
      apiFetch(`/top-talkers?tipo=ip_dst&limite=20&periodo=${state.periodo}`),
      apiFetch(`/top-talkers?tipo=porta&limite=10&periodo=${state.periodo}`),
      apiFetch(`/top-talkers?tipo=proto&limite=10&periodo=${state.periodo}`),
      apiFetch(`/top-apps?limite=12&periodo=${state.periodo}`)
    ]);

    $('tt-src').innerHTML = topTable(src, 'src');
    $('tt-dst').innerHTML = topTable(dst, 'dst');
    $('tt-port').innerHTML = portTable(port);
    $('tt-proto').innerHTML = protoTable(proto);
    renderAppsChart(apps);
    enrichWithAsn('tt-src', 'src');
    enrichWithAsn('tt-dst', 'dst');
  } catch (e) {
    ['tt-src','tt-dst','tt-port','tt-proto'].forEach(id => {
      $(id).innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">Erro: ${esc(e.message)}</div>`;
    });
  }
}

function topTable(data, tipo) {
  if (!Array.isArray(data) || !data.length) return '<div style="padding:12px 0;text-align:center;color:var(--text-muted);font-style:italic;">sem dados</div>';
  const dataKey = tipo === 'src' ? 'ip_src' : 'ip_dst';
  const rows = data.map((r, i) => {
    const ip = r[dataKey] || '—';
    const attrs = `class="asn-ready" data-src="${tipo === 'src' ? (r.ip_src || '') : ''}" data-dst="${tipo === 'dst' ? (r.ip_dst || '') : ''}"`;
    return `<tr ${attrs}><td class="num">${i + 1}</td>${ipCell(ip, tipo, r.tipo_ip)}<td class="traf">${fmtBps(r.bps)}</td><td class="flows">${fmtNum(r.total_flows)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>#</th><th>IP</th><th>Tráfego</th><th>Flows</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function portTable(data) {
  if (!Array.isArray(data) || !data.length) return '<div style="padding:12px 0;text-align:center;color:var(--text-muted);font-style:italic;">sem dados</div>';
  const rows = data.map((r, i) => {
    const port = r.port_dst || r.porta || '—';
    const proto = fmtProto(r.proto);
    return `<tr><td class="num">${i + 1}</td><td><span class="proto-badge ${proto}">${proto}</span> ${esc(port)}</td><td class="traf">${fmtBps(r.bps)}</td><td class="flows">${fmtNum(r.total_flows)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>#</th><th>Porta</th><th>Tráfego</th><th>Flows</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function protoTable(data) {
  if (!Array.isArray(data) || !data.length) return '<div style="padding:12px 0;text-align:center;color:var(--text-muted);font-style:italic;">sem dados</div>';
  const total = data.reduce((s, r) => s + (parseFloat(r.bps) || 0), 0);
  const rows = data.map((r, i) => {
    const proto = fmtProto(r.proto);
    const pct = total > 0 ? Math.round(parseFloat(r.bps) / total * 100) : 0;
    return `<tr><td class="num">${i + 1}</td><td><span class="proto-badge ${proto}">${proto}</span></td><td class="traf">${fmtBps(r.bps)}</td><td style="font-size:11px;color:var(--text-dim);">${pct}%<span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span></td></tr>`;
  }).join('');
  return `<table><thead><tr><th>#</th><th>Protocolo</th><th>Tráfego</th><th>%</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAppsChart(data) {
  const el = $('tt-apps');
  if (state.appsChart) { state.appsChart.destroy(); state.appsChart = null; }

  if (!Array.isArray(data) || !data.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-style:italic;">sem dados de aplicações</div>';
    return;
  }

  const colors = ['#38bdf8','#34d399','#fbbf24','#a78bfa','#ef4444','#fb923c','#2dd4bf','#f472b6','#818cf8','#4ade80','#facc15','#e879f9','#64748b'];

  el.innerHTML = '<div class="apps-grid"><div id="apps-donut"></div><div id="apps-table"></div></div>';

  const labels = data.map(x => x.name);
  const vals = data.map(x => Math.round(x.bps / 1e6 * 100) / 100);

  const chartOpts = {
    chart: { type: 'donut', height: 240, toolbar: { show: false }, fontFamily: 'Inter, system-ui, sans-serif', foreColor: '#64748b' },
    labels, colors,
    dataLabels: { enabled: false },
    legend: { show: false },
    stroke: { show: false },
    plotOptions: { pie: { donut: { size: '60%', background: 'transparent' } } },
    tooltip: { theme: 'dark', y: { formatter: v => v + ' Mbps' } },
    responsive: [{ breakpoint: 600, options: { chart: { height: 200 } } }]
  };

  state.appsChart = new ApexCharts(document.getElementById('apps-donut'), chartOpts);
  state.appsChart.render();

  const total = data.reduce((s, x) => s + x.bps, 0);
  const tableHtml = `<table class="apps-data-table">
    <thead><tr><th>Aplicação</th><th>Tráfego</th><th>%</th><th>Portas</th></tr></thead>
    <tbody>${data.map(x => {
      const pct = total > 0 ? Math.round(x.bps / total * 100) : 0;
      return `<tr><td><span class="app-name">${esc(x.name)}</span></td><td class="traf">${fmtBps(x.bps)}</td><td>${pct}%</td><td style="font-size:10px;color:var(--text-muted);font-family:var(--mono);">${(x.ports || []).join(', ')}</td></tr>`;
    }).join('')}</tbody></table>`;
  document.getElementById('apps-table').innerHTML = tableHtml;
}

// ── Attack Timeline ──
async function renderAtkTimeline() {
  try {
    const data = await apiFetch('/ataques-timeline');
    if (!Array.isArray(data) || !data.length) {
      $('atk-timeline-chart').innerHTML = '';
      return;
    }
    const cats = data.map(d => {
      const dt = new Date(d.t);
      return String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
    });
    if (state.atkChart) state.atkChart.destroy();
    state.atkChart = new ApexCharts($('atk-timeline-chart'), {
      chart: { type: 'bar', height: 140, stacked: true, toolbar: { show: false }, fontFamily: 'Inter, system-ui, sans-serif', foreColor: '#64748b', background: 'transparent', sparkline: { enabled: true } },
      colors: ['#ef4444', '#facc15', '#a855f7'],
      series: [
        { name: 'DDoS', data: data.map(d => d.ddos) },
        { name: 'Scan', data: data.map(d => d.portscan) },
        { name: 'Brute', data: data.map(d => d.bruteforce) }
      ],
      xaxis: { categories: cats, labels: { show: false } },
      yaxis: { show: false },
      grid: { show: false },
      tooltip: { theme: 'dark', style: { fontSize: '10px' } },
      legend: { show: true, position: 'top', horizontalAlign: 'right', fontSize: '9px', itemMargin: { horizontal: 6 } },
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 1, distributed: false } },
      dataLabels: { enabled: false }
    });
    state.atkChart.render();
  } catch {
    $('atk-timeline-chart').innerHTML = '';
  }
}

// ── Ataques ──
async function renderAtaques() {
  renderAtkTimeline();
  try {
    const data = await apiFetch('/ataques');
    if (!Array.isArray(data) || !data.length) {
      $('atk-table').innerHTML = '<div class="atk-none">nenhum ataque detectado</div>';
      return;
    }
    $('atk-table').innerHTML = `<table><thead><tr><th>IP</th><th>Tráfego</th><th>Alvos</th><th>Tipo</th><th>Status</th><th>Detectado</th></tr></thead><tbody>${data.map(a => {
      const st = (a.status || 'ativo').toLowerCase();
      const t = a.tipo || 'suspeito';
      const tipoLabel = { ddos: 'DDoS', portscan: 'Port Scan', bruteforce: 'Brute Force', amplification: 'Amplificação' }[t] || 'Suspeito';
      const tipoCls = { ddos: 'atk-ddos', portscan: 'atk-scan', bruteforce: 'atk-brute', amplification: 'atk-ampl' }[t] || 'atk-suspeito';
      return `<tr>${ipCell(a.ip_src, 'ip-atk')}<td class="bps-atk">${fmtBps(a.bps)}</td><td style="font-size:11px;color:var(--text-dim);">${a.alvos || '—'}</td><td><span class="atk-tipo ${tipoCls}">${tipoLabel}</span></td><td><span class="status-badge ${st}">${st}</span></td><td style="font-size:11px;color:var(--text-muted);font-family:var(--mono);">${tempoAgo(a.timestamp)}</td></tr>`;
    }).join('')}</tbody></table>`;
  } catch (e) {
    $('atk-table').innerHTML = `<div class="atk-none">Erro: ${esc(e.message)}</div>`;
  }
}

function tempoAgo(ts) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return diff + 's';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// ── IP Profile ──
async function renderIpProfile(ip, per) {
  const el = $('ip-profile-card');
  if (!el) return;
  try {
    const data = await apiFetch(`/ip-profile?ip=${encodeURIComponent(ip)}&periodo=${per}`);
    if (!data || !data.bps && !data.total_flows) { el.innerHTML = ''; return; }
    const score = data.risk_score || 0;
    const scoreCls = score < 30 ? 'ok' : score < 60 ? 'warn' : 'erro';
    const pais = data.geo?.country || '—';
    const asnStr = data.asn ? `AS${data.asn.asn} ${esc(data.asn.org)}` : '—';
    const pctIn = data.total_bytes > 0 ? Math.round(data.bytes_dst / data.total_bytes * 100) : 0;
    const pctOut = 100 - pctIn;
    const atkBadge = data.ataques?.ativos > 0
      ? `<span style="color:var(--red);font-weight:600;">${data.ataques.ativos} ativo(s)</span>`
      : data.ataques?.total > 0
        ? `<span style="color:var(--text-dim);">${data.ataques.total} histórico</span>`
        : '<span style="color:var(--green);">nenhum</span>';
    el.innerHTML = `<div class="card ip-profile-card">
      <div class="card-head"><span class="card-title">Perfil do IP</span></div>
      <div style="display:flex;gap:16px;padding:4px 12px 12px;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:140px;">
          <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;">Score Risco</span>
          <span style="font-size:20px;font-weight:700;font-family:var(--mono);color:var(--${scoreCls === 'ok' ? 'green' : scoreCls === 'warn' ? 'yellow' : 'red'});">${score}/100</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:140px;">
          <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;">Geo / ASN</span>
          <span style="font-size:12px;font-weight:600;">${pais}</span>
          <span style="font-size:10px;color:var(--text-dim);font-family:var(--mono);">${asnStr}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:140px;">
          <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;">Tráfego</span>
          <span style="font-size:12px;font-weight:600;">${fmtBps(data.bps)}</span>
          <span style="font-size:10px;color:var(--text-dim);">↓ in ${pctIn}% / ↑ out ${pctOut}%</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:140px;">
          <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;">Portas / Ataques</span>
          <span style="font-size:12px;font-weight:600;">${data.total_ports} portas</span>
          <span style="font-size:10px;">${atkBadge}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:120px;">
          <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;">Top Portas</span>
          ${(data.top_ports || []).slice(0, 3).map(p => `<span style="font-size:11px;font-family:var(--mono);color:var(--text-dim);">${p.port} — ${fmtBytes(p.bytes)}</span>`).join('') || '<span style="font-size:10px;color:var(--text-muted);">—</span>'}
          <button class="btn-sm" style="margin-top:4px;font-size:9px;" id="scan-check-btn" data-ip="${esc(ip)}"><i class="ph ph-magnifying-glass"></i> Verificar Scan</button>
        </div>
      </div>
    </div>`;
  } catch {
    el.innerHTML = '';
  }
}

// ── Buscar IP ──
function initBuscar() {
  const input = $('buscar-input');
  const btn = $('buscar-btn');
  const results = $('buscar-results');
  let per = '6h';

  function doSearch() {
    const ip = input.value.trim();
    if (!ip) return;
    results.innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);">buscando...</div>';

    const activePer = document.querySelector('#buscar-period .per-btn.active');
    per = activePer ? activePer.dataset.period : '6h';

    apiFetch(`/buscar?ip=${encodeURIComponent(ip)}&periodo=${per}`).then(data => {
      if (!Array.isArray(data) || !data.length) {
        results.innerHTML = '<div class="buscar-empty">nenhum tráfego encontrado para este IP no período.</div>';
        return;
      }
      let totalBps = 0, totalFlows = 0;
      for (const r of data) { totalBps += parseFloat(r.bps) || 0; totalFlows += parseFloat(r.total_flows) || 0; }

      results._lastData = data;

      results.innerHTML = `
        <div class="buscar-export">
          <button class="btn-sm" id="export-csv"><i class="ph ph-download-simple"></i> Exportar CSV</button>
        </div>
        <div class="buscar-kpis">
          <div class="kpi"><span class="kpi-label">IP Investigado</span><span class="kpi-value" style="font-size:16px;color:var(--accent);">${esc(ip)}</span></div>
          <div class="kpi"><span class="kpi-label">Tráfego Total</span><span class="kpi-value" style="font-size:16px;color:var(--green);">${fmtBps(totalBps)}</span></div>
          <div class="kpi"><span class="kpi-label">Conexões</span><span class="kpi-value" style="font-size:16px;color:var(--purple);">${fmtNum(data.length)}</span></div>
        </div>
        <div id="ip-profile-card"></div>
        <div class="card" style="padding:0;">
          <table>
            <thead><tr><th>IP Par</th><th>Porta</th><th>Proto</th><th>Tráfego</th><th>Flows</th></tr></thead>
            <tbody>${data.map(r => {
              const proto = fmtProto(r.proto);
              return `<tr>${ipCell(r.ip_par, 'dst')}<td style="font-size:11px;font-family:var(--mono);color:var(--text-dim);">${r.port_src || '—'}:${r.port_dst || '—'}</td><td><span class="proto-badge ${proto}">${proto}</span></td><td class="traf">${fmtBytes(r.bytes_total)}</td><td class="flows">${fmtNum(r.total_flows)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>`;
      const expBtn = results.querySelector('#export-csv');
      if (expBtn) expBtn.addEventListener('click', () => exportCsv(data, `buscar-${ip}-${per}.csv`));
      renderIpProfile(ip, per);
      setTimeout(() => {
        const scanBtn = results.querySelector('#scan-check-btn');
        if (scanBtn) {
          scanBtn.addEventListener('click', async () => {
            const ip = scanBtn.dataset.ip;
            scanBtn.disabled = true;
            scanBtn.innerHTML = '<i class="ph ph-spinner-gap"></i> verificando...';
            try {
              const res = await apiFetch(`/port-scan-check?ip=${encodeURIComponent(ip)}&janela=300`);
              const labels = { normal: 'normal ✅', scan: 'scan 🟡', scan_agressivo: 'scan agressivo 🔴', scan_leve: 'scan leve ⚠️' };
              scanBtn.innerHTML = labels[res.resultado] || res.resultado;
              scanBtn.style.fontSize = '9px';
            } catch {
              scanBtn.innerHTML = 'erro';
            }
            setTimeout(() => { scanBtn.disabled = false; }, 3000);
          });
        }
      }, 50);
    }).catch(err => {
      results.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);">Erro: ${esc(err.message)}</div>`;
    });
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  document.querySelectorAll('#buscar-period .per-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#buscar-period .per-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      per = b.dataset.period;
      if (input.value.trim()) doSearch();
    });
  });
}

// ── Period ──
function initPeriod() {
  document.querySelectorAll('#period-bar .per-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#period-bar .per-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.periodo = btn.dataset.period;
      savePrefs();
      renderView(state.viewAtual);
    });
  });
}

// ── Card Actions ──
const CARD_VIEWS = {
  'top talkers': 'top-talkers',
  'ataques': 'ataques',
  'comparativo semanal': 'comparar'
};

function openCardMenu(btn) {
  closeCardMenu();
  const card = btn.closest('.card');
  const key = card ? card.dataset.card : null;
  const menu = document.createElement('div');
  menu.className = 'card-menu';
  const items = [];
  items.push({ icon: 'ph-arrows-clockwise', label: 'Atualizar', fn: () => renderVisaoGeral() });
  if (key && CARD_VIEWS[key]) {
    items.push({ icon: 'ph-arrows-out', label: 'Abrir na view', fn: () => setView(CARD_VIEWS[key]) });
  }
  items.push({ icon: 'ph-eye-slash', label: 'Ocultar card', fn: () => { if (key) toggleCardHidden(key); }, danger: key === null });
  menu.innerHTML = items.map(it =>
    `<button class="card-menu-item ${it.danger ? 'danger' : ''}" data-idx="${items.indexOf(it)}">
      <i class="ph ${it.icon}"></i>${it.label}
    </button>`).join('');
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 150) + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - 150, window.innerWidth - 160)) + 'px';
  menu.querySelectorAll('.card-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      closeCardMenu();
      items[idx].fn();
    });
  });
  setTimeout(() => {
    document.addEventListener('click', closeCardMenu, { once: true });
  }, 0);
}

function closeCardMenu() {
  const m = document.querySelector('.card-menu');
  if (m) m.remove();
}

function initCardActions() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.ca-btn[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'navigate') {
      document.querySelector(`.sb-btn[data-view="${btn.dataset.view}"]`).click();
    } else if (action === 'refresh-kpis') {
      renderVisaoGeral();
    } else if (action === 'menu') {
      e.stopPropagation();
      openCardMenu(btn);
    }
  });
}

function initCustomizePanel() {
  const btn = $('ph-customize');
  if (!btn) return;
  btn.addEventListener('click', () => {
    closeCardMenu();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999;';
    const cards = [...document.querySelectorAll('#view-visao-geral .dash-grid > *')]
      .map(el => ({ key: cardKeyOf(el), el }))
      .filter(c => c.key);
    overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:340px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.5);">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Personalizar dashboard</div>
      <div style="display:grid;gap:8px;">
        ${cards.map(c => `<label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;">
          <input type="checkbox" data-key="${esc(c.key)}" ${state.hiddenCards.includes(c.key) ? '' : 'checked'} style="accent-color:var(--accent);">
          ${esc(c.key)}
        </label>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
        <button class="eq-btn" id="cus-cancel">Cancelar</button>
        <button id="cus-save" style="background:var(--accent);color:#050B14;border:none;border-radius:6px;padding:6px 14px;font-weight:600;font-size:12px;cursor:pointer;">Aplicar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cus-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cus-save').addEventListener('click', () => {
      const hidden = cards
        .filter(c => !overlay.querySelector(`input[data-key="${CSS.escape(c.key)}"]`).checked)
        .map(c => c.key);
      state.hiddenCards = hidden;
      savePrefs();
      applyHiddenCards();
      overlay.remove();
    });
  });
}

// ── Dashboards (F3) ──
const WIDGET_DEFAULTS = {
  'tráfego': { w: 12, h: 10 },
  'visão geral': { w: 12, h: 8 },
  'capacidade': { w: 6, h: 8 },
  'protocolos': { w: 6, h: 8 },
  'flows ao vivo': { w: 6, h: 10 },
  'top talkers': { w: 6, h: 10 },
  'ataques': { w: 6, h: 10 },
  'comparativo semanal': { w: 12, h: 8 }
};
const WIDGET_TYPES = {
  'chart': 'tráfego', 'kpis': 'visão geral', 'metricas': 'capacidade',
  'protocolos': 'protocolos', 'live': 'flows ao vivo', 'talkers': 'top talkers',
  'ataques': 'ataques', 'semanal': 'comparativo semanal'
};

function dashboardAtual() {
  if (!state.dashboardAtivo) return null;
  return state.dashboards.find(d => String(d.id) === String(state.dashboardAtivo)) || null;
}

async function loadDashboards() {
  try {
    state.dashboards = (await apiFetch('/dashboards', { skipEqFilter: true, skipClienteFilter: true })) || [];
  } catch {
    state.dashboards = [];
  }
}

function destroyGrid() {
  if (state.gs) {
    try { state.gs.destroy(false); } catch {}
    state.gs = null;
  }
  const grid = $('dash-grid');
  if (!grid) return;
  grid.classList.remove('gs-active');
  grid.querySelectorAll('.grid-stack-item').forEach(item => {
    const content = item.querySelector('.grid-stack-item-content');
    if (content && content.firstElementChild) {
      content.firstElementChild.style.display = '';
      item.parentNode.insertBefore(content.firstElementChild, item);
    }
    item.remove();
  });
  grid.querySelectorAll('.card, .live-feed-wrap').forEach(el => { el.style.display = ''; });
}

function buildGridItems(widgets) {
  const grid = $('dash-grid');
  const byKey = {};
  [...grid.children].forEach(el => {
    const k = cardKeyOf(el);
    if (k) byKey[k] = el;
  });
  const used = new Set();
  widgets.forEach(w => {
    const el = byKey[w.tipo || w.key];
    if (!el || used.has(el)) return;
    used.add(el);
    const key = cardKeyOf(el);
    const size = WIDGET_DEFAULTS[key] || { w: 6, h: 8 };
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.setAttribute('data-gs-x', w.x ?? 0);
    item.setAttribute('data-gs-y', w.y ?? 0);
    item.setAttribute('data-gs-w', w.w || size.w);
    item.setAttribute('data-gs-h', w.h || size.h);
    item.dataset.key = key;
    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    el.parentNode.insertBefore(item, el);
    item.appendChild(content);
    content.appendChild(el);
  });
  [...grid.children].forEach(el => {
    if (el.classList.contains('grid-stack-item')) return;
    const k = cardKeyOf(el);
    if (k && !used.has(el)) el.style.display = 'none';
  });
}

function initGrid(readonly) {
  const grid = $('dash-grid');
  grid.classList.add('gs-active');
  if (typeof GridStack === 'undefined') {
    $('dash-grid').innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);">GridStack não carregado (offline?)</div>';
    return null;
  }
  const opts = {
    column: 12, cellHeight: 26, margin: 8, float: false,
    animate: true, handle: '.card-head', disableDrag: readonly, disableResize: readonly
  };
  state.gs = GridStack.init(opts, grid);
  return state.gs;
}

function applyDashboard(dash) {
  destroyGrid();
  const widgets = (dash && Array.isArray(dash.widgets) && dash.widgets.length)
    ? dash.widgets
    : Object.keys(WIDGET_DEFAULTS).map(key => {
        const size = WIDGET_DEFAULTS[key];
        return { tipo: key, titulo: key, x: 0, y: 0, w: size.w, h: size.h };
      });
  buildGridItems(widgets);
  const gs = initGrid(!state.editandoLayout);
  if (gs && state.editandoLayout) attachRemoveButtons();
  renderVisaoGeral();
  if (gs) gs.on('change', () => {});
}

function enterEditMode() {
  state.editandoLayout = true;
  $('dash-palette').style.display = 'flex';
  const dash = dashboardAtual();
  applyDashboard(dash);
}

function exitEditMode() {
  state.editandoLayout = false;
  $('dash-palette').style.display = 'none';
  destroyGrid();
  if (state.dashboardAtivo) applyDashboard(dashboardAtual());
  else renderVisaoGeral();
}

function collectWidgets() {
  const out = [];
  document.querySelectorAll('#dash-grid .grid-stack-item').forEach(item => {
    const n = item.gridstackNode || item._gridstackNode || {};
    out.push({
      tipo: item.dataset.key,
      titulo: item.dataset.key,
      x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 6, h: n.h ?? 8
    });
  });
  return out;
}

async function saveLayout() {
  if (!state.gs) return;
  const widgets = collectWidgets();
  let dash = dashboardAtual();
  if (!dash) {
    const nome = prompt('Nome do novo dashboard:') || '';
    if (!nome) return;
    const r = await apiFetch('/dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, widgets }) });
    state.dashboardAtivo = r.id;
    await loadDashboards();
  } else {
    await apiFetch(`/dashboards/${dash.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: dash.nome, widgets }) });
  }
  exitEditMode();
}

function attachRemoveButtons() {
  document.querySelectorAll('#dash-grid .grid-stack-item').forEach(item => {
    if (item.querySelector('.widget-rm')) return;
    const rm = document.createElement('button');
    rm.className = 'widget-rm';
    rm.innerHTML = '<i class="ph ph-x"></i>';
    rm.title = 'Remover widget';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.gs) { try { state.gs.removeWidget(item, false); } catch { item.remove(); } }
    });
    item.appendChild(rm);
  });
}

function openDashMenu() {
  closeCardMenu();
  const menu = document.createElement('div');
  menu.className = 'card-menu';
  const btn = $('ph-dash');
  const items = [];
  items.push({ icon: 'ph-plus', label: 'Novo dashboard', fn: async () => {
    const nome = prompt('Nome do novo dashboard:') || '';
    if (!nome) return;
    await loadDashboards();
    const r = await apiFetch('/dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, widgets: [] }) });
    await loadDashboards();
    state.dashboardAtivo = r.id;
    enterEditMode();
  }});
  if (state.dashboards.length) {
    items.push({ divider: true });
    state.dashboards.forEach(d => {
      items.push({ icon: d.ativo ? 'ph-check-circle' : 'ph-circle', label: esc(d.nome), active: String(state.dashboardAtivo) === String(d.id), fn: () => {
        state.dashboardAtivo = String(d.id);
        exitEditMode();
      }});
    });
  }
  items.push({ divider: true });
  items.push({ icon: state.editandoLayout ? 'ph-check' : 'ph-pencil-simple', label: state.editandoLayout ? 'Sair da edição' : 'Editar layout', fn: () => {
    if (state.editandoLayout) exitEditMode();
    else enterEditMode();
  }});
  items.push({ icon: 'ph-layout', label: 'Layout padrão', active: !state.dashboardAtivo, fn: () => {
    state.dashboardAtivo = null;
    exitEditMode();
    renderVisaoGeral();
  }});
  if (dashboardAtual()) {
    items.push({ icon: 'ph-trash', label: 'Excluir dashboard', danger: true, fn: async () => {
      const d = dashboardAtual();
      if (!confirm(`Excluir o dashboard "${d.nome}"?`)) return;
      await apiFetch(`/dashboards/${d.id}`, { method: 'DELETE' });
      await loadDashboards();
      state.dashboardAtivo = null;
      exitEditMode();
      renderVisaoGeral();
    }});
  }
  menu.innerHTML = items.map((it, idx) => it.divider
    ? '<div style="height:1px;background:var(--border);margin:4px 6px;"></div>'
    : `<button class="card-menu-item ${it.danger ? 'danger' : ''}" data-idx="${idx}">
        <i class="ph ${it.icon}"></i>${it.label}${it.active ? ' <span style="margin-left:auto;color:var(--accent);font-size:10px;">●</span>' : ''}
      </button>`).join('');
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 200) + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - 170, window.innerWidth - 180)) + 'px';
  menu.querySelectorAll('.card-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      closeCardMenu();
      items[idx].fn();
    });
  });
  setTimeout(() => { document.addEventListener('click', closeCardMenu, { once: true }); }, 0);
}

function initDashUI() {
  const btn = $('ph-dash');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCardMenu();
    openDashMenu();
  });
  const palette = $('dash-palette');
  if (palette) {
      palette.querySelectorAll('[data-widget]').forEach(b => {
      b.addEventListener('click', () => {
        if (!state.gs || !state.editandoLayout) return;
        const key = WIDGET_TYPES[b.dataset.widget];
        if (!key) return;
        const existente = [...document.querySelectorAll('#dash-grid .grid-stack-item')].find(x => x.dataset.key === key);
        if (existente) return;
        const size = WIDGET_DEFAULTS[key];
        const src = [...gridChildren()].find(x => cardKeyOf(x) === key);
        if (!src) return;
        const item = document.createElement('div');
        item.className = 'grid-stack-item';
        item.setAttribute('data-gs-x', 0); item.setAttribute('data-gs-y', 99);
        item.setAttribute('data-gs-w', size.w); item.setAttribute('data-gs-h', size.h);
        item.dataset.key = key;
        const content = document.createElement('div');
        content.className = 'grid-stack-item-content';
        item.appendChild(content);
        gridAppend(item, src, content);
      });
    });
    $('dash-save').addEventListener('click', saveLayout);
    $('dash-cancel-edit').addEventListener('click', () => exitEditMode());
  }
}

function gridChildren() {
  return [...$('dash-grid').children];
}

function gridAppend(item, src, content) {
  const grid = $('dash-grid');
  src.style.display = '';
  grid.appendChild(item);
  content.appendChild(src);
  if (state.gs) state.gs.makeWidget(item);
  attachRemoveButtons();
  renderVisaoGeral();
}

// ── IP Cell Actions ──
function initIpActions() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.ip-act-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const ip = btn.dataset.ip;
    if (!ip || ip === '—' || action === 'menu') return;

    if (action === 'copy') {
      navigator.clipboard.writeText(ip).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '<i class="ph ph-check"></i>';
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<i class="ph ph-copy-simple"></i>'; }, 1500);
      }).catch(() => {});
    } else if (action === 'search') {
      goToBuscar(ip);
    }
  });
}

// ── Socket.IO Live Feed ──
let __lastLiveTs = 0;

function setLiveDot(stateClass) {
  const dot = $('live-dot');
  if (!dot) return;
  dot.className = 'live-dot';
  if (stateClass) dot.classList.add(stateClass);
}

function setLiveAgo(text) {
  const el = $('live-ago');
  if (el) el.textContent = text;
}

function initLiveFeed() {
  if (typeof io === 'undefined') {
    setLiveDot('err');
    setLiveAgo('socket.io não carregado');
    return;
  }
  try {
    const origin = window.location.origin;
    state.socket = io(origin, { path: '/socket.io', reconnection: true, reconnectionDelay: 3000, reconnectionAttempts: 20 });

    state.socket.on('connect', () => {
      setLiveDot('ok');
      setLiveAgo('conectado');
      const fe = $('live-feed-empty');
      if (fe) fe.textContent = 'conectado, aguardando dados...';    });

    state.socket.on('disconnect', (reason) => {
      setLiveDot('err');
      setLiveAgo('desconectado: ' + reason);
    });

    state.socket.on('connect_error', (err) => {
      setLiveDot('err');
      const msg = err.message || '';
      if (msg.includes('CORS') || msg.includes('cross')) {
        setLiveAgo('CORS bloqueado');
      const fe = $('live-feed-empty');
      if (fe) fe.textContent = 'erro CORS — verifique allowedOrigins no backend';
      } else if (msg.includes('xhr') || msg.includes('transport')) {
        setLiveAgo('transporte falhou');
      } else {
        setLiveAgo('erro: ' + msg.substring(0, 30));
      }
    });

    state.socket.on('liveFlows', rows => {
      if (!Array.isArray(rows) || !rows.length) return;
      __lastLiveTs = Date.now();
      setLiveDot('ok');
      setLiveAgo('agora');
      for (const r of rows) {
        state.liveFlows.unshift(r);
        if (state.liveFlows.length > 50) state.liveFlows.pop();
      }
      renderLiveFeed();
    });

    state.socket.on('novoAtaque', () => {
      if (state.viewAtual === 'visao-geral' || state.viewAtual === 'ataques') {
        renderView(state.viewAtual);
      }
    });
  } catch (e) {
    setLiveDot('err');
    setLiveAgo('erro init: ' + (e.message || ''));
  }

  // Check health every 5s: if no data for 30s, mark warning
  setInterval(() => {
    const ago = Date.now() - __lastLiveTs;
    if (__lastLiveTs && ago > 30000) {
      setLiveDot('err');
      setLiveAgo('sem dados >30s');
    } else if (__lastLiveTs) {
      setLiveAgo(Math.round(ago / 1000) + 's atrás');
    }
  }, 5000);
}

function renderLiveFeed() {
  const el = $('live-feed-body');
  if (!el) return;
  if (!state.liveFlows.length) {
    el.innerHTML = '<div class="live-feed-empty">aguardando dados ao vivo...</div>';
    return;
  }
  el.innerHTML = `<table class="live-table">
    <thead><tr><th>Src</th><th>→</th><th>Dst</th><th>Porta</th><th>Proto</th><th>Bytes</th></tr></thead>
    <tbody>${state.liveFlows.slice(0, 20).map(r => {
      const p = fmtProto(r.proto);
      return `<tr><td class="live-ip">${esc(r.ip_src)}</td><td class="live-arrow">→</td><td class="live-ip">${esc(r.ip_dst)}</td><td class="live-port">${r.port_src || '?'}:${r.port_dst || '?'}</td><td><span class="proto-badge ${p}">${p}</span></td><td class="live-bytes">${fmtBytes(r.bytes_total)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

// ── Mapa Global 3D ──
async function renderGlobal() {
  const emptyEl = $('global-map-empty');
  const mapEl = $('global-map');
  const container = mapEl.parentElement;

  emptyEl.style.display = 'block';

  try {
    const [srcData, dstData] = await Promise.all([
      apiFetch(`/top-talkers?tipo=ip_src&limite=30&periodo=${state.periodo}`),
      apiFetch(`/top-talkers?tipo=ip_dst&limite=30&periodo=${state.periodo}`)
    ]);

    const ips = new Set();
    const ipMap = {};
    for (const r of srcData) { if (r.ip_src) { ips.add(r.ip_src); ipMap[r.ip_src] = (ipMap[r.ip_src] || 0) + (parseFloat(r.bps) || 0); } }
    for (const r of dstData) { if (r.ip_dst) { ips.add(r.ip_dst); ipMap[r.ip_dst] = (ipMap[r.ip_dst] || 0) + (parseFloat(r.bps) || 0); } }

    if (!ips.size) {
      emptyEl.textContent = 'sem IPs para mapear';
      return;
    }

    const geoRes = await fetch(API + '/geoip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips: [...ips] })
    });
    const geoData = await geoRes.json();
    emptyEl.style.display = 'none';

    // Build location list
    const locBps = {};
    for (const [ip, bps] of Object.entries(ipMap)) {
      const g = geoData[ip];
      if (g && g.ll && g.ll[0] != null && g.ll[1] != null) {
        const k = `${g.ll[0]},${g.ll[1]}`;
        if (!locBps[k]) locBps[k] = { ll: g.ll, bps: 0, ips: [], country: g.country, city: g.city };
        locBps[k].bps += bps;
        locBps[k].ips.push(ip);
      }
    }

    const locs = Object.values(locBps);
    const maxBps = Math.max(...locs.map(x => x.bps), 1);

    // Side panels (always render)
    renderGlobalCountries(locs);
    renderGlobalCities(locs);

    // Destroy previous globe if exists
    if (state.globalMap) {
      state.globalMap._destructor();
      state.globalMap = null;
    }

    // Init Globe — dark map style (visible continents, dark aesthetic)
    state.globalMap = Globe()(mapEl)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .width(mapEl.clientWidth)
      .height(mapEl.clientHeight || 500);

    state.globalMap.backgroundColor('rgba(6,11,20,0)');

    // Points data — neon futuristic
    const points = locs.map(loc => {
      const r = Math.max(0.4, Math.sqrt(loc.bps / maxBps) * 1.5);
      const intensity = loc.bps / maxBps;
      return {
        lat: loc.ll[0],
        lng: loc.ll[1],
        radius: r,
        color: intensity > 0.7 ? '#ff3366' : intensity > 0.3 ? '#ffaa00' : '#00ddff',
        altitude: r * 0.02,
        label: `${loc.city || loc.country || 'Desconhecido'}\n${fmtBps(loc.bps)}\n${loc.ips.slice(0, 3).join('\n')}`
      };
    });

    state.globalMap
      .pointsData(points)
      .pointLat('lat')
      .pointLng('lng')
      .pointRadius('radius')
      .pointColor('color')
      .pointAltitude('altitude')
      .pointLabel('label');

    // Arcs from approximate network center to destinations — neon glow
    const centerLat = locs.reduce((s, l) => s + l.ll[0], 0) / locs.length;
    const centerLng = locs.reduce((s, l) => s + l.ll[1], 0) / locs.length;

    const arcs = locs.map(loc => ({
      startLat: centerLat,
      startLng: centerLng,
      endLat: loc.ll[0],
      endLng: loc.ll[1],
      color: loc.bps / maxBps > 0.5 ? '#ff336688' : loc.bps / maxBps > 0.2 ? '#ffaa0088' : '#00ddff88',
      altitude: 0.05 + (loc.bps / maxBps) * 0.15,
      stroke: Math.max(0.3, loc.bps / maxBps)
    }));

    state.globalMap
      .arcsData(arcs)
      .arcColor('color')
      .arcAltitude('altitude')
      .arcStroke('stroke')
      .arcDashLength(0.03)
      .arcDashGap(0.01)
      .arcDashAnimateTime(4000);

    // Auto-rotate
    state.globalMap.controls().autoRotate = true;
    state.globalMap.controls().autoRotateSpeed = 0.8;
    state.globalMap.pointOfView({ altitude: 2.5 }, 0);

    mapEl.addEventListener('mouseenter', () => { if (state.globalMap) state.globalMap.controls().autoRotate = false; });
    mapEl.addEventListener('mouseleave', () => { if (state.globalMap) state.globalMap.controls().autoRotate = true; });

  } catch (e) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'Erro ao carregar mapa: ' + e.message;
  }
}

function renderGlobalCountries(locs) {
  const countries = {};
  for (const loc of locs) {
    const c = loc.country || 'Desconhecido';
    if (!countries[c]) countries[c] = { bps: 0, count: 0 };
    countries[c].bps += loc.bps;
    countries[c].count += loc.ips.length;
  }
  const sorted = Object.entries(countries).sort((a, b) => b[1].bps - a[1].bps);
  const total = sorted.reduce((s, x) => s + x[1].bps, 0);
  $('global-countries').innerHTML = sorted.length
    ? sorted.map(([country, d], i) => {
      const pct = total > 0 ? Math.round(d.bps / total * 100) : 0;
      return `<div class="global-row"><span class="global-rank">${i + 1}</span><span class="global-name">${esc(country)}</span><span class="global-val">${fmtBps(d.bps)}</span><span class="global-pct"><span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span></span></div>`;
    }).join('')
    : '<div class="global-empty">sem dados</div>';
}

function renderGlobalCities(locs) {
  const cities = {};
  for (const loc of locs) {
    const key = (loc.city || 'Desconhecido') + ', ' + (loc.country || '');
    if (!cities[key]) cities[key] = { bps: 0, count: 0 };
    cities[key].bps += loc.bps;
    cities[key].count += loc.ips.length;
  }
  const sorted = Object.entries(cities).sort((a, b) => b[1].bps - a[1].bps).slice(0, 15);
  const total = sorted.reduce((s, x) => s + x[1].bps, 0);
  $('global-cities').innerHTML = sorted.length
    ? sorted.map(([city, d], i) => {
      const pct = total > 0 ? Math.round(d.bps / total * 100) : 0;
      return `<div class="global-row"><span class="global-rank">${i + 1}</span><span class="global-name">${esc(city)}</span><span class="global-val">${fmtBps(d.bps)}</span><span class="global-pct"><span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span></span></div>`;
    }).join('')
    : '<div class="global-empty">sem dados</div>';
}

// ── Comparar Períodos ──
function initComparar() {
  document.querySelectorAll('.cmp-period').forEach((container, idx) => {
    container.querySelectorAll('.per-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.per-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.cmpPeriods[idx] = btn.dataset.period;
        if (state.viewAtual === 'comparar') renderComparar();
      });
    });
  });
}

async function renderComparar() {
  const p1 = state.cmpPeriods[0];
  const p2 = state.cmpPeriods[1];

  $('cmp-title-1').textContent = 'Período A — ' + p1;
  $('cmp-title-2').textContent = 'Período B — ' + p2;

  try {
    const data = await apiFetch(`/comparar?p1=${p1}&p2=${p2}&intervalo=300`);

    renderCmpChart(0, data.series1, '#34d399', 'Inbound');
    renderCmpChart(1, data.series2, '#60a5fa', 'Inbound');

    // Summary metrics
    const sum1 = data.series1.reduce((s, x) => s + (x.in_bps || 0) + (x.out_bps || 0), 0);
    const sum2 = data.series2.reduce((s, x) => s + (x.in_bps || 0) + (x.out_bps || 0), 0);
    const avg1 = data.series1.length ? sum1 / data.series1.length : 0;
    const avg2 = data.series2.length ? sum2 / data.series2.length : 0;
    const diff = avg2 > 0 ? ((avg1 - avg2) / avg2 * 100).toFixed(1) : '—';
    const direction = diff !== '—' ? (diff > 0 ? '▲' : '▼') : '—';
    const color = diff !== '—' ? (diff > 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)';

    $('cmp-metrics').innerHTML = `
      <div class="cmp-metric">
        <span class="cmp-metric-label">Tráfego Médio (A — ${p1})</span>
        <span class="cmp-metric-value">${fmtBps(avg1)}</span>
      </div>
      <div class="cmp-metric">
        <span class="cmp-metric-label">Tráfego Médio (B — ${p2})</span>
        <span class="cmp-metric-value">${fmtBps(avg2)}</span>
      </div>
      <div class="cmp-metric">
        <span class="cmp-metric-label">Diferença</span>
        <span class="cmp-metric-value" style="color:${color}">${direction} ${diff !== '—' ? Math.abs(diff) + '%' : '—'}</span>
      </div>
      <div class="cmp-metric">
        <span class="cmp-metric-label">Total Amostras (A)</span>
        <span class="cmp-metric-value">${fmtNum(data.series1.length)}</span>
      </div>
      <div class="cmp-metric">
        <span class="cmp-metric-label">Total Amostras (B)</span>
        <span class="cmp-metric-value">${fmtNum(data.series2.length)}</span>
      </div>`;
  } catch (e) {
    $('cmp-metrics').innerHTML = `<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-muted);">Erro: ${esc(e.message)}</div>`;
  }
}

function renderCmpChart(idx, series, color, label) {
  const el = document.getElementById(`cmp-chart-${idx + 1}`);
  if (state.cmpCharts[idx]) { state.cmpCharts[idx].destroy(); state.cmpCharts[idx] = null; }

  if (!series || !series.length) {
    el.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--text-muted);">sem dados</div>';
    return;
  }

  const data = series.map(s => ({ x: s.t / 1, y: (s.in_bps || 0) / 1e6 }));

  const opts = {
    chart: { type: 'area', height: 240, toolbar: { show: false }, zoom: { enabled: true }, fontFamily: 'Inter, system-ui, sans-serif', foreColor: '#64748b', background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 800 } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 1.5, lineCap: 'round' },
    fill: { type: 'gradient', gradient: { shadeIntensity: 0.8, opacityFrom: 0.2, opacityTo: 0.02, stops: [0, 90, 100] } },
    markers: { size: 0, strokeWidth: 0, hover: { size: 4, strokeWidth: 0 } },
    xaxis: { type: 'datetime', labels: { format: 'HH:mm', style: { fontSize: '10px', colors: '#475569' } }, axisBorder: { show: false }, axisTicks: { show: false }, crosshairs: { show: true, width: 1, stroke: { color: '#1e293b', dashArray: 3 } } },
    yaxis: { labels: { formatter: v => v.toFixed(1), style: { fontSize: '10px', colors: '#475569' } }, forceNiceScale: true, axisBorder: { show: false }, axisTicks: { show: false }, min: 0 },
    grid: { borderColor: 'rgba(255,255,255,0.03)', strokeDashArray: 4, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { left: 4, right: 4 } },
    tooltip: { theme: 'dark', x: { format: 'dd/MM HH:mm' }, y: { formatter: v => v.toFixed(2) + ' Mbps' }, style: { fontSize: '11px' }, marker: { show: true }, fixed: { enabled: true, position: 'topRight', offsetX: 0, offsetY: 0 } },
    colors: [color],
    series: [{ name: label, data }]
  };

  state.cmpCharts[idx] = new ApexCharts(el, opts);
  state.cmpCharts[idx].render();
}

// ── ASN View ──
let asnData = null;
async function renderAsnView() {
  try {
    $('asn-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">carregando...</div>';
    const res = await apiFetch(`/top-asns?periodo=${state.periodo}`);
    asnData = res;
    renderAsnTable(res.asns, res.ips, '');
    $('asn-stats').innerHTML = `
      <span class="asn-stat"><strong>${res.asns.length}</strong> ASNs</span>
      <span class="asn-stat"><strong>${Object.keys(res.ips).length}</strong> IPs únicos</span>
      <span class="asn-stat"><strong>${fmtBps(res.total_bps)}</strong> total</span>`;
  } catch (e) {
    $('asn-body').innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">Erro: ${esc(e.message)}</div>`;
  }
}

function renderAsnTable(asns, ips, filter) {
  const f = filter.toLowerCase().trim();
  const filtered = f ? asns.filter(a =>
    String(a.asn).includes(f) ||
    (a.org || '').toLowerCase().includes(f) ||
    (a.country || '').toLowerCase().includes(f)
  ) : asns;

  if (!filtered.length) {
    $('asn-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">nenhum ASN encontrado</div>';
    return;
  }

  const total = asns.reduce((s, x) => s + x.bps, 0);
  const rows = filtered.map((a, i) => {
    const pct = total > 0 ? (a.bps / total * 100).toFixed(1) : 0;
    const barW = total > 0 ? (a.bps / total * 100).toFixed(1) : 0;
    return `<tr>
      <td class="num">${i + 1}</td>
      <td class="asn-num">AS${a.asn}</td>
      <td class="asn-org">${esc(a.org)}</td>
      <td class="asn-country"><span class="asn-flag">${flagEmoji(a.country)}</span> ${a.country}</td>
      <td class="asn-range">${a.range ? esc(a.range) : '—'}</td>
      <td class="traf">${fmtBps(a.bps)}</td>
      <td class="pct"><div class="bar-bg"><div class="bar-fill" style="width:${barW}%"></div></div>${pct}%</td>
      <td class="asn-ips">${a.ips}</td>
      <td class="asn-flows">${fmtNum(a.flows)}</td>
    </tr>`;
  }).join('');

  $('asn-body').innerHTML = `<table class="asn-table"><thead><tr>
    <th>#</th><th>ASN</th><th>Organização</th><th>País</th><th>Bloco</th><th>Tráfego</th><th>%</th><th>IPs</th><th>Flows</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  const a = 0x1F1E6, offset = code.toUpperCase().charCodeAt(0) - 65;
  return String.fromCodePoint(a + offset, a + offset + 1);
}

function initAsnSearch() {
  $('asn-search').addEventListener('input', () => {
    if (asnData) renderAsnTable(asnData.asns, asnData.ips, $('asn-search').value);
  });
}

// ── Capacity Metrics (Pico / 95º) ──
function mcBar(a, b) {
  const max = Math.max(a, b, 1);
  const wa = Math.round(a / max * 100);
  const wb = Math.round(b / max * 100);
  return `<span style="display:inline-flex;gap:2px;align-items:center;margin-top:2px;"><span style="display:inline-block;width:${wa}px;height:3px;border-radius:2px;background:var(--green);"></span><span style="display:inline-block;width:${wb}px;height:3px;border-radius:2px;background:var(--blue);"></span></span>`;
}
async function renderMetricas() {
  if (!$('vg-metricas')) return;
  try {
    const data = await apiFetch(`/metricas?periodo=${state.periodo}`);
    if (!data || !data.amostras) {
      $('vg-metricas').innerHTML = '<div style="padding:8px 0;text-align:center;color:var(--text-muted);font-size:11px;">sem dados</div>';
      return;
    }
    const maxVal = Math.max(data.pico_bps, data.percentil95_bps, data.media_bps, 1);
    const picoH = data.pico_horario ? new Date(data.pico_horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const perLabels = { '30m': 'últimos 30 min', '1h': 'última hora', '6h': 'últimas 6h', '24h': 'últimas 24h', '7d': 'últimos 7 dias' };
    function bar(v) { const w = Math.round(v / maxVal * 60); return `<span class="mc-bar"><span class="mc-bar-fill" style="width:${w}px"></span></span>`; }
    $('vg-metricas').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);">
        <div class="mc-item">
          <span class="mc-label"><span style="color:var(--yellow);">▲</span> Pico tráfego total (todos IPs)</span>
          <span class="mc-value" style="color:var(--yellow);">${fmtBps(data.pico_bps)}</span>
          <span class="mc-sub">in: ${fmtBps(data.pico_in_bps)} / out: ${fmtBps(data.pico_out_bps)} · às ${picoH}</span>
          ${mcBar(data.pico_in_bps, data.pico_out_bps)}
        </div>
        <div class="mc-item">
          <span class="mc-label"><span style="color:var(--orange);">◆</span> 95º Percentil</span>
          <span class="mc-value" style="color:var(--orange);">${fmtBps(data.percentil95_bps)}</span>
          <span class="mc-sub">95% dos buckets ficaram abaixo deste valor</span>
          ${bar(data.percentil95_bps)}
        </div>
        <div class="mc-item">
          <span class="mc-label"><span style="color:var(--blue);">≈</span> Média tráfego total</span>
          <span class="mc-value" style="color:var(--blue);">${fmtBps(data.media_bps)}</span>
          <span class="mc-sub">${perLabels[data.periodo] || data.periodo} · ${fmtNum(data.amostras)} amostras</span>
          ${bar(data.media_bps)}
        </div>
      </div>`;
  } catch {
    $('vg-metricas').innerHTML = '<div style="padding:8px 0;text-align:center;color:var(--text-muted);font-size:11px;">erro</div>';
  }
}

// ── Weekly Comparison ──
function fmtBytesParts(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + ' TB';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + ' GB';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' MB';
  return fmtNum(v) + ' B';
}
function semBar(a, b) {
  const max = Math.max(a, b, 1);
  const wa = Math.round(a / max * 30);
  const wb = Math.round(b / max * 30);
  return `<span style="display:flex;gap:4px;align-items:center;margin-top:3px;">
    <span style="display:inline-block;width:${wa}px;height:4px;border-radius:2px;background:var(--accent);opacity:0.8;"></span>
    <span style="display:inline-block;width:${wb}px;height:4px;border-radius:2px;background:var(--text-dim);opacity:0.4;"></span>
  </span>`;
}
async function renderComparativoSemanal() {
  if (!$('vg-semanal')) return;
  try {
    const data = await apiFetch('/comparativo-semanal');
    if (!data || !data.esta_semana || !data.esta_semana.amostras) {
      $('vg-semanal').innerHTML = '<div style="padding:12px 0;text-align:center;color:var(--text-muted);font-size:11px;">sem dados</div>';
      return;
    }
    const { esta_semana: es, semana_passada: sp, diff_total_pct, diff_total_bytes_pct, diff_pico_pct, diff_media_pct } = data;
    function dateRange(r) {
      if (!r.inicio) return '';
      const d1 = new Date(r.inicio).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
      const d2 = new Date(r.fim).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
      return `${d1} — ${d2}`;
    }
    function diffHtml(pct, abs) {
      const cls = pct > 0 ? 'var(--green)' : pct < 0 ? 'var(--red)' : 'var(--text-dim)';
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '◆';
      const pctStr = abs ? `${Math.abs(pct)}% · ${fmtBytesParts(Math.abs(abs))}` : `${Math.abs(pct)}%`;
      return `<span style="color:${cls};font-weight:600;font-size:11px;">${arrow} ${pctStr}</span>`;
    }
    const d1 = dateRange(es);
    const d2 = dateRange(sp);

    $('vg-semanal').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);">
        <div class="mc-item">
          <span class="mc-label">Total acumulado 7d (todos IPs)</span>
          <div style="display:flex;gap:24px;justify-content:center;margin:3px 0;">
            <span style="display:flex;flex-direction:column;">
              <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Esta</span>
              <span class="mc-value" style="color:var(--green);font-size:13px;">${fmtBytesParts(es.total_bytes)}</span>
            </span>
            <span style="display:flex;flex-direction:column;">
              <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Anterior</span>
              <span class="mc-value" style="color:var(--text-muted);font-size:13px;">${fmtBytesParts(sp.total_bytes)}</span>
            </span>
          </div>
          <span class="mc-sub">${diffHtml(diff_total_bytes_pct, es.total_bytes - sp.total_bytes)}</span>
          ${semBar(es.total_bytes, sp.total_bytes)}
        </div>
        <div class="mc-item">
          <span class="mc-label">Pico da semana</span>
          <div style="display:flex;gap:24px;justify-content:center;margin:3px 0;">
            <span style="display:flex;flex-direction:column;">
              <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Esta</span>
              <span class="mc-value" style="color:var(--yellow);font-size:13px;">${fmtBps(es.pico_bps)}</span>
            </span>
            <span style="display:flex;flex-direction:column;">
              <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Anterior</span>
              <span class="mc-value" style="color:var(--text-muted);font-size:13px;">${fmtBps(sp.pico_bps)}</span>
            </span>
          </div>
          <span class="mc-sub">${diffHtml(diff_pico_pct)}</span>
          ${semBar(es.pico_bps, sp.pico_bps)}
        </div>
        <div class="mc-item">
          <span class="mc-label">Média da semana</span>
          <div style="display:flex;gap:24px;justify-content:center;margin:3px 0;">
            <span style="display:flex;flex-direction:column;">
              <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Esta</span>
              <span class="mc-value" style="color:var(--blue);font-size:13px;">${fmtBps(es.media_bps)}</span>
            </span>
            <span style="display:flex;flex-direction:column;">
              <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Anterior</span>
              <span class="mc-value" style="color:var(--text-muted);font-size:13px;">${fmtBps(sp.media_bps)}</span>
            </span>
          </div>
          <span class="mc-sub">${diffHtml(diff_media_pct)}</span>
          ${semBar(es.media_bps, sp.media_bps)}
        </div>
      </div>
      <div style="text-align:center;font-size:9px;color:var(--text-dim);padding:4px 0 2px;border-top:1px solid var(--border);">
        ${d1 ? '<span>esta semana: ' + d1 + '</span>' : ''}
        ${d2 ? '<span style="margin-left:16px;">anterior: ' + d2 + '</span>' : ''}
      </div>`;
  } catch (e) {
    $('vg-semanal').innerHTML = '<div style="padding:12px 0;text-align:center;color:var(--text-muted);font-size:11px;">erro</div>';
  }
}

// ── Protocol Distribution ──
async function renderProtocolos() {
  if (!$('vg-protocolos')) return;
  try {
    const res = await apiFetch(`/protocolos?periodo=${state.periodo}`);
    const data = res.protocolos || [];
    if (!data.length) {
      $('vg-protocolos').innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);">sem dados</div>';
      return;
    }
    const totalBps = res.total_bps || data.reduce((s, d) => s + d.bps, 0);
    const cores = { TCP: '#60a5fa', UDP: '#34d399', ICMP: '#ef4444', IGMP: '#fbbf24', 'Proto 47': '#a78bfa', 'Proto 50': '#f472b6', 'Proto 51': '#fb923c', 'Proto 89': '#94a3b8', 'Proto 132': '#38bdf8' };
    const series = data.map(d => ({ name: d.nome, y: Math.round(d.bps / 1e6 * 100) / 100 }));
    const opts = {
      chart: { type: 'donut', height: 130, width: 130, toolbar: { show: false }, fontFamily: 'Inter, system-ui, sans-serif', foreColor: '#64748b', background: 'transparent', sparkline: { enabled: true } },
      dataLabels: { enabled: false },
      stroke: { width: 1 },
      colors: data.map(d => cores[d.nome] || '#475569'),
      legend: { show: false },
      tooltip: { theme: 'dark', y: { formatter: v => v.toFixed(1) + ' Mbps' }, style: { fontSize: '11px' } },
      plotOptions: { pie: { donut: { size: '60%' } } },
      series
    };
    if (state.protoChart) state.protoChart.destroy();
    state.protoChart = new ApexCharts(document.getElementById('vg-protocolos-chart'), opts);
    state.protoChart.render();

    const maxBps = Math.max(...data.map(d => d.bps), 1);
    const top = data[0];
    const topPct = totalBps > 0 ? Math.round(top.bps / totalBps * 100) : 0;
    const insightData = data.filter(d => d.nome === 'ICMP' || d.nome === 'GRE');
    const insightIcmp = insightData.find(d => d.nome === 'ICMP');
    const icmpNormal = !insightIcmp || insightIcmp.bps / totalBps < 0.01;
    let insight = `${top.nome} domina com ${topPct}% do tráfego no período.`;
    if (!icmpNormal) insight += ` ICMP elevado (${Math.round(insightIcmp.bps / totalBps * 100)}%).`;
    else insight += ` ICMP dentro do esperado.`;

    $('vg-protocolos-legenda').innerHTML = data.map(d => {
      const pct = totalBps > 0 ? Math.round(d.bps / totalBps * 100) : 0;
      const cor = cores[d.nome] || '#475569';
      const w = Math.round(d.bps / maxBps * 80);
      return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;">
        <span style="width:8px;height:8px;border-radius:2px;background:${cor};flex-shrink:0;"></span>
        <span style="color:var(--text-dim);width:36px;flex-shrink:0;">${esc(d.nome)}</span>
        <span style="font-family:var(--mono);font-weight:600;color:var(--text);width:72px;text-align:right;">${fmtBps(d.bps)}</span>
        <span style="color:var(--text-muted);width:32px;text-align:right;">${pct}%</span>
        <span style="display:inline-block;width:80px;height:4px;border-radius:2px;background:rgba(255,255,255,0.06);overflow:hidden;">
          <span style="display:block;height:100%;width:${w}px;border-radius:2px;background:${cor};opacity:0.7;"></span>
        </span>
      </div>`;
    }).join('');
    $('vg-protocolos-footer').textContent = insight;
  } catch {
    $('vg-protocolos').innerHTML = '<div style="padding:20px 0;text-align:center;color:var(--text-muted);">erro</div>';
  }
}

// ── ASN Matrix View ──
async function renderMatrizView() {
  try {
    const data = await apiFetch(`/matriz-asn?periodo=${state.periodo}&limite=30`);
    const pares = data.pares || [];
    if (!pares.length) {
      $('matriz-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">sem dados</div>';
      $('matriz-stats').innerHTML = '';
      return;
    }
    const totalBps = data.total_bps || 0;
    $('matriz-stats').innerHTML = `<span class="asn-stat">${fmtNum(pares.length)} pares</span><span class="asn-stat">${fmtBps(totalBps)} total</span>`;
    $('matriz-body').innerHTML = `<table class="asn-table">
      <thead><tr><th>#</th><th>Origem → Destino</th><th>Org (src)</th><th>Org (dst)</th><th>Tráfego</th><th>%</th><th>Flows</th><th>IPs</th></tr></thead>
      <tbody>${pares.map((r, i) => {
        const pct = totalBps > 0 ? Math.round(r.bps / totalBps * 100) : 0;
        const flagSrc = r.src_country === 'BR' ? '🇧🇷' : r.src_country === 'US' ? '🇺🇸' : '';
        const flagDst = r.dst_country === 'BR' ? '🇧🇷' : r.dst_country === 'US' ? '🇺🇸' : '';
        return `<tr>
          <td class="num">${i + 1}</td>
          <td style="font-family:var(--mono);font-size:11px;"><span class="asn-num">${r.src_asn === -1 ? 'INT' : `AS${r.src_asn}`}</span> <span style="color:var(--text-dim);font-size:9px;">→</span> <span class="asn-num">${r.dst_asn === -1 ? 'INT' : `AS${r.dst_asn}`}</span></td>
          <td class="asn-org">${flagSrc} ${esc(r.src_org)}</td>
          <td class="asn-org">${flagDst} ${esc(r.dst_org)}</td>
          <td class="traf">${fmtBps(r.bps)}</td>
          <td class="pct">${pct}%<span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span></td>
          <td class="asn-flows">${fmtNum(r.total_flows)}</td>
          <td class="asn-ips">${fmtNum(r.ips)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch {
    $('matriz-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">erro ao carregar</div>';
  }
}

// ── Equipamentos View ──
async function loadEquipamentos() {
  try {
    state.equipamentos = (await apiFetch('/equipamentos', { skipEqFilter: true })) || [];
  } catch {
    state.equipamentos = [];
  }
  const sel = $('tb-eq-select');
  if (!sel) return;
  const prev = sel.value || state.equipamentoAtivo;
  sel.innerHTML = '<option value="">Todos os equipamentos</option>' +
    state.equipamentos.map(e => `<option value="${e.id}">${esc(e.nome)}${e.localidade ? ' · ' + esc(e.localidade) : ''}</option>`).join('');
  if (prev && state.equipamentos.some(e => e.id == prev)) {
    sel.value = prev;
    state.equipamentoAtivo = String(prev);
  } else { sel.value = ''; state.equipamentoAtivo = null; }
}

function initEqSelect() {
  const sel = $('tb-eq-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    state.equipamentoAtivo = sel.value || null;
    savePrefs();
    renderView(state.viewAtual);
    updatePageHead(state.viewAtual);
  });
}

async function renderEquipamentosView() {
  const body = $('eq-body');
  if (!body) return;
  try {
    await loadEquipamentos();
    const eqs = state.equipamentos;
    if (!eqs.length) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Nenhum equipamento cadastrado. Reinicie o nfacctd com <code style="font-family:var(--mono);font-size:11px;">agent_id</code> por instância e cadastre aqui.</div>';
      $('eq-stats').innerHTML = '';
      $('eq-chart').innerHTML = '';
      return;
    }
    const totalBps = eqs.reduce((s, e) => s + (e.bps || 0), 0);
    $('eq-stats').innerHTML = `<span class="asn-stat">${fmtNum(eqs.length)} dispositivos</span><span class="asn-stat">${fmtBps(totalBps)} total</span>`;
    body.innerHTML = `<table class="asn-table">
      <thead><tr><th>Nome</th><th>Agente</th><th>Fabricante / Modelo</th><th>Localização</th><th>IP</th><th>Tráfego</th><th>%</th><th>Ações</th></tr></thead>
      <tbody>${eqs.map(e => {
        const pct = totalBps > 0 ? Math.round((e.bps || 0) / totalBps * 100) : 0;
        const ativo = state.equipamentoAtivo && String(state.equipamentoAtivo) === String(e.id);
        return `<tr class="eq-row" data-id="${e.id}">
          <td style="font-weight:600;">${esc(e.nome)}</td>
          <td><span class="eq-badge eq-fab">agent ${esc(e.agent_id)}</span></td>
          <td class="eq-modelo">${esc(e.fabricante || '—')} ${esc(e.modelo || '')}</td>
          <td class="eq-modelo">${esc(e.localidade || '—')}</td>
          <td style="font-family:var(--mono);font-size:11px;">${esc(e.ip || '—')}</td>
          <td class="traf">${fmtBps(e.bps || 0)}</td>
          <td class="pct">${pct}%<span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span></td>
          <td>
            <button class="eq-btn ${ativo ? 'eq-ativo' : ''}" data-act="filtrar" title="Filtrar dashboard por este equipamento"><i class="ph ph-funnel"></i></button>
            <button class="eq-btn" data-act="editar"><i class="ph ph-pencil-simple"></i></button>
            <button class="eq-btn" data-act="excluir" style="color:#f87171;"><i class="ph ph-trash"></i></button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    renderEqChart(eqs);
    $('eq-chart-header').querySelector('.card-title').textContent = `Comparativo entre Equipamentos · ${fmtBps(totalBps)} total`;
  } catch {
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">erro ao carregar</div>';
  }
}

function renderEqChart(eqs) {
  const el = $('eq-chart');
  const labels = eqs.map(e => esc(e.nome));
  const values = eqs.map(e => Math.round((e.bps || 0) / 1000));
  const max = Math.max(...values, 1);
  el.innerHTML = `<div style="display:flex;align-items:flex-end;gap:14px;padding:16px;height:160px;border-bottom:1px solid var(--border);">
    ${values.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text-dim);">${fmtBps(eqs[i].bps || 0)}</span>
      <div style="width:70%;max-width:60px;height:${Math.max(4, Math.round(v / max * 100))}px;background:linear-gradient(180deg,var(--accent),rgba(139,92,246,0.25));border-radius:4px 4px 0 0;" title="${esc(eqs[i].nome)}: ${fmtBps(eqs[i].bps || 0)}"></div>
    </div>`).join('')}
  </div>
  <div style="display:flex;gap:14px;padding:8px 16px;">
    ${labels.map(l => `<div style="flex:1;text-align:center;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${l}">${l}</div>`).join('')}
  </div>`;
}

function initEqBody() {
  const body = $('eq-body');
  if (!body) return;
  body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    const row = ev.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const eq = state.equipamentos.find(e => String(e.id) === id);
    if (!eq) return;
    if (!btn) {
      if (ev.target.closest('.traf') || ev.target.closest('.pct')) return;
      state.equipamentoAtivo = id;
      const sel = $('tb-eq-select');
      if (sel) sel.value = id;
      setView('visao-geral');
      return;
    }
    const act = btn.dataset.act;
    if (act === 'filtrar') {
      state.equipamentoAtivo = state.equipamentoAtivo && String(state.equipamentoAtivo) === id ? null : id;
      const sel = $('tb-eq-select');
      if (sel) sel.value = state.equipamentoAtivo || '';
      renderEquipamentosView();
    } else if (act === 'editar') {
      eqModal(eq);
    } else if (act === 'excluir') {
      if (confirm(`Excluir equipamento "${eq.nome}"?`)) deleteEquipamento(eq);
    }
  });
  const add = $('eq-add');
  if (add) add.addEventListener('click', () => eqModal(null));
}

function eqModal(eq) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999;';
  const f = (v, ph, w = '100%') => `<input id="eqm-${v}" value="${esc(eq ? eq[v] : '')}" placeholder="${ph}" style="width:${w};background:#0a0f1a;border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;">`;
  overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:420px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.5);">
    <div style="font-size:14px;font-weight:600;margin-bottom:14px;">${eq ? 'Editar equipamento' : 'Novo equipamento'}</div>
    <div style="display:grid;gap:10px;">
      ${f('nome', 'Nome (ex.: Borda-SP-01)')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${f('fabricante', 'Fabricante', '100%')}${f('modelo', 'Modelo', '100%')}</div>
      ${f('tipo', 'Tipo (roteador, firewall, switch)', '100%')}
      ${f('ip', 'IP de gerenciamento')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${f('localidade', 'Localização', '100%')}${f('agent_id', 'agent_id (porta do nfacctd)', '100%')}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
      <button id="eqm-cancel" class="eq-btn">Cancelar</button>
      <button id="eqm-save" style="background:var(--accent);color:#050B14;border:none;border-radius:6px;padding:6px 14px;font-weight:600;font-size:12px;cursor:pointer;">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#eqm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#eqm-save').addEventListener('click', async () => {
    const val = id => overlay.querySelector('#eqm-' + id).value.trim();
    const payload = {
      nome: val('nome'), fabricante: val('fabricante'), modelo: val('modelo'),
      tipo: val('tipo'), ip: val('ip'), localidade: val('localidade'),
      agent_id: val('agent_id')
    };
    if (!payload.nome || payload.agent_id === '') { alert('Nome e agent_id são obrigatórios.'); return; }
    try {
      if (eq) await apiFetch(`/equipamentos/${eq.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      else await apiFetch('/equipamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      overlay.remove();
      renderEquipamentosView();
    } catch (err) { alert('Erro ao salvar: ' + err.message); }
  });
}

async function deleteEquipamento(eq) {
  try {
    await apiFetch(`/equipamentos/${eq.id}`, { method: 'DELETE' });
    if (String(state.equipamentoAtivo) === String(eq.id)) {
      state.equipamentoAtivo = null;
      const sel = $('tb-eq-select');
      if (sel) sel.value = '';
    }
    renderEquipamentosView();
  } catch (err) { alert('Erro ao excluir: ' + err.message); }
}

// ── Clientes View ──
async function loadClientes() {
  try {
    state.clientes = (await apiFetch('/clientes', { raw: true, skipEqFilter: true, skipClienteFilter: true })) || [];
  } catch {
    state.clientes = [];
  }
  const sel = $('tb-cliente-select');
  if (!sel) return;
  const prev = sel.value || state.clienteAtivo;
  sel.innerHTML = '<option value="">Todos os clientes</option>' +
    state.clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (prev && state.clientes.some(c => c.id == prev)) {
    sel.value = prev;
    state.clienteAtivo = String(prev);
  } else { sel.value = ''; state.clienteAtivo = null; }
}

function initClienteSelect() {
  const sel = $('tb-cliente-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    state.clienteAtivo = sel.value || null;
    savePrefs();
    renderView(state.viewAtual);
    updatePageHead(state.viewAtual);
  });
}

async function renderClientesView() {
  const body = $('cli-body');
  if (!body) return;
  try {
    await loadClientes();
    const resumo = await apiFetch('/clientes/resumo', { skipClienteFilter: true });
    const clientes = state.clientes;
    const uso = {};
    (resumo || []).forEach(r => { uso[r.id] = r; });
    if (!clientes.length) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Nenhum cliente cadastrado. Cadastre os clientes e seus blocos CIDR.</div>';
      $('cli-stats').innerHTML = '<span class="asn-stat">usando ranges do .env (CLIENTE_RANGES) como fallback</span>';
      $('cli-chart').innerHTML = '';
      $('cli-chart-header').querySelector('.card-title').textContent = 'Uso por Cliente';
      return;
    }
    const totalBanda = clientes.reduce((s, c) => s + (c.banda_contratada_mbps || 0), 0);
    const totalUso = resumo.reduce((s, r) => s + r.bps, 0);
    $('cli-stats').innerHTML = `<span class="asn-stat">${fmtNum(clientes.length)} clientes</span><span class="asn-stat">${fmtBps(totalUso)} em uso</span><span class="asn-stat">${fmtNum(totalBanda)} Mbps contratados</span>`;
    body.innerHTML = `<table class="asn-table">
      <thead><tr><th>Cliente</th><th>Blocos</th><th>Plano</th><th>Contratado</th><th>Uso atual</th><th>% uso</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>${clientes.map(c => {
        const r = uso[c.id] || { bps: 0, up_bps: 0, down_bps: 0, pct_uso: null, blocos: [] };
        const banda = c.banda_contratada_mbps || 0;
        const pct = r.pct_uso;
        const situacao = !banda ? '<span style="color:var(--text-muted);font-size:10px;">sem contrato</span>'
          : pct === null ? '<span style="color:var(--text-muted);font-size:10px;">sem dados</span>'
          : pct >= 100 ? '<span style="color:#f87171;font-weight:600;">CRÍTICO</span>'
          : pct >= 80 ? '<span style="color:#fbbf24;font-weight:600;">ALERTA</span>'
          : '<span style="color:#34d399;">OK</span>';
        const ativo = state.clienteAtivo && String(state.clienteAtivo) === String(c.id);
        return `<tr class="eq-row" data-id="${c.id}">
          <td style="font-weight:600;">${esc(c.nome)}</td>
          <td style="font-size:10px;font-family:var(--mono);color:var(--text-dim);">${(r.blocos && r.blocos.length ? r.blocos : (c.blocos || []).map(b => b.bloco)).join(', ')}</td>
          <td class="eq-modelo">${esc(c.plano || '—')}</td>
          <td class="eq-modelo">${banda ? banda + ' Mbps' : '—'}</td>
          <td class="traf">${fmtBps(r.bps)}</td>
          <td class="pct">${pct === null ? '—' : pct + '%'}<span class="bar-bg"><span class="bar-fill" style="width:${Math.min(pct || 0, 100)}%;${(pct || 0) >= 80 ? 'background:#fbbf24' : ''}"></span></span></td>
          <td>${situacao}</td>
          <td>
            <button class="eq-btn ${ativo ? 'eq-ativo' : ''}" data-act="filtrar" title="Filtrar dashboard por este cliente"><i class="ph ph-funnel"></i></button>
            <button class="eq-btn" data-act="editar"><i class="ph ph-pencil-simple"></i></button>
            <button class="eq-btn" data-act="bloco" title="Adicionar bloco"><i class="ph ph-plus-circle"></i></button>
            <button class="eq-btn" data-act="excluir" style="color:#f87171;"><i class="ph ph-trash"></i></button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    renderCliChart(resumo || []);
    $('cli-chart-header').querySelector('.card-title').textContent = `Uso por Cliente · ${fmtBps(totalUso)} total`;
  } catch {
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">erro ao carregar</div>';
  }
}

function renderCliChart(lista) {
  const el = $('cli-chart');
  if (!lista.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">sem uso detectado</div>'; return; }
  const max = Math.max(...lista.map(r => r.bps), 1);
  el.innerHTML = `<div style="display:flex;align-items:flex-end;gap:14px;padding:16px;height:160px;border-bottom:1px solid var(--border);">
    ${lista.map(r => {
      const pct = Math.round(r.bps / max * 100);
      const banda = r.banda_contratada_mbps;
      const crit = banda && r.pct_uso >= 80;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--text-dim);">${fmtBps(r.bps)}</span>
        <div style="width:70%;max-width:60px;height:${Math.max(4, pct)}px;background:${crit ? 'linear-gradient(180deg,#f87171,rgba(248,113,113,.25))' : 'linear-gradient(180deg,var(--accent),rgba(139,92,246,.25))'};border-radius:4px 4px 0 0;" title="${esc(r.nome)}: ${fmtBps(r.bps)}"></div>
      </div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:14px;padding:8px 16px;">
    ${lista.map(r => `<div style="flex:1;text-align:center;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(r.nome)}">${esc(r.nome)}</div>`).join('')}
  </div>`;
}

function initCliBody() {
  const body = $('cli-body');
  if (!body) return;
  body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    const row = ev.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const c = state.clientes.find(x => String(x.id) === id);
    if (!c) return;
    if (!btn) {
      if (ev.target.closest('.traf') || ev.target.closest('.pct')) return;
      state.clienteAtivo = id;
      const sel = $('tb-cliente-select');
      if (sel) sel.value = id;
      setView('visao-geral');
      return;
    }
    const act = btn.dataset.act;
    if (act === 'filtrar') {
      state.clienteAtivo = state.clienteAtivo && String(state.clienteAtivo) === id ? null : id;
      const sel = $('tb-cliente-select');
      if (sel) sel.value = state.clienteAtivo || '';
      renderClientesView();
    } else if (act === 'editar') {
      cliModal(c);
    } else if (act === 'bloco') {
      blocoModal(c);
    } else if (act === 'excluir') {
      if (confirm(`Excluir cliente "${c.nome}" e seus blocos?`)) deleteCliente(c);
    }
  });
  const add = $('cli-add');
  if (add) add.addEventListener('click', () => cliModal(null));
}

function cliModal(c) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999;';
  const f = (v, ph, w = '100%') => `<input id="clm-${v}" value="${esc(c ? c[v] : '')}" placeholder="${ph}" style="width:${w};background:#0a0f1a;border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;">`;
  const blocosStr = c ? (c.blocos || []).map(b => b.bloco).join(', ') : '';
  overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:460px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:88vh;overflow:auto;">
    <div style="font-size:14px;font-weight:600;margin-bottom:14px;">${c ? 'Editar cliente' : 'Novo cliente'}</div>
    <div style="display:grid;gap:10px;">
      ${f('nome', 'Nome / Razão social')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${f('documento', 'CNPJ / CPF', '100%')}${f('plano', 'Plano (ex.: Fibra 300M)', '100%')}</div>
      ${f('banda_contratada_mbps', 'Banda contratada (Mbps)', '100%')}
      <input id="clm-blocos" value="${esc(blocosStr)}" placeholder="Blocos CIDR separados por vírgula (ex.: 189.0.0.0/22, 189.0.4.0/23)" style="width:100%;background:#0a0f1a;border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-family:var(--mono);font-size:11px;outline:none;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${f('contato', 'Contato', '100%')}${f('telefone', 'Telefone', '100%')}</div>
      ${f('email', 'E-mail', '100%')}
      ${f('endereco', 'Endereço', '100%')}
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
      <button id="clm-cancel" class="eq-btn">Cancelar</button>
      <button id="clm-save" style="background:var(--accent);color:#050B14;border:none;border-radius:6px;padding:6px 14px;font-weight:600;font-size:12px;cursor:pointer;">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#clm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#clm-save').addEventListener('click', async () => {
    const val = id => overlay.querySelector('#clm-' + id).value.trim();
    const blocos = overlay.querySelector('#clm-blocos').value.split(',').map(s => s.trim()).filter(Boolean);
    const payload = {
      nome: val('nome'), documento: val('documento'), plano: val('plano'),
      banda_contratada_mbps: val('banda_contratada_mbps'), contato: val('contato'),
      telefone: val('telefone'), email: val('email'), endereco: val('endereco'),
      blocos
    };
    if (!payload.nome) { alert('Nome é obrigatório.'); return; }
    try {
      if (c) {
        await apiFetch(`/clientes/${c.id}`, { raw: true, method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const atuais = new Set((c.blocos || []).map(b => b.bloco));
        const novos = blocos.filter(b => !atuais.has(b));
        const removidos = (c.blocos || []).filter(b => !blocos.includes(b.bloco));
        for (const b of novos) await apiFetch(`/clientes/${c.id}/blocos`, { raw: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bloco: b }) });
        for (const b of removidos) await apiFetch(`/clientes/blocos/${b.id}`, { raw: true, method: 'DELETE' });
      } else {
        await apiFetch('/clientes', { raw: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      overlay.remove();
      renderClientesView();
    } catch (err) { alert('Erro ao salvar: ' + err.message); }
  });
}

function blocoModal(c) {
  const bloco = prompt(`Adicionar bloco CIDR ao cliente "${c.nome}":`);
  if (!bloco) return;
  addBlocoCliente(c, bloco);
}

async function addBlocoCliente(c, bloco) {
  try {
    await apiFetch(`/clientes/${c.id}/blocos`, { raw: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bloco }) });
    renderClientesView();
  } catch (err) { alert('Erro ao adicionar bloco: ' + err.message); }
}

async function deleteCliente(c) {
  try {
    await apiFetch(`/clientes/${c.id}`, { raw: true, method: 'DELETE' });
    if (String(state.clienteAtivo) === String(c.id)) {
      state.clienteAtivo = null;
      const sel = $('tb-cliente-select');
      if (sel) sel.value = '';
    }
    renderClientesView();
  } catch (err) { alert('Erro ao excluir: ' + err.message); }
}

// ── Subnets View ──
let subnetsState = { prefixo: 24, lado: 'src' };

async function renderSubnetsView() {
  try {
    const data = await apiFetch(`/top-subnets?periodo=${state.periodo}&limite=30&prefixo=${subnetsState.prefixo}&lado=${subnetsState.lado}`);
    const ladoLabel = subnetsState.lado === 'src' ? 'origem' : 'destino';
    if (!Array.isArray(data) || !data.length) {
      $('subnets-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">sem dados</div>';
      $('subnets-stats').innerHTML = '';
      return;
    }
    const totalBps = data.reduce((s, r) => s + r.bps, 0);
    $('subnets-stats').innerHTML = `<span class="asn-stat">${fmtNum(data.length)} sub-redes</span><span class="asn-stat">${fmtBps(totalBps)} total</span><span class="asn-stat">${ladoLabel}</span>`;
    $('subnets-body').innerHTML = `<table>
      <thead><tr><th>#</th><th>Sub-rede</th><th>Tráfego</th><th>%</th><th>IPs</th><th>Flows</th><th>Top IP</th></tr></thead>
      <tbody>${data.map((r, i) => {
        const pct = totalBps > 0 ? Math.round(r.bps / totalBps * 100) : 0;
        return `<tr>
          <td class="num">${i + 1}</td>
          <td style="font-family:var(--mono);font-size:13px;font-weight:600;">${esc(r.subnet)}</td>
          <td class="traf">${fmtBps(r.bps)}</td>
          <td style="font-size:11px;color:var(--text-dim);">${pct}%<span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span></td>
          <td style="font-size:11px;color:var(--text-dim);font-family:var(--mono);">${fmtNum(r.ips_ativos)}</td>
          <td style="font-size:11px;color:var(--text-dim);">${fmtNum(r.total_flows)}</td>
          <td style="font-size:11px;font-family:var(--mono);color:var(--text-dim);">${esc(r.top_ip)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch {
    $('subnets-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">erro ao carregar</div>';
  }
}

function initSubnets() {
  document.querySelectorAll('.subnet-prefix').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subnet-prefix').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      subnetsState.prefixo = parseInt(btn.dataset.prefix);
      renderSubnetsView();
    });
  });
  const sideBtn = document.querySelector('[data-action="subnet-side"]');
  if (sideBtn) {
    sideBtn.addEventListener('click', () => {
      subnetsState.lado = subnetsState.lado === 'src' ? 'dst' : 'src';
      renderSubnetsView();
    });
  }
  const searchInput = $('subnets-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const filter = searchInput.value.toLowerCase();
      document.querySelectorAll('#subnets-body tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(filter) ? '' : 'none';
      });
    });
  }
}

function initMatrizSearch() {
  const searchInput = $('matriz-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const filter = searchInput.value.toLowerCase();
      document.querySelectorAll('#matriz-body tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(filter) ? '' : 'none';
      });
    });
  }
}

// ── Polling ──
function startPoll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (state.viewAtual === 'visao-geral') renderVisaoGeral();
    $('last-update').textContent = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, 30000);
}

// ── Init ──
async function init() {
  const ok = await authVerify();
  if (!ok) return;
  loadPrefs();
  initNav();
  initPeriod();
  initBuscar();
  initTheme();
  initFullscreen();
  initTopbarSearch();
  initCardActions();
  initCustomizePanel();
  initDashUI();
  loadDashboards();
  initIpActions();
  initLiveFeed();
  initComparar();
  initAsnSearch();
  initSubnets();
  initMatrizSearch();
  initEqSelect();
  initEqBody();
  loadEquipamentos();
  initClienteSelect();
  initCliBody();
  loadClientes();
  applyHiddenCards();
  document.querySelectorAll('#period-bar .per-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === state.periodo);
  });
  updatePageHead('visao-geral');
  renderView('visao-geral');
  $('last-update').textContent = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  pollHealth();
  startPoll();
  state.healthTimer = setInterval(pollHealth, 30000);
  $('ph-refresh').addEventListener('click', () => renderView(state.viewAtual));
  $('atk-refresh').addEventListener('click', () => renderView('ataques'));
  $('notif-btn').addEventListener('click', () => {
    document.querySelector('.sb-btn[data-view="ataques"]').click();
  });
}

// ── Esc Esc → Launcher ──
let __escTimer = 0;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !e.target.closest('input,textarea,select,[contenteditable]')) {
    const now = Date.now();
    if (__escTimer && (now - __escTimer) < 500) {
      __escTimer = 0;
      window.location.href = '/';
    } else {
      __escTimer = now;
    }
  }
});

init();
