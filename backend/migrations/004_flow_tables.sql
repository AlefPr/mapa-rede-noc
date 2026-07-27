-- Flow Analysis - Tabelas de tráfego

CREATE TABLE IF NOT EXISTS flow_bruto (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP(6) NOT NULL,
    agent_id INT DEFAULT 0,
    ip_src VARCHAR(45) NOT NULL,
    ip_dst VARCHAR(45) NOT NULL,
    port_src INT NOT NULL,
    port_dst INT NOT NULL,
    proto TINYINT NOT NULL,
    tos TINYINT DEFAULT NULL,
    bytes BIGINT NOT NULL DEFAULT 0,
    packets INT NOT NULL DEFAULT 0,
    INDEX idx_ts (timestamp),
    INDEX idx_src (ip_src),
    INDEX idx_dst (ip_dst)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flow_minuto (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    agent_id INT DEFAULT 0,
    ip_src VARCHAR(45) NOT NULL,
    ip_dst VARCHAR(45) NOT NULL,
    port_src INT NOT NULL,
    port_dst INT NOT NULL,
    proto TINYINT NOT NULL,
    bytes_total BIGINT NOT NULL DEFAULT 0,
    packets_total INT NOT NULL DEFAULT 0,
    flows_count INT NOT NULL DEFAULT 1,
    INDEX idx_ts (timestamp),
    INDEX idx_src (ip_src),
    INDEX idx_dst (ip_dst),
    INDEX idx_ts_src (timestamp, ip_src)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS flow_hora (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    data DATE NOT NULL,
    hora TINYINT NOT NULL,
    agent_id INT DEFAULT 0,
    ip_src VARCHAR(45) NOT NULL,
    ip_dst VARCHAR(45) NOT NULL,
    bytes_total BIGINT NOT NULL DEFAULT 0,
    packets_total INT NOT NULL DEFAULT 0,
    INDEX idx_data (data, hora),
    INDEX idx_ip (ip_src, ip_dst)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ataques (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_src VARCHAR(45) NOT NULL,
    bps BIGINT NOT NULL DEFAULT 0,
    alvos INT NOT NULL DEFAULT 0,
    descricao VARCHAR(255) DEFAULT NULL,
    status ENUM('ativo','mitigado','encerrado') DEFAULT 'ativo',
    INDEX idx_status (status),
    INDEX idx_ts (timestamp)
) ENGINE=InnoDB;
