// incidentes.js
import { state } from './state.js';
import { api } from './api.js';
import { mapa } from './mapa.js';
import { telemetria } from './telemetria.js';

export const incidentes = {
    incidentesGlobais: [],
    socket: null,
    isInitialized: false,
    severidadeFiltro: '',

    init: async () => {
        if (incidentes.isInitialized) return;
        incidentes.isInitialized = true;
        await incidentes.carregarProblemas();
        incidentes.conectarWebSocket();
        
        // Listeners para filtros
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                incidentes.severidadeFiltro = e.target.dataset.severidade;
                incidentes.carregarProblemas();
            });
        });
        
        // Escuta quando a UI pede atualização forçada do painel
        document.addEventListener('atualizarAlarmesPanel', () => incidentes.carregarProblemas());
        
        // Pede o cache inicial assim que entra
        try {
            const res = await fetch(`${state.API_URL_BASE}/zabbix/cache`);
            state.zabbixCacheLocal = await res.json();
            
            if (typeof mapa.atualizarCoresDeSaude === 'function') {
                mapa.atualizarCoresDeSaude();
            }
            if (state.rotaSelecionada && typeof telemetria.atualizarPainelSaude === 'function') {
                telemetria.atualizarPainelSaude(state.rotaSelecionada);
            }
        } catch (e) {
            console.error("Aviso: Falha ao carregar cache inicial do Zabbix", e);
        }
    },

    conectarWebSocket: () => {
        if (typeof io !== 'undefined' && !incidentes.socket) {
            incidentes.socket = io({
                auth: { token: state.token || '' }
            });

            incidentes.socket.on('novoProblema', () => incidentes.carregarProblemas());
            incidentes.socket.on('problemaResolvido', () => incidentes.carregarProblemas());
            incidentes.socket.on('rotaManutencaoAtualizada', (dados) => {
                const rota = state.rotasSalvas.find(r => r.id === dados.id);
                if (rota) {
                    rota.manutencao_ativa = dados.manutencao_ativa ? 1 : 0;
                    if (typeof mapa.atualizarCoresDeSaude === 'function') mapa.atualizarCoresDeSaude();
                    if (typeof ui.atualizarBadgeManutencao === 'function' && state.rotaSelecionada && state.rotaSelecionada.id === dados.id) {
                        ui.atualizarBadgeManutencao(rota);
                    }
                }
            });
            
            incidentes.socket.on('zabbixCacheUpdated', (novoCache) => {
                state.zabbixCacheLocal = novoCache;
                
                if (typeof mapa.atualizarCoresDeSaude === 'function') {
                    mapa.atualizarCoresDeSaude();
                }
                const panelVisivel = document.getElementById('resumo-panel')?.style.display !== 'none';
                if (panelVisivel && typeof ui.renderizarResumo === 'function') ui.renderizarResumo();
                const drawerOpen = document.getElementById('route-drawer')?.classList.contains('open');
                if (drawerOpen && state.rotaSelecionada) {
                    if (typeof telemetria.atualizarPainelSaude === 'function') {
                        telemetria.atualizarPainelSaude(state.rotaSelecionada);
                    }
                    if (typeof telemetria.renderizarMiniTrend === 'function') {
                        telemetria.renderizarMiniTrend(state.rotaSelecionada);
                    }
                    if (typeof telemetria.renderHistorico === 'function') {
                        telemetria.renderHistorico(state.rotaSelecionada);
                    }
                }
            });
        }
    },

    carregarProblemas: async () => {
        try {
            let url = `${state.API_URL_BASE}/problemas`;
            if (incidentes.severidadeFiltro) {
                url += `?severidade=${incidentes.severidadeFiltro}`;
            }
            const response = await fetch(url);
            if (!response.ok) {
                console.error("Erro HTTP ao buscar incidentes:", response.status);
                return;
            }
            const data = await response.json();
            incidentes.incidentesGlobais = Array.isArray(data) ? data : [];
            incidentes.atualizarPainelAlarmes();
        } catch (error) {
            console.error("Erro ao buscar incidentes:", error);
        }
    },

    atualizarPainelAlarmes: () => {
        const alarmList = document.getElementById('alarm-list');
        const badge = document.getElementById('alarm-badge');
        const ativos = incidentes.incidentesGlobais.filter(p => p.status === 'Ativo');

        if (badge) {
            if (ativos.length > 0) { 
                badge.textContent = ativos.length; badge.style.display = 'block'; 
            } else { 
                badge.style.display = 'none'; 
            }
        }

        if (!alarmList) return;
        alarmList.innerHTML = '';

        if (incidentes.incidentesGlobais.length === 0) {
            alarmList.innerHTML = `
                <div class="alarm-empty">
                    <i class="ph ph-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 12px; opacity: 0.8;"></i>
                    <span class="alarm-empty-title">Nenhum incidente ativo</span>
                    <span class="alarm-empty-sub">Toda a rede operando normalmente.</span>
                </div>`;
        } else {
            incidentes.incidentesGlobais.forEach(inc => {
                const isAtivo = inc.status === 'Ativo';
                const classeCard = isAtivo ? 'incident-card active' : 'incident-card resolved';
                const classeDot = isAtivo ? 'status-dot active pulse' : 'status-dot resolved';
                const classeStatus = isAtivo ? 'incident-card-status active' : 'incident-card-status resolved';
                const dataStr = new Date(inc.data_inicio).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

                const div = document.createElement('div');
                div.className = classeCard;
                div.innerHTML = `
                    <div class="incident-card-header">
                        <strong class="incident-card-name">
                            <span class="${classeDot}"></span>
                            ${inc.nome_rota}
                        </strong>
                        <span class="incident-card-time">${dataStr}</span>
                    </div>
                    <div class="incident-card-desc">${inc.descricao}</div>
                    <div class="${classeStatus}">STATUS: ${inc.status.toUpperCase()}</div>
                `;
                alarmList.appendChild(div);
            });
        }

        // Atualização do Widget flutuante de alarmes
        const widgetAlarms = document.getElementById('w-alarms-list');
        if (widgetAlarms) {
            if (ativos.length === 0) {
                widgetAlarms.innerHTML = '<div style="padding: 15px 10px; color: #94a3b8; font-size: 13px; text-align: center; font-weight: 500;"><i class="ph ph-check-circle" style="color: #34d399; font-size: 18px; vertical-align: bottom; margin-right: 5px;"></i> Rede Operacional</div>';
            } else {
                widgetAlarms.innerHTML = ativos.slice(0, 6).map(inc => {
                    const horaQueda = new Date(inc.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    return `
                        <div class="critical-pulse" style="background: rgba(0, 0, 0, 0.25); border-left: 3px solid #ef4444; padding: 10px 12px; border-radius: 6px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 700; font-size: 13px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 190px;" title="${inc.nome_rota}">${inc.nome_rota}</span>
                                <span style="font-size: 11px; color: #94a3b8; font-weight: 500;">${horaQueda}</span>
                            </div>
                            <div style="font-size: 11px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${inc.descricao}">${inc.descricao}</div>
                        </div>
                    `;
                }).join('');
            }
        }
    }
};
