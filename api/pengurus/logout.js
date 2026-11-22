'use strict';
const { assertSameOrigin, handleCors, clearSessionCookie, methodNotAllowed, sendJson } = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try { assertSameOrigin(req); } catch (error) { return sendJson(res, error.status || 403, { error: error.message }); }
  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
};
