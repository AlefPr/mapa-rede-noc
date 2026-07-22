process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.REDIS_HOST = 'localhost';

const request = require('supertest');
const http = require('http');
const express = require('express');
const cors = require('cors');

// Mock dos módulos externos antes de importar server
jest.mock('../db', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn()
}));

jest.mock('../redisClient', () => ({
  get: jest.fn(),
  set: jest.fn(),
  quit: jest.fn()
}));

jest.mock('../services/zabbixService', () => ({
  syncZabbixCache: jest.fn(),
  getCache: jest.fn().mockResolvedValue({}),
  zabbixApiCall: jest.fn()
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(cors());
    app.use(express.json());
    app.get('/', (req, res) => res.json({ message: "API OK!" }));
    require('../routes/rotas')(app, null);
    require('../routes/zabbix')(app);
    require('../routes/problemas')(app, null);
  });

  test('GET / deve retornar status OK', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'API OK!');
  });

  test('GET /api/problemas deve retornar array', async () => {
    const db = require('../db');
    db.execute.mockResolvedValue([[]]);
    const res = await request(app).get('/api/problemas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Validação de Rotas', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const { validarCriacaoRota, validarAtualizacaoRota, validarWebhook } = require('../middleware/validate');

    app.post('/test/criar', validarCriacaoRota, (req, res) => res.json({ ok: true }));
    app.put('/test/atualizar/:id', validarAtualizacaoRota, (req, res) => res.json({ ok: true }));
    app.post('/test/webhook', validarWebhook, (req, res) => res.json({ ok: true }));
  });

  test('criar rota sem nome deve falhar', async () => {
    const res = await request(app)
      .post('/test/criar')
      .send({ coordenadas: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Dados inválidos.');
  });

  test('criar rota com dados válidos deve passar', async () => {
    const res = await request(app)
      .post('/test/criar')
      .send({
        nome: 'Rota Teste',
        coordenadas: [{ lat: -23.5, lng: -46.6 }, { lat: -22.9, lng: -43.2 }],
        cor: '#3b82f6',
        espessura: 3
      });
    expect(res.status).toBe(200);
  });

  test('atualizar rota com id inválido deve falhar', async () => {
    const res = await request(app).put('/test/atualizar/invalido').send({ nome: 'Teste' });
    expect(res.status).toBe(400);
  });

  test('webhook sem token deve falhar quando configurado', async () => {
    process.env.WEBHOOK_SECRET = 'secret123';
    const res = await request(app).post('/test/webhook').send({});
    expect(res.status).toBe(401);
    delete process.env.WEBHOOK_SECRET;
  });
});
