CREATE TABLE IF NOT EXISTS vaquinha (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    titulo TEXT NOT NULL,
    descricao TEXT,
    imagens TEXT NOT NULL DEFAULT '[]',
    meta_centavos INTEGER NOT NULL CHECK (meta_centavos > 0),
    chave_pix TEXT NOT NULL,
    pix_copia_cola TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contribuicao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    identificador_pix TEXT UNIQUE,
    comprovante_hash TEXT UNIQUE,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
