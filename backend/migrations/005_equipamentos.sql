-- Fase 1 - Multi-dispositivo / multi-vendor
-- Tabela de equipamentos + agent_id no fluxo

CREATE TABLE IF NOT EXISTS flow_data.equipamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    fabricante VARCHAR(40) DEFAULT NULL COMMENT 'Cisco, Huawei, Mikrotik, Juniper, Ubiquiti...',
    modelo VARCHAR(80) DEFAULT NULL,
    tipo VARCHAR(30) DEFAULT 'roteador' COMMENT 'roteador, switch, firewall, OLT, core',
    ip VARCHAR(45) DEFAULT NULL,
    localidade VARCHAR(100) DEFAULT NULL,
    agent_id INT DEFAULT NULL COMMENT 'vínculo com agent_id do fluxo pmacct',
    ativo TINYINT(1) DEFAULT 1,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Chave única do flow_minuto passa a incluir agent_id
-- (as linhas existentes têm agent_id=0, então a troca é segura)
ALTER TABLE flow_data.flow_minuto
    DROP INDEX uq_flow;

ALTER TABLE flow_data.flow_minuto
    ADD UNIQUE KEY uq_flow (timestamp, agent_id, ip_src, ip_dst, port_src, port_dst, proto);

ALTER TABLE flow_data.flow_minuto
    ADD INDEX idx_agent (agent_id);

ALTER TABLE flow_data.flow_hora
    ADD INDEX idx_hora_agent (data, hora, agent_id);
