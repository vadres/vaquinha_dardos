import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarApp } from '../src/server.js';
import { dimensoesImagem, origemDoPedido, tagsOg } from '../src/og.js';

const config = {
  port: 0,
  host: '127.0.0.1',
  databasePath: ':memory:',
  titulo: 'Jogo de dardos & proteção',
  descricao: 'Alvo de sisal com dardos.',
  imagens: ['/images/inexistente.png', '/images/dardos.jpg'],
  metaCentavos: 49999,
  maxContribuicaoCentavos: 50000,
  rateLimitPorMinuto: 15,
  pixChave: 'organizador@example.com',
  pixNome: 'Organizador',
  pixCidade: 'Sao Paulo',
};

let app;
before(async () => {
  app = await criarApp(config, { logger: false });
});
after(() => app.close());

test('dimensoesImagem lê o JPEG do produto', () => {
  const d = dimensoesImagem(fs.readFileSync('public/images/dardos.jpg'));
  assert.deepEqual(d, { largura: 1442, altura: 1500 });
});

test('dimensoesImagem lê um PNG', () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  assert.deepEqual(dimensoesImagem(png), { largura: 640, altura: 480 });
});

test('dimensoesImagem devolve null para formato desconhecido', () => {
  assert.equal(dimensoesImagem(Buffer.from('nao é imagem')), null);
});

test('origemDoPedido prefere os cabeçalhos do túnel', () => {
  assert.equal(
    origemDoPedido({
      headers: { 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'abc.trycloudflare.com' },
      protocol: 'http',
      host: '127.0.0.1:3000',
    }),
    'https://abc.trycloudflare.com',
  );
});

test('origemDoPedido cai no host do pedido sem cabeçalhos', () => {
  assert.equal(
    origemDoPedido({ headers: {}, protocol: 'http', host: '192.168.0.10:3000' }),
    'http://192.168.0.10:3000',
  );
});

test('tagsOg escapa aspas e & do título', () => {
  const html = tagsOg({
    origem: 'https://x.test',
    titulo: 'Dardos & "proteção"',
    descricao: 'Desc',
    metaCentavos: 49999,
    imagem: null,
  });
  assert.match(html, /content="Dardos &amp; &quot;proteção&quot; — vaquinha entre amigos"/);
  assert.doesNotMatch(html, /og:image/);
  assert.match(html, /twitter:card" content="summary"/);
});

test('GET / injeta Open Graph com URL absoluta da origem do pedido', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/',
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'abc.trycloudflare.com' },
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  const html = res.body;
  assert.match(html, /<meta property="og:url" content="https:\/\/abc\.trycloudflare\.com\/">/);
  // pula a primeira imagem da lista, que não existe no disco
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/abc\.trycloudflare\.com\/images\/dardos\.jpg">/,
  );
  assert.match(html, /<meta property="og:image:width" content="1442">/);
  assert.match(html, /<meta property="og:image:height" content="1500">/);
  assert.match(html, /<meta property="og:image:type" content="image\/jpeg">/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /<meta property="og:description" content="[^"]*R\$&nbsp;499,99|499,99/);
  // a página em si continua intacta
  assert.match(html, /<section class="galeria" id="galeria"/);
  assert.match(html, /<script type="module" src="\/app\.js">/);
});

test('GET /index.html redireciona para /', async () => {
  const res = await app.inject({ method: 'GET', url: '/index.html' });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/');
});

test('estáticos continuam servidos', async () => {
  const res = await app.inject({ method: 'GET', url: '/styles.css' });
  assert.equal(res.statusCode, 200);
});
