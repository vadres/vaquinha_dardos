// Leitura do comprovante no navegador. Nada aqui é enviado ao servidor.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let tesseractPromise;
let pdfjsPromise;

function carregarTesseract() {
  tesseractPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => {
      tesseractPromise = undefined;
      reject(new Error('Não foi possível carregar o leitor de imagens (Tesseract).'));
    };
    document.head.appendChild(s);
  });
  return tesseractPromise;
}

function carregarPdfjs() {
  pdfjsPromise ??= import(PDFJS_URL)
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    })
    .catch(() => {
      pdfjsPromise = undefined;
      throw new Error('Não foi possível carregar o leitor de PDF (PDF.js).');
    });
  return pdfjsPromise;
}

async function ocrImagem(imagem, aoProgredir) {
  const Tesseract = await carregarTesseract();
  const worker = await Tesseract.createWorker('por', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') aoProgredir?.(`Lendo texto… ${Math.round(m.progress * 100)}%`);
      else if (m.status) aoProgredir?.('Preparando leitor…');
    },
  });
  try {
    const { data } = await worker.recognize(imagem);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

// Abre o PDF uma vez e devolve um leitor de páginas.
export async function abrirPdf(buffer) {
  const pdfjs = await carregarPdfjs();
  // getDocument transfere o buffer para o worker; passamos uma cópia.
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  return {
    numPages: pdf.numPages,
    async lerPagina(numero, aoProgredir) {
      const pagina = await pdf.getPage(numero);
      const conteudo = await pagina.getTextContent();
      const texto = conteudo.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('');
      if (texto.replace(/\s/g, '').length >= 20) return texto;

      // PDF escaneado: renderiza a página e aplica OCR.
      aoProgredir?.('PDF sem texto. Lendo como imagem…');
      const viewport = pagina.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const textoOcr = await ocrImagem(canvas, aoProgredir);
      canvas.width = canvas.height = 0;
      return textoOcr;
    },
    fechar: () => pdf.destroy(),
  };
}

export function lerImagem(arquivo, aoProgredir) {
  return ocrImagem(arquivo, aoProgredir);
}

// ---------- Extração ----------

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ROTULOS_FORTES = [
  'valor pago', 'valor da transferencia', 'valor do pix', 'valor enviado',
  'valor transferido', 'valor do pagamento', 'total pago', 'voce pagou', 'voce enviou',
];
const ROTULOS_FRACOS = ['valor', 'total', 'quantia'];
const ROTULOS_RUINS = ['saldo', 'tarifa', 'limite', 'taxa', 'juros', 'disponivel', 'cashback'];

const RE_VALOR = /(R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/g;

// Devolve { centavos, candidatos } com o valor mais provável de ser o Pix pago.
export function extrairValor(texto) {
  const candidatos = [];

  for (const m of texto.matchAll(RE_VALOR)) {
    const centavos = Number(m[2].replace(/\D/g, ''));
    if (!centavos) continue;

    // contexto: linha atual até o valor + linha anterior
    const inicio = m.index;
    const antes = semAcento(texto.slice(Math.max(0, inicio - 80), inicio));
    const linhas = antes.split('\n');
    const perto = linhas.slice(-2).join(' ');

    let pontos = m[1] ? 3 : 0;
    if (ROTULOS_FORTES.some((r) => perto.includes(r))) pontos += 10;
    else if (ROTULOS_FRACOS.some((r) => perto.includes(r))) pontos += 4;
    if (ROTULOS_RUINS.some((r) => perto.includes(r))) pontos -= 12;

    candidatos.push({ centavos, pontos, indice: inicio });
  }

  if (!candidatos.length) return { centavos: null, candidatos };
  const melhor = [...candidatos].sort((a, b) => b.pontos - a.pontos || a.indice - b.indice)[0];
  return { centavos: melhor.pontos > -5 ? melhor.centavos : null, candidatos };
}

// EndToEndId: E + ISPB (8 dígitos) + AAAAMMDDHHMM (12 dígitos) + 11 alfanuméricos.
export function extrairIdentificador(texto) {
  const compacto = texto.replace(/\s+/g, '');
  const m = compacto.match(/E\d{20}[0-9A-Za-z]{11}/);
  return m ? m[0] : null;
}
