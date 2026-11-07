function inteiroPositivo(nome, padrao) {
  const bruto = process.env[nome] ?? String(padrao);
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${nome} deve ser um inteiro positivo (recebido: "${bruto}")`);
  }
  return valor;
}

export function carregarConfig() {
  const pixChave = (process.env.PIX_CHAVE ?? '').trim();
  if (!pixChave) {
    throw new Error('PIX_CHAVE não configurada. Copie .env.example para .env e preencha a chave Pix.');
  }

  return {
    port: inteiroPositivo('PORT', 3000),
    host: process.env.HOST || '0.0.0.0',
    databasePath: process.env.DATABASE_PATH || './data/vaquinha.sqlite',
    titulo: process.env.TITULO || 'Jogo de dardos + proteção de parede',
    descricao:
      process.env.DESCRICAO ||
      'Alvo de sisal com dardos e proteção de parede em EVA',
    imagens: (process.env.IMAGENS || '/images/dardos.jpg,/images/protecao.jpeg')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    metaCentavos: inteiroPositivo('META_CENTAVOS', 49999),
    maxContribuicaoCentavos: inteiroPositivo('MAX_CONTRIBUICAO_CENTAVOS', 50000),
    rateLimitPorMinuto: inteiroPositivo('RATE_LIMIT_POR_MINUTO', 10),
    // Ligue só atrás de um túnel/proxy confiável (cloudflared, ngrok): faz o
    // rate limit contar por IP real. Com a porta exposta direto na internet,
    // permitiria falsear o IP pelo cabeçalho X-Forwarded-For.
    trustProxy: (process.env.TRUST_PROXY ?? 'false').trim() === 'true',
    pixChave,
    pixNome: process.env.PIX_NOME || 'ORGANIZADOR',
    pixCidade: process.env.PIX_CIDADE || 'BRASIL',
  };
}
