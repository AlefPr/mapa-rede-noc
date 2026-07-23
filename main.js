import { incidentes } from './incidentes.js';
import { ui } from './ui.js';
import { state } from './state.js';
import { api } from './api.js';
import { mapa } from './mapa.js';
import { auth } from './auth.js';

const GOOGLE_MAPS_KEY = 'AIzaSyDOarTFBQ6-CJEpY2z7DeCBvSFw3wNKIzw';

function loadGoogleMaps() {
  return new Promise((resolve) => {
    if (window.google?.maps?.Map) { resolve(); return; }
    window._gmapsReady = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=geometry&callback=_gmapsReady`;
    s.async = true;
    document.head.appendChild(s);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const btnCriar = document.getElementById('create-route-button');
  if (btnCriar) {
    btnCriar.addEventListener('click', () => mapa.iniciarDesenho());
  }
});

async function initApp() {
  try {
    const valido = await auth.verify();
    if (!valido) {
      ui.configurarAuthUI();
      ui.mostrarLogin();
      return;
    }
    ui.atualizarEstadoAuth();
    await loadGoogleMaps();
    console.log("🚀 A inicializar Sistema NOC Premium...");
    mapa.init();
    ui.init();
    incidentes.init();
    try {
      const rotas = await api.getRotas();
      state.rotasSalvas = rotas;
      mapa.renderizarRotasNoMapa(state.rotasSalvas);
      if (typeof mapa.atualizarCoresDeSaude === 'function') {
        mapa.atualizarCoresDeSaude();
      }
      console.log(`✅ ${rotas.length} rotas carregadas.`);

      if (typeof ui.renderizarResumo === 'function') ui.renderizarResumo();

      // Kiosk Mode
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('kiosk') === 'true') {
        document.body.classList.add('kiosk-mode');
        const kioskInfo = document.getElementById('kiosk-info');
        const kioskClock = document.getElementById('kiosk-clock');

        let kioskIdx = 0;
        setInterval(() => {
          const problemasContainer = document.getElementById('alarm-list');
          if (problemasContainer) {
            const ativos = problemasContainer.querySelectorAll('.incident-card.active');
            if (ativos.length > 0) {
              const ativosArr = Array.from(ativos);
              if (kioskIdx >= ativosArr.length) kioskIdx = 0;
              const nome = ativosArr[kioskIdx]?.querySelector('.incident-card-name')?.textContent?.trim();
              const rota = state.rotasSalvas.find(r => nome && r.nome_rota === nome);
              if (rota && rota.coordenadas && typeof mapa.focarRota === 'function') {
                mapa.focarRota(rota);
              }
              kioskIdx++;
            }
          }
          if (kioskClock) {
            kioskClock.textContent = new Date().toLocaleTimeString('pt-BR');
          }
        }, 15000);
      }
    } catch (error) {
      console.error("❌ Erro ao carregar rotas:", error);
    }
  } catch (error) {
    console.error("❌ Erro na inicialização:", error);
    alert('Erro ao carregar o mapa. Verifique o console (F12) para detalhes.');
  }
}

initApp();
