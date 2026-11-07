import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/server.js';

const config = {
  port: 0,
  host: '127.0.0.1',
  databasePath: ':memory:',
  titulo: 'Teste',
  descricao: 'Desc',
  imagens: ['/images/a.jpg'],
  metaCentavos: 49999,
  maxContribuicaoCentavos: 50000,
  rateLimitPorMinuto: 15,
  pixChave: 'organizador@example.com',
  pixNome: 'Organizador',
  pixCidade: 'Sao Paulo',
};

const hash = (c) => c.repeat(64);
let app;

before(async () => {
  app = await criarApp(config, { logger: false });
});
after(() => app.close());

const post = (payload) => app.inject({ method: 'POST', url: '/api/contribuicoes', payload });

test('GET /api/vaquinha devolve configuração e total zerado', async () => {
  const res = await app.inject('/api/vaquinha');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.metaCentavos, 49999);
  assert.equal(body.totalCentavos, 0);
  assert.equal(body.percentual, 0);
  assert.deepEqual(body.imagens, ['/images/a.jpg']);
  assert.match(body.pixCopiaCola, /^000201.*br\.gov\.bcb\.pix.*6304[0-9A-F]{4}$/);
});

test('GET /api/health', async () => {
  const res = await app.inject('/api/health');
  assert.equal(res.statusCode, 200);
});

test('GET /api/pix/qr.svg devolve SVG', async () => {
  const res = await app.inject('/api/pix/qr.svg');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /image\/svg\+xml/);
  assert.match(res.body, /<svg/);
});

test('POST registra e devolve novo total', async () => {
  const res = await post({ nome: 'Ana', valorCentavos: 5000, identificadorPix: null, comprovanteHash: hash('a') });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json(), { id: 1, valorCentavos: 5000, totalCentavos: 5000 });

  const v = (await app.inject('/api/vaquinha')).json();
  assert.equal(v.totalCentavos, 5000);
  assert.equal(v.percentual, 10);
});

test('mesmo hash de comprovante dá 409', async () => {
  const res = await post({ valorCentavos: 100, comprovanteHash: hash('a') });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().erro, 'duplicado');
});

test('mesmo identificador Pix dá 409', async () => {
  const e2e = 'E12345678202611061230abcdefghijk';
  assert.equal(e2e.length, 32);
  assert.equal((await post({ valorCentavos: 100, identificadorPix: e2e, comprovanteHash: hash('b') })).statusCode, 201);
  const res = await post({ valorCentavos: 100, identificadorPix: e2e, comprovanteHash: hash('c') });
  assert.equal(res.statusCode, 409);
});

test('valores e campos inválidos dão 400', async () => {
  for (const payload of [
    { valorCentavos: 0, comprovanteHash: hash('d') },
    { valorCentavos: 10.5, comprovanteHash: hash('d') },
    { valorCentavos: 50001, comprovanteHash: hash('d') },
    { valorCentavos: '100', comprovanteHash: hash('d') },
    { valorCentavos: 100, comprovanteHash: 'xyz' },
    { valorCentavos: 100 },
    { valorCentavos: 100, comprovanteHash: hash('d'), totalCentavos: 999999 },
  ]) {
    const res = await post(payload);
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
});

test('total nunca é aceito do cliente e o progresso passa de 100%', async () => {
  await post({ valorCentavos: 50000, comprovanteHash: hash('e') });
  const v = (await app.inject('/api/vaquinha')).json();
  assert.equal(v.totalCentavos, 5000 + 100 + 50000);
  assert.ok(v.percentual > 100);
});

test('excesso de envios dá 429', async () => {
  let ultimo;
  for (let i = 0; i < 5; i++) {
    ultimo = await post({ valorCentavos: 1, comprovanteHash: hash(String(i)) });
  }
  assert.equal(ultimo.statusCode, 429);
  assert.equal(ultimo.json().erro, 'limite');
});
