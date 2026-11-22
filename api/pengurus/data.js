'use strict';

const {
  assertSameOrigin,
  handleCors,
  docToObject,
  errorStatus,
  methodNotAllowed,
  requirePengurusSession,
  sendJson,
} = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    assertSameOrigin(req);
    const { db, person } = await requirePengurusSession(req);
    const pid = person.id;
    const [programSnap, proposalSnap] = await Promise.all([
      db.collection('program_kerja').where('penanggungJawabId', '==', pid).get(),
      db.collection('usulan_program').where('pengurusId', '==', pid).get(),
    ]);
    return sendJson(res, 200, {
      ok: true,
      user: {
        uid: `internal:${pid}`,
        role: 'pengurus',
        nama: person.nama,
        jabatan: person.jabatan || '',
        bidang: person.bidang || '',
        pengurusId: pid,
        loginName: person.loginName || '',
      },
      people: [person],
      programs: programSnap.docs.map(docToObject),
      proposals: proposalSnap.docs.map(docToObject),
    });
  } catch (error) {
    return sendJson(res, errorStatus(error), { error: error.message || 'Gagal memuat data Pengurus.' });
  }
};
