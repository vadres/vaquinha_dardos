import QRCode from 'qrcode';

export function calcularTotal(db) {
  return db.prepare('SELECT COALESCE(SUM(valor_centavos), 0) AS total FROM contribuicao').get().total;
}

export function calcularPercentual(totalCentavos, metaCentavos) {
  return Math.round((totalCentavos / metaCentavos) * 1000) / 10;
}

export default async function rotasVaquinha(app, { db, config }) {
  const buscar = db.prepare('SELECT * FROM vaquinha WHERE id = 1');
  const qrCache = new Map();

  app.get('/api/vaquinha', async () => {
    const v = buscar.get();
    const totalCentavos = calcularTotal(db);
    return {
      id: v.id,
      titulo: v.titulo,
      descricao: v.descricao,
      imagens: JSON.parse(v.imagens),
      metaCentavos: v.meta_centavos,
      totalCentavos,
      percentual: calcularPercentual(totalCentavos, v.meta_centavos),
      maxContribuicaoCentavos: config.maxContribuicaoCentavos,
      chavePix: v.chave_pix,
      pixCopiaCola: v.pix_copia_cola,
    };
  });

  app.get('/api/pix/qr.svg', async (req, reply) => {
    const { pix_copia_cola: payload } = buscar.get();
    if (!qrCache.has(payload)) {
      qrCache.clear();
      qrCache.set(
        payload,
        await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
      );
    }
    reply.header('Cache-Control', 'no-cache').type('image/svg+xml');
    return qrCache.get(payload);
  });
}
