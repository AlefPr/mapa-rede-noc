import { state } from './state.js';

export const auth = {
  isAuthenticated() {
    return state.autenticado;
  },

  async login(username, password) {
    const res = await fetch(`${state.API_URL_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao autenticar' }));
      throw new Error(err.error || 'Credenciais inválidas');
    }
    const data = await res.json();
    state.usuario = data.usuario;
    state.autenticado = true;
    return data;
  },

  async register(username, password) {
    const res = await fetch(`${state.API_URL_BASE}/auth/registar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao registar' }));
      throw new Error(err.error || 'Erro ao registar');
    }
    return await res.json();
  },

  async logout() {
    state.usuario = null;
    state.autenticado = false;
    try {
      await fetch(`${state.API_URL_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
    }
  },

  async verify() {
    try {
      const res = await fetch(`${state.API_URL_BASE}/auth/verificar`);
      if (!res.ok) {
        console.warn('auth.verify: token rejeitado', res.status);
        state.autenticado = false;
        state.usuario = null;
        return false;
      }
      const data = await res.json();
      state.usuario = data.usuario;
      state.autenticado = true;
      return true;
    } catch (err) {
      console.warn('auth.verify: exceção', err);
      state.autenticado = false;
      return false;
    }
  }
};
