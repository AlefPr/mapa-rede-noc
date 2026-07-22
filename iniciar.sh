#!/bin/bash

echo "--- INICIANDO SCRIPT DE DIAGNÓSTICO ---"
echo ""

# Passo 1: Verificar se a pasta NVM existe
export NVM_DIR="$HOME/.nvm"
echo "[PASSO 1] Verificando a pasta NVM em: $NVM_DIR"
if [ -d "$NVM_DIR" ]; then
    echo "      -> SUCESSO: O diretório NVM existe."
else
    echo "      -> ERRO FATAL: O diretório NVM não foi encontrado. A instalação do NVM falhou."
    exit 1
fi
echo ""

# Passo 2: Tentar carregar o nvm.sh e verificar se o comando 'nvm' é criado
echo "[PASSO 2] Carregando o script nvm.sh para criar o comando 'nvm'..."
source "$NVM_DIR/nvm.sh"

if command -v nvm &> /dev/null; then
    echo "      -> SUCESSO: O comando 'nvm' foi carregado e agora existe!"
else
    echo "      -> ERRO FATAL: Carregamos o nvm.sh, mas o comando 'nvm' AINDA não foi encontrado. Isso indica um problema no próprio script do NVM ou no seu shell."
    exit 1
fi
echo ""

# Passo 3: Tentar usar o 'nvm' para ativar o Node.js
echo "[PASSO 3] Usando 'nvm' para ativar a versão padrão do Node.js..."
nvm use default
echo ""

# Passo 4: Verificar se o comando 'npm' agora existe
echo "[PASSO 4] Verificando se o comando 'npm' agora existe no sistema..."
if command -v npm &> /dev/null; then
    echo "      -> SUCESSO: O comando 'npm' foi encontrado!"
    echo "      -> Caminho do npm: $(command -v npm)"
else
    echo "      -> ERRO FATAL: Ativamos o NVM e o Node, mas o comando 'npm' AINDA não foi encontrado."
    exit 1
fi
echo ""

# Passo 5: Se tudo deu certo, iniciar o servidor
echo "[PASSO 5] Tudo parece OK. Tentando iniciar o servidor..."
cd backend
npm run dev

echo "--- FIM DO SCRIPT ---"
