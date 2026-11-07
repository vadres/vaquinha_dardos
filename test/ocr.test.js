import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairValor, extrairIdentificador } from '../public/ocr.js';

test('prefere o valor rotulado como pago, não o saldo', () => {
  const texto = `Comprovante de transferência
Saldo disponível R$ 1.234,56
Pix enviado
Valor pago
R$ 50,00
Tarifa R$ 0,00`;
  assert.equal(extrairValor(texto).centavos, 5000);
});

test('valor com milhar e acento no rótulo', () => {
  assert.equal(extrairValor('Valor da transferência: R$ 1.250,00').centavos, 125000);
});

test('sem rótulo, usa o primeiro valor com R$', () => {
  assert.equal(extrairValor('Pix\nR$ 25,90\nData 06/11/2026').centavos, 2590);
});

test('sem valor no texto devolve null', () => {
  assert.equal(extrairValor('Comprovante ilegível').centavos, null);
});

test('só saldo devolve null', () => {
  assert.equal(extrairValor('Saldo R$ 300,00').centavos, null);
});

test('extrai EndToEndId mesmo com quebras do OCR', () => {
  const id = 'E18236120202611061530s0123abcDEF';
  assert.equal(id.length, 32);
  assert.equal(extrairIdentificador(`ID da transação\n${id.slice(0, 16)} ${id.slice(16)}\n`), id);
  assert.equal(extrairIdentificador('sem id aqui'), null);
});
