import { gerarPixCopiaCola } from '../pix.js';

// Grava (ou atualiza) a única vaquinha a partir da configuração.
// Não toca nas contribuições já registradas.
export function aplicarSeed(db, config) {
  const pixCopiaCola = gerarPixCopiaCola({
    chave: config.pixChave,
    nome: config.pixNome,
    cidade: config.pixCidade,
  });

  db.prepare(
    `INSERT INTO vaquinha (id, titulo, descricao, imagens, meta_centavos, chave_pix, pix_copia_cola)
     VALUES (1, @titulo, @descricao, @imagens, @metaCentavos, @chavePix, @pixCopiaCola)
     ON CONFLICT(id) DO UPDATE SET
       titulo = excluded.titulo,
       descricao = excluded.descricao,
       imagens = excluded.imagens,
       meta_centavos = excluded.meta_centavos,
       chave_pix = excluded.chave_pix,
       pix_copia_cola = excluded.pix_copia_cola`
  ).run({
    titulo: config.titulo,
    descricao: config.descricao,
    imagens: JSON.stringify(config.imagens),
    metaCentavos: config.metaCentavos,
    chavePix: config.pixChave,
    pixCopiaCola,
  });
}
