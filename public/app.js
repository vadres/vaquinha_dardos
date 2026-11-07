import { sha256Hex } from './sha256.js';
import { abrirPdf, lerImagem, extrairValor, extrairIdentificador } from './ocr.js';

const TAMANHO_MAX = 5 * 1024 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'application/pdf'];
const INTERVALO_POLLING = 5000;
const RE_E2E = /^E[0-9A-Za-z]{31}$/;

const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (centavos) => brl.format(centavos / 100);

const estado = {
  vaquinha: null,
  hash: null,
  pdf: null,
  processando: false,
};

// ---------- Progresso ----------

function renderizarProgresso({ totalCentavos, metaCentavos, percentual }) {
  $('total').textContent = fmt(totalCentavos);
  $('meta').textContent = fmt(metaCentavos);
  $('percentual').textContent = `${percentual.toLocaleString('pt-BR')}%`;
  $('barra-preenchida').style.width = `${Math.min(percentual, 100)}%`;
  $('barra').setAttribute('aria-valuenow', String(Math.min(Math.round(percentual), 100)));
  const faltam = metaCentavos - totalCentavos;
  $('faltam').textContent = faltam > 0 ? `faltam ${fmt(faltam)}` : 'meta batida! 🎯';
}

function renderizarVaquinha(v) {
  const primeira = !estado.vaquinha;
  estado.vaquinha = v;
  renderizarProgresso(v);
  if (!primeira) return;

  $('titulo').textContent = v.titulo;
  document.title = `Vaquinha: ${v.titulo}`;
  $('descricao').textContent = v.descricao ?? '';
  $('chave').textContent = v.chavePix;
  const galeria = $('galeria');
  galeria.replaceChildren(
    ...v.imagens.map((src, i) => {
      const img = new Image();
      img.src = src;
      img.alt = `${v.titulo} — foto ${i + 1}`;
      img.loading = i === 0 ? 'eager' : 'lazy';
      return img;
    })
  );
}

async function atualizar() {
  try {
    const res = await fetch('/api/vaquinha', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    renderizarVaquinha(await res.json());
    $('status-conexao').hidden = true;
  } catch {
    $('status-conexao').hidden = false;
  }
}

function iniciarPolling() {
  setInterval(() => {
    if (!document.hidden) atualizar();
  }, INTERVALO_POLLING);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizar();
  });
}

// ---------- Copiar Pix ----------

async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  // http:// fora de localhost: API de clipboard indisponível
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, texto.length);
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy falhou');
}

$('copiar').addEventListener('click', async () => {
  if (!estado.vaquinha) return;
  try {
    await copiarTexto(estado.vaquinha.pixCopiaCola);
    $('copiado').textContent = 'Código copiado! Cole no app do banco.';
  } catch {
    $('copiado').textContent = 'Não deu para copiar. Use o QR Code ou copie a chave acima.';
  }
  $('copiado').hidden = false;
  setTimeout(() => ($('copiado').hidden = true), 4000);
});

// ---------- Mensagens e estados ----------

function mensagem(texto, tipo = 'info') {
  const el = $('mensagem');
  el.textContent = texto;
  el.className = `mensagem ${tipo}`;
  el.hidden = !texto;
}

function statusOcr(texto) {
  $('ocr-status').hidden = !texto;
  if (texto) $('ocr-texto').textContent = texto;
}

// ---------- Valor ----------

