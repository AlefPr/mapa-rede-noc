-- Fase 1 - Atualiza os EVENTs de agregação para incluir agent_id
-- Executar: mysql -u mapa_user -p mapa < 005b_eventos_agent_id.sql
-- (ou como root)

USE flow_data;

DROP EVENT IF EXISTS agregar_flow_minuto;
DELIMITER $$
CREATE DEFINER=`mapa_user`@`localhost` EVENT `agregar_flow_minuto`
ON SCHEDULE EVERY 1 MINUTE STARTS CURRENT_TIMESTAMP
ON COMPLETION NOT PRESERVE ENABLE DO
BEGIN
  INSERT INTO flow_minuto (timestamp, agent_id, ip_src, ip_dst, port_src, port_dst, proto, bytes_total, packets_total, flows_count)
  SELECT
    DATE_FORMAT(stamp_inserted, '%Y-%m-%d %H:%i:00') AS ts,
    COALESCE(agent_id, 0) AS agent_id,
    ip_src,
    ip_dst,
    src_port,
    dst_port,
    CASE ip_proto
      WHEN 'tcp' THEN 6
      WHEN 'udp' THEN 17
      WHEN 'icmp' THEN 1
      WHEN 'igmp' THEN 2
      ELSE 0
    END AS proto_num,
    SUM(bytes) AS bytes_total,
    SUM(packets) AS packets_total,
    COUNT(*) AS flows_count
  FROM flow_bruto
  WHERE stamp_inserted >= NOW() - INTERVAL 5 MINUTE
  GROUP BY ts, agent_id, ip_src, ip_dst, src_port, dst_port, ip_proto
  ON DUPLICATE KEY UPDATE
    bytes_total = VALUES(bytes_total),
    packets_total = VALUES(packets_total),
    flows_count = VALUES(flows_count);
END$$
DELIMITER ;

DROP EVENT IF EXISTS agregar_flow_hora;
DELIMITER $$
CREATE DEFINER=`mapa_user`@`localhost` EVENT `agregar_flow_hora`
ON SCHEDULE EVERY 1 HOUR STARTS CURRENT_TIMESTAMP
ON COMPLETION NOT PRESERVE ENABLE DO
BEGIN
  INSERT INTO flow_hora (data, hora, agent_id, ip_src, ip_dst, bytes_total, packets_total)
  SELECT
    DATE(stamp_inserted) AS data,
    HOUR(stamp_inserted) AS hora,
    COALESCE(agent_id, 0) AS agent_id,
    ip_src,
    ip_dst,
    SUM(bytes) AS bytes_total,
    SUM(packets) AS packets_total
  FROM flow_bruto
  WHERE stamp_inserted >= NOW() - INTERVAL 2 HOUR
  GROUP BY data, hora, agent_id, ip_src, ip_dst
  ON DUPLICATE KEY UPDATE
    bytes_total = VALUES(bytes_total),
    packets_total = VALUES(packets_total);
END$$
DELIMITER ;
