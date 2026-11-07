// Prévia de link (Open Graph) para WhatsApp, Telegram e afins.
// Esses robôs não executam JavaScript: as tags têm de vir no HTML do servidor,
// e og:image precisa de URL absoluta. Como a URL pública varia (túnel, rede
// local), ela é montada a partir do próprio pedido.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escaparAtributo(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Largura e altura de um JPEG ou PNG, sem dependência externa. */
export function dimensoesImagem(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marcador = buffer[i + 1];
      // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 carregam as dimensões.
      const ehSOF =
        (marcador >= 0xc0 && marcador <= 0xcf) &&
        marcador !== 0xc4 &&
        marcador !== 0xc8 &&
        marcador !== 0xcc;
      if (ehSOF) {
        return { altura: buffer.readUInt16BE(i + 5), largura: buffer.readUInt16BE(i + 7) };
      }
      if (marcador === 0xd8 || (marcador >= 0xd0 && marcador <= 0xd9)) {
        i += 2;
        continue;
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * Origem pública do pedido, para montar as URLs absolutas da prévia.
 * Atrás de um túnel, o Fastify vê http://127.0.0.1, então os cabeçalhos
 * x-forwarded-* vêm primeiro. Eles são usados só para montar o link da
 * prévia — nenhuma decisão de segurança depende deles.
 */
export function origemDoPedido(req) {
  const primeiro = (valor) => String(valor ?? '').split(',')[0].trim();
  const protocolo = primeiro(req.headers['x-forwarded-proto']) || req.protocol || 'http';
  const host = primeiro(req.headers['x-forwarded-host']) || req.host;
  return `${protocolo}://${host}`;
}

function formatarReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Monta as tags Open Graph. `imagem` é { caminho, largura, altura } ou null.
 * O WhatsApp exibe apenas UMA imagem na prévia e guarda o resultado em cache,
 * por isso a descrição traz a meta e não o total arrecadado, que ficaria velho.
 */
export function tagsOg({ origem, titulo, descricao, metaCentavos, imagem }) {
  const tituloPrevia = `${titulo} — vaquinha entre amigos`;
  const texto = String(descricao ?? '').trim();
  const comPonto = texto && !/[.!?]$/.test(texto) ? `${texto}.` : texto;
  const descricaoPrevia = `${comPonto} Meta: ${formatarReais(metaCentavos)}.`.trim();

  const tags = [
    ['og:type', 'website'],
    ['og:site_name', 'Vaquinha entre amigos'],
    ['og:locale', 'pt_BR'],
    ['og:url', `${origem}/`],
    ['og:title', tituloPrevia],
    ['og:description', descricaoPrevia],
  ];

  if (imagem) {
    tags.push(
      ['og:image', `${origem}${imagem.caminho}`],
      ['og:image:secure_url', `${origem}${imagem.caminho}`],
      ['og:image:type', imagem.caminho.endsWith('.png') ? 'image/png' : 'image/jpeg'],
      ['og:image:alt', titulo],
    );
    if (imagem.largura && imagem.altura) {
      tags.push(['og:image:width', String(imagem.largura)], ['og:image:height', String(imagem.altura)]);
    }
  }

  const linhas = tags.map(
    ([propriedade, conteudo]) =>
      `  <meta property="${propriedade}" content="${escaparAtributo(conteudo)}">`,
  );

  linhas.push(
    `  <meta name="description" content="${escaparAtributo(descricaoPrevia)}">`,
    `  <meta name="twitter:card" content="${imagem ? 'summary_large_image' : 'summary'}">`,
    `  <meta name="twitter:title" content="${escaparAtributo(tituloPrevia)}">`,
    `  <meta name="twitter:description" content="${escaparAtributo(descricaoPrevia)}">`,
  );
  if (imagem) {
    linhas.push(`  <meta name="twitter:image" content="${escaparAtributo(origem + imagem.caminho)}">`);
  }

  return linhas.join('\n');
}

/** Injeta as tags logo antes de </head>. */
export function injetarOg(html, tags) {
  return html.replace('</head>', `${tags}\n</head>`);
}
