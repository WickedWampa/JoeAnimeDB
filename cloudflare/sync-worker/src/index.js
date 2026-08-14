const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Cache-Control': 'no-store'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearerToken(request) {
  const match = String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validVaultId(value) {
  return /^[A-Za-z0-9_-]{20,40}$/.test(String(value || ''));
}

function validEnvelope(envelope) {
  const ciphertext = String(envelope?.ciphertext || '');
  return envelope?.algorithm === 'AES-256-GCM'
    && ['gzip', 'none'].includes(envelope.compression)
    && /^[A-Za-z0-9_-]{12,40}$/.test(String(envelope.iv || ''))
    && ciphertext.length >= 20
    && ciphertext.length <= 1800000
    && /^[A-Za-z0-9_-]+$/.test(ciphertext);
}

async function bodyJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 1900000) throw new Error('The encrypted snapshot is too large.');
  return request.json();
}

function rowEnvelope(row) {
  return {
    algorithm: row.algorithm,
    compression: row.compression,
    iv: row.iv,
    ciphertext: row.ciphertext
  };
}

async function authenticatedVault(request, env, vaultId) {
  const token = bearerToken(request);
  if (!token) return { error: json({ error: 'Authorization is required.' }, 401) };
  const row = await env.DB.prepare(
    `SELECT vault_id, auth_hash, revision, algorithm, compression, iv, ciphertext,
            updated_at, device_id, app_version
       FROM sync_vaults
      WHERE vault_id = ?1`
  ).bind(vaultId).first();
  if (!row) return { error: json({ error: 'Cloud library not found.' }, 404) };
  if (row.auth_hash !== await sha256(token)) {
    return { error: json({ error: 'The recovery code does not unlock this cloud library.' }, 403) };
  }
  return { row };
}

async function createVault(request, env) {
  const token = bearerToken(request);
  if (!token) return json({ error: 'Authorization is required.' }, 401);

  let body;
  try {
    body = await bodyJson(request);
  } catch (error) {
    return json({ error: error?.message || 'Invalid request body.' }, 400);
  }
  if (!validVaultId(body.vaultId) || !validEnvelope(body.envelope)) {
    return json({ error: 'The encrypted snapshot payload is invalid.' }, 400);
  }

  const exists = await env.DB.prepare(
    'SELECT vault_id FROM sync_vaults WHERE vault_id = ?1'
  ).bind(body.vaultId).first();
  if (exists) return json({ error: 'A cloud library already exists for this recovery code.' }, 409);

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO sync_vaults (
       vault_id, auth_hash, revision, algorithm, compression, iv, ciphertext,
       created_at, updated_at, device_id, app_version
     ) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9)`
  ).bind(
    body.vaultId,
    await sha256(token),
    body.envelope.algorithm,
    body.envelope.compression,
    body.envelope.iv,
    body.envelope.ciphertext,
    now,
    String(body.deviceId || '').slice(0, 80),
    String(body.appVersion || '').slice(0, 40)
  ).run();

  return json({ vaultId: body.vaultId, revision: 1, updatedAt: now }, 201);
}

async function readVault(request, env, vaultId) {
  const auth = await authenticatedVault(request, env, vaultId);
  if (auth.error) return auth.error;
  return json({
    vaultId,
    revision: Number(auth.row.revision),
    updatedAt: auth.row.updated_at,
    deviceId: auth.row.device_id,
    appVersion: auth.row.app_version,
    envelope: rowEnvelope(auth.row)
  });
}

async function updateVault(request, env, vaultId) {
  const auth = await authenticatedVault(request, env, vaultId);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await bodyJson(request);
  } catch (error) {
    return json({ error: error?.message || 'Invalid request body.' }, 400);
  }
  if (!validEnvelope(body.envelope)) {
    return json({ error: 'The encrypted snapshot payload is invalid.' }, 400);
  }
  const expectedRevision = Number(body.expectedRevision || 0);
  if (expectedRevision !== Number(auth.row.revision)) {
    return json({
      error: 'The cloud library changed on another device. Restore it before uploading again.',
      revision: Number(auth.row.revision),
      updatedAt: auth.row.updated_at
    }, 409);
  }

  const nextRevision = expectedRevision + 1;
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE sync_vaults
        SET revision = ?1, algorithm = ?2, compression = ?3, iv = ?4,
            ciphertext = ?5, updated_at = ?6, device_id = ?7, app_version = ?8
      WHERE vault_id = ?9 AND revision = ?10`
  ).bind(
    nextRevision,
    body.envelope.algorithm,
    body.envelope.compression,
    body.envelope.iv,
    body.envelope.ciphertext,
    now,
    String(body.deviceId || '').slice(0, 80),
    String(body.appVersion || '').slice(0, 40),
    vaultId,
    expectedRevision
  ).run();

  if (!result.meta?.changes) {
    return json({ error: 'The cloud library changed during this upload. Restore it and try again.' }, 409);
  }
  return json({ vaultId, revision: nextRevision, updatedAt: now });
}

async function deleteVault(request, env, vaultId) {
  const auth = await authenticatedVault(request, env, vaultId);
  if (auth.error) return auth.error;
  await env.DB.prepare('DELETE FROM sync_vaults WHERE vault_id = ?1').bind(vaultId).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'JoeAnimeDB Sync' });
    }
    if (request.method === 'POST' && url.pathname === '/v1/vaults') {
      return createVault(request, env);
    }

    const match = url.pathname.match(/^\/v1\/vaults\/([A-Za-z0-9_-]+)$/);
    if (!match || !validVaultId(match[1])) return json({ error: 'Not found.' }, 404);
    const vaultId = match[1];

    if (request.method === 'GET') return readVault(request, env, vaultId);
    if (request.method === 'PUT') return updateVault(request, env, vaultId);
    if (request.method === 'DELETE') return deleteVault(request, env, vaultId);
    return json({ error: 'Method not allowed.' }, 405);
  }
};
