import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, gerarPixCopiaCola, normalizarTexto } from '../src/pix.js';

test('crc16 CCITT-FALSE bate com o valor de verificação padrão', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('gera o BR Code de exemplo do manual do Banco Central', () => {
  const payload = gerarPixCopiaCola({
    chave: '123e4567-e12b-12d1-a456-426655440000',
    nome: 'Fulano de Tal',
    cidade: 'Brasília',
  });
  assert.ok(
    payload.startsWith(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008Brasilia62070503***6304'
    ),
    payload
  );
  assert.equal(
    gerarPixCopiaCola({
      chave: '123e4567-e12b-12d1-a456-426655440000',
      nome: 'Fulano de Tal',
      cidade: 'BRASILIA',
    }),
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D'
  );
});

test('payload estático não tem campo 54 (valor)', () => {
  const payload = gerarPixCopiaCola({ chave: 'a@b.com', nome: 'X', cidade: 'Y' });
  // percorre os TLVs de primeiro nível
  const ids = [];
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    ids.push(id);
    i += 4 + len;
  }
  assert.ok(!ids.includes('54'));
  assert.deepEqual(ids, ['00', '26', '52', '53', '58', '59', '60', '62', '63']);
});

test('normaliza nome e cidade', () => {
  assert.equal(normalizarTexto('João da Conceição Açúcar Longo', 25), 'Joao da Conceicao Acucar');
  assert.equal(normalizarTexto('São Luís', 15), 'Sao Luis');
});
