import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

const envPath = path.join(process.cwd(), '.env.local');
const env = parseEnv(await readFile(envPath, 'utf8'));
const projectUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!projectUrl || !publishableKey) {
  throw new Error('.env.local에 Supabase URL과 Publishable Key가 필요합니다.');
}

const headers = { apikey: publishableKey };
const authResponse = await fetch(`${projectUrl}/auth/v1/settings`, { headers });
if (!authResponse.ok) throw new Error(`Auth 연결 실패: HTTP ${authResponse.status}`);

const protectedTables = ['user_preferences', 'user_bible_state', 'verse_notes', 'churches', 'messages'];
for (const table of protectedTables) {
  const databaseResponse = await fetch(
    `${projectUrl}/rest/v1/${table}?select=*&limit=1`,
    { headers }
  );
  const databaseBody = await databaseResponse.json().catch(() => ({}));
  if (databaseResponse.status !== 401 || databaseBody.code !== '42501') {
    throw new Error(`${table} 익명 접근이 예상대로 차단되지 않았습니다: HTTP ${databaseResponse.status}`);
  }
}

const rpcResponse = await fetch(`${projectUrl}/rest/v1/rpc/create_conversation`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_kind: 'direct', conversation_name: null, member_ids: [] }),
});
const rpcBody = await rpcResponse.json().catch(() => ({}));
if (rpcResponse.status !== 401 || rpcBody.code !== '42501') {
  throw new Error(`익명 RPC 실행이 예상대로 차단되지 않았습니다: HTTP ${rpcResponse.status}`);
}

const forgedOwner = `forged-${Date.now()}`;
const storageResponse = await fetch(
  `${projectUrl}/storage/v1/object/avatars/${forgedOwner}/probe.txt`,
  {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/plain' },
    body: 'storage-policy-probe',
  }
);
const storageBody = await storageResponse.json().catch(() => ({}));
if (storageBody.code !== 'AccessDenied') {
  throw new Error(`위조 Storage 쓰기가 예상대로 차단되지 않았습니다: HTTP ${storageResponse.status}`);
}

const authSettings = await authResponse.json();
console.log('Supabase 원격 통합 검사 통과');
console.log(`- Auth 연결: 정상`);
console.log(`- 이메일 로그인: ${authSettings.external?.email ? '활성' : '비활성'}`);
console.log(`- 익명 계정 데이터 접근: ${protectedTables.length}개 핵심 테이블 차단됨`);
console.log('- 익명 계정 RPC 실행: 차단됨');
console.log('- 위조 Storage 경로 쓰기: 차단됨');
