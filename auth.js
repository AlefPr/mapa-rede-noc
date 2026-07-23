import { state } from './state.js';

const AUTH_KEY = 'noc_auth_token';

export const auth = {
  getToken() {
    return localStorage.getItem(AUTH_KEY);
  },

  setToken(token) {
    if (token) {
      localStorage.setItem(AUTH_KEY, token);
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  },

  isAuthenticated() {
    return !!this.getToken();
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
    state.token = data.token;
    state.usuario = data.usuario;
    state.autenticado = true;
    this.setToken(data.token);
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
    const token = this.getToken();
    state.token = null;
    state.usuario = null;
    state.autenticado = false;
    this.setToken(null);
    if (token) {
      try {
        await fetch(`${state.API_URL_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      } catch {
      }
    }
  },

  async verify() {
    const token = this.getToken();
    if (!token) { console.warn('auth.verify: sem token'); return false; }
    try {
      const res = await fetch(`${state.API_URL_BASE}/auth/verificar`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        console.warn('auth.verify: token rejeitado', res.status);
        this.setToken(null);
        return false;
      }
      const data = await res.json();
      state.token = token;
      state.usuario = data.usuario;
      state.autenticado = true;
      return true;
    } catch (err) {
      console.warn('auth.verify: exceção', err);
      return false;
    }
  }
};
