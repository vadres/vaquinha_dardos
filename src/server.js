import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { carregarConfig } from './config.js';
import { abrirBanco } from './db/connection.js';
import { aplicarSeed } from './db/seed.js';
import rotasVaquinha from './routes/vaquinha.js';
import rotasContribuicoes from './routes/contribuicoes.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function criarApp(config, { logger = true } = {}) {
  const db = abrirBanco(config.databasePath);
  aplicarSeed(db, config);

  const app = Fastify({
    logger,
    bodyLimit: 4096,
    // sem coerção: "100" (string) não vira 100 silenciosamente
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  app.decorate('db', db);
  app.addHook('onClose', async () => db.close());

  app.setErrorHandler((err, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({ erro: 'invalido', mensagem: 'Dados inválidos: ' + err.message });
    }
    if (err.statusCode === 429) {
      return reply.code(429).send({
        erro: 'limite',
        mensagem: 'Muitos envios em pouco tempo. Aguarde um minuto e tente de novo.',
      });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ erro: 'requisicao', mensagem: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ erro: 'interno', mensagem: 'Erro interno. Tente novamente.' });
  });

  await app.register(rateLimit, { global: false });

  await app.register(fastifyStatic, { root: path.join(raiz, 'public') });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(rotasVaquinha, { db, config });
  await app.register(rotasContribuicoes, { db, config });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(path.join(raiz, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const config = carregarConfig();
  const app = await criarApp(config);
  await app.listen({ port: config.port, host: config.host });
}
