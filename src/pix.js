// Monta o payload "BR Code" (EMV QRCPS) de um Pix estático sem valor fixo.
// Especificação: Manual de Padrões para Iniciação do Pix (Banco Central).

function tlv(id, valor) {
  const tamanho = String(valor.length).padStart(2, '0');
  if (valor.length > 99) throw new Error(`Campo ${id} excede 99 caracteres`);
  return `${id}${tamanho}${valor}`;
}

// Remove acentos e caracteres fora do conjunto aceito, truncado em `max`.
export function normalizarTexto(texto, max) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

// CRC16-CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF.
export function crc16(payload) {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function gerarPixCopiaCola({ chave, nome, cidade, txid = '***' }) {
  const nomeNorm = normalizarTexto(nome, 25) || 'ORGANIZADOR';
  const cidadeNorm = normalizarTexto(cidade, 15) || 'BRASIL';

  const contaMerchant = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave.trim());

  const semCrc =
    tlv('00', '01') +
    tlv('26', contaMerchant) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('58', 'BR') +
    tlv('59', nomeNorm) +
    tlv('60', cidadeNorm) +
    tlv('62', tlv('05', txid)) +
    '6304';

  return semCrc + crc16(semCrc);
}
