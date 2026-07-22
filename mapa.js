// mapa.js
import { state } from './state.js';
import { mapDarkStyle } from './mapa/constants.js';
import { renderer } from './mapa/renderer.js';

export const mapa = {
    directionsService: null,
    linhasDesenhadas: [],
    linhaTemporaria: null,
    clickTimeout: null,
    routeMarkers: {}, 

    init: () => {
        state.map = new google.maps.Map(document.getElementById("map"), {
            center: { lat: -10.184, lng: -48.333 }, 
            zoom: 13,
            styles: mapDarkStyle,
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER }
        });

        state.map.addListener('dragstart', () => state.isMapMoving = true);
        state.map.addListener('dragend', () => state.isMapMoving = false);
        state.map.addListener('zoom_changed', () => {
            state.isMapMoving = true;
            clearTimeout(state.zoomDebounce);
            state.zoomDebounce = setTimeout(() => state.isMapMoving = false, 300);
        });

        mapa.directionsService = new google.maps.DirectionsService();

       state.map.addListener('click', (e) => {
            if (state.isDrawing) {
                if (mapa.clickTimeout) clearTimeout(mapa.clickTimeout);
                
                mapa.clickTimeout = setTimeout(() => {
                    mapa.adicionarPontoAoDesenho(e.latLng);
                }, 250);
            }
            else if (state.rotaSelecionada || document.getElementById('route-drawer').classList.contains('open')) {
                document.dispatchEvent(new CustomEvent('fecharGaveta'));
            }
        });

        state.map.addListener('dblclick', (e) => {
            if (state.isDrawing) {
                if (mapa.clickTimeout) clearTimeout(mapa.clickTimeout);
                if (e.domEvent) e.domEvent.preventDefault();
                else if (typeof e.stop === 'function') e.stop();
                mapa.concluirDesenho();
            }
        });

        mapa.iniciarAnimacoes();
    },

    iniciarDesenho: () => {
        state.isDrawing = true;
        state.coordenadasDaRotaAtual = [];
        state.map.setOptions({ draggableCursor: 'crosshair', disableDoubleClickZoom: true });
    },

    cancelarDesenho: () => {
        state.isDrawing = false;
        state.coordenadasDaRotaAtual = [];
        state.map.setOptions({ draggableCursor: '', disableDoubleClickZoom: false });
        
        if (mapa.linhaTemporaria) {
            mapa.linhaTemporaria.setMap(null);
            mapa.linhaTemporaria = null;
        }
    },

    adicionarPontoAoDesenho: (latLng) => {
        const novoPonto = { lat: latLng.lat(), lng: latLng.lng() };
        
        if (state.coordenadasDaRotaAtual.length > 0 && state.isSnapToRoadEnabled) {
            const origem = state.coordenadasDaRotaAtual[state.coordenadasDaRotaAtual.length - 1];
            mapa.directionsService.route({
                origin: origem, destination: novoPonto, travelMode: google.maps.TravelMode.WALKING
            }, (response, status) => {
                if (status === 'OK') {
                    const caminhos = response.routes[0].overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }));
                    state.coordenadasDaRotaAtual = state.coordenadasDaRotaAtual.concat(caminhos);
                    mapa.atualizarLinhaTemporaria();
                }
            });
        } else {
            state.coordenadasDaRotaAtual.push(novoPonto);
            mapa.atualizarLinhaTemporaria();
        }
    },

    atualizarLinhaTemporaria: () => {
        renderer.atualizarLinhaTemporaria(mapa);
    },

    concluirDesenho: () => {
        state.map.setOptions({ draggableCursor: '' });
        
        setTimeout(() => {
            state.map.setOptions({ disableDoubleClickZoom: false });
        }, 300);

        document.dispatchEvent(new CustomEvent('desenhoFinalizado'));
    },

    renderizarRotasNoMapa: (rotasDb) => {
        renderer.renderizarRotasNoMapa(rotasDb, mapa);
    },

    filtrarERenderizarRotas: () => {
        const status = state.filtros.status;
        let rotasFiltradas = state.rotasSalvas;

        if (status === 'up') {
            rotasFiltradas = state.rotasSalvas.filter(rota => !(rota.corDeAlerta === '#FF0000'));
        } else if (status === 'down') {
            rotasFiltradas = state.rotasSalvas.filter(rota => rota.corDeAlerta === '#FF0000');
        }
        mapa.renderizarRotasNoMapa(rotasFiltradas);
    },

    iniciarAnimacoes: () => {
        if (state.animationTimer) clearInterval(state.animationTimer);

        setInterval(() => {
            if (typeof mapa.atualizarCoresDeSaude === 'function') {
                mapa.atualizarCoresDeSaude();
            }
        }, 5000);

        let lastTime = 0;
        const animate = (time) => {
            if (time - lastTime < 100) {
                requestAnimationFrame(animate);
                return;
            }
            lastTime = time;

            if (!state.isMapMoving) {
                mapa.linhasDesenhadas.forEach(linha => {
                    if (linha.tipoLinha !== 'main' || !linha.rotaData) return;

                    const rota = linha.rotaData;
                    const estilo = rota.estilo || 'solida';
                    let step = 1;

                    if (estilo === 'particulas' && rota.zabbix_items && state.zabbixCacheLocal) {
                        let valorIn = 0, valorOut = 0;
                        if (rota.zabbix_items.in) rota.zabbix_items.in.forEach(id => { if (state.zabbixCacheLocal[id]) valorIn += state.zabbixCacheLocal[id].current; });
                        if (rota.zabbix_items.out) rota.zabbix_items.out.forEach(id => { if (state.zabbixCacheLocal[id]) valorOut += state.zabbixCacheLocal[id].current; });
                        const trafegoTotal = valorIn + valorOut;
                        const capacidadeEmBps = (rota.unidade && rota.unidade.toLowerCase() === 'gbps') ? parseFloat(rota.capacidade) * 1000000000 : parseFloat(rota.capacidade) * 1000000;
                        if (capacidadeEmBps > 0 && trafegoTotal > 0) {
                            step = 1 + ((trafegoTotal / capacidadeEmBps) * 14);
                        }
                    }

                    linha.animCount = (linha.animCount || 0) + step;
                    const icons = linha.get('icons');
                    if (!icons || icons.length === 0) return;

                    if (estilo === 'neon') {
                        linha.setOptions({ strokeOpacity: 0.3 + (((Math.sin(linha.animCount * 0.05) + 1) / 2) * 0.7) });
                    } else if (estilo === 'solida') {
                        icons[0].offset = (linha.animCount * 0.15) % 100 + '%';
                        linha.set('icons', icons);
                    } else if (estilo === 'setas') {
                        icons[0].offset = (linha.animCount / 2) % 100 + '%';
                        linha.set('icons', icons);
                    } else if (estilo === 'tracejada') {
                        icons[0].offset = Math.floor(linha.animCount % 20) + 'px';
                        linha.set('icons', icons);
                    } else if (estilo === 'particulas') {
                        icons[0].offset = Math.floor(linha.animCount % 20) + 'px';
                        icons[0].icon.fillColor = linha.get('strokeColor');
                        linha.set('icons', icons);
                    }
                });
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    focarRota: (rota) => {
        if (!rota || !rota.coordenadas) return;

        const coords = typeof rota.coordenadas === 'string' ? JSON.parse(rota.coordenadas) : rota.coordenadas;
        if (!coords || coords.length === 0) return;

        const bounds = new google.maps.LatLngBounds();
        coords.forEach(c => {
            const lat = typeof c.lat === 'function' ? c.lat() : c.lat;
            const lng = typeof c.lng === 'function' ? c.lng() : c.lng;
            bounds.extend(new google.maps.LatLng(lat, lng));
        });

        const mainLine = mapa.linhasDesenhadas.find(l => l.rotaData && l.rotaData.id === rota.id && l.tipoLinha === 'main');

        if (mainLine) {
            const corOriginal = mainLine.get('strokeColor');
            const espessuraOriginal = mainLine.get('strokeWeight');

            mainLine.setOptions({ strokeColor: '#34d399', strokeWeight: 12, zIndex: 9999 });
            state.map.panTo(bounds.getCenter());

            setTimeout(() => {
                state.map.fitBounds(bounds);
                let zoomAtual = state.map.getZoom();
                if (zoomAtual > 18) zoomAtual = 18;
                state.map.setZoom(zoomAtual + 1);

                setTimeout(() => { state.map.setZoom(zoomAtual); }, 300);
                setTimeout(() => {
                    const corRestaurada = mainLine.rotaData.corDeAlerta || corOriginal;
                    mainLine.setOptions({ strokeColor: corRestaurada, strokeWeight: espessuraOriginal, zIndex: 10 });
                }, 2500);
            }, 1000);
        } else {
            state.map.fitBounds(bounds);
        }
    },

    atualizarCoresDeSaude: () => {
        if (!state.zabbixCacheLocal) return;

        const processed = new Set();
        mapa.linhasDesenhadas.forEach(linha => {
            if (linha.tipoLinha !== 'main') return;
            const rota = linha.rotaData;
            if (!rota || processed.has(rota.id)) return;
            processed.add(rota.id);

            let newColor = rota.cor || '#ffffff';
            let alertColor = null;

            if (rota.manutencao_ativa) {
                newColor = '#F59E0B';
                alertColor = '#F59E0B';
                linha.setOptions({ strokeColor: newColor });
                rota.corDeAlerta = alertColor;
                const glowLine = mapa.linhasDesenhadas.find(l => l.rotaData && l.rotaData.id === rota.id && l.tipoLinha === 'glow');
                if (glowLine) glowLine.setOptions({ strokeColor: newColor });
                return;
            }

            let rotaEstaDown = false;
            if (rota.zabbix_items && rota.zabbix_items.status && rota.zabbix_items.status.length > 0) {
                for (const statusId of rota.zabbix_items.status) {
                    const itemCache = state.zabbixCacheLocal[statusId];
                    if (itemCache && (itemCache.current == 2 || itemCache.current == "2")) {
                        rotaEstaDown = true; break;
                    }
                }
            }

            if (rotaEstaDown) {
                newColor = '#FF0000';
                alertColor = '#FF0000';
            } else if (rota.capacidade && parseFloat(rota.capacidade) > 0 && rota.zabbix_items) {
                let valorIn = 0, valorOut = 0;
                if (rota.zabbix_items.in) rota.zabbix_items.in.forEach(id => { if (state.zabbixCacheLocal[id]) valorIn += parseFloat(state.zabbixCacheLocal[id].current) || 0; });
                if (rota.zabbix_items.out) rota.zabbix_items.out.forEach(id => { if (state.zabbixCacheLocal[id]) valorOut += parseFloat(state.zabbixCacheLocal[id].current) || 0; });

                let trafegoConsiderado = 0;
                const tipoCalculo = rota.tipo_rota || 'full-duplex';
                if (tipoCalculo === 'agregado') trafegoConsiderado = valorIn + valorOut;
                else if (tipoCalculo === 'download') trafegoConsiderado = valorIn;
                else if (tipoCalculo === 'upload') trafegoConsiderado = valorOut;
                else if (tipoCalculo === 'full-duplex') trafegoConsiderado = Math.max(valorIn, valorOut);

                let capacidadeEmBps = (rota.unidade && rota.unidade.toLowerCase() === 'gbps') ? parseFloat(rota.capacidade) * 1000000000 : parseFloat(rota.capacidade) * 1000000;

                if (capacidadeEmBps > 0) {
                    let percentual = (trafegoConsiderado / capacidadeEmBps) * 100;
                    if (percentual >= 90) { newColor = '#FFFF00'; alertColor = '#FFFF00'; }
                    else if (percentual >= 80) { newColor = '#8B5CF6'; alertColor = '#8B5CF6'; }
                }
            }

            linha.setOptions({ strokeColor: newColor });
            rota.corDeAlerta = alertColor;

            const glowLine = mapa.linhasDesenhadas.find(l => l.rotaData && l.rotaData.id === rota.id && l.tipoLinha === 'glow');
            if (glowLine) glowLine.setOptions({ strokeColor: newColor });
        });
        document.dispatchEvent(new CustomEvent('atualizarDashboard'));
    },

    alternarModoEscuro: (isDark) => {
        state.map.setOptions({ styles: isDark ? mapDarkStyle : [] });
    },

    renderizarMinimapa: (rota) => {
        renderer.renderizarMinimapa(rota, mapa);
    }
};
