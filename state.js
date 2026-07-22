// state.js
// Centraliza todas as variáveis globais da aplicação.
export const state = {
    // Configurações de Rede
    get API_URL_BASE() {
        return '/api';
    },

    // Instâncias do Mapa e UI
    map: null,
    customInfoWindow: null,
    minimapInstance: null,
    minimapPolyline: null,
    minimapPolylineGlow: null,
    
    // Dados de Rotas
    rotasSalvas: [],
    filtros: { status: 'todos' }, // --> NOVA: Filtros ativos
    rotaSelecionada: null,
    coordenadasDaRotaAtual: [],
    
    // Estados de Ação (Flags)
    isDrawing: false,
    isSnapToRoadEnabled: false,
    isQuickDeleting: false,
    isEditingRoute: false,
    
    // Telemetria e Zabbix
    zabbixHosts: [],
    zabbixCacheLocal: {},
    zabbixStatusItems: [],
    trafficChartInstance: null,
    rxChartInstance: null,
    sparklineChartInstance: null,
    sparklineGeralInstance: null,
    
    // Controlos de Tempo e Animação
    trafficInterval: null,
    healthCheckInterval: null,
    animationOffset: 0,
    animationTimer: null,
    isMapMoving: false, // Otimização de scroll
    zoomDebounce: null, // Otimização de zoom
    
    // Autenticação
    token: null,
    usuario: null,
    autenticado: false,

    // Eventos de Rato Globais
    mouseX: 0,
    mouseY: 0,

// ---> ADICIONE ISTO: Cursores Customizados <---
    cursores: {
        lixeira: "url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2228%22 height=%2228%22 fill=%22%23ef4444%22 viewBox=%220 0 256 256%22%3E%3Cpath d=%22M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z%22%3E%3C/path%3E%3C/svg%3E') 14 14, crosshair"
    
}

}
// Listener para monitorizar a posição do rato globalmente (utilizado nos Hover Cards)
document.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
});

// Expondo o estado global para o Console (Apenas para Debug/Investigação)
window.state = state;