# Vaquinha Dardos

Site de vaquinha via Pix para um único produto, em um único evento entre amigos.
Mostra a meta e o progresso, gera o QR Code Pix estático e registra as
contribuições declaradas por comprovante — o comprovante é lido no próprio
navegador (OCR) e **nunca** sai do dispositivo do participante.

Vaquinha configurada neste repositório: **jogo de dardos + proteção de parede em
EVA**, meta de **R$ 499,99**.

> **Atenção:** não há conferência bancária. Os valores exibidos são
> contribuições *declaradas*, não pagamentos verificados. O projeto assume
> confiança entre os participantes.

## Funcionalidades

- Página única e responsiva, pensada para celular.
- Barra de progresso com total arrecadado e percentual da meta.
- QR Code Pix estático (sem valor fixo) e botão **Copiar Pix**, gerados no servidor.
- Upload local de comprovante em JPG, PNG ou PDF, com OCR no navegador.
- Valor sugerido pelo OCR, sempre editável antes de confirmar.
- Bloqueio de comprovante duplicado (hash SHA-256 do arquivo e identificador Pix).
- Progresso atualizado por polling a cada 5 segundos.
- Persistência em SQLite.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Backend | Node.js >= 22 + Fastify 5 |
| Banco | SQLite (`better-sqlite3`) |
| Pix | BR Code estático gerado em `src/pix.js` + `qrcode` |
| Frontend | HTML, CSS e JavaScript sem build |
| OCR | Tesseract.js 5.1.1 e PDF.js 4.10.38 (via jsDelivr) |

## Requisitos

- Node.js 22 ou superior (usa `process.loadEnvFile()` e `node --test`).
- Uma chave Pix do organizador.

## Instalação

```bash
git clone <url-do-repositorio>
cd vaquinha_dardos
npm install
cp .env.example .env
```

## Configuração

Edite o `.env`. `PIX_CHAVE`, `PIX_NOME` e `PIX_CIDADE` são obrigatórios.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Escuta em toda a rede local |
| `DATABASE_PATH` | `./data/vaquinha.sqlite` | Arquivo do banco |
| `TITULO` | — | Nome do produto |
| `DESCRICAO` | — | Descrição curta |
| `IMAGENS` | — | Caminhos em `public/`, separados por vírgula |
| `META_CENTAVOS` | — | Meta em centavos (`49999` = R$ 499,99) |
| `MAX_CONTRIBUICAO_CENTAVOS` | — | Teto por contribuição |
| `RATE_LIMIT_POR_MINUTO` | `10` | Limite de requisições por minuto |
| `PIX_CHAVE` | — | CPF/CNPJ só números, telefone `+55DDDNUMERO`, e-mail minúsculo ou UUID |
| `PIX_NOME` | — | Recebedor, até 25 caracteres (acentos removidos) |
| `PIX_CIDADE` | — | Cidade, até 15 caracteres |

Depois de configurar, **escaneie o QR Code com o app do seu banco** e confira
nome e chave antes de divulgar o link.

Mudou o `.env`? Reinicie o servidor: a vaquinha é atualizada e as contribuições
já registradas permanecem no banco.

## Uso

```bash
npm start   # http://localhost:3000
npm run dev # com --watch
npm test    # testes de Pix, API e extração do OCR
```

Os amigos acessam pela rede local em `http://IP-DA-MAQUINA:3000`.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/vaquinha` | Configuração pública, total arrecadado e percentual |
| `GET` | `/api/pix/qr.svg` | QR Code Pix em SVG |
| `POST` | `/api/contribuicoes` | Registra uma contribuição declarada |
| `GET` | `/api/health` | Checagem de disponibilidade |

### `POST /api/contribuicoes`

Não recebe imagem nem PDF.

```json
{
  "nome": "Amigo (opcional)",
  "valorCentavos": 5000,
  "identificadorPix": null,
  "comprovanteHash": "sha256-em-hex-do-arquivo"
}
```

Respostas: `201` com `id`, `valorCentavos` e `totalCentavos`; `400` dados
inválidos; `409` hash ou identificador Pix já registrado; `429` excesso de
requisições; `500` erro interno. `totalCentavos` e `percentual` são sempre
calculados no servidor.

## Estrutura

```text
.
├── src/
│   ├── server.js          # Fastify, estáticos, rate limit, handler de erro
│   ├── config.js          # Leitura e validação do .env
│   ├── pix.js             # BR Code estático
│   ├── db/                # connection.js, schema.sql, seed.js
│   └── routes/            # vaquinha.js, contribuicoes.js
├── public/                # index.html, styles.css, app.js, ocr.js, sha256.js, images/
├── test/                  # api.test.js, ocr.test.js, pix.test.js
├── docs/ESPECIFICACAO.md  # Documento de projeto do MVP
└── data/                  # SQLite gerado em execução (não versionado)
```

## Banco de dados

Valores monetários são inteiros em centavos. Schema em
[src/db/schema.sql](src/db/schema.sql): tabela `vaquinha` (linha única) e tabela
`contribuicao`, com `UNIQUE` em `identificador_pix` e `comprovante_hash`.

Backup com o servidor rodando:

```bash
sqlite3 data/vaquinha.sqlite ".backup data/backup.sqlite"
```

## Segurança e operação

- Use HTTPS em produção.
- Comprovantes, CPF, dados bancários e texto do OCR não são armazenados.
- Não exponha o arquivo `.sqlite` publicamente.
- Hospede com **disco persistente**: deploy que apaga o filesystem apaga a arrecadação.
- Faça backup antes e durante o evento.
- Não existem rotas que alterem meta, chave Pix ou total.

## Diferenças em relação à especificação

[docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md) é o documento de projeto. A
implementação divergiu nos pontos abaixo:

- A coluna `imagem_url` virou `imagens` (array JSON), para exibir duas fotos. A
  API devolve `imagens` e também `maxContribuicaoCentavos`.
- As variáveis de ambiente são lidas com `process.loadEnvFile()`, sem `dotenv`.
- Tesseract.js e PDF.js vêm do jsDelivr: o celular precisa de internet para ler
  o comprovante. Falhando o OCR, o valor pode ser digitado.
- Em `http://` na rede local não há `crypto.subtle` nem `navigator.clipboard`;
  a página usa SHA-256 em JS puro (`public/sha256.js`) e cópia via `execCommand`.

## Status

MVP implementado. Testado localmente: API, persistência, OCR de PNG e PDF no
Chrome e bloqueio de comprovante duplicado.
