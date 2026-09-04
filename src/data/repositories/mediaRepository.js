import { requireSupabase } from '../../lib/supabase.js';

const BUCKETS = Object.freeze({
  avatar: 'avatars',
  church: 'church-media',
  message: 'message-attachments',
});

const LIMITS = Object.freeze({
  avatar: { bytes: 5 * 1024 * 1024, types: ['image/'] },
  church: { bytes: 8 * 1024 * 1024, types: ['image/'] },
  message: { bytes: 25 * 1024 * 1024, types: ['image/', 'audio/', 'application/pdf', 'text/plain'] },
});

function normalizeFileName(fileName) {
  return fileName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
}

export function validateStorageObjectPath({ bucket, path, userId, churchIds = [], conversationIds = [] }) {
  const segments = path.split('/').filter(Boolean);
  if (bucket === BUCKETS.avatar && segments[0] === userId && segments.length >= 2) return true;
  if (bucket === BUCKETS.church && churchIds.includes(segments[0]) && segments.length >= 2) return true;
  if (bucket === BUCKETS.message && conversationIds.includes(segments[0]) && segments.length >= 2) return true;
  throw new Error('허용되지 않은 Storage 경로입니다.');
}

export function createStorageObjectPath({ kind, ownerId, fileName }) {
  if (!BUCKETS[kind]) throw new Error(`지원하지 않는 미디어 종류입니다: ${kind}`);
  return `${ownerId}/${globalThis.crypto?.randomUUID?.() ?? Date.now()}-${normalizeFileName(fileName)}`;
}

export async function readImagePreview(file, maxBytes = 5 * 1024 * 1024) {
  if (!file?.type?.startsWith('image/')) throw new Error('이미지 파일만 선택할 수 있습니다.');
  if (file.size > maxBytes) {
    const limitMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    throw new Error(`이미지는 ${limitMb}MB 이하만 사용할 수 있습니다.`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadMedia({ kind, ownerId, file, userId, churchIds, conversationIds }) {
  const rule = LIMITS[kind];
  if (!rule) throw new Error(`지원하지 않는 미디어 종류입니다: ${kind}`);
  if (!rule.types.some((type) => type.endsWith('/') ? file.type.startsWith(type) : file.type === type)) {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  if (file.size > rule.bytes) {
    throw new Error(`파일은 최대 ${Math.round(rule.bytes / (1024 * 1024))}MB까지 업로드할 수 있습니다.`);
  }
  const bucket = BUCKETS[kind];
  const path = createStorageObjectPath({ kind, ownerId, fileName: file.name });
  validateStorageObjectPath({ bucket, path, userId, churchIds, conversationIds });
  const client = requireSupabase();
  const { data, error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return { bucket, path: data.path };
}

export async function createSignedMediaUrl({ bucket, path, expiresIn = 60 * 60 }) {
  if (!path) return '';
  const client = requireSupabase();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadAvatar(file, userId) {
  return uploadMedia({ kind: 'avatar', ownerId: userId, file, userId });
}

export async function uploadChurchMedia(file, churchId, churchIds) {
  return uploadMedia({ kind: 'church', ownerId: churchId, file, churchIds });
}

export async function uploadMessageAttachment(file, conversationId, conversationIds) {
  return uploadMedia({ kind: 'message', ownerId: conversationId, file, conversationIds });
}
