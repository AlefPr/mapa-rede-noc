// telemetria.js
import { state } from './state.js';

export const telemetria = {

    // ==========================================
    // PAINEL DE SAÚDE DO ENLACE E KPIs
    // ==========================================
    atualizarPainelSaude: (rota) => {
        const kpiIn = document.getElementById('kpi-current-in');
        const kpiOut = document.getElementById('kpi-current-out');
        const progressFill = document.querySelector('.progress-fill');
        const healthValue = document.querySelector('.health-value');
        const healthSubtext = document.querySelector('.health-subtext');
        
        let rxValueEl = document.getElementById('ui-rx-value');
        let rxBadgeEl = document.getElementById('ui-rx-badge');
        let rxBarContainer = document.getElementById('ui-rx-bars');

        if (!rxBarContainer || !rxValueEl || !rxBadgeEl) {
            const rxDisplay = document.querySelector('.rx-signal-display');
            const healthRx = document.querySelector('.health-compact + .health-compact') || document.querySelector('#tab-geral .health-compact:last-child');
            if (!rxBarContainer && rxDisplay) {
                rxBarContainer = document.createElement('div');
                rxBarContainer.className = 'signal-bars';
                rxBarContainer.id = 'ui-rx-bars';
                for (let i = 0; i < 5; i++) {
                    const bar = document.createElement('div');
                    bar.className = 'signal-bar';
                    rxBarContainer.appendChild(bar);
                }
                rxDisplay.insertBefore(rxBarContainer, rxDisplay.firstChild);
            }
            if (!rxValueEl && rxDisplay) {
                rxValueEl = document.createElement('span');
                rxValueEl.id = 'ui-rx-value';
                rxValueEl.className = 'rx-value';
                rxValueEl.innerHTML = '<span class="empty-pulse">···</span>';
                rxDisplay.appendChild(rxValueEl);
            }
            if (!rxBadgeEl) {
                const row = document.querySelector('.health-compact-row');
                if (row) {
                    rxBadgeEl = document.createElement('span');
                    rxBadgeEl.id = 'ui-rx-badge';
                    rxBadgeEl.className = 'badge badge-neutral';
                    rxBadgeEl.innerHTML = '<span class="empty-pulse">···</span>';
                    row.appendChild(rxBadgeEl);
                }
            }
            if (!rxBarContainer || !rxValueEl || !rxBadgeEl) {
                console.warn('[RX] Elementos não encontrados mesmo após fallback DOM:', {rxBarContainer, rxValueEl, rxBadgeEl});
            }
        }

        // MÁGICA NOC: Escala automática (Mbps -> Gbps -> Tbps)
        const formatarAuto = (bps) => {
            if (!bps || bps === 0) return '0 Mbps';
            if (bps >= 1000000000000) return (bps / 1000000000000).toFixed(2) + ' Tbps';
            if (bps >= 1000000000) return (bps / 1000000000).toFixed(2) + ' Gbps';
            return (bps / 1000000).toFixed(2) + ' Mbps';
        };

        if (!rota || !rota.zabbix_items) {
            if (kpiIn) kpiIn.innerHTML = '<span class="empty-pulse">···</span>';
            if (kpiOut) kpiOut.innerHTML = '<span class="empty-pulse">···</span>';
            if (progressFill) { progressFill.style.width = '0%'; progressFill.style.background = '#64748b'; }
            if (healthValue) healthValue.innerHTML = '<span class="empty-pulse">···</span>';
            if (healthSubtext) healthSubtext.textContent = 'Aguardando configuração...';
            if (rxValueEl) rxValueEl.innerHTML = '<span class="empty-pulse">···</span>';
            if (rxBadgeEl) { rxBadgeEl.innerHTML = '<span class="empty-pulse">···</span>'; rxBadgeEl.className = 'badge badge-neutral'; }
            if (rxBarContainer) rxBarContainer.querySelectorAll('.signal-bar').forEach(b => b.classList.remove('active'));
            return;
        }

        // 1. CÁLCULO DE TRÁFEGO E SATURAÇÃO
        let valorIn = 0, valorOut = 0;
        
        if (rota.zabbix_items.in) rota.zabbix_items.in.forEach(id => { if (state.zabbixCacheLocal[id]) valorIn += parseFloat(state.zabbixCacheLocal[id].current) || 0; });
        if (rota.zabbix_items.out) rota.zabbix_items.out.forEach(id => { if (state.zabbixCacheLocal[id]) valorOut += parseFloat(state.zabbixCacheLocal[id].current) || 0; });

        if (kpiIn) kpiIn.textContent = formatarAuto(valorIn);
        if (kpiOut) kpiOut.textContent = formatarAuto(valorOut);

        let trafegoConsiderado = 0;
        const tipoCalculo = rota.tipo_rota || 'full-duplex';

        if (tipoCalculo === 'agregado') trafegoConsiderado = valorIn + valorOut;
        else if (tipoCalculo === 'download') trafegoConsiderado = valorIn;
        else if (tipoCalculo === 'upload') trafegoConsiderado = valorOut;
        else if (tipoCalculo === 'full-duplex') trafegoConsiderado = Math.max(valorIn, valorOut);

        let capacidadeEmBps = 0;
        if (rota.capacidade && parseFloat(rota.capacidade) > 0) {
            capacidadeEmBps = (rota.unidade && rota.unidade.toLowerCase() === 'gbps') ? parseFloat(rota.capacidade) * 1000000000 : parseFloat(rota.capacidade) * 1000000;
        }

        if (progressFill && healthValue && healthSubtext) {
            if (capacidadeEmBps > 0) {
                let percentual = (trafegoConsiderado / capacidadeEmBps) * 100;
                if (percentual > 100) percentual = 100;

                progressFill.style.width = `${percentual}%`;
                healthValue.textContent = `${percentual.toFixed(1)}%`;
                healthSubtext.textContent = `${formatarAuto(trafegoConsiderado)} de ${rota.capacidade} ${rota.unidade.toUpperCase()}`;
                
                // Lógica de Cores da Barra (Invertida: Roxo 80%, Amarelo 90%)
                if (percentual < 80) {
                    progressFill.style.background = 'linear-gradient(90deg, #059669, #10b981)'; // < 80%: Verde
                } else if (percentual < 90) {
                    progressFill.style.background = 'linear-gradient(90deg, #7c3aed, #8b5cf6)'; // 80 a 90%: Roxo
                } else {
                    progressFill.style.background = 'linear-gradient(90deg, #d97706, #f59e0b)'; // > 90%: Amarelo
                }
            } else {
                progressFill.style.width = '0%';
                healthValue.textContent = '--';
                healthSubtext.textContent = 'Capacidade não configurada';
                progressFill.style.background = '#64748b';
            }
        }

        // 2. CÁLCULO DO SINAL ÓPTICO (RX)
        if (rxValueEl && rxBadgeEl && rxBarContainer) {
            const bars = rxBarContainer.querySelectorAll('.signal-bar');
            if (rota.zabbix_items.rx && rota.zabbix_items.rx.length > 0) {
                let rxValores = [];
                let piorRx = null;

                rota.zabbix_items.rx.forEach(id => {
                    if (state.zabbixCacheLocal[id]) {
                        const v = parseFloat(state.zabbixCacheLocal[id].current);
                        rxValores.push(v.toFixed(2));
                        if (piorRx === null || v < piorRx) piorRx = v; 
                    }
                });

                if (rxValores.length > 0) {
                    rxValueEl.textContent = rxValores.join(' / ') + ' dBm';
                    let activeBars, barColor;
                    if (piorRx >= -24) {
                        rxBadgeEl.textContent = 'SINAL EXCELENTE'; rxBadgeEl.className = 'badge badge-success';
                        activeBars = 5; barColor = '#10b981';
                    } else if (piorRx >= -27) {
                        rxBadgeEl.textContent = 'DEGRADAÇÃO LEVE'; rxBadgeEl.className = 'badge badge-warning';
                        activeBars = 3; barColor = '#fbbf24';
                    } else {
                        rxBadgeEl.textContent = 'SINAL CRÍTICO'; rxBadgeEl.className = 'badge badge-danger';
                        activeBars = 1; barColor = '#ef4444';
                    }
                    bars.forEach((bar, i) => {
                        bar.classList.toggle('active', i < activeBars);
                        bar.style.setProperty('--bar-color', barColor);
                    });
                } else {
                    rxValueEl.innerHTML = '<span class="empty-pulse">···</span>'; rxBadgeEl.textContent = 'SEM DADOS'; rxBadgeEl.className = 'badge badge-neutral';
                    bars.forEach(b => b.classList.remove('active'));
                }
            } else {
                rxValueEl.innerHTML = '<span class="empty-pulse">···</span>'; rxBadgeEl.textContent = 'SEM DADOS'; rxBadgeEl.className = 'badge badge-neutral';
                bars.forEach(b => b.classList.remove('active'));
            }
        }
        document.querySelectorAll('.metric-value, .health-value, .rx-value, .badge').forEach(el => {
            if (el && el.closest('#tab-geral')) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
        });
        const tsEl = document.getElementById('last-update-timestamp');
        if (tsEl) {
            const agora = new Date();
            tsEl.textContent = `atualizado ${agora.toLocaleTimeString('pt-BR')}`;
            tsEl.dataset.timestamp = agora.getTime();
        }
    },

    _intervalRelogio: null,

    iniciarRelogio: () => {
        if (telemetria._intervalRelogio) return;
        telemetria._intervalRelogio = setInterval(() => {
            const tsEl = document.getElementById('last-update-timestamp');
            if (!tsEl || !tsEl.dataset.timestamp) return;
            const diff = Math.floor((Date.now() - parseInt(tsEl.dataset.timestamp)) / 1000);
            if (diff < 5) tsEl.textContent = 'agora';
            else if (diff < 60) tsEl.textContent = `há ${diff}s`;
            else tsEl.textContent = `há ${Math.floor(diff/60)}min`;
        }, 3000);
    },

    pararRelogio: () => {
        if (telemetria._intervalRelogio) {
            clearInterval(telemetria._intervalRelogio);
            telemetria._intervalRelogio = null;
        }
    },

    renderizarSparklineGeral: (rota) => {
        const container = document.getElementById('sparkline-geral');
        if (!container) return;

        if (!rota.zabbix_items || (!rota.zabbix_items.in.length && !rota.zabbix_items.out.length)) {
            container.innerHTML = '';
            return;
        }

        let historyInSum = [];
        let historyOutSum = [];

        if (rota.zabbix_items.in && state.zabbixCacheLocal) {
            rota.zabbix_items.in.forEach(id => {
                if (state.zabbixCacheLocal[id] && state.zabbixCacheLocal[id].history) {
                    state.zabbixCacheLocal[id].history.forEach((val, i) => {
                        historyInSum[i] = (historyInSum[i] || 0) + parseFloat(val);
                    });
                }
            });
        }

        if (rota.zabbix_items.out && state.zabbixCacheLocal) {
            rota.zabbix_items.out.forEach(id => {
                if (state.zabbixCacheLocal[id] && state.zabbixCacheLocal[id].history) {
                    state.zabbixCacheLocal[id].history.forEach((val, i) => {
                        historyOutSum[i] = (historyOutSum[i] || 0) + parseFloat(val);
                    });
                }
            });
        }

        const historicoIn = historyInSum.map(x => parseFloat((x / 1000000).toFixed(2)));
        const historicoOut = historyOutSum.map(x => parseFloat((x / 1000000).toFixed(2)));

        if (historicoIn.length <= 1 && historicoOut.length <= 1) {
            container.innerHTML = '';
            return;
        }

        if (state.sparklineGeralInstance) {
            state.sparklineGeralInstance.destroy();
        }

        const options = {
            series: [ { name: 'OUT', data: historicoOut }, { name: 'IN', data: historicoIn } ],
            chart: { type: 'area', height: 36, sparkline: { enabled: true }, animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 500 } } },
            stroke: { curve: 'smooth', width: 1.5 },
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] } },
            colors: ['#60a5fa', '#34d399'],
            tooltip: { enabled: false }
        };

        state.sparklineGeralInstance = new ApexCharts(container, options);
        state.sparklineGeralInstance.render();
    },

    // ==========================================
    // GRÁFICOS E HOVER CARDS
    // ==========================================
    renderizarRX: async (itemid) => {
        const chartRxContainer = document.getElementById('chart-rx');
        if (!chartRxContainer) return;
        
        try {
            chartRxContainer.innerHTML = '<div style="color:#94a3b8; padding: 20px;">A carregar dados de sinal (RX)...</div>';

            const res = await fetch(`${state.API_URL_BASE}/zabbix/item/${itemid}/history?period=24h&value_type=0`);
            const dados = await res.json();
            
            if (!dados || dados.length === 0) {
                chartRxContainer.innerHTML = `<div class="empty-chart-state" style="padding-top:60px;"><p>Sem dados de sinal no período.</p></div>`;
                return;
            }

            const dataPoints = dados.map(d => [d.clock * 1000, parseFloat(d.value)]);
            
            const optionsRx = {
                series: [{ name: 'Sinal RX', data: dataPoints }],
                chart: { type: 'line', height: 250, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } },
                colors: ['#fbbf24', '#f472b6'],
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: 2 },
                xaxis: { type: 'datetime', labels: { style: { colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: function (value) { return value.toFixed(1) + " dBm"; } } },
                tooltip: { theme: 'dark', y: { formatter: function (val) { return val + " dBm"; } } },
                grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                legend: { labels: { colors: '#cbd5e1' } }
            };

            if (state.rxChartInstance) state.rxChartInstance.destroy();
            chartRxContainer.innerHTML = '';
            state.rxChartInstance = new ApexCharts(chartRxContainer, optionsRx);
            state.rxChartInstance.render();

        } catch (error) {
            console.error("Erro ao plotar RX:", error);
            chartRxContainer.innerHTML = '<div style="color:#ef4444; padding: 20px;">Erro ao carregar gráfico.</div>';
        }
    },

    // Motor Inteligente do Modal Gigante (Com Auto-Resolver Zabbix e KPIs Matemáticos)
    renderizarWideChart: async (rota, period = '1h', interfacesSelecionadas = ['0'], dicionarioNomes = {}) => {
        const chartTrafficContainer = document.querySelector("#wide-chart-traffic");
        const chartRxContainer = document.querySelector("#wide-chart-rx");

        if (!chartTrafficContainer || !chartRxContainer) return;

        if (!rota || (!rota.zabbix_items.in.length && !rota.zabbix_items.out.length && (!rota.zabbix_items.rx || !rota.zabbix_items.rx.length))) {
            chartTrafficContainer.innerHTML = '<div class="empty-chart-state" style="padding-top:100px;"><i class="ph ph-warning-circle" style="font-size:32px; color:#64748b; margin-bottom:10px;"></i><p>Nenhuma interface configurada.</p></div>';
            chartRxContainer.innerHTML = '<div class="empty-chart-state" style="padding-top:70px;"><i class="ph ph-warning-circle" style="font-size:32px; color:#64748b; margin-bottom:10px;"></i><p>Sem RX configurado.</p></div>';
            return;
        }

        const loaderHTML = '<div style="text-align: center; color: #38bdf8; padding: 100px 0;"><i class="ph ph-spinner-gap ph-spin" style="font-size: 32px; margin-bottom: 10px; display: inline-block; animation: spin 1s linear infinite;"></i><p style="font-size: 13px;">Extraindo telemetria do Zabbix...</p><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style></div>';
        chartTrafficContainer.innerHTML = loaderHTML;
        chartRxContainer.innerHTML = loaderHTML;

        try {
            let itemsToFetch = [];

            // Função interna blindada para evitar o "TypeError: replace is undefined"
            const getNomeSeguro = (idItem, defaultName) => {
                if (!idItem) return defaultName;
                if (dicionarioNomes && dicionarioNomes[idItem]) return dicionarioNomes[idItem];
                if (rota.dicionario_nomes && rota.dicionario_nomes[idItem]) return rota.dicionario_nomes[idItem];
                
                const cacheItem = state.zabbixCacheLocal[idItem];
                if (cacheItem && cacheItem.name) {
                    let limpo = cacheItem.name.replace(/Traffic IN |Traffic OUT |Incoming network traffic on |Outgoing network traffic on |Interface /ig, '').trim();
                    return limpo.split('[')[0].trim();
                }
                return defaultName;
            };

            // Adiciona apenas as interfaces solicitadas pelo Sidebar
            interfacesSelecionadas.forEach(idx => {
                const i = parseInt(idx);
                const idIn = (rota.zabbix_items.in && rota.zabbix_items.in.length > i) ? rota.zabbix_items.in[i] : null;
                const idOut = (rota.zabbix_items.out && rota.zabbix_items.out.length > i) ? rota.zabbix_items.out[i] : null;

                const nomeCurtoIn = getNomeSeguro(idIn, `Porta ${i + 1}`);
                const nomeCurtoOut = getNomeSeguro(idOut, `Porta ${i + 1}`);

                if(idIn) itemsToFetch.push({ id: idIn, type: 'traffic', name: `IN (${nomeCurtoIn})`, vType: 3 });
                if(idOut) itemsToFetch.push({ id: idOut, type: 'traffic', name: `OUT (${nomeCurtoOut})`, vType: 3 });
                
                // ---> NOVA MÁGICA: Distribuição Matemática de RX (Multi-lane à prova de falhas) <---
                if (rota.zabbix_items.rx && rota.zabbix_items.rx.length > 0) {
                    const inCount = Math.max(rota.zabbix_items.in ? rota.zabbix_items.in.length : 0, rota.zabbix_items.out ? rota.zabbix_items.out.length : 1);
                    const rxCount = rota.zabbix_items.rx.length;
                    
                    if (inCount <= 1) {
                        // Cenário A: Rota normal ou 100G (1 Porta Lógica). TODOS os canais RX pertencem a ela.
                        rota.zabbix_items.rx.forEach((idRx, rxIdx) => {
                            const nomeRx = getNomeSeguro(idRx, `Lane ${rxIdx + 1}`);
                            itemsToFetch.push({ id: idRx, type: 'rx', name: `RX (${nomeRx})`, vType: 0 });
                        });
                    } else {
                        // Cenário B: LACP (Múltiplas portas de tráfego com múltiplos canais RX).
                        // O sistema distribui as lanes de forma matematicamente proporcional.
                        const lanesPerPort = Math.max(1, Math.floor(rxCount / inCount));
                        const startIndex = i * lanesPerPort;
                        const endIndex = startIndex + lanesPerPort;
                        
                        for (let j = startIndex; j < endIndex && j < rxCount; j++) {
                            const idRx = rota.zabbix_items.rx[j];
                            const nomeRx = getNomeSeguro(idRx, `Lane ${j + 1}`);
                            itemsToFetch.push({ id: idRx, type: 'rx', name: `RX (${nomeRx})`, vType: 0 });
                        }
                    }
                }
            });
            
            const fetchPromises = itemsToFetch.map(item => {
                return fetch(`${state.API_URL_BASE}/zabbix/item/${item.id}/history?period=${period}&value_type=${item.vType}`)
                    .then(res => res.json())
                    .then(data => ({
                        name: item.name, type: item.type, data: Array.isArray(data) ? data : []
                    }));
            });
            
            const results = await Promise.all(fetchPromises);
            
            const formatarTimestamp = (clock) => {
                const date = new Date(clock * 1000);
                return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            };

            const trafficData = results.filter(r => r.type === 'traffic' && r.data && r.data.length > 0);

            // ==========================================
            // MOTOR DE KPIs AVANÇADOS (Picos e Médias)
            // ==========================================
            let maxIn = 0, maxOut = 0, sumIn = 0, sumOut = 0, countIn = 0, countOut = 0;

            if (trafficData.length > 0) {
                trafficData.forEach(series => {
                    const isOut = series.name.includes('OUT');
                    series.data.forEach(d => {
                        const val = parseFloat(d.value);
                        if (isOut) {
                            if (val > maxOut) maxOut = val;
                            sumOut += val;
                            countOut++;
                        } else {
                            if (val > maxIn) maxIn = val;
                            sumIn += val;
                            countIn++;
                        }
                    });
                });
            }

            // FUNÇÃO INTELIGENTE DE ESCALA PARA OS KPIs (Mbps -> Gbps -> Tbps)
            const formatKpiDinâmico = (bps) => {
                if (!bps || bps <= 0) return '-- Mbps';
                if (bps >= 1000000000000) return (bps / 1000000000000).toFixed(2) + ' Tbps';
                if (bps >= 1000000000) return (bps / 1000000000).toFixed(2) + ' Gbps';
                return (bps / 1000000).toFixed(2) + ' Mbps';
            };
            
            const elMaxIn = document.getElementById('kpi-max-in');
            const elMaxOut = document.getElementById('kpi-max-out');
            const elAvgIn = document.getElementById('kpi-avg-in');
            const elAvgOut = document.getElementById('kpi-avg-out');
            
            if(elMaxIn) elMaxIn.textContent = formatKpiDinâmico(maxIn);
            if(elMaxOut) elMaxOut.textContent = formatKpiDinâmico(maxOut);
            if(elAvgIn) elAvgIn.textContent = countIn > 0 ? formatKpiDinâmico(sumIn / countIn) : '-- Mbps';
            if(elAvgOut) elAvgOut.textContent = countOut > 0 ? formatKpiDinâmico(sumOut / countOut) : '-- Mbps';
            
            if (state.trafficChartInstance) state.trafficChartInstance.destroy();
            chartTrafficContainer.innerHTML = '';

            if (trafficData.length > 0) {
                const categories = trafficData[0].data.map(d => formatarTimestamp(d.clock));
                const seriesData = trafficData.map(result => ({
                    name: result.name,
                    // Mantemos a base matemática em Mbps para o gráfico renderizar proporções corretamente
                    data: result.data.map(d => Number((parseFloat(d.value) / 1000000).toFixed(2)))
                }));
                
                const optionsTraffic = {
                    series: seriesData,
                    chart: { type: 'area', height: 320, fontFamily: 'Inter, sans-serif', animations: { enabled: true }, background: 'transparent', toolbar: { show: false } },
                    colors: ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#f472b6'],
                    dataLabels: { enabled: false },
                    stroke: { curve: 'smooth', width: 2 },
                    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
                    xaxis: { categories: categories, tickAmount: 12, tooltip: { enabled: false }, labels: { style: { colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                    
                    // FORMATAÇÃO INTELIGENTE DO EIXO Y
                    yaxis: { 
                        labels: { 
                            style: { colors: '#94a3b8' }, 
                            formatter: function (value) { 
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + " T";
                                if (value >= 1000) return (value / 1000).toFixed(1) + " G";
                                return value.toFixed(1) + " M"; 
                            } 
                        } 
                    },
                    
                    // FORMATAÇÃO INTELIGENTE DO TOOLTIP (Hover)
                    tooltip: { 
                        theme: 'dark', 
                        y: { 
                            formatter: function (val) { 
                                if (val >= 1000000) return (val / 1000000).toFixed(2) + " Tbps";
                                if (val >= 1000) return (val / 1000).toFixed(2) + " Gbps";
                                return val.toFixed(2) + " Mbps"; 
                            } 
                        } 
                    },
                    
                    grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                    legend: { labels: { colors: '#cbd5e1' } }
                };
                state.trafficChartInstance = new ApexCharts(chartTrafficContainer, optionsTraffic);
                state.trafficChartInstance.render();
            } else {
                chartTrafficContainer.innerHTML = `<div class="empty-chart-state" style="padding-top:100px;"><p>Sem dados de tráfego no período.</p></div>`;
            }

            // ==========================================
            // RENDERIZAÇÃO DE RX COM INDICADORES DE LANE
            // ==========================================
            const rxData = results.filter(r => r.type === 'rx' && r.data && r.data.length > 0);
            
            if (state.rxChartInstance) state.rxChartInstance.destroy();
            chartRxContainer.innerHTML = '';

            if (rxData.length > 0) {
                // 1. Gera os Cards de Indicadores Coloridos dinamicamente
                let rxIndicatorsHTML = '<div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">';
                
                rxData.forEach(series => {
                    // Pega o valor exato mais recente (o último do array de histórico)
                    const ultimoDado = series.data[series.data.length - 1]; 
                    if (ultimoDado) {
                        const val = parseFloat(ultimoDado.value);
                        
                        // Lógica NOC de Degradação Óptica (Limiares padrão)
                        let cor = '#10b981'; let icone = 'ph-check-circle'; // Verde (Excelente)
                        if (val <= -26) { cor = '#ef4444'; icone = 'ph-warning-circle'; } // Vermelho (Crítico)
                        else if (val <= -24) { cor = '#f59e0b'; icone = 'ph-warning'; } // Amarelo (Atenção)
                        
                        // ---> A MÁGICA DA INTERAÇÃO (CLIQUE) ENTRA AQUI <---
                        const serieNameLimpo = series.name; // O nome original para a API do ApexCharts encontrar a linha
                        const nomeExibicao = series.name.replace('RX ', '').replace(/[()]/g, '');

                        rxIndicatorsHTML += `
                            <div onclick="if(state.rxChartInstance) { state.rxChartInstance.toggleSeries('${serieNameLimpo}'); this.style.opacity = this.style.opacity === '0.5' ? '1' : '0.5'; }" 
                                 title="Clique para ocultar/mostrar esta Lane no gráfico"
                                 style="background: rgba(255,255,255,0.03); border: 1px solid ${cor}40; border-radius: 8px; padding: 8px 14px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: 0.2s; user-select: none;"
                                 onmouseover="this.style.background='rgba(255,255,255,0.08)'"
                                 onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                                <i class="ph ${icone}" style="color: ${cor}; font-size: 18px;"></i>
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: #94a3b8; font-size: 10px; font-weight: 700; text-transform: uppercase;">${nomeExibicao}</span>
                                    <span style="color: #f8fafc; font-size: 14px; font-weight: 700; font-family: monospace;">${val.toFixed(2)} dBm</span>
                                </div>
                            </div>
                        `;
                    }
                });
                rxIndicatorsHTML += '</div>';

                // 2. Prepara o espaço na tela (Cards em cima, Gráfico novo em baixo)
                chartRxContainer.innerHTML = rxIndicatorsHTML + '<div id="rx-canvas" style="width: 100%; min-height: 200px;"></div>';

                // 3. Monta e plota o gráfico de histórico
                const categories = rxData[0].data.map(d => formatarTimestamp(d.clock));
                const seriesData = rxData.map(result => ({
                    name: result.name,
                    data: result.data.map(d => Number(parseFloat(d.value).toFixed(2)))
                }));
                
                const optionsRx = {
                    series: seriesData,
                    chart: { type: 'line', height: 220, fontFamily: 'Inter, sans-serif', animations: { enabled: true }, background: 'transparent', toolbar: { show: false } },
                    colors: ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'], // Paleta alargada para multi-lane
                    dataLabels: { enabled: false },
                    stroke: { curve: 'smooth', width: 2 },
                    xaxis: { categories: categories, tickAmount: 12, tooltip: { enabled: false }, labels: { style: { colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                    yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: function (value) { return value.toFixed(1) + " d"; } } },
                    tooltip: { theme: 'dark', y: { formatter: function (val) { return val + " dBm"; } } },
                    grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                    legend: { show: false } // Esconde a legenda do gráfico pois os Cards já fazem esse papel lindamente
                };
                
                state.rxChartInstance = new ApexCharts(document.querySelector("#rx-canvas"), optionsRx);
                state.rxChartInstance.render();
            } else {
                chartRxContainer.innerHTML = `<div class="empty-chart-state" style="padding-top:70px;"><p>Sem dados de sinal no período.</p></div>`;
            }

        } catch (error) { 
            console.error("Erro ao plotar Wide Chart:", error);
            chartTrafficContainer.innerHTML = '<div class="empty-chart-state" style="color: #ef4444;"><p>Falha ao conectar com API.</p></div>'; 
            chartRxContainer.innerHTML = '<div class="empty-chart-state" style="color: #ef4444;"><p>Falha ao conectar com API.</p></div>'; 
        }
    },

    renderizarSparklineHover: (rota) => {
        const container = document.getElementById('hc-sparkline');
        if (!container) return;

        if (!rota.zabbix_items || (!rota.zabbix_items.in.length && !rota.zabbix_items.out.length)) {
            container.innerHTML = '';
            if (state.sparklineChartInstance) {
                state.sparklineChartInstance.destroy();
                state.sparklineChartInstance = null;
            }
            return;
        }

        let historyInSum = [];
        let historyOutSum = [];

        if (rota.zabbix_items.in && state.zabbixCacheLocal) {
            rota.zabbix_items.in.forEach(id => {
                if (state.zabbixCacheLocal[id] && state.zabbixCacheLocal[id].history) {
                    state.zabbixCacheLocal[id].history.forEach((val, i) => {
                        historyInSum[i] = (historyInSum[i] || 0) + parseFloat(val);
                    });
                }
            });
        }

        if (rota.zabbix_items.out && state.zabbixCacheLocal) {
            rota.zabbix_items.out.forEach(id => {
                if (state.zabbixCacheLocal[id] && state.zabbixCacheLocal[id].history) {
                    state.zabbixCacheLocal[id].history.forEach((val, i) => {
                        historyOutSum[i] = (historyOutSum[i] || 0) + parseFloat(val);
                    });
                }
            });
        }

        const historicoIn = historyInSum.map(x => parseFloat((x / 1000000).toFixed(2)));
        const historicoOut = historyOutSum.map(x => parseFloat((x / 1000000).toFixed(2)));

        if (historicoIn.length <= 1 && historicoOut.length <= 1) {
            container.innerHTML = '<div style="color: #64748b; font-size: 10px; text-align: center; padding-top: 15px;">Aguardar propagação de histórico...</div>';
            if (state.sparklineChartInstance) {
                state.sparklineChartInstance.destroy();
                state.sparklineChartInstance = null;
            }
            return;
        }

        if (state.sparklineChartInstance) {
            state.sparklineChartInstance.destroy();
        }

        const options = {
            series: [ { name: 'OUT', data: historicoOut }, { name: 'IN', data: historicoIn } ],
            chart: { type: 'area', height: 60, sparkline: { enabled: true }, animations: { enabled: false } },
            stroke: { curve: 'smooth', width: 2 },
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
            colors: ['#60a5fa', '#34d399'], 
            tooltip: { enabled: false } 
        };

        state.sparklineChartInstance = new ApexCharts(container, options);
        state.sparklineChartInstance.render();
    },

    renderizarMiniTrend: async (rota) => {
        const container = document.getElementById('mini-trend-chart');
        if (!container) return;
        container.innerHTML = '';

        if (!rota || !rota.zabbix_items || (!rota.zabbix_items.in.length && !rota.zabbix_items.out.length)) {
            container.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding-top:18px;">Configure interfaces Zabbix para ver tendência</div>';
            return;
        }

        try {
            const allIds = [...(rota.zabbix_items.in || []), ...(rota.zabbix_items.out || [])];
            const idsStr = allIds.map(id => `itemids=${id}`).join('&');
            const res = await fetch(`${state.API_URL_BASE}/zabbix/items/history?${idsStr}&period=6h`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            const inIds = new Set(rota.zabbix_items.in || []);
            const outIds = new Set(rota.zabbix_items.out || []);

            const aggregated = {};
            (data || []).forEach(p => {
                if (!aggregated[p.clock]) aggregated[p.clock] = { in: 0, out: 0 };
                const id = String(p.itemid);
                const val = parseFloat(p.value) || 0;
                if (inIds.has(id)) aggregated[p.clock].in += val;
                if (outIds.has(id)) aggregated[p.clock].out += val;
            });

            const sorted = Object.entries(aggregated).sort((a, b) => a[0] - b[0]);
            const inData = sorted.map(([, v]) => +(v.in / 1000000).toFixed(2));
            const outData = sorted.map(([, v]) => +(v.out / 1000000).toFixed(2));

            if (inData.length < 2 && outData.length < 2) {
                container.innerHTML = '<div style="color:#64748b;font-size:11px;text-align:center;padding-top:18px;">Aguardar dados de histórico...</div>';
                return;
            }

            if (state.miniTrendChart) state.miniTrendChart.destroy();

            state.miniTrendChart = new ApexCharts(container, {
                series: [
                    { name: 'IN', data: inData },
                    { name: 'OUT', data: outData }
                ],
                chart: {
                    type: 'area',
                    height: 72,
                    sparkline: { enabled: true },
                    animations: { enabled: false }
                },
                stroke: { curve: 'smooth', width: 1.5 },
                fill: {
                    type: 'gradient',
                    gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05, stops: [0, 100] }
                },
                colors: ['#34d399', '#60a5fa'],
                tooltip: {
                    enabled: true,
                    theme: 'dark',
                    x: { show: true },
                    y: {
                        formatter: (v) => v.toFixed(2) + ' Mbps'
                    }
                }
            });
            state.miniTrendChart.render();
        } catch (e) {
            console.error('Mini-trend error:', e);
            container.innerHTML = '<div style="color:#ef4444;font-size:11px;text-align:center;padding-top:18px;">Erro ao carregar</div>';
        }
    }
};