import { state } from './state.js';
import { auth } from './auth.js';

function headers(extra = {}) {
  const h = { ...extra };
  if (state.token) {
    h['Authorization'] = `Bearer ${state.token}`;
  }
  return h;
}

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(options.headers), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  if (res.status === 401 && state.token) {
    state.autenticado = false;
    state.token = null;
    state.usuario = null;
    auth.setToken(null);
    document.dispatchEvent(new CustomEvent('auth:expired'));
  }
  return res;
}

export const api = {
    getRotas: async () => {
        try {
            const response = await authFetch(`${state.API_URL_BASE}/rotas`);
            if (!response.ok) throw new Error('Erro ao buscar rotas');
            return await response.json();
        } catch (error) {
            console.error('Falha na API (getRotas):', error);
            return [];
        }
    },

    salvarRota: async (dadosRota) => {
        try {
            const response = await authFetch(`${state.API_URL_BASE}/rotas`, {
                method: 'POST',
                body: JSON.stringify(dadosRota)
            });
            if (!response.ok) throw new Error('Erro ao salvar rota');
            return await response.json();
        } catch (error) {
            console.error('Falha na API (salvarRota):', error);
            throw error;
        }
    },

    atualizarRota: async (id, dadosRota) => {
        try {
            const response = await authFetch(`${state.API_URL_BASE}/rotas/${id}`, {
                method: 'PUT',
                body: JSON.stringify(dadosRota)
            });
            if (!response.ok) throw new Error('Erro ao atualizar rota');
            return await response.json();
        } catch (error) {
            console.error(`Falha na API (atualizarRota ID ${id}):`, error);
            throw error;
        }
    },

    eliminarRota: async (id) => {
        try {
            const response = await authFetch(`${state.API_URL_BASE}/rotas/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Erro ao eliminar rota');
            return await response.json();
        } catch (error) {
            console.error(`Falha na API (eliminarRota ID ${id}):`, error);
            throw error;
        }
    },

    limparAlarmes: async () => {
        try {
            const response = await authFetch(`${state.API_URL_BASE}/problemas/limpar`, { method: 'POST' });
            if (!response.ok) throw new Error('Erro ao limpar alarmes');
            return await response.json();
        } catch (error) {
            console.error('Falha na API (limparAlarmes):', error);
            throw error;
        }
    }
};