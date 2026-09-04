import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { persistencePolicies } from '../src/data/persistence/policyRegistry.js';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const violations = [];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target) : [target];
  }));
  return files.flat().filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file));
}

const files = await collectFiles(sourceRoot);
for (const file of files) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const source = await readFile(file, 'utf8');
  const isRawStore = relative === 'src/data/persistence/rawLocalStore.js';
  const isRepository = relative.startsWith('src/data/repositories/');
  const isInfrastructure = relative.startsWith('src/data/persistence/') || relative.startsWith('src/lib/');

  if (!isRawStore && /(?:window\.)?localStorage\b/.test(source)) {
    violations.push(`${relative}: localStorage는 rawLocalStore에서만 사용할 수 있습니다.`);
  }
  if (/from\s+['"][^'"]*data\/localStore(?:\.js)?['"]/.test(source)) {
    violations.push(`${relative}: 제거된 localStore를 직접 import하고 있습니다.`);
  }
  if (!isRepository && !isInfrastructure && /from\s+['"][^'"]*(?:lib\/supabase|@supabase\/supabase-js)/.test(source)) {
    violations.push(`${relative}: Supabase client는 repository/infrastructure에서만 사용할 수 있습니다.`);
  }

  const keyMatches = source.matchAll(/['"](bibleon\.[A-Za-z0-9]+(?:[A-Za-z0-9._-]*))['"]/g);
  for (const [, key] of keyMatches) {
    if (key.startsWith('bibleon.account.') || key.startsWith('bibleon.guest.')) continue;
    if (!persistencePolicies[key]) {
      violations.push(`${relative}: registry에 등록되지 않은 저장 키 ${key}`);
    }
  }
}

if (violations.length) {
  console.error(['저장 경계 검사 실패:', ...violations.map((item) => `- ${item}`)].join('\n'));
  process.exit(1);
}

console.log(`저장 경계 검사 통과: ${files.length}개 소스 파일, ${Object.keys(persistencePolicies).length}개 정책 키`);

