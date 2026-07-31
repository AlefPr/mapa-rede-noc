-- Fase 2 - Clientes com múltiplos blocos de IP
-- Tabelas de clientes + blocos CIDR vinculados

CREATE TABLE IF NOT EXISTS flow_data.clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    documento VARCHAR(20) DEFAULT NULL COMMENT 'CNPJ / CPF',
    contato VARCHAR(120) DEFAULT NULL,
    telefone VARCHAR(30) DEFAULT NULL,
    email VARCHAR(120) DEFAULT NULL,
    endereco VARCHAR(200) DEFAULT NULL,
    plano VARCHAR(80) DEFAULT NULL COMMENT 'plano comercial, ex.: Fibra 300M',
    banda_contratada_mbps INT DEFAULT NULL COMMENT 'banda contratada em Mbps',
    ativo TINYINT(1) DEFAULT 1,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flow_data.cliente_blocos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    bloco VARCHAR(45) NOT NULL COMMENT 'CIDR, ex.: 189.0.0.0/22',
    descricao VARCHAR(120) DEFAULT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bloco_cliente FOREIGN KEY (cliente_id)
        REFERENCES flow_data.clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_blocos_cliente ON flow_data.cliente_blocos (cliente_id);
