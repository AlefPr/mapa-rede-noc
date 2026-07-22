import bcrypt from 'bcryptjs';
import { createInterface } from 'readline';
import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
import { createHash } from 'crypto';

config({ path: new URL('../.env', import.meta.url) });

const rl = createInterface({ input: process.stdin, output: process.stdout });

function pergunta(q) {
  return new Promise(r => rl.question(q, r));
}

function validarPassword(pw) {
  const erros = [];
  if (pw.length < 8) erros.push('mínimo 8 caracteres');
  if (!/(?=.*[a-z])/.test(pw)) erros.push('pelo menos uma minúscula');
  if (!/(?=.*[A-Z])/.test(pw)) erros.push('pelo menos uma maiúscula');
  if (!/(?=.*\d)/.test(pw)) erros.push('pelo menos um número');
  if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(pw)) erros.push('pelo menos um caractere especial');
  return erros;
}

async function main() {
  console.log('=== Criar Utilizador NOC ===\n');

  const username = (await pergunta('Username: ')).trim();
  if (!username) { console.log('Username inválido.'); rl.close(); return; }

  let password, confirm;
  while (true) {
    password = await pergunta('Password: ');
    const erros = validarPassword(password);
    if (erros.length > 0) {
      console.log(`  Requisitos: ${erros.join(', ')}`);
      continue;
    }
    confirm = await pergunta('Confirmar password: ');
    if (password !== confirm) {
      console.log('  Passwords não coincidem.');
      continue;
    }
    break;
  }

  rl.close();

  const hash = await bcrypt.hash(password, 10);

  const conn = await createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'mapa_user',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'mapa_rotas'
  });

  try {
    const [existentes] = await conn.execute('SELECT id FROM usuarios WHERE username = ?', [username]);
    if (existentes.length > 0) {
      console.log(`\nUtilizador "${username}" já existe.`);
      return;
    }

    await conn.execute('INSERT INTO usuarios (username, password) VALUES (?, ?)', [username, hash]);
    console.log(`\nUtilizador "${username}" criado com sucesso.`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
