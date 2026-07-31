-- Fase 3 - Dashboards personalizados
-- Layouts salvos do dashboard (widgets + posições)

CREATE TABLE IF NOT EXISTS flow_data.dashboards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descricao VARCHAR(255) DEFAULT NULL,
    widgets JSON DEFAULT NULL COMMENT '[{tipo, titulo, x, y, w, h, oculto}]',
    ativo TINYINT(1) DEFAULT 1,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