function parseBRL(entrada) {
  let s = entrada.replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

const formatarCampo = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Comprovante ----------

function limparComprovante() {
  estado.hash = null;
  estado.pdf?.fechar();
  estado.pdf = null;
  $('arquivo').value = '';
  $('arquivo-nome').textContent = 'Nenhum arquivo';
  $('pagina-pdf').hidden = true;
  $('form').hidden = true;
  statusOcr('');
}

function preencherForm(texto) {
  const { centavos } = extrairValor(texto);
  const e2e = extrairIdentificador(texto);
  $('form').hidden = false;
  $('valor').value = centavos ? formatarCampo(centavos) : '';
  $('e2e').value = e2e ?? '';
  $('valor-dica').textContent = centavos
    ? 'Valor encontrado no comprovante. Confira e corrija se precisar.'
    : 'Não encontramos o valor no comprovante. Digite o valor que você pagou.';
  if (!centavos) $('valor').focus();
}

async function processarTexto(lerTexto) {
  estado.processando = true;
  $('form').hidden = true;
  try {
    statusOcr('Lendo comprovante…');
    const texto = await lerTexto((t) => statusOcr(t));
    preencherForm(texto);
  } catch (err) {
    // OCR falhou: segue com digitação manual
    preencherForm('');
    mensagem(`${err.message || 'Falha na leitura.'} Você pode digitar o valor manualmente.`, 'erro');
  } finally {
    statusOcr('');
    estado.processando = false;
  }
}

$('arquivo').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files?.[0];
  mensagem('');
  estado.pdf?.fechar();
  estado.pdf = null;
  $('pagina-pdf').hidden = true;
  if (!arquivo) return limparComprovante();

  $('arquivo-nome').textContent = arquivo.name;

  if (!TIPOS.includes(arquivo.type)) {
    limparComprovante();
    return mensagem('Formato não aceito. Envie JPG, PNG ou PDF.', 'erro');
  }
  if (arquivo.size > TAMANHO_MAX) {
    limparComprovante();
    return mensagem('Arquivo maior que 5 MB. Tire um print menor ou exporte de novo.', 'erro');
  }

  const buffer = await arquivo.arrayBuffer();
  estado.hash = await sha256Hex(buffer);

  if (arquivo.type === 'application/pdf') {
    await processarTexto(async (progresso) => {
      progresso('Abrindo PDF…');
      estado.pdf = await abrirPdf(buffer);
      if (estado.pdf.numPages > 1) {
        const select = $('pagina');
        select.replaceChildren(
          ...Array.from({ length: estado.pdf.numPages }, (_, i) => new Option(`Página ${i + 1}`, i + 1))
        );
        $('pagina-pdf').hidden = false;
      }
      return estado.pdf.lerPagina(1, progresso);
    });
  } else {
    await processarTexto((progresso) => lerImagem(arquivo, progresso));
  }
});

$('pagina').addEventListener('change', async (ev) => {
  if (!estado.pdf || estado.processando) return;
  mensagem('');
  const numero = Number(ev.target.value);
  await processarTexto((progresso) => estado.pdf.lerPagina(numero, progresso));
});

// ---------- Envio ----------

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mensagem('');

  const valorCentavos = parseBRL($('valor').value);
  const max = estado.vaquinha?.maxContribuicaoCentavos ?? Infinity;
  if (!valorCentavos || valorCentavos <= 0) {
    $('valor').focus();
    return mensagem('Informe um valor válido, por exemplo 50,00.', 'erro');
  }
  if (valorCentavos > max) {
    $('valor').focus();
    return mensagem(`O valor máximo por contribuição é ${fmt(max)}.`, 'erro');
  }
  if (!estado.hash) return mensagem('Selecione o comprovante de novo.', 'erro');

  const e2eBruto = $('e2e').value.trim();
  if (e2eBruto && !RE_E2E.test(e2eBruto)) {
    $('e2e').focus();
    return mensagem('Identificador inválido. Corrija ou deixe o campo vazio.', 'erro');
  }

  const botao = $('enviar');
  botao.disabled = true;
  botao.textContent = 'Registrando…';
  try {
    const res = await fetch('/api/contribuicoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: $('nome').value.trim() || null,
        valorCentavos,
        identificadorPix: e2eBruto || null,
        comprovanteHash: estado.hash,
      }),
    });
    const corpo = await res.json().catch(() => ({}));

    if (res.status === 201) {
      const nome = $('nome').value.trim();
      limparComprovante();
      $('nome').value = '';
      if (estado.vaquinha) {
        const v = { ...estado.vaquinha, totalCentavos: corpo.totalCentavos };
        v.percentual = Math.round((v.totalCentavos / v.metaCentavos) * 1000) / 10;
        renderizarVaquinha(v);
      }
      mensagem(`Valeu${nome ? `, ${nome}` : ''}! ${fmt(corpo.valorCentavos)} registrados. 🎯`, 'sucesso');
      atualizar();
    } else if (res.status === 409) {
      mensagem(corpo.mensagem || 'Este comprovante já foi registrado.', 'erro');
    } else if (res.status === 429) {
      mensagem(corpo.mensagem || 'Muitos envios. Aguarde um minuto.', 'erro');
    } else if (res.status === 400) {
      mensagem('Dados inválidos. Confira o valor e o identificador.', 'erro');
    } else {
      mensagem('Erro no servidor. Tente de novo em instantes.', 'erro');
    }
  } catch {
    mensagem('Sem conexão. Verifique a internet e tente de novo.', 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Registrar minha contribuição';
  }
});

atualizar();
iniciarPolling();
