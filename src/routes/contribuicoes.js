import { calcularTotal } from './vaquinha.js';

export default async function rotasContribuicoes(app, { db, config }) {
  const inserir = db.prepare(
    `INSERT INTO contribuicao (nome, valor_centavos, identificador_pix, comprovante_hash)
     VALUES (@nome, @valorCentavos, @identificadorPix, @comprovanteHash)`
  );

  const registrar = db.transaction((dados) => {
    const { lastInsertRowid } = inserir.run(dados);
    return { id: Number(lastInsertRowid), totalCentavos: calcularTotal(db) };
  });

  const schema = {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['valorCentavos', 'comprovanteHash'],
      properties: {
        nome: { type: ['string', 'null'], maxLength: 60 },
        valorCentavos: { type: 'integer', minimum: 1, maximum: config.maxContribuicaoCentavos },
        identificadorPix: {
          anyOf: [{ type: 'null' }, { type: 'string', pattern: '^E[0-9A-Za-z]{31}$' }],
        },
        comprovanteHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      },
    },
  };

  app.post(
    '/api/contribuicoes',
    {
      schema,
      bodyLimit: 2048,
      config: { rateLimit: { max: config.rateLimitPorMinuto, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { valorCentavos, comprovanteHash } = req.body;
      const nome = req.body.nome?.trim() || null;
      const identificadorPix = req.body.identificadorPix?.toUpperCase() || null;

      try {
        const { id, totalCentavos } = registrar({
          nome,
          valorCentavos,
          identificadorPix,
          comprovanteHash,
        });
        return reply.code(201).send({ id, valorCentavos, totalCentavos });
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          const campo = err.message.includes('identificador_pix')
            ? 'Este Pix (identificador da transação) já foi registrado.'
            : 'Este comprovante já foi enviado.';
          return reply.code(409).send({ erro: 'duplicado', mensagem: campo });
        }
        throw err;
      }
    }
  );
}
