-- Cleanup: apaga dados antigos (roda 1x/dia via cron)
DELETE FROM flow_data.flow_bruto WHERE timestamp < NOW() - INTERVAL 2 HOUR;
DELETE FROM flow_data.flow_minuto WHERE timestamp < NOW() - INTERVAL 7 DAY;
DELETE FROM flow_data.flow_hora WHERE data < CURDATE() - INTERVAL 90 DAY;
DELETE FROM flow_data.ataques WHERE status = 'encerrado' AND timestamp < NOW() - INTERVAL 30 DAY;
OPTIMIZE TABLE flow_data.flow_bruto, flow_data.flow_minuto, flow_data.flow_hora;
