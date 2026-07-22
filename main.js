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

const valido = await auth.verify();
if (valido) {
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
  } catch (error) {
    console.error("❌ Erro ao carregar rotas:", error);
  }
} else {
  window.location.href = 'login.html';
}
