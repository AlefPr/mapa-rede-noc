import { state } from '../state.js';
import { mapDarkStyle } from './constants.js';

const STYLE_CONFIG = {
  solida: { strokeOpacity: 0.85, extraIcons: true },
  tracejada: { strokeOpacity: 0.0, extraIcons: false, dashIcons: true },
  setas: { strokeOpacity: 0.85, extraIcons: false, arrowIcons: true },
  particulas: { strokeOpacity: 0.85, extraIcons: false, particleIcons: true },
  neon: { strokeOpacity: 0.85, extraIcons: false, neonPulse: true }
};

export const renderer = {
  renderizarRotasNoMapa: (rotasDb, mapaContext) => {
    mapaContext.linhasDesenhadas.forEach(linha => linha.setMap(null));
    mapaContext.linhasDesenhadas = [];

    if (mapaContext.routeMarkers) {
      Object.values(mapaContext.routeMarkers).forEach(m => m.setMap(null));
    }
    mapaContext.routeMarkers = {};

    rotasDb.forEach(rota => {
      const coords = typeof rota.coordenadas === 'string' ? JSON.parse(rota.coordenadas) : rota.coordenadas;
      if (!coords || coords.length < 2) return;

      const espessura = Math.max(3, parseInt(rota.espessura) || 4);
      const corBase = rota.cor || '#38bdf8';
      const estilo = rota.estilo || 'solida';
      const cfg = STYLE_CONFIG[estilo] || STYLE_CONFIG.solida;

      const icons = [];

      if (cfg.extraIcons) {
        icons.push({
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 3.5,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            fillColor: '#ffffff',
            fillOpacity: 1
          },
          offset: '0%'
        });
      }

      if (cfg.arrowIcons) {
        icons.push({
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            fillOpacity: 1,
            strokeOpacity: 1,
            scale: Math.max(2, espessura - 1)
          },
          offset: '0',
          repeat: '50px'
        });
      }

      if (cfg.dashIcons) {
        icons.push({
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: espessura
          },
          offset: '0',
          repeat: '20px'
        });
      }

      if (cfg.particleIcons) {
        icons.push({
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: Math.max(2, espessura / 2),
            fillColor: corBase,
            fillOpacity: 1,
            strokeOpacity: 0
          },
          offset: '0',
          repeat: '20px'
        });
      }

      if (rota.manutencao_ativa) {
        icons.push({
          icon: {
            path: 'M 0,-1 0,1',
            strokeColor: '#f59e0b',
            strokeOpacity: 1,
            scale: espessura * 1.5
          },
          offset: '0',
          repeat: '15px'
        });
      }

      // ── GLOW ──
      const glow = new google.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: corBase,
        strokeWeight: espessura + 6,
        strokeOpacity: 0.10,
        zIndex: 1,
        clickable: false
      });
      glow.rotaData = rota;
      glow.tipoLinha = 'glow';
      glow.setMap(state.map);
      mapaContext.linhasDesenhadas.push(glow);

      // ── MAIN ──
      const main = new google.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: corBase,
        strokeWeight: espessura,
        strokeOpacity: cfg.strokeOpacity,
        zIndex: 10,
        clickable: true,
        icons: icons.length > 0 ? icons : null
      });
      main.rotaData = rota;
      main.id = rota.id;
      main.nome_rota = rota.nome_rota;
      main.tipoLinha = 'main';
      main.animCount = 0;
      main.espessuraOriginal = espessura;
      main.corOriginal = corBase;
      main.cfg = cfg;
      main.setMap(state.map);
      mapaContext.linhasDesenhadas.push(main);

      // ── HIGHLIGHT ──
      const highlight = new google.maps.Polyline({
        path: coords,
        geodesic: true,
        strokeColor: '#ffffff',
        strokeWeight: Math.max(1, espessura * 0.3),
        strokeOpacity: 0.18,
        zIndex: 11,
        clickable: false
      });
      highlight.rotaData = rota;
      highlight.tipoLinha = 'highlight';
      highlight.setMap(state.map);
      mapaContext.linhasDesenhadas.push(highlight);

      // ── ORIGEM ──
      const origMarker = new google.maps.Marker({
        position: coords[0],
        map: state.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 3,
          strokeColor: corBase,
          strokeWeight: 1.5,
          fillColor: '#0f172a',
          fillOpacity: 1
        },
        zIndex: 20,
        clickable: false
      });
      mapaContext.routeMarkers[rota.id + '_orig'] = origMarker;

      // ── DESTINO ──
      const destMarker = new google.maps.Marker({
        position: coords[coords.length - 1],
        map: state.map,
        icon: {
          path: 'M -1,-3 L 1,-3 L 3,-1 L 3,1 L 1,3 L -1,3 L -3,1 L -3,-1 Z',
          scale: 2.5,
          strokeColor: corBase,
          strokeWeight: 1.5,
          fillColor: corBase,
          fillOpacity: 0.15
        },
        zIndex: 20,
        clickable: false
      });
      mapaContext.routeMarkers[rota.id + '_dest'] = destMarker;

      // ── EVENTOS ──
      main.addListener('click', () => {
        if (state.isDrawing) return;
        if (state.isQuickDeleting) {
          state.rotaSelecionada = rota;
          document.dispatchEvent(new CustomEvent('excluirRotaRapida'));
        } else {
          document.dispatchEvent(new CustomEvent('rotaClicada', { detail: rota }));
        }
      });

      main.addListener('mouseover', () => {
        main.setOptions({ strokeWeight: espessura + 2, zIndex: 50 });
        glow.setOptions({ strokeOpacity: 0.22, zIndex: 49 });
        state.map.setOptions({ draggableCursor: state.isQuickDeleting ? 'not-allowed' : 'pointer' });
        document.dispatchEvent(new CustomEvent('rotaMouseOver', { detail: rota }));
      });

      main.addListener('mouseout', () => {
        main.setOptions({ strokeWeight: espessura, zIndex: 10 });
        glow.setOptions({ strokeOpacity: 0.10, zIndex: 1 });
        state.map.setOptions({ draggableCursor: '' });
        document.dispatchEvent(new CustomEvent('rotaMouseOut', { detail: rota }));
      });

      main.addListener('rightclick', () => {
        if (!state.isQuickDeleting) document.dispatchEvent(new CustomEvent('rotaRightClick', { detail: rota }));
      });
    });

    if (typeof mapaContext.atualizarCoresDeSaude === 'function') {
      mapaContext.atualizarCoresDeSaude();
    }
  },

  atualizarLinhaTemporaria: (mapaContext) => {
    if (mapaContext.linhaTemporaria) mapaContext.linhaTemporaria.setMap(null);
    mapaContext.linhaTemporaria = new google.maps.Polyline({
      path: state.coordenadasDaRotaAtual,
      geodesic: true,
      strokeColor: '#38bdf8',
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: state.map
    });
  },

  renderizarMinimapa: (rota, mapaContext) => {
    const container = document.getElementById('minimap-container');
    if (!container || !rota || !rota.coordenadas) return;

    if (!state.minimapInstance) {
      state.minimapInstance = new google.maps.Map(container, {
        zoom: 14,
        styles: mapDarkStyle,
        disableDefaultUI: true,
        gestureHandling: 'none',
        backgroundColor: '#020617'
      });
    }

    if (state.minimapPolyline) state.minimapPolyline.setMap(null);
    if (state.minimapPolylineGlow) state.minimapPolylineGlow.setMap(null);

    const coords = typeof rota.coordenadas === 'string' ? JSON.parse(rota.coordenadas) : rota.coordenadas;
    if (!coords || coords.length === 0) return;

    const cor = rota.cor || '#38bdf8';
    const esp = Math.max(2, parseInt(rota.espessura) || 3);

    state.minimapPolyline = new google.maps.Polyline({
      path: coords,
      geodesic: true,
      strokeColor: cor,
      strokeOpacity: 0.85,
      strokeWeight: esp,
      map: state.minimapInstance
    });

    state.minimapPolylineGlow = new google.maps.Polyline({
      path: coords,
      geodesic: true,
      strokeColor: cor,
      strokeOpacity: 0.08,
      strokeWeight: esp + 4,
      map: state.minimapInstance
    });

    const bounds = new google.maps.LatLngBounds();
    coords.forEach(c => {
      const lat = typeof c.lat === 'function' ? c.lat() : c.lat;
      const lng = typeof c.lng === 'function' ? c.lng() : c.lng;
      bounds.extend(new google.maps.LatLng(lat, lng));
    });

    state.minimapInstance.fitBounds(bounds);
  }
};
