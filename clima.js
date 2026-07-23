import { state } from './state.js';

const REGIOES = {
  'America/Sao_Paulo': 'Brasil (Horário de Brasília)',
  'America/Manaus': 'Brasil (Horário do Amazonas)',
  'America/New_York': 'Estados Unidos (Costa Leste)',
  'America/Chicago': 'Estados Unidos (Central)',
  'America/Denver': 'Estados Unidos (Montanhas)',
  'America/Los_Angeles': 'Estados Unidos (Costa Oeste)',
  'Europe/London': 'Reino Unido',
  'Europe/Lisbon': 'Portugal',
  'Europe/Madrid': 'Espanha',
  'Europe/Paris': 'França',
  'Africa/Lagos': 'Nigéria',
  'Africa/Johannesburg': 'África do Sul',
};

export const clima = {
  active: false,
  mapListener: null,

  async toggle() {
    this.active = !this.active;
    document.getElementById('btn-clima')?.classList.toggle('active', this.active);
    document.getElementById('weather-overlay')?.remove();
    if (this.mapListener) {
      google.maps.event.removeListener(this.mapListener);
      this.mapListener = null;
    }

    if (!this.active) return;

    const overlay = document.createElement('div');
    overlay.id = 'weather-overlay';
    overlay.innerHTML = '<div class="weather-loading"><i class="ph ph-spinner-gap ph-spin"></i> Carregando clima...</div>';
    document.body.appendChild(overlay);

    await this.atualizar();

    if (state.map) {
      this.mapListener = state.map.addListener('idle', () => this.atualizar());
    }
  },

  async atualizar() {
    if (!this.active) return;
    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;
    const center = state.map?.getCenter();
    if (!center) return;

    const lat = center.lat();
    const lng = center.lng();

    overlay.innerHTML = '<div class="weather-loading"><i class="ph ph-spinner-gap ph-spin"></i> Carregando clima...</div>';

    try {
      const res = await fetch(`${state.API_URL_BASE}/weather?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const w = await res.json();

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const regiao = REGIOES[tz] || `Coordenada ${lat.toFixed(2)}, ${lng.toFixed(2)}`;

      overlay.innerHTML = `
        <div class="weather-header"><i class="ph ph-cloud"></i> Condições na Região</div>
        <div class="weather-grid"><div class="weather-card">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="weather-icon">${this.icone(w.weather_code)}</div>
            <div>
              <div class="weather-temp">${w.temperature.toFixed(1)}°C</div>
              <div class="weather-desc">${w.condition}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">
            <div class="weather-detail">🌡️ Sensação ${w.feels_like.toFixed(1)}°C</div>
            <div class="weather-detail">💧 Umidade ${w.humidity}%</div>
            <div class="weather-detail">💨 Vento ${w.wind_speed.toFixed(0)} km/h</div>
            <div class="weather-detail ${w.precipitation > 0 ? 'weather-rain' : ''}">🌧️ Precip. ${w.precipitation.toFixed(1)} mm</div>
          </div>
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:#475569;">
            Dados: Open-Meteo · Posição central do mapa (${lat.toFixed(2)}, ${lng.toFixed(2)})
          </div>
        </div></div>`;
    } catch (e) {
      console.error('Weather error:', e);
      overlay.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;font-size:12px;">Erro ao carregar clima</div>';
    }
  },

  icone(code) {
    if (code >= 95) return '⛈️';
    if (code >= 80) return '🌧️';
    if (code >= 71) return '❄️';
    if (code >= 61) return '🌦️';
    if (code >= 51) return '🌦️';
    if (code >= 45) return '🌫️';
    if (code >= 0 && code <= 3) return code === 0 ? '☀️' : '⛅';
    return '🌡️';
  },

  limpar() {
    if (this.mapListener) {
      google.maps.event.removeListener(this.mapListener);
      this.mapListener = null;
    }
    document.getElementById('weather-overlay')?.remove();
  }
};
