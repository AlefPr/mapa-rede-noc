require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');

const ZABBIX_URL = process.env.ZABBIX_API_URL || 'http://127.0.0.1/zabbix/api_jsonrpc.php';
const USER = process.env.ZABBIX_TEST_USER || 'Admin';
const PASS = process.env.ZABBIX_TEST_PASS || 'zabbix';
const HOST_ID = process.env.ZABBIX_TEST_HOST_ID || '10673';

async function testarZabbixDireto() {
    try {
        console.log("⏳ 1. Autenticando no Zabbix...");
        const authRes = await axios.post(ZABBIX_URL, {
            jsonrpc: '2.0', method: 'user.login',
            params: { username: USER, password: PASS }, id: 1
        });
        
        const token = authRes.data.result;
        if (!token) throw new Error("Falha na autenticação. Verifique usuário/senha.");
        console.log("✅ Autenticado com sucesso! Token obtido.\n");

        console.log(`⏳ 2. Vasculhando o Host ID ${HOST_ID} atrás de sinais RX...`);
        const itemRes = await axios.post(ZABBIX_URL, {
            jsonrpc: '2.0', method: 'item.get',
            params: {
                output: ['itemid', 'name', 'key_', 'lastvalue'],
                hostids: HOST_ID,
                search: { key_: "RX" }, // Busca qualquer chave que contenha RX
                searchWildcardsEnabled: true
            },
            auth: token, id: 2
        });

        const itens = itemRes.data.result;

        if (itens.length === 0) {
            console.log("❌ RESULTADO: O Zabbix NÃO está monitorando (ou não descobriu) nenhum item com a chave RX neste equipamento.");
        } else {
            console.log(`✅ RESULTADO: Encontrados ${itens.length} itens de RX no Zabbix! Veja a leitura em tempo real:\n`);
            
            itens.forEach(i => {
                console.log(`=========================================`);
                console.log(`🔹 NOME DA PORTA : ${i.name}`);
                console.log(`🔑 CHAVE (KEY)   : ${i.key_}`);
                console.log(`🆔 ITEM ID       : ${i.itemid}`);
                
                // Formatação visual para identificar se o sinal está vazio
                if (i.lastvalue === "" || i.lastvalue === null) {
                    console.log(`📡 SINAL ATUAL   : ⚠️ SEM DADOS (O Zabbix criou o item mas ainda não conseguiu ler o laser da GBIC)`);
                } else {
                    console.log(`📡 SINAL ATUAL   : 🟢 ${i.lastvalue} dBm`);
                }
                console.log(`=========================================\n`);
            });
        }
    } catch (error) {
        console.error("🚨 Erro Crítico no Teste:", error.message);
    }
}

testarZabbixDireto();