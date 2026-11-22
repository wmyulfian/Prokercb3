'use strict';

const {
  assertSameOrigin,
  handleCors,
  FieldValue,
  errorStatus,
  methodNotAllowed,
  readBody,
  requirePengurusSession,
  sendJson,
} = require('../../lib/server');

const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try { assertSameOrigin(req); } catch (error) { return sendJson(res, error.status || 403, { error: error.message }); }
  try {
    const { db, person } = await requirePengurusSession(req);
    const body = readBody(req);
    const nama = clean(body.nama, 180);
    const tahun = Number(body.tahun);
    if (!nama) return sendJson(res, 400, { error: 'Nama kegiatan wajib diisi.' });
    if (!Number.isInteger(tahun) || tahun < 2020 || tahun > 2100) return sendJson(res, 400, { error: 'Tahun program tidak valid.' });

    const data = {
      nama,
      tahun,
      bidang: clean(body.bidang, 120),
      frekuensi: clean(body.frekuensi, 40) || 'Insidental',
      tanggal: clean(body.tanggal, 20),
      deskripsi: clean(body.deskripsi, 5000),
      budget: Math.max(0, Number(body.budget) || 0),
      penanggungJawab: clean(body.penanggungJawab, 180) || person.nama,
      pengurusId: person.id,
      pengurusNama: person.nama,
      status: 'pending',
      createdBy: `internal:${person.id}`,
      createdAt: FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('usulan_program').add(data);
    return sendJson(res, 201, { ok: true, id: ref.id });
  } catch (error) {
    return sendJson(res, errorStatus(error), { error: error.message || 'Gagal mengirim usulan program.' });
  }
};
