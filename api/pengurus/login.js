'use strict';

const {
  assertSameOrigin,
  handleCors,
  checkLoginRateLimit,
  clearSessionCookie,
  errorStatus,
  getDb,
  makeSession,
  methodNotAllowed,
  normalizeLoginName,
  readBody,
  sendJson,
  setSessionCookie,
  verifyPassword,
} = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try { assertSameOrigin(req); } catch (error) { return sendJson(res, error.status || 403, { error: error.message }); }
  try {
    const body = readBody(req);
    const loginName = normalizeLoginName(body.loginName);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!loginName || !password) return sendJson(res, 400, { error: 'Masukkan nama login dan password.' });

    const rateRef = await checkLoginRateLimit(req);
    const db = getDb();
    const accountSnap = await db.collection('akun_pengurus').doc(loginName).get();
    const account = accountSnap.exists ? accountSnap.data() : null;
    const passwordOk = await verifyPassword(password, account);
    if (!account || !passwordOk || !account.aktif) {
      return sendJson(res, 401, { error: 'Nama login atau password tidak sesuai, atau akun sedang nonaktif.' });
    }

    const personSnap = await db.collection('pengurus').doc(account.pengurusId).get();
    if (!personSnap.exists || personSnap.data().aktif === false) {
      return sendJson(res, 403, { error: 'Akun Pengurus sedang nonaktif. Hubungi Admin.' });
    }

    await rateRef.delete().catch(() => {});
    setSessionCookie(res, makeSession(account));
    const person = personSnap.data();
    return sendJson(res, 200, {
      ok: true,
      user: {
        uid: `internal:${personSnap.id}`,
        role: 'pengurus',
        nama: person.nama,
        jabatan: person.jabatan || '',
        bidang: person.bidang || '',
        pengurusId: personSnap.id,
        loginName: account.loginName,
      },
    });
  } catch (error) {
    return sendJson(res, errorStatus(error), { error: error.message || 'Login Pengurus gagal.' });
  }
};
