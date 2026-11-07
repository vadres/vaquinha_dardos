import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/server.js';

const base = {
  port: 0,
  host: '127.0.0.1',
  databasePath: ':memory:',
  titulo: 'Teste',
  descricao: 'Desc',
  imagens: ['/images/dardos.jpg'],
  metaCentavos: 49999,
  maxContribuicaoCentavos: 50000,
  rateLimitPorMinuto: 1,
  pixChave: 'organizador@example.com',
  pixNome: 'Organizador',
  pixCidade: 'Sao Paulo',
};

const hash = (c) => c.repeat(64);

const enviar = (app, ip, c) =>
  app.inject({
    method: 'POST',
    url: '/api/contribuicoes',
    headers: { 'x-forwarded-for': ip },
    payload: { valorCentavos: 1000, comprovanteHash: hash(c) },
  });

test('com trustProxy, o rate limit conta por IP real do túnel', async () => {
  const app = await criarApp({ ...base, trustProxy: true }, { logger: false });
  try {
    assert.equal((await enviar(app, '203.0.113.1', 'a')).statusCode, 201);
    // amigo diferente, atrás do mesmo túnel: não deve herdar o limite do outro
    assert.equal((await enviar(app, '203.0.113.2', 'b')).statusCode, 201);
    // mesmo IP de novo, acima do limite de 1/min
    assert.equal((await enviar(app, '203.0.113.1', 'c')).statusCode, 429);
  } finally {
    await app.close();
  }
});

test('sem trustProxy, todos caem no mesmo contador', async () => {
  const app = await criarApp({ ...base, trustProxy: false }, { logger: false });
  try {
    assert.equal((await enviar(app, '203.0.113.1', 'd')).statusCode, 201);
    // o cabeçalho é ignorado: o segundo amigo é bloqueado pelo envio do primeiro
    assert.equal((await enviar(app, '203.0.113.2', 'e')).statusCode, 429);
  } finally {
    await app.close();
  }
});

test('trustProxy desligado é o padrão quando TRUST_PROXY não vem', async () => {
  const app = await criarApp({ ...base }, { logger: false });
  try {
    assert.ok(!app.initialConfig.trustProxy);
  } finally {
    await app.close();
  }
});
