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
  expanded: false,
  mapListener: null,
  lastData: null,

  async toggle() {
    this.active = !this.active;
    document.getElementById('btn-clima')?.classList.toggle('active', this.active);
    document.getElementById('weather-overlay')?.remove();
    this.expanded = false;
    if (this.mapListener) {
      google.maps.event.removeListener(this.mapListener);
      this.mapListener = null;
    }
    if (!this.active) return;

    const overlay = document.createElement('div');
    overlay.id = 'weather-overlay';
    document.body.appendChild(overlay);
    this.atualizar();

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

    if (!this.lastData) {
      overlay.innerHTML = '<div class="w-badge"><span class="w-loading"><i class="ph ph-spinner-gap ph-spin"></i></span></div>';
    }

    try {
      const res = await fetch(`${state.API_URL_BASE}/weather?lat=${center.lat()}&lng=${center.lng()}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.lastData = await res.json();
    } catch (e) {
      console.error('Weather error:', e);
      overlay.innerHTML = '<div class="w-badge"><span class="w-loading" style="color:#ef4444;">!</span></div>';
      return;
    }

    this.render(overlay);
  },

  render(overlay) {
    const w = this.lastData;
    if (!w) return;

    const icone = this.icone(w.weather_code);

    if (this.expanded) {
      overlay.innerHTML = `
        <div class="w-badge w-expanded" id="weather-body">
          <div class="w-main" id="w-toggle">
            <span class="w-ico">${icone}</span>
            <span class="w-temp">${w.temperature.toFixed(1)}°</span>
          </div>
          <div class="w-details">
            <div class="w-det-row"><span>Condição</span><span>${w.condition}</span></div>
            <div class="w-det-row"><span>Sensação</span><span>${w.feels_like.toFixed(1)}°C</span></div>
            <div class="w-det-row"><span>Umidade</span><span>${w.humidity}%</span></div>
            <div class="w-det-row"><span>Vento</span><span>${w.wind_speed.toFixed(0)} km/h</span></div>
            <div class="w-det-row"><span>Precip.</span><span>${w.precipitation.toFixed(1)} mm</span></div>
            <div class="w-det-footer">Open-Meteo · ${centerLabel()}</div>
          </div>
        </div>
      `;
    } else {
      overlay.innerHTML = `
        <div class="w-badge" id="weather-body">
          <div class="w-main" id="w-toggle">
            <span class="w-ico">${icone}</span>
            <span class="w-temp">${w.temperature.toFixed(1)}°</span>
          </div>
        </div>
      `;
    }

    document.getElementById('w-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expanded = !this.expanded;
      this.render(overlay);
    });

    if (this.expanded) {
      const closeOutside = (e) => {
        if (!e.target.closest('#weather-overlay')) {
          this.expanded = false;
          this.render(overlay);
          document.removeEventListener('click', closeOutside);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOutside), 0);
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
    this.lastData = null;
    this.expanded = false;
  }
};

function centerLabel() {
  const c = state.map?.getCenter();
  if (!c) return '';
  return `${c.lat().toFixed(2)}, ${c.lng().toFixed(2)}`;
}
