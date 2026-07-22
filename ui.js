import { api } from './api.js';
import { state } from './state.js';
import { mapa } from './mapa.js';
import { telemetria } from './telemetria.js?v3';
import { auth } from './auth.js';

export const ui = {
    gaveta: document.getElementById('route-drawer'),

    init: () => {
        ui.configurarEventosGlobais();
        ui.initSelect2();
        ui.tornarWidgetArrastavel('widget-alarms', window.innerWidth - 350, window.innerHeight - 200);

        state.isSnapToRoadEnabled = false;
        const snapCheckbox = document.getElementById('snap-to-road-checkbox');
        if (snapCheckbox) snapCheckbox.checked = false;

        // Ativar toggles dos widgets
        document.querySelectorAll('.widget-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const widget = e.target.closest('.noc-widget');
                if (widget) {
                    widget.classList.toggle('collapsed');
                    btn.classList.toggle('ph-minus');
                    btn.classList.toggle('ph-plus');
                }
            });
        });

        ui.atualizarLivePreview();
        ui.atualizarDashboard();
        ui.atualizarEstadoAuth();
        ui.configurarAuthUI();
    },

    atualizarDashboard: () => {
        const totalRotas = state.rotasSalvas.length;
        const downRotas = state.rotasSalvas.filter(r => r.corDeAlerta === '#FF0000').length;
        
        const elTotal = document.getElementById('w-total-rotas');
        const elStatus = document.getElementById('w-rede-status');
        
        if (elTotal) elTotal.textContent = totalRotas;
        if (elStatus) {
            if (downRotas > 0) {
                elStatus.textContent = 'ALERTA';
                elStatus.style.color = '#ef4444';
            } else {
                elStatus.textContent = 'OK';
                elStatus.style.color = '#34d399';
            }
        }
    },

    initSelect2: () => {
        if (window.jQuery && window.jQuery.fn.select2) {
            window.jQuery('#zabbix-item-in-select, #zabbix-item-out-select').select2({ placeholder: "-- Interfaces --", allowClear: true, width: '100%', dropdownParent: window.jQuery('#route-drawer') });
            window.jQuery('#zabbix-group-select, #zabbix-host-select').select2({ width: '100%', dropdownParent: window.jQuery('#route-drawer') });
            window.jQuery('#zabbix-item-rx-select').select2({ placeholder: "-- Sinal RX (dBm) --", allowClear: true, width: '100%', dropdownParent: window.jQuery('#route-drawer') });

            window.jQuery('#zabbix-group-select').on('change', async function () {
                if (!state.isEditingRoute) await ui.popularHostsDropdown(window.jQuery(this).val());
            });
            window.jQuery('#zabbix-host-select').on('change', async function () {
                if (!state.isEditingRoute) await ui.popularItemsDropdowns(window.jQuery(this).val());
            });
        }
    },

    configurarEventosGlobais: () => {
        document.addEventListener('rotaClicada', (e) => ui.abrirGaveta(e.detail));
        document.addEventListener('atualizarDashboard', () => ui.atualizarDashboard());
        
        // BUG 2 FIX: Trava anti-loop. Só abre a gaveta via desenhoFinalizado se NÃO estivermos a fechá-la.
        document.addEventListener('desenhoFinalizado', () => {
            if (!state.isClosingDrawer) {
                ui.abrirGaveta(null);
            }
        });
        
        document.addEventListener('fecharGaveta', () => ui.fecharGaveta());
        document.addEventListener('excluirRotaRapida', () => ui.excluirRota());

        document.addEventListener('rotaMouseOver', (e) => ui.mostrarHoverCard(e.detail));
        document.addEventListener('rotaMouseOut', () => ui.esconderHoverCard());
        document.addEventListener('rotaRightClick', (e) => ui.abrirMenuContexto(e.detail));

        // =====================================================================
        // MEGA BLOCO DE CLIQUES (Toda lógica que usa 'target' fica aqui)
        // =====================================================================
        document.addEventListener('click', async (event) => {
            const target = event.target;

            if (target.matches('#create-route-button') || target.closest('#create-route-button')) {
                const qdb = document.getElementById('quick-delete-button');
                if (state.isQuickDeleting && qdb) qdb.click();
                mapa.iniciarDesenho();
                ui.mostrarToast("Modo Desenho Ativo. Clique no mapa para traçar.", "info");
            }

            if (target.matches('#quick-delete-button') || target.closest('#quick-delete-button')) {
                if (state.isDrawing) return;
                state.isQuickDeleting = !state.isQuickDeleting;

                const btn = target.closest('#quick-delete-button');

                if (state.isQuickDeleting) {
                    btn.style.background = 'rgba(239, 68, 68, 0.15)';
                    btn.style.color = '#ef4444';
                    state.map.setOptions({ draggableCursor: state.cursores.lixeira });
                    mapa.linhasDesenhadas.forEach(linha => linha.setOptions({ cursor: state.cursores.lixeira }));
                    ui.mostrarToast("Modo Exclusão Ativo. Clique numa rota para apagá-la.", "warning");
                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = '#a1a1aa';
                    state.map.setOptions({ draggableCursor: null });
                    mapa.linhasDesenhadas.forEach(linha => linha.setOptions({ cursor: 'pointer' }));
                    ui.mostrarToast("Modo Exclusão Desativado.", "info");
                }
            }

            ui.esconderMenuContexto();

            if (target.matches('#cm-btn-editar') || target.closest('#cm-btn-editar')) ui.abrirGaveta(state.rotaSelecionada);
            if (target.matches('#cm-btn-focar') || target.closest('#cm-btn-focar')) {
                ui.esconderHoverCard();
                mapa.focarRota(state.rotaSelecionada);
            }

            // ==========================================
            // QUICK ACTIONS (Focar e Copiar Smart Copy)
            // ==========================================
            if (target.matches('#btn-focar-rota') || target.closest('#btn-focar-rota')) {
                if (state.rotaSelecionada) {
                    mapa.focarRota(state.rotaSelecionada);
                    ui.mostrarToast("Foco centralizado na rota.", "info");
                }
            }

            if (target.matches('#btn-smart-copy') || target.closest('#btn-smart-copy')) {
                const rota = state.rotaSelecionada;
                if (!rota) return;

                const nome = rota.nome_rota || 'Rota Desconhecida';
                const status = document.getElementById('ui-status-badge')?.textContent || 'Desconhecido';
                const dist = document.getElementById('route-distance-value')?.textContent || '--';
                const origem = document.getElementById('ui-route-origin')?.textContent || 'N/A';
                const destino = document.getElementById('ui-route-destination')?.textContent || 'N/A';

                let trafegoIn = document.getElementById('kpi-current-in')?.textContent || '--';
                let trafegoOut = document.getElementById('kpi-current-out')?.textContent || '--';
                const rx = document.getElementById('ui-rx-value')?.textContent || '--';

                const relatorio = `🚨 *Relatório de Rota NOC: ${nome}*\n\n` +
                    `📊 *Status Operacional:* ${status}\n` +
                    `📍 *Trecho:* ${origem} ➔ ${destino}\n` +
                    `📏 *Extensão Física:* ${dist}\n` +
                    `🔗 *Tráfego:* IN ${trafegoIn} | OUT ${trafegoOut}\n` +
                    `⚡ *Sinal Óptico:* ${rx}\n\n` +
                    `_Gerado via NOC Premium_`;

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(relatorio)
                        .then(() => ui.mostrarToast("Relatório copiado!", "success"))
                        .catch(() => ui.mostrarToast("Erro ao copiar.", "error"));
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = relatorio;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-999999px";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        ui.mostrarToast("Relatório copiado (Modo Rede Local)!", "success");
                    } catch (err) {
                        ui.mostrarToast("Navegador bloqueou a cópia.", "error");
                    }
                    textArea.remove();
                }
            }

            // ==========================================
            // MODO ISOLAR (Raio-X com Watchdog)
            // ==========================================
            if (target.matches('#btn-isolar-rota') || target.closest('#btn-isolar-rota')) {
                const btn = target.closest('#btn-isolar-rota');
                if (!state.rotaSelecionada) return;

                if (typeof state.isIsolatedMode === 'undefined') state.isIsolatedMode = false;
                state.isIsolatedMode = !state.isIsolatedMode;

                if (state.isIsolatedMode) {
                    btn.style.background = 'rgba(234, 179, 8, 0.15)';
                    btn.style.color = '#eab308';
                    btn.innerHTML = '<i class="ph ph-star-fill"></i> Restaurar';
                    ui.mostrarToast("Modo Isolar ativado.", "info");

                    const aplicarRaioX = () => {
                        if (mapa.linhasDesenhadas && mapa.linhasDesenhadas.length > 0) {
                            mapa.linhasDesenhadas.forEach(item => {
                                try {
                                    const linha = typeof item.setOptions === 'function' ? item : (item.linha || item.polyline || item.path);
                                    if (!linha) return;

                                    const rotaObj = item.rota || linha.rota || item;
                                    const idDaLinha = rotaObj.id || linha.id || item.id || item.rotaId || (linha.get && linha.get('id'));

                                    const isSelecionada = String(idDaLinha) === String(state.rotaSelecionada.id);

                                    if (isSelecionada) {
                                        linha.setOptions({ strokeOpacity: 1.0, zIndex: 9999 });
                                        if (linha.originalColor && linha.originalColor !== '#334155') {
                                            linha.setOptions({ strokeColor: linha.originalColor });
                                        }
                                    } else {
                                        const corAtual = linha.get('strokeColor');
                                        if (corAtual && corAtual !== '#334155') {
                                            linha.originalColor = corAtual;
                                            linha.originalOpacity = linha.get('strokeOpacity') || 1.0;
                                        }
                                        linha.setOptions({ strokeOpacity: 0.15, zIndex: 1, strokeColor: '#334155' });
                                    }
                                } catch (e) { }
                            });
                        }
                    };

                    aplicarRaioX();

                    if (!window.watchdogIsolar) {
                        window.watchdogIsolar = setInterval(() => {
                            if (!state.isIsolatedMode) {
                                clearInterval(window.watchdogIsolar);
                                window.watchdogIsolar = null;
                                return;
                            }
                            aplicarRaioX();
                        }, 1000);
                    }

                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = '#a1a1aa';
                    btn.innerHTML = '<i class="ph ph-star"></i> Isolar';
                    ui.mostrarToast("Visão normal restaurada.", "info");

                    if (window.watchdogIsolar) {
                        clearInterval(window.watchdogIsolar);
                        window.watchdogIsolar = null;
                    }

                    if (mapa.linhasDesenhadas) {
                        mapa.linhasDesenhadas.forEach(item => {
                            try {
                                const linha = typeof item.setOptions === 'function' ? item : (item.linha || item.polyline || item.path);
                                if (linha && linha.originalColor) {
                                    linha.setOptions({
                                        strokeOpacity: linha.originalOpacity || 1.0,
                                        zIndex: 2,
                                        strokeColor: linha.originalColor
                                    });
                                }
                            } catch (e) { }
                        });
                    }
                }
            }

            // ==========================================
            // MODO MANUTENÇÃO
            // ==========================================
            if (target.matches('#btn-manutencao-rota') || target.closest('#btn-manutencao-rota')) {
                if (!state.rotaSelecionada) return;
                const rota = state.rotaSelecionada;
                const ativa = !rota.manutencao_ativa;
                api.toggleManutencao(rota.id, ativa).then(() => {
                    rota.manutencao_ativa = ativa ? 1 : 0;
                    ui.atualizarBadgeManutencao(rota);
                    mapa.renderizarRotasNoMapa(state.rotasSalvas);
                    ui.mostrarToast(ativa ? 'Modo manutenção ativado.' : 'Modo manutenção desativado.', 'info');
                }).catch(e => {
                    ui.mostrarToast('Erro ao alternar manutenção.', 'error');
                });
            }

            // ========================================================
            // BUG 1 FIX: ABERTURA DO MODAL DE TELEMETRIA
            // ========================================================
            if (target.matches('#btn-abrir-analise-trafego') || target.closest('#btn-abrir-analise-trafego')) {
                state.abriuTelemetriaPelaGaveta = true; 
                ui.abrirModalTelemetria(state.rotaSelecionada);
            }
            if (target.matches('#cm-btn-historico') || target.closest('#cm-btn-historico')) {
                state.abriuTelemetriaPelaGaveta = false; 
                ui.abrirModalTelemetria(state.rotaSelecionada);
            }

            // ========================================================
            // BUG 1 FIX: FECHAMENTO INTELIGENTE DA TELEMETRIA
            // ========================================================
            if (target.matches('#close-traffic-modal') || target.closest('#close-traffic-modal')) {
                const modal = document.getElementById('traffic-analysis-modal');
                if (modal) modal.classList.remove('visible');
                if (state.trafficChartInstance) state.trafficChartInstance.destroy();
                if (state.rxChartInstance) state.rxChartInstance.destroy();
                
                // Inteligência de Roteamento (Volta para onde veio)
                if (state.abriuTelemetriaPelaGaveta) {
                    if (state.rotaSelecionada && ui.gaveta) ui.gaveta.classList.add('open');
                } else {
                    if (ui.gaveta) ui.gaveta.classList.remove('open', 'wide');
                }
                state.abriuTelemetriaPelaGaveta = false;
            }

            if (target.matches('#btn-refresh-traffic') || target.closest('#btn-refresh-traffic')) {
                const activePeriodBtn = document.querySelector('.period-button.active');
                const period = activePeriodBtn ? activePeriodBtn.getAttribute('data-period') : '1h';
                telemetria.renderizarWideChart(state.rotaSelecionada, period);
            }

            if (target.matches('.period-button')) {
                document.querySelectorAll('.period-button').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                    btn.style.color = '#94a3b8';
                });
                target.classList.add('active');
                target.style.background = '#3b82f6';
                target.style.color = 'white';

                const period = target.getAttribute('data-period');
                const checks = Array.from(document.querySelectorAll('.iface-check:checked')).map(cb => cb.value);
                const ativos = checks.length > 0 ? checks : ['0'];

                const dicionario = state.rotaSelecionada && state.rotaSelecionada.nomesResolvidos ? state.rotaSelecionada.nomesResolvidos : {};
                telemetria.renderizarWideChart(state.rotaSelecionada, period, ativos, dicionario);
            }

            // ==========================================
            // GAVETA: ABAS, SALVAR E FECHAR
            // ==========================================
            if (target.matches('.m-tab') || target.closest('.m-tab')) {
                const btn = target.closest('.m-tab');
                document.querySelectorAll('.m-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.m-tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');

                const targetId = btn.getAttribute('data-target');
                if (targetId && document.getElementById(targetId)) document.getElementById(targetId).classList.add('active');

                const drawerFooter = document.querySelector('.drawer-footer');
                if (drawerFooter) {
                    const abasSemFooter = ['tab-geral', 'visao-geral', 'tab-visao-geral', 'tab-trafego'];
                    drawerFooter.style.display = abasSemFooter.includes(targetId) ? 'none' : 'flex';
                }

                if (ui.gaveta) {
                    if (targetId === 'tab-trafego') ui.gaveta.classList.add('wide');
                    else ui.gaveta.classList.remove('wide');
                }

                if (targetId === 'tab-aparencia') {
                    setTimeout(() => ui.atualizarLivePreview(), 50);
                }
            }

            if (target.matches('#close-drawer-button') || target.closest('#close-drawer-button')) ui.fecharGaveta();
            if (target.matches('#modal-cancel-button') || target.closest('#modal-cancel-button')) ui.fecharGaveta();
            if (target.matches('#modal-save-button') || target.closest('#modal-save-button')) await ui.salvarRota();
            if (target.matches('#delete-route-button') || target.closest('#delete-route-button')) await ui.excluirRota();

            // ==========================================
            // GAVETA: ESTILO E PRESETS (ABA APARÊNCIA)
            // ==========================================
            if (target.matches('.style-card') || target.closest('.style-card')) {
                const card = target.closest('.style-card');
                document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                const hiddenInput = document.getElementById('route-style-select');
                if (hiddenInput) { hiddenInput.value = card.getAttribute('data-style'); ui.atualizarLivePreview(); }
                
                // UX/UI FIX: Desliga o preset pois o utilizador customizou
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            }
            if (target.matches('.color-btn')) {
                const routeColorInput = document.getElementById('route-color');
                if (routeColorInput) { routeColorInput.value = target.getAttribute('data-color'); ui.atualizarLivePreview(); }
                
                // UX/UI FIX: Desliga o preset pois o utilizador customizou
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            }

            if (target.matches('.btn-preset') || target.closest('.btn-preset')) {
                const btn = target.closest('.btn-preset');
                const preset = btn.getAttribute('data-preset');

                const inputColor = document.getElementById('route-color');
                const inputStyle = document.getElementById('route-style-select');
                const inputWidth = document.getElementById('route-width');
                const displayWidth = document.getElementById('width-display-value');

                if (preset === 'backbone') {
                    if (inputColor) inputColor.value = '#3b82f6';
                    if (inputStyle) inputStyle.value = 'neon';
                    if (inputWidth) inputWidth.value = 6;
                }
                else if (preset === 'backup') {
                    if (inputColor) inputColor.value = '#94a3b8';
                    if (inputStyle) inputStyle.value = 'tracejada';
                    if (inputWidth) inputWidth.value = 3;
                }
                else if (preset === 'cliente') {
                    if (inputColor) inputColor.value = '#10b981';
                    if (inputStyle) inputStyle.value = 'solida';
                    if (inputWidth) inputWidth.value = 2;
                }

                if (displayWidth && inputWidth) displayWidth.textContent = inputWidth.value + ' px';

                document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
                if (inputStyle) {
                    const cardAtivo = document.querySelector(`.style-card[data-style="${inputStyle.value}"]`);
                    if (cardAtivo) cardAtivo.classList.add('active');
                }

                // UX/UI FIX: Acende o preset clicado e apaga os restantes
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                ui.atualizarLivePreview();
            }

            // Sliders de glow e dash
            if (target.matches('#route-glow, #route-dash')) {
                ui.atualizarLivePreview();
            }

            // ==========================================
            // ALARMES E INVENTÁRIO
            // ==========================================
            if (target.matches('#btn-problemas') || target.closest('#btn-problemas')) {
                const panel = document.getElementById('alarm-panel');
                if (panel) panel.classList.toggle('open');
            }
            if (target.matches('#close-alarm-panel') || target.closest('#close-alarm-panel')) {
                const panel = document.getElementById('alarm-panel');
                if (panel) panel.classList.remove('open');
            }
            if (target.matches('#btn-limpar-alarmes') || target.closest('#btn-limpar-alarmes')) {
                ui.mostrarConfirmacao("Tem certeza que deseja limpar os alarmes resolvidos do painel?", async () => {
                    try {
                        await api.limparAlarmes();
                        ui.mostrarToast("Alarmes resolvidos foram limpos!", "success");
                    } catch (e) { ui.mostrarToast("Erro ao limpar os alarmes.", "error"); }
                }, "Limpar Alarmes");
            }

            if (target.matches('#open-inventory-button') || target.closest('#open-inventory-button')) ui.abrirModalInventario();
            if (target.matches('#close-inventory-button') || target.closest('#close-inventory-button')) {
                const modal = document.getElementById('inventory-modal');
                if (modal) modal.classList.remove('visible');
            }
            if (target.closest('.inv-btn-focar')) {
                const btn = target.closest('.inv-btn-focar');
                const rota = state.rotasSalvas.find(r => r.id == btn.getAttribute('data-id'));
                if (rota) { document.getElementById('inventory-modal').classList.remove('visible'); mapa.focarRota(rota); }
            }
            if (target.closest('.inv-btn-editar')) {
                const btn = target.closest('.inv-btn-editar');
                const rota = state.rotasSalvas.find(r => r.id == btn.getAttribute('data-id'));
                if (rota) { document.getElementById('inventory-modal').classList.remove('visible'); ui.abrirGaveta(rota); }
            }

            if (target.id === 'command-palette-overlay') ui.fecharCommandPalette();

            if (target.matches('#toggle-minimap-btn') || target.closest('#toggle-minimap-btn')) {
                const wrapper = document.getElementById('minimap-wrapper');
                const icon = document.getElementById('toggle-minimap-icon');
                if (wrapper && icon) {
                    wrapper.classList.toggle('collapsed');
                    if (wrapper.classList.contains('collapsed')) {
                        icon.classList.remove('ph-caret-up'); icon.classList.add('ph-caret-down');
                    } else {
                        icon.classList.remove('ph-caret-down'); icon.classList.add('ph-caret-up');
                        if (state.minimapInstance && state.rotaSelecionada) {
                            setTimeout(() => { google.maps.event.trigger(state.minimapInstance, 'resize'); mapa.renderizarMinimapa(state.rotaSelecionada); }, 300);
                        }
                    }
                }
            }
        }); 

        // =====================================================================
        // EVENTOS DE INPUT E CHANGE (Fora do clique)
        // =====================================================================
        const routeColorInput = document.getElementById('route-color');
        const routeWidthInput = document.getElementById('route-width');
        const widthDisplay = document.getElementById('width-display-value');

        if (routeColorInput) {
            routeColorInput.addEventListener('input', () => {
                ui.atualizarLivePreview();
                // UX/UI FIX: Desliga presets
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            });
        }
        
        if (routeWidthInput) {
            routeWidthInput.addEventListener('input', (e) => {
                if (widthDisplay) widthDisplay.textContent = e.target.value + ' px';
                ui.atualizarLivePreview();
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            });
        }

        const glowInput = document.getElementById('route-glow');
        const dashInput = document.getElementById('route-dash');
        if (glowInput) glowInput.addEventListener('input', () => ui.atualizarLivePreview());
        if (dashInput) dashInput.addEventListener('input', () => ui.atualizarLivePreview());

        document.addEventListener('change', (event) => {
            if (event.target.id === 'dark-mode-checkbox') mapa.alternarModoEscuro(event.target.checked);
            if (event.target.id === 'snap-to-road-checkbox') {
                state.isSnapToRoadEnabled = event.target.checked;
                ui.mostrarToast(`Ímã de Ruas ${event.target.checked ? "Ativado" : "Desativado"}.`, "info");
            }
        });

        // =====================================================================
        // ATALHOS DE TECLADO (Command Palette)
        // =====================================================================
        let cmdSelectedIndex = -1;
        document.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('command-palette-overlay');
            const isPaletteOpen = overlay && overlay.style.display === 'flex';

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (isPaletteOpen) ui.fecharCommandPalette();
                else { cmdSelectedIndex = -1; ui.abrirCommandPalette(); }
                return;
            }

            if (isPaletteOpen) {
                if (e.key === 'Escape') ui.fecharCommandPalette();
                else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const results = document.querySelectorAll('.cp-result-item');
                    if (cmdSelectedIndex < results.length - 1) cmdSelectedIndex++;
                    ui.atualizarSelecaoPaleta(cmdSelectedIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (cmdSelectedIndex > 0) cmdSelectedIndex--;
                    ui.atualizarSelecaoPaleta(cmdSelectedIndex);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const results = document.querySelectorAll('.cp-result-item');
                    if (cmdSelectedIndex >= 0 && results[cmdSelectedIndex]) results[cmdSelectedIndex].click();
                    else if (results.length === 1) results[0].click();
                }
                return;
            }

            // Atalhos globais do drawer
            if (e.key === 'Escape' && ui.gaveta && ui.gaveta.classList.contains('open')) {
                ui.fecharGaveta();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                const saveBtn = document.getElementById('modal-save-button');
                if (saveBtn && ui.gaveta && ui.gaveta.classList.contains('open')) {
                    e.preventDefault();
                    saveBtn.click();
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const copyBtn = document.getElementById('btn-smart-copy');
                if (copyBtn && ui.gaveta && ui.gaveta.classList.contains('open') && !e.target.closest('input,textarea,select,[contenteditable]')) {
                    e.preventDefault();
                    copyBtn.click();
                }
                return;
            }
        });

        const cpInput = document.getElementById('command-palette-input');
        if (cpInput) {
            cpInput.addEventListener('input', (e) => {
                cmdSelectedIndex = -1;
                ui.renderizarResultadosBusca(e.target.value);
            });
        }
    },

    // =====================================================================
    // FUNÇÃO CENTRALIZADA DE TELEMETRIA
    // =====================================================================
    abrirModalTelemetria: (rota) => {
        if (!rota) return;
        
        const modal = document.getElementById('traffic-analysis-modal');
        if (modal) modal.classList.add('visible');
        if (ui.gaveta) ui.gaveta.classList.remove('open');
        
        ui.esconderHoverCard();
        ui.esconderMenuContexto();

        const listContainer = document.getElementById('interface-list-container');
        if (!listContainer) return;

        listContainer.innerHTML = '<div style="padding: 30px 10px; text-align: center; color: #3b82f6;"><i class="ph ph-spinner-gap ph-spin" style="font-size: 28px; animation: spin 1s linear infinite;"></i><p style="font-size: 11px; margin-top: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Sincronizando portas...</p><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style></div>';

        const resolverNomes = async () => {
            if (rota.nomesResolvidos) return rota.nomesResolvidos; 

            let dicionario = {};
            try {
                const idBase = (rota.zabbix_items.in && rota.zabbix_items.in[0]) || (rota.zabbix_items.out && rota.zabbix_items.out[0]);
                if (idBase) {
                    const resItem = await fetch(`${state.API_URL_BASE}/zabbix/items/${idBase}`);
                    const details = await resItem.json();

                    if (details && details.hosts && details.hosts.length > 0) {
                        const hostId = details.hosts[0].hostid;
                        const resAll = await fetch(`${state.API_URL_BASE}/zabbix/hosts/${hostId}/items`);
                        const allItems = await resAll.json();

                        allItems.forEach(it => {
                            let limpo = it.name.replace(/Traffic IN |Traffic OUT |Incoming network traffic on |Outgoing network traffic on |Interface /ig, '').trim();
                            limpo = limpo.split('[')[0].trim();
                            dicionario[it.itemid] = limpo;
                        });
                    }
                }
            } catch (e) { console.error("Erro ao resolver nomes dinamicamente:", e); }

            rota.nomesResolvidos = dicionario;
            return dicionario;
        };

        resolverNomes().then(dicionarioNomes => {
            listContainer.innerHTML = '';
            let interfacesSelecionadas = ['0'];

            let numPorts = 0;
            if (rota.zabbix_items) {
                const lenIn = rota.zabbix_items.in ? rota.zabbix_items.in.length : 0;
                const lenOut = rota.zabbix_items.out ? rota.zabbix_items.out.length : 0;
                numPorts = Math.max(lenIn, lenOut);
                if (numPorts === 0 && rota.zabbix_items.rx && rota.zabbix_items.rx.length > 0) numPorts = 1;
            }

            for (let index = 0; index < numPorts; index++) {
                const idIn = rota.zabbix_items.in ? rota.zabbix_items.in[index] : null;
                const idOut = rota.zabbix_items.out ? rota.zabbix_items.out[index] : null;
                const idRx = rota.zabbix_items.rx ? rota.zabbix_items.rx[index] : null;

                const idRef = idIn || idOut || idRx;
                let nomeReal = dicionarioNomes[idRef] || `Interface ${index + 1}`;

                const isActive = index === 0 ? 'active' : '';
                const isChecked = index === 0 ? 'checked' : '';

                const card = document.createElement('div');
                card.className = `iface-card ${isActive}`;
                card.setAttribute('data-idx', index);
                card.innerHTML = `
                    <div class="iface-info">
                        <span class="iface-name" title="${nomeReal}">${nomeReal}</span>
                        <span class="iface-status">Online</span>
                    </div>
                    <input type="checkbox" class="iface-check" value="${index}" ${isChecked}>
                `;
                listContainer.appendChild(card);
            }

            const atualizarGrafico = () => {
                const atualContainer = document.getElementById('interface-list-container');
                if (!atualContainer) return;

                const checks = Array.from(atualContainer.querySelectorAll('.iface-check:checked')).map(cb => cb.value);
                const ativos = checks.length > 0 ? checks : ['0'];

                atualContainer.querySelectorAll('.iface-card').forEach(c => {
                    if (ativos.includes(c.getAttribute('data-idx'))) c.classList.add('active');
                    else c.classList.remove('active');
                });

                const activePeriodBtn = document.querySelector('.period-button.active');
                const periodAtivo = activePeriodBtn ? activePeriodBtn.getAttribute('data-period') : '1h';

                telemetria.renderizarWideChart(rota, periodAtivo, ativos, dicionarioNomes);
            };

            const novoContainer = listContainer.cloneNode(true);
            listContainer.parentNode.replaceChild(novoContainer, listContainer);

            novoContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.iface-card');
                if (!card || e.target.classList.contains('iface-check')) return;

                const idx = card.getAttribute('data-idx');
                novoContainer.querySelectorAll('.iface-check').forEach(cb => cb.checked = (cb.value === idx));
                atualizarGrafico();
            });

            novoContainer.addEventListener('change', (e) => {
                if (e.target.classList.contains('iface-check')) atualizarGrafico();
            });

            telemetria.renderizarWideChart(rota, '1h', interfacesSelecionadas, dicionarioNomes);
        });
    },

    atualizarLivePreview: () => {
        const previewLine = document.getElementById('preview-line');
        if (!previewLine) return;

        const routeColorInput = document.getElementById('route-color');
        const routeWidthInput = document.getElementById('route-width');
        const routeStyleSelect = document.getElementById('route-style-select');
        const routeGlowInput = document.getElementById('route-glow');
        const routeDashInput = document.getElementById('route-dash');

        const color = routeColorInput ? routeColorInput.value : '#3b82f6';
        const width = routeWidthInput ? routeWidthInput.value : '3';
        const style = routeStyleSelect ? routeStyleSelect.value : 'solida';
        const glow = routeGlowInput ? parseInt(routeGlowInput.value) : 10;
        const dash = routeDashInput ? parseInt(routeDashInput.value) : 25;

        previewLine.style.height = `${width}px`;
        previewLine.style.color = color;
        previewLine.className = ''; 
        previewLine.style.backgroundColor = color;
        previewLine.style.boxShadow = 'none';

        document.getElementById('glow-control').style.display = style === 'neon' ? 'block' : 'none';
        document.getElementById('dash-control').style.display = style === 'tracejada' ? 'block' : 'none';

        if (style === 'tracejada') {
            previewLine.classList.add('preview-tracejada');
        }
        else if (style === 'setas') {
            previewLine.classList.add('preview-setas');
        }
        else if (style === 'neon') {
            previewLine.style.backgroundColor = color;
            previewLine.style.setProperty('--glow-intensity', glow);
            previewLine.classList.add('preview-neon');
        }
        else if (style === 'particulas') {
            previewLine.style.backgroundColor = 'transparent';
            previewLine.classList.add('preview-particulas');
        }

        const glowDisplay = document.getElementById('glow-display-value');
        if (glowDisplay) glowDisplay.textContent = glow;
        const dashDisplay = document.getElementById('dash-display-value');
        if (dashDisplay) dashDisplay.textContent = dash;
    },

    abrirGaveta: async (rota) => {
        // TRAVA ANTI-SOBREPOSIÇÃO (Bug Gaveta Zumbi)
        const modalTelemetria = document.getElementById('traffic-analysis-modal');
        if (modalTelemetria && modalTelemetria.classList.contains('visible')) {
            return;
        }

        const statusEl = document.getElementById('ui-status-badge');
        const statusCard = document.querySelector('.card-status');
        if (statusEl) {
            statusEl.style.cssText = '';
            const alerta = rota ? (rota.corDeAlerta ? rota.corDeAlerta.toUpperCase() : null) : null;

            if (rota && rota.manutencao_ativa) {
                statusEl.textContent = 'Manutenção';
                statusEl.className = 'stat-value badge';
                statusEl.style.background = 'rgba(245, 158, 11, 0.2)';
                statusEl.style.color = '#f59e0b';
                statusEl.style.border = '1px solid rgba(245, 158, 11, 0.4)';
                if (statusCard) statusCard.style.borderLeftColor = '#f59e0b';
            } else if (alerta === '#FF0000') {
                statusEl.textContent = 'DOWN';
                statusEl.className = 'stat-value badge badge-danger';
                if (statusCard) statusCard.style.borderLeftColor = '#ef4444';
            } else if (alerta === '#FFFF00') {
                statusEl.textContent = 'Saturado';
                statusEl.className = 'stat-value badge badge-warning';
                if (statusCard) statusCard.style.borderLeftColor = '#f59e0b';
            } else if (alerta === '#8B5CF6') {
                statusEl.textContent = 'Alta Carga';
                statusEl.className = 'stat-value badge';
                statusEl.style.background = 'rgba(139, 92, 246, 0.15)';
                statusEl.style.color = '#a78bfa';
                statusEl.style.border = '1px solid rgba(139, 92, 246, 0.3)';
                if (statusCard) statusCard.style.borderLeftColor = '#8b5cf6';
            } else {
                statusEl.textContent = 'Operacional';
                statusEl.className = 'stat-value badge badge-success';
                if (statusCard) statusCard.style.borderLeftColor = '#10b981';
            }
        }
        state.rotaSelecionada = rota;
        state.isEditingRoute = true;

        if (ui.gaveta) {
            ui.gaveta.classList.remove('wide');
            ui.gaveta.classList.add('open');
        }

        const drawerHeader = document.querySelector('.drawer-header');
        if (drawerHeader && rota) drawerHeader.style.setProperty('--route-accent', rota.cor || '#3b82f6');

        const btnExcluir = document.getElementById('delete-route-button');
        
        // Garante que abre sempre na Aba Visão Geral ao abrir a gaveta
        const tabVisaoGeral = document.querySelector('.m-tab[data-target="visao-geral"]') || 
                              document.querySelector('.m-tab[data-target="tab-visao-geral"]') || 
                              document.querySelector('.m-tab[data-target="tab-geral"]');

        if (tabVisaoGeral) {
            tabVisaoGeral.click();
        } else {
            const primeiraAba = document.querySelector('.m-tab');
            if (primeiraAba) primeiraAba.click();
        }

        if (rota) {
            if (btnExcluir) btnExcluir.style.display = 'inline-block';
     
            const idsInput = {
                'route-name': rota.nome_rota || '',
                'route-color': rota.cor || '#3b82f6',
                'route-width': rota.espessura || '3',
                'route-glow': rota.glow || '10',
                'route-dash': rota.dash || '25',
                'route-capacity': rota.capacidade || ''
            };

            for (const [id, valor] of Object.entries(idsInput)) {
                const el = document.getElementById(id); if (el) el.value = valor;
            }

            if (window.jQuery) {
                window.jQuery('#route-style-select').val(rota.estilo || 'solida');
                window.jQuery('#route-type-select').val(rota.tipo_rota || 'agregado').trigger('change');
                window.jQuery('#route-capacity-unit').val(rota.unidade || 'Gbps').trigger('change');
            }

            const capBarFill = document.getElementById('capacity-bar-fill');
            const capLabel = document.getElementById('capacity-label');
            if (capBarFill && capLabel) {
                const cap = parseFloat(rota.capacidade) || 0;
                const unidade = rota.unidade || 'Gbps';
                if (cap > 0) {
                    const maxRef = unidade.toLowerCase() === 'gbps' ? 100 : 100000;
                    const pct = Math.min((cap / maxRef) * 100, 100);
                    capBarFill.style.width = `${pct}%`;
                    capBarFill.style.background = pct > 80 ? '#f59e0b' : pct > 50 ? '#3b82f6' : '#10b981';
                    capLabel.textContent = `${cap} ${unidade.toUpperCase()}`;
                } else {
                    capBarFill.style.width = '0%';
                    capBarFill.style.background = '#475569';
                    capLabel.textContent = 'Não configurada';
                }
            }

            // CONFIG STATUS BADGE
            const configBadge = document.getElementById('config-status-badge');
            if (configBadge) {
                const hasItems = rota.zabbix_items && ((rota.zabbix_items.in && rota.zabbix_items.in.length > 0) || (rota.zabbix_items.out && rota.zabbix_items.out.length > 0));
                if (hasItems) {
                    configBadge.textContent = 'Configurado';
                    configBadge.className = 'badge badge-success';
                } else {
                    configBadge.textContent = 'Não configurado';
                    configBadge.className = 'badge badge-neutral';
                }
            }

            document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
            const cardAtivo = document.querySelector(`.style-card[data-style="${rota.estilo || 'solida'}"]`);
            if (cardAtivo) cardAtivo.classList.add('active');

            ui.atualizarBadgeManutencao(rota);

            // INTELIGÊNCIA GEOGRÁFICA
            const elDist = document.getElementById('route-distance-value');
            const elOrigem = document.getElementById('ui-route-origin');
            const elDestino = document.getElementById('ui-route-destination');

            if (elDist) elDist.textContent = 'Calculando...';
            if (elOrigem) elOrigem.textContent = 'Buscando...';
            if (elDestino) elDestino.textContent = 'Buscando...';

            if (rota.coordenadas && window.google && google.maps.geometry) {
                const coords = typeof rota.coordenadas === 'string' ? JSON.parse(rota.coordenadas) : rota.coordenadas;

                if (coords.length > 0) {
                    const path = coords.map(c => new google.maps.LatLng(
                        parseFloat(typeof c.lat === 'function' ? c.lat() : c.lat),
                        parseFloat(typeof c.lng === 'function' ? c.lng() : c.lng)
                    ));

                    const metros = google.maps.geometry.spherical.computeLength(path);
                    if (elDist) elDist.textContent = metros < 1000 ? Math.round(metros) + ' m' : (metros / 1000).toFixed(2) + ' km';

                    if (path.length >= 2) {
                        if (rota.nomesGeograficosResolvidos) {
                            if (elOrigem) elOrigem.textContent = rota.origem_nome_cache;
                            if (elDestino) elDestino.textContent = rota.destino_nome_cache;
                        } else {
                            const geocoder = new google.maps.Geocoder();

                            const extrairLocal = (latLngObj, el, tipoPonto) => {
                                geocoder.geocode({ location: latLngObj }, (results, status) => {
                                    if (status === 'OK' && results[0]) {
                                        const getCmp = (tipo) => results[0].address_components.find(c => c.types.includes(tipo))?.long_name;

                                        const bairro = getCmp('sublocality') || getCmp('neighborhood');
                                        const cidade = getCmp('administrative_area_level_2') || getCmp('locality');

                                        let nomeFinal = 'Área Rural / Rodovia';
                                        if (cidade) nomeFinal = bairro ? `${bairro}, ${cidade}` : cidade;

                                        if (el) el.textContent = nomeFinal;

                                        if (tipoPonto === 'origem') rota.origem_nome_cache = nomeFinal;
                                        if (tipoPonto === 'destino') rota.destino_nome_cache = nomeFinal;

                                    } else {
                                        if (el) el.textContent = 'Mapeamento Indisponível';
                                        if (tipoPonto === 'origem') rota.origem_nome_cache = 'Mapeamento Indisponível';
                                        if (tipoPonto === 'destino') rota.destino_nome_cache = 'Mapeamento Indisponível';
                                    }

                                    rota.nomesGeograficosResolvidos = true;
                                });
                            };

                            extrairLocal(path[0], elOrigem, 'origem');
                            extrairLocal(path[path.length - 1], elDestino, 'destino');
                        }
                    }
                }
            }

            await ui.carregarMetadadosZabbix(rota);

            if (typeof telemetria.atualizarPainelSaude === 'function') {
                telemetria.atualizarPainelSaude(rota);
                telemetria.iniciarRelogio();
                telemetria.renderizarSparklineGeral(rota);
            }

            ui.atualizarSaudeItens(rota);

            const idBar = document.getElementById('route-identity-bar');
            const idDot = document.getElementById('route-id-dot');
            const idName = document.getElementById('route-id-name');
            const idPath = document.getElementById('route-id-path');
            if (idBar && idDot && idName && idPath && rota) {
                idDot.style.background = rota.cor || '#3b82f6';
                idName.textContent = rota.nome_rota || '';
                idBar.style.display = 'flex';
                setTimeout(() => {
                    const orig = (document.getElementById('ui-route-origin') || {}).textContent || '';
                    const dest = (document.getElementById('ui-route-destination') || {}).textContent || '';
                    idPath.textContent = `${orig} → ${dest}`.replace('Buscando... → Buscando...', 'Carregando...');
                }, 500);
            }

            if (rota.zabbix_items && rota.zabbix_items.rx && rota.zabbix_items.rx.length > 0) {
                setTimeout(() => {
                    if (typeof telemetria.renderizarRX === 'function') {
                        telemetria.renderizarRX(rota.zabbix_items.rx[0]);
                    }
                }, 300);
            }

            setTimeout(() => {
                mapa.renderizarMinimapa(rota);
                setTimeout(() => {
                    const mc = document.getElementById('minimap-container');
                    if (mc && mc.querySelector('iframe')) {
                        const evt = new Event('resize');
                        window.dispatchEvent(evt);
                    }
                }, 200);
            }, 600);

        } else {
            if (btnExcluir) btnExcluir.style.display = 'none';

            ui.limparCamposFormulario();
            await ui.popularGroupsDropdown();
        }

        ui.atualizarLivePreview();
        setTimeout(() => { state.isEditingRoute = false; }, 500);
    },

    mostrarHoverCard: (rota) => {
        const card = document.getElementById('route-hover-card');
        if (!card) return;

        card.style.left = (state.mouseX + 15) + 'px';
        card.style.top = (state.mouseY + 15) + 'px';

        const nomeEl = document.getElementById('hc-route-name');
        if (nomeEl) nomeEl.textContent = rota.nome_rota || 'Rota sem nome';

        let distanciaFormatada = '--';
        if (window.google && google.maps && google.maps.geometry && rota.coordenadas) {
            const coords = typeof rota.coordenadas === 'string' ? JSON.parse(rota.coordenadas) : rota.coordenadas;
            const path = coords.map(c => new google.maps.LatLng(typeof c.lat === 'function' ? c.lat() : c.lat, typeof c.lng === 'function' ? c.lng() : c.lng));
            const metros = google.maps.geometry.spherical.computeLength(path);
            distanciaFormatada = metros < 1000 ? Math.round(metros) + ' m' : (metros / 1000).toFixed(2) + ' km';
        }

        let valorIn = 0, valorOut = 0, piorRx = null, arrayRx = [];
        if (rota.zabbix_items && state.zabbixCacheLocal) {
            if (rota.zabbix_items.in) rota.zabbix_items.in.forEach(id => { if (state.zabbixCacheLocal[id]) valorIn += parseFloat(state.zabbixCacheLocal[id].current) || 0; });
            if (rota.zabbix_items.out) rota.zabbix_items.out.forEach(id => { if (state.zabbixCacheLocal[id]) valorOut += parseFloat(state.zabbixCacheLocal[id].current) || 0; });

            if (rota.zabbix_items.rx) {
                rota.zabbix_items.rx.forEach(id => {
                    if (state.zabbixCacheLocal[id]) {
                        const v = parseFloat(state.zabbixCacheLocal[id].current);
                        arrayRx.push(v.toFixed(2));
                        if (piorRx === null || v < piorRx) piorRx = v;
                    }
                });
            }
        }

        let statusText = 'UP'; let statusClass = 'up';
        const alerta = rota.corDeAlerta ? rota.corDeAlerta.toUpperCase() : null;

        if (rota.manutencao_ativa) {
            statusText = 'MANUT'; statusClass = 'maint';
        } else if (alerta === '#FF0000') {
            statusText = 'DOWN'; statusClass = 'down';
        }
        else if (alerta === '#FFFF00') {
            statusText = 'SATURADO'; statusClass = 'warning';
        }
        else if (alerta === '#8B5CF6') {
            statusText = 'ALTA CARGA'; statusClass = 'critical';
        }

        const badgeEl = document.getElementById('hc-badge');
        const dotEl = document.getElementById('hc-dot');
        if (badgeEl) { badgeEl.textContent = statusText; badgeEl.className = `hc-badge ${statusClass}`; }
        if (dotEl) { dotEl.className = `hc-status-dot ${statusClass}`; }

        const distEl = document.getElementById('hc-dist');
        if (distEl) distEl.textContent = distanciaFormatada;

        const capEl = document.getElementById('hc-cap');
        if (capEl) capEl.textContent = (rota.capacidade || '--') + ' ' + (rota.unidade || 'Gbps').toUpperCase();

        const formatarMbps = (bps) => bps > 0 ? (bps / 1000000).toFixed(2) + ' Mbps' : '-- Mbps';
        const inEl = document.getElementById('hc-in');
        const outEl = document.getElementById('hc-out');
        if (inEl) inEl.textContent = formatarMbps(valorIn);
        if (outEl) outEl.textContent = formatarMbps(valorOut);

        const rxEl = document.getElementById('hc-rx');
        if (rxEl) {
            if (arrayRx.length > 0) {
                rxEl.textContent = arrayRx.join(' / ') + ' dBm';
                rxEl.style.color = piorRx < -25 ? '#ef4444' : '#10b981';
            } else {
                rxEl.textContent = '-- dBm';
                rxEl.style.color = '#94a3b8';
            }
        }

        const maintRow = document.getElementById('hc-maint-row');
        if (maintRow) {
            maintRow.style.display = rota.manutencao_ativa ? 'flex' : 'none';
        }
        const maintTag = document.getElementById('hc-maint-tag');
        if (maintTag) maintTag.style.display = 'none';

        telemetria.renderizarSparklineHover(rota);
        card.style.display = 'block';
    },

    esconderHoverCard: () => {
        const card = document.getElementById('route-hover-card');
        if (card) card.style.display = 'none';
        if (state.sparklineChartInstance) { state.sparklineChartInstance.destroy(); state.sparklineChartInstance = null; }
    },

    abrirMenuContexto: (rota) => {
        const menu = document.getElementById('route-context-menu');
        if (!menu) return;
        state.rotaSelecionada = rota;
        const nomeCm = document.getElementById('cm-route-name');
        if (nomeCm) nomeCm.textContent = rota.nome_rota || 'Rota sem nome';
        menu.style.left = state.mouseX + 'px';
        menu.style.top = state.mouseY + 'px';
        menu.style.display = 'block';
    },

    esconderMenuContexto: () => {
        const menu = document.getElementById('route-context-menu');
        if (menu) menu.style.display = 'none';
    },

    abrirModalInventario: () => {
        const modal = document.getElementById('inventory-modal');
        const tbody = document.getElementById('inventory-table-body');
        if (!modal || !tbody) return;

        tbody.innerHTML = '';
        if (!state.rotasSalvas || state.rotasSalvas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #64748b;">Nenhuma rota registada no banco de dados.</td></tr>';
        } else {
            state.rotasSalvas.forEach(rota => {
                let distanciaFormatada = '--';
                if (window.google && google.maps && google.maps.geometry && rota.coordenadas) {
                    const coords = typeof rota.coordenadas === 'string' ? JSON.parse(rota.coordenadas) : rota.coordenadas;
                    if (coords.length > 0) {
                        const path = coords.map(c => new google.maps.LatLng(typeof c.lat === 'function' ? c.lat() : c.lat, typeof c.lng === 'function' ? c.lng() : c.lng));
                        const metros = google.maps.geometry.spherical.computeLength(path);
                        distanciaFormatada = metros < 1000 ? Math.round(metros) + ' m' : (metros / 1000).toFixed(2) + ' km';
                    }
                }
                const capacidadeLabel = rota.capacidade ? `${rota.capacidade} ${(rota.unidade || 'Gbps').toUpperCase()}` : '--';
                const corBadge = rota.cor || '#3b82f6';

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
                tr.innerHTML = `
                    <td style="text-align: center; padding: 12px 10px;"><div style="width: 14px; height: 14px; border-radius: 4px; background: ${corBadge}; margin: 0 auto; box-shadow: 0 0 5px ${corBadge}40;"></div></td>
                    <td style="font-weight: 600; color: #e2e8f0; font-size: 13px;">${rota.nome_rota || 'Sem Nome'}</td>
                    <td style="color: #94a3b8; font-family: monospace; font-size: 13px;">${distanciaFormatada}</td>
                    <td><span class="badge badge-neutral" style="font-size: 10px;">${capacidadeLabel}</span></td>
                    <td style="text-align: right; padding-right: 24px;">
                        <button class="btn-secondary inv-btn-focar" data-id="${rota.id}" title="Focar no Mapa" style="padding: 4px 8px; font-size: 14px; margin-right: 4px;"><i class="ph ph-crosshair"></i></button>
                        <button class="btn-secondary inv-btn-editar" data-id="${rota.id}" title="Editar Configurações" style="padding: 4px 8px; font-size: 14px;"><i class="ph ph-pencil-simple"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        modal.classList.add('visible');
    },

    limparCamposFormulario: () => {
        const ids = ['route-name', 'route-capacity'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        const routeColor = document.getElementById('route-color'); if (routeColor) routeColor.value = '#3b82f6';
        const routeWidth = document.getElementById('route-width'); if (routeWidth) routeWidth.value = '3';
        const routeGlow = document.getElementById('route-glow'); if (routeGlow) routeGlow.value = '10';
        const routeDash = document.getElementById('route-dash'); if (routeDash) routeDash.value = '25';

        document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
        const cardSolida = document.querySelector(`.style-card[data-style="solida"]`);
        if (cardSolida) cardSolida.classList.add('active');

        if (window.jQuery) {
            window.jQuery('#route-style-select').val('solida');
            window.jQuery('#route-type-select').val('agregado').trigger('change');
            window.jQuery('#zabbix-group-select').val(null).trigger('change.select2');
            window.jQuery('#zabbix-host-select').val(null).trigger('change.select2');
            window.jQuery('#zabbix-item-in-select').val(null).trigger('change');
            window.jQuery('#zabbix-item-out-select').val(null).trigger('change');
            window.jQuery('#zabbix-item-rx-select').val(null).trigger('change');
        }

        const chartRxContainer = document.getElementById('chart-rx');
        if (chartRxContainer) chartRxContainer.innerHTML = '';

        const capFill = document.getElementById('capacity-bar-fill');
        const capLabel = document.getElementById('capacity-label');
        if (capFill) { capFill.style.width = '0%'; capFill.style.background = '#475569'; }
        if (capLabel) capLabel.textContent = 'Não configurada';

        if (typeof telemetria.atualizarPainelSaude === 'function') {
            telemetria.atualizarPainelSaude(null);
        }
        ui.atualizarLivePreview();
    },

    atualizarSaudeItens: (rota) => {
        const dots = document.querySelectorAll('.item-health-dot');
        dots.forEach(dot => {
            const target = dot.dataset.target;
            if (!target || !rota.zabbix_items || !rota.zabbix_items[target]) {
                dot.style.background = '#475569';
                return;
            }
            const ids = rota.zabbix_items[target];
            let hasData = false;
            ids.forEach(id => {
                if (state.zabbixCacheLocal && state.zabbixCacheLocal[id] && state.zabbixCacheLocal[id].current !== undefined && state.zabbixCacheLocal[id].current !== null) {
                    hasData = true;
                }
            });
            dot.style.background = hasData ? '#10b981' : '#ef4444';
        });
    },

    fecharGaveta: () => {
        // Trava anti-loop: impede aberturas acidentais via desenhoFinalizado
        state.isClosingDrawer = true;

        if (ui.gaveta) ui.gaveta.classList.remove('open', 'wide');

        if (state.isIsolatedMode) {
            const btnIsolar = document.getElementById('btn-isolar-rota');
            if (btnIsolar) btnIsolar.click();
        }

        state.rotaSelecionada = null;

        const drawerHeader = document.querySelector('.drawer-header');
        if (drawerHeader) drawerHeader.style.removeProperty('--route-accent');
        const idBar = document.getElementById('route-identity-bar');
        if (idBar) idBar.style.display = 'none';
        
        // Apenas cancela se o utilizador estava a desenhar
        if (state.isDrawing) {
            mapa.cancelarDesenho();
        }
        
        ui.limparCamposFormulario();

        setTimeout(() => { state.isClosingDrawer = false; }, 500);
    },

    carregarMetadadosZabbix: async (rota) => {
        try {
            const temConfig = rota.zabbix_items && (rota.zabbix_items.in.length > 0 || rota.zabbix_items.out.length > 0 || (rota.zabbix_items.rx && rota.zabbix_items.rx.length > 0) || (rota.zabbix_items.status && rota.zabbix_items.status.length > 0));
            if (temConfig && window.jQuery) {
                const primeiroItemId = rota.zabbix_items.in[0] || rota.zabbix_items.out[0] || (rota.zabbix_items.rx && rota.zabbix_items.rx[0]) || (rota.zabbix_items.status && rota.zabbix_items.status[0]);
                if (primeiroItemId) {
                    const res = await fetch(`${state.API_URL_BASE}/zabbix/items/${primeiroItemId}`);
                    const itemDetails = await res.json();
                    if (itemDetails && itemDetails.hosts && itemDetails.hosts.length > 0) {
                        const hostId = itemDetails.hosts[0].hostid;
                        let groupId = (itemDetails.groups && itemDetails.groups.length > 0) ? itemDetails.groups[0].groupid : '';
                        await ui.popularGroupsDropdown();
                        window.jQuery('#zabbix-group-select').val(groupId).trigger('change');
                        await ui.popularHostsDropdown(groupId);
                        window.jQuery('#zabbix-host-select').val(hostId).trigger('change');
                        await ui.popularItemsDropdowns(hostId);
                        window.jQuery('#zabbix-item-in-select').val(rota.zabbix_items.in).trigger('change');
                        window.jQuery('#zabbix-item-out-select').val(rota.zabbix_items.out).trigger('change');
                        window.jQuery('#zabbix-item-rx-select').val(rota.zabbix_items.rx || []).trigger('change');
                    }
                }
            } else {
                await ui.popularGroupsDropdown();
                if (window.jQuery) {
                    window.jQuery('#zabbix-group-select').val(null).trigger('change');
                    window.jQuery('#zabbix-host-select').val(null).trigger('change');
                    window.jQuery('#zabbix-item-in-select').val(null).trigger('change');
                    window.jQuery('#zabbix-item-out-select').val(null).trigger('change');
                    window.jQuery('#zabbix-item-rx-select').val(null).trigger('change');
                }
            }
        } catch (e) { console.error("Erro na sincronização Zabbix:", e); }
    },

    popularGroupsDropdown: async () => {
        const groupSelect = document.getElementById('zabbix-group-select');
        if (!groupSelect) return;
        try {
            const response = await fetch(`${state.API_URL_BASE}/zabbix/hostgroups`);
            const groups = await response.json();
            groupSelect.innerHTML = '<option value="">-- Todos os Grupos --</option>';
            groups.forEach(g => groupSelect.appendChild(new Option(g.name, g.groupid)));
        } catch (error) { groupSelect.innerHTML = '<option value="">Erro</option>'; }
    },

    popularHostsDropdown: async (groupId = '') => {
        const hostSelect = document.getElementById('zabbix-host-select');
        if (!hostSelect) return;
        try {
            const url = groupId ? `${state.API_URL_BASE}/zabbix/hosts?groupid=${groupId}` : `${state.API_URL_BASE}/zabbix/hosts`;
            const response = await fetch(url);
            const hosts = await response.json();
            hostSelect.innerHTML = '<option value="">-- Selecione um Host --</option>';
            hosts.forEach(h => hostSelect.appendChild(new Option(h.name, h.hostid)));
        } catch (error) { hostSelect.innerHTML = '<option value="">Erro</option>'; }
    },

    popularItemsDropdowns: async (hostId) => {
        if (!window.jQuery) return;
        const $in = window.jQuery('#zabbix-item-in-select');
        const $out = window.jQuery('#zabbix-item-out-select');
        const $rx = window.jQuery('#zabbix-item-rx-select');
        $in.empty().trigger('change'); $out.empty().trigger('change'); $rx.empty().trigger('change');
        if (!hostId) return;

        try {
            const response = await fetch(`${state.API_URL_BASE}/zabbix/hosts/${hostId}/items`);
            const items = await response.json();
            state.zabbixStatusItems = [];

            items.forEach(item => {
                const nomeItemMin = item.name.toLowerCase();
                const chaveItem = item.key_.toLowerCase();

                let nomeLimpo = item.name.replace(/(\s*-\s*Download|\s*-\s*Upload|Traffic IN |Traffic OUT |Incoming network traffic on |Outgoing network traffic on |Interface )/ig, '').trim();
                nomeLimpo = nomeLimpo.split('[')[0].trim();

                if (chaveItem.includes('status') || chaveItem.includes('operstatus')) {
                    state.zabbixStatusItems.push(item);
                    return;
                }

                if (nomeItemMin.includes('download') || chaveItem.includes('ifhcin')) {
                    $in.append(new Option(nomeLimpo, item.itemid, false, false));
                }
                else if (nomeItemMin.includes('upload') || chaveItem.includes('ifhcout')) {
                    $out.append(new Option(nomeLimpo, item.itemid, false, false));
                }
                else if (chaveItem.includes('rx[') || chaveItem.includes('rxtwo') || nomeItemMin.includes('rx power') || nomeItemMin.includes('rx ') || chaveItem.includes('rxpower')) {
                    let textoRxExibicao = nomeLimpo;

                    if (!nomeItemMin.includes('lane') && item.key_.match(/RxLane\d+/i)) {
                        let laneLimpa = item.key_.match(/RxLane\d+/i)[0]; 
                        textoRxExibicao = `${nomeLimpo} - ${laneLimpa}`;
                    }

                    $rx.append(new Option(textoRxExibicao, item.itemid, false, false));
                }
            });
        } catch (error) {
            console.error("Erro ao popular itens do Zabbix:", error);
        }
    },
    
    salvarRota: async () => {
        const itemsIn = window.jQuery ? window.jQuery('#zabbix-item-in-select').val() || [] : [];
        const itemsOut = window.jQuery ? window.jQuery('#zabbix-item-out-select').val() || [] : [];
        const itemsRx = window.jQuery ? window.jQuery('#zabbix-item-rx-select').val() || [] : [];
        let itemsStatus = [];

        let dicionarioNomes = {};
        const capturarNomes = (seletor) => {
            if (window.jQuery && window.jQuery(seletor).length) {
                window.jQuery(seletor).select2('data').forEach(item => {
                    let nomeLimpo = item.text.replace(/Traffic IN |Traffic OUT |Incoming network traffic on |Outgoing network traffic on |Interface /ig, '').trim();
                    nomeLimpo = nomeLimpo.split('[')[0].trim();
                    dicionarioNomes[item.id] = nomeLimpo;
                });
            }
        };
        capturarNomes('#zabbix-item-in-select');
        capturarNomes('#zabbix-item-out-select');
        capturarNomes('#zabbix-item-rx-select');

        if ((itemsIn.length > 0 || itemsOut.length > 0) && state.zabbixStatusItems) {
            const allSelectedData = [...window.jQuery('#zabbix-item-in-select').select2('data'), ...window.jQuery('#zabbix-item-out-select').select2('data')];
            allSelectedData.forEach(itemData => {
                const base = itemData.text.replace(' - Download', '').replace(' - Upload', '').trim();
                const sItem = state.zabbixStatusItems.find(i => i.name.startsWith(base));
                if (sItem && !itemsStatus.includes(sItem.itemid)) itemsStatus.push(sItem.itemid);
            });
        }

        const routeNameEl = document.getElementById('route-name');
        if (!routeNameEl || !routeNameEl.value.trim()) {
            ui.mostrarToast("Por favor, dê um nome para a rota.", "warning");
            return;
        }

        const dadosRota = {
            nome: routeNameEl.value.trim(),
            cor: document.getElementById('route-color').value,
            espessura: parseInt(document.getElementById('route-width').value) || 3,
            glow: parseInt(document.getElementById('route-glow').value) || 10,
            dash: parseInt(document.getElementById('route-dash').value) || 25,
            estilo: document.getElementById('route-style-select').value,
            tipo_rota: document.getElementById('route-type-select').value,
            capacidade: document.getElementById('route-capacity').value,
            unidade: document.getElementById('route-capacity-unit').value,
            itemsIn: itemsIn,
            itemsOut: itemsOut,
            itemsStatus: itemsStatus,
            itemsRx: itemsRx,
            dicionario_nomes: dicionarioNomes 
        };
        
        try {
            if (state.rotaSelecionada) {
                await api.atualizarRota(state.rotaSelecionada.id, dadosRota);
                ui.mostrarToast("Rota atualizada com sucesso!", "success");
            } else {
                dadosRota.coordenadas = state.coordenadasDaRotaAtual;
                await api.salvarRota(dadosRota);
                ui.mostrarToast("Nova rota criada com sucesso!", "success");
            }
            ui.fecharGaveta();
            const rotasAtualizadas = await api.getRotas();
            state.rotasSalvas = rotasAtualizadas;
            mapa.renderizarRotasNoMapa(state.rotasSalvas);
            ui.atualizarDashboard();
        } catch (error) { ui.mostrarToast("Erro ao comunicar com o servidor.", "error"); }
    },

    excluirRota: async () => {
        if (!state.rotaSelecionada) {
            return;
        }

        ui.mostrarConfirmacao(
            `Tem certeza que deseja excluir a rota "${state.rotaSelecionada.nome_rota}"?\nEsta ação não pode ser desfeita.`,
            async () => {
                try {
                    await api.eliminarRota(state.rotaSelecionada.id);

                    ui.mostrarToast("Rota excluída com sucesso!", "success");
                    ui.fecharGaveta();
                    const rotasAtualizadas = await api.getRotas();
                    state.rotasSalvas = rotasAtualizadas;
                    mapa.renderizarRotasNoMapa(state.rotasSalvas);
                    ui.atualizarDashboard();
                } catch (error) {
                    ui.mostrarToast("Erro ao excluir a rota.", "error");
                }
            },
            "Excluir Rota"
        );
    },

    mostrarConfirmacao: (mensagem, callbackAcao, textoBotaoAcao = "Confirmar") => {
        const existente = document.getElementById('custom-confirm-overlay');
        if (existente) existente.remove();

        const overlay = document.createElement('div');
        overlay.id = 'custom-confirm-overlay';

        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            z-index: 999999; opacity: 0; transition: opacity 0.2s ease-in-out;
        `;

        overlay.innerHTML = `
            <div id="custom-confirm-box" style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 24px; width: 90%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; transform: translateY(-20px); transition: transform 0.2s ease-in-out;">
                <div style="color: #ef4444; font-size: 36px; margin-bottom: 15px;"><i class="ph ph-warning-circle"></i></div>
                <div style="color: #f8fafc; font-size: 15px; font-weight: 500; margin-bottom: 24px; line-height: 1.5;">${mensagem}</div>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="custom-confirm-cancel" style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: transparent; color: #cbd5e1; font-weight: 600; cursor: pointer; transition: 0.2s;">Cancelar</button>
                    <button id="custom-confirm-ok" style="flex: 1; padding: 10px; border-radius: 6px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2);">${textoBotaoAcao}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = '1';
            document.getElementById('custom-confirm-box').style.transform = 'translateY(0)';
        }, 10);

        document.getElementById('custom-confirm-cancel').onclick = () => {
            overlay.style.opacity = '0';
            document.getElementById('custom-confirm-box').style.transform = 'translateY(-20px)';
            setTimeout(() => overlay.remove(), 200);
        };

        document.getElementById('custom-confirm-ok').onclick = () => {
            overlay.style.opacity = '0';
            document.getElementById('custom-confirm-box').style.transform = 'translateY(-20px)';
            callbackAcao();
            setTimeout(() => overlay.remove(), 200);
        };
    },

    mostrarToast: (mensagem, tipo = 'info') => {
        let container = document.getElementById('toast-container');
        if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
        const toast = document.createElement('div'); toast.className = `toast-item toast-${tipo}`;
        let icone = tipo === 'success' ? 'ph ph-check-circle' : tipo === 'error' ? 'ph ph-x-circle' : 'ph ph-warning';
        toast.innerHTML = `<div class="toast-icon"><i class="${icone}"></i></div><div class="toast-message">${mensagem}</div>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('toast-show'); }, 10);
        setTimeout(() => { toast.classList.remove('toast-show'); setTimeout(() => { toast.remove(); }, 400); }, 3500);
    },

    tornarWidgetArrastavel: (widgetId, posicaoPadraoX, posicaoPadraoY) => {
        const widget = document.getElementById(widgetId);
        if (!widget) return;
        const header = widget.querySelector('.noc-widget-header');
        const posSalva = localStorage.getItem('pos_' + widgetId);
        if (posSalva) {
            const pos = JSON.parse(posSalva);
            if (pos.x <= 0 && pos.y <= 0) { widget.style.left = posicaoPadraoX + 'px'; widget.style.top = posicaoPadraoY + 'px'; }
            else { widget.style.left = pos.x + 'px'; widget.style.top = pos.y + 'px'; }
        } else { widget.style.left = posicaoPadraoX + 'px'; widget.style.top = posicaoPadraoY + 'px'; }

        let isDragging = false, startX, startY, initialX, initialY;
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('widget-toggle')) return;
            isDragging = true; startX = e.clientX; startY = e.clientY;
            initialX = widget.offsetLeft; initialY = widget.offsetTop; widget.style.zIndex = 501;
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            widget.style.left = (initialX + (e.clientX - startX)) + 'px'; widget.style.top = (initialY + (e.clientY - startY)) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) { isDragging = false; widget.style.zIndex = 500; localStorage.setItem('pos_' + widgetId, JSON.stringify({ x: widget.offsetLeft, y: widget.offsetTop })); }
        });
    },

    abrirCommandPalette: () => {
        const overlay = document.getElementById('command-palette-overlay');
        const input = document.getElementById('command-palette-input');
        const results = document.getElementById('command-palette-results');
        if (overlay && input) { overlay.style.display = 'flex'; input.value = ''; if (results) results.innerHTML = ''; setTimeout(() => input.focus(), 50); }
    },

    fecharCommandPalette: () => { const overlay = document.getElementById('command-palette-overlay'); if (overlay) overlay.style.display = 'none'; },

    renderizarResultadosBusca: (termo) => {
        const resultsContainer = document.getElementById('command-palette-results');
        if (!resultsContainer) return;
        resultsContainer.innerHTML = ''; if (!termo.trim()) return;

        const termoMin = termo.toLowerCase();
        const rotasFiltradas = state.rotasSalvas.filter(r => r.nome_rota && r.nome_rota.toLowerCase().includes(termoMin));

        if (rotasFiltradas.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 15px 20px; color: #64748b; font-size: 13px; text-align: center;">Nenhuma rota encontrada para este termo.</div>'; return;
        }

        rotasFiltradas.forEach(rota => {
            const item = document.createElement('div'); item.className = 'cp-result-item';
            const dotCor = rota.cor || '#3b82f6';
            const cap = rota.capacidade ? `${rota.capacidade} ${(rota.unidade || 'Gbps').toUpperCase()}` : '';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;"><div style="width: 10px; height: 10px; border-radius: 50%; background: ${dotCor}; box-shadow: 0 0 8px ${dotCor}80;"></div><span style="font-weight: 600; font-size: 14px; color: #f8fafc;">${rota.nome_rota}</span></div>
                <div style="display: flex; align-items: center; gap: 15px;"><span style="color: #64748b; font-size: 12px; font-family: monospace;">${cap}</span><i class="ph ph-arrow-right" style="color: #3b82f6; font-size: 16px;"></i></div>
            `;
            item.onclick = () => { ui.fecharCommandPalette(); mapa.focarRota(rota); };
            resultsContainer.appendChild(item);
        });
    },

    atualizarSelecaoPaleta: (index) => {
        const items = document.querySelectorAll('.cp-result-item');
        items.forEach((item, i) => {
            if (i === index) { item.classList.add('active'); item.style.background = 'rgba(59, 130, 246, 0.15)'; item.scrollIntoView({ block: 'nearest' }); }
            else { item.classList.remove('active'); item.style.background = 'transparent'; }
        });
    },

    configurarAuthUI: () => {
        const btnLogin = document.getElementById('btn-login');
        const btnLogout = document.getElementById('btn-logout');
        const loginOverlay = document.getElementById('login-overlay');
        const btnSubmit = document.getElementById('btn-login-submit');
        const loginError = document.getElementById('login-error');

        btnLogin?.addEventListener('click', () => { window.location.href = 'login.html'; });

        btnLogout?.addEventListener('click', async () => {
            await auth.logout();
            ui.atualizarEstadoAuth();
            window.location.href = 'login.html';
        });

        btnSubmit?.addEventListener('click', async () => {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value.trim();
            if (!username || !password) {
                ui.mostrarErroLogin('Preencha todos os campos.');
                return;
            }
            try {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Entrando...';
                await auth.login(username, password);
                ui.esconderLogin();
                ui.atualizarEstadoAuth();
                document.getElementById('login-username').value = '';
                document.getElementById('login-password').value = '';
                loginError.style.display = 'none';
            } catch (e) {
                ui.mostrarErroLogin(e.message);
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<i class="ph ph-sign-in"></i> Entrar';
            }
        });

        loginOverlay?.addEventListener('click', (e) => {
            if (e.target === loginOverlay && state.autenticado) {
                ui.esconderLogin();
            }
        });

        document.getElementById('login-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnSubmit?.click();
        });

        document.addEventListener('auth:expired', () => {
            ui.atualizarEstadoAuth();
            window.location.href = 'login.html';
        });
    },

    mostrarLogin: () => {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'flex';
    },

    esconderLogin: () => {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
    },

    mostrarErroLogin: (msg) => {
        const el = document.getElementById('login-error');
        if (el) {
            el.textContent = msg;
            el.style.display = 'block';
        }
    },

    atualizarEstadoAuth: () => {
        const btnLogin = document.getElementById('btn-login');
        const btnLogout = document.getElementById('btn-logout');
        const createBtn = document.getElementById('create-route-button');
        const deleteBtn = document.getElementById('quick-delete-button');
        const limparBtn = document.getElementById('btn-limpar-alarmes');

        const maintBtn = document.getElementById('btn-manutencao-rota');

        if (state.autenticado) {
            if (btnLogin) btnLogin.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'flex';
            if (createBtn) createBtn.style.display = 'flex';
            if (deleteBtn) deleteBtn.style.display = 'flex';
            if (limparBtn) limparBtn.style.display = 'inline-block';
            if (maintBtn) maintBtn.style.display = 'inline-flex';
        } else {
            if (btnLogin) btnLogin.style.display = 'flex';
            if (btnLogout) btnLogout.style.display = 'none';
            if (createBtn) createBtn.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (limparBtn) limparBtn.style.display = 'none';
            if (maintBtn) maintBtn.style.display = 'none';
        }
    },

    atualizarBadgeManutencao: (rota) => {
        const badge = document.getElementById('route-maint-badge');
        const btn = document.getElementById('btn-manutencao-rota');
        if (!badge || !rota) return;
        if (rota.manutencao_ativa) {
            badge.style.display = 'inline-block';
            if (btn) { btn.innerHTML = '<i class="ph ph-wrench"></i> Sair Manutenção'; btn.style.background = 'rgba(245, 158, 11, 0.15)'; btn.style.color = '#f59e0b'; }
        } else {
            badge.style.display = 'none';
            if (btn) { btn.innerHTML = '<i class="ph ph-wrench"></i> Manutenção'; btn.style.background = 'transparent'; btn.style.color = '#a1a1aa'; }
        }
    }
};