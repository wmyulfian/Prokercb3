'use strict';

const {
  assertSameOrigin,
  handleCors,
  errorStatus,
  hashPassword,
  makeSession,
  methodNotAllowed,
  readBody,
  requirePengurusSession,
  sendJson,
  setSessionCookie,
  verifyPassword,
} = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try { assertSameOrigin(req); } catch (error) { return sendJson(res, error.status || 403, { error: error.message }); }
  try {
    const { accountRef, account } = await requirePengurusSession(req);
    const body = readBody(req);
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!(await verifyPassword(currentPassword, account))) {
      return sendJson(res, 400, { error: 'Password saat ini tidak sesuai.' });
    }
    const hash = await hashPassword(newPassword);
    const nextAccount = {
      ...hash,
      tokenVersion: Number(account.tokenVersion || 1) + 1,
      updatedAt: new Date(),
    };
    await accountRef.update(nextAccount);
    const updated = { ...account, ...nextAccount };
    setSessionCookie(res, makeSession(updated));
    return sendJson(res, 200, { ok: true, message: 'Password berhasil diperbarui.' });
  } catch (error) {
    return sendJson(res, errorStatus(error), { error: error.message || 'Gagal mengubah password.' });
  }
};
