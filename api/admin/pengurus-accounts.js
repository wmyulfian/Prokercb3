'use strict';

const {
  assertSameOrigin,
  handleCors,
  FieldValue,
  errorStatus,
  getDb,
  hashPassword,
  methodNotAllowed,
  normalizeLoginName,
  readBody,
  sendJson,
  verifyAdminRequest,
} = require('../../lib/server');

const clean = (value, max = 180) => String(value || '').trim().slice(0, max);

async function listAccounts(db) {
  const snap = await db.collection('akun_pengurus').get();
  return snap.docs.map((doc) => {
    const item = doc.data();
    return {
      loginName: item.loginName || doc.id,
      pengurusId: item.pengurusId,
      aktif: item.aktif !== false,
      updatedAt: item.updatedAt?.toMillis?.() || null,
    };
  });
}

async function createPersonWithAccount(db, body, adminUid) {
  const nama = clean(body.nama);
  const jabatan = clean(body.jabatan, 120);
  const bidang = clean(body.bidang, 120);
  const loginName = normalizeLoginName(body.loginName);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!nama) throw Object.assign(new Error('Nama pengurus wajib diisi.'), { status: 400 });
  if (!loginName || !/^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(loginName)) {
    throw Object.assign(new Error('Nama login harus 3–40 karakter dan hanya berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung.'), { status: 400 });
  }
  const passwordFields = await hashPassword(password);
  const personRef = db.collection('pengurus').doc();
  const accountRef = db.collection('akun_pengurus').doc(loginName);
  const duplicatePersonQuery = db.collection('pengurus').where('loginName', '==', loginName);
  const person = { nama, jabatan, bidang, loginName, aktif: true, createdAt: FieldValue.serverTimestamp(), createdBy: adminUid };
  const account = {
    loginName,
    pengurusId: personRef.id,
    ...passwordFields,
    aktif: true,
    tokenVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: adminUid,
  };
  await db.runTransaction(async (tx) => {
    const [existingAccount, existingPerson] = await Promise.all([
      tx.get(accountRef),
      tx.get(duplicatePersonQuery),
    ]);
    if (existingAccount.exists || !existingPerson.empty) {
      throw Object.assign(new Error('Nama login tersebut sudah digunakan.'), { status: 409 });
    }
    tx.create(personRef, person);
    tx.create(accountRef, account);
  });
  return { id: personRef.id, ...person, createdAt: Date.now(), accountActive: true };
}

async function createAccountForExistingPerson(db, body, adminUid) {
  const pengurusId = clean(body.pengurusId, 128);
  const loginName = normalizeLoginName(body.loginName);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!pengurusId || !loginName) throw Object.assign(new Error('Data pengurus dan nama login wajib diisi.'), { status: 400 });
  if (!/^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(loginName)) throw Object.assign(new Error('Format nama login tidak valid.'), { status: 400 });
  const passwordFields = await hashPassword(password);
  const personRef = db.collection('pengurus').doc(pengurusId);
  const accountRef = db.collection('akun_pengurus').doc(loginName);
  const accountForPersonQuery = db.collection('akun_pengurus').where('pengurusId', '==', pengurusId);
  await db.runTransaction(async (tx) => {
    const [personSnap, accountSnap, existingAccountForPerson] = await Promise.all([
      tx.get(personRef),
      tx.get(accountRef),
      tx.get(accountForPersonQuery),
    ]);
    if (!personSnap.exists) throw Object.assign(new Error('Data pengurus tidak ditemukan.'), { status: 404 });
    if (accountSnap.exists) throw Object.assign(new Error('Nama login tersebut sudah digunakan.'), { status: 409 });
    if (!existingAccountForPerson.empty) throw Object.assign(new Error('Pengurus ini sudah memiliki akun login. Gunakan fitur reset password.'), { status: 409 });
    tx.create(accountRef, {
      loginName,
      pengurusId,
      ...passwordFields,
      aktif: personSnap.data().aktif !== false,
      tokenVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
    });
    tx.update(personRef, { loginName, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true, loginName, pengurusId };
}

async function resetPassword(db, body, adminUid) {
  const loginName = normalizeLoginName(body.loginName);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!loginName) throw Object.assign(new Error('Nama login tidak valid.'), { status: 400 });
  const passwordFields = await hashPassword(password);
  const ref = db.collection('akun_pengurus').doc(loginName);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Akun login pengurus tidak ditemukan.'), { status: 404 });
  await ref.update({
    ...passwordFields,
    tokenVersion: Number(snap.data().tokenVersion || 1) + 1,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });
  return { ok: true };
}

async function setActive(db, body, adminUid) {
  const loginName = normalizeLoginName(body.loginName);
  const aktif = body.aktif === true;
  if (!loginName) throw Object.assign(new Error('Nama login tidak valid.'), { status: 400 });
  const accountRef = db.collection('akun_pengurus').doc(loginName);
  const accountSnap = await accountRef.get();
  if (!accountSnap.exists) throw Object.assign(new Error('Akun login pengurus tidak ditemukan.'), { status: 404 });
  const account = accountSnap.data();
  const personRef = db.collection('pengurus').doc(account.pengurusId);
  const batch = db.batch();
  batch.update(accountRef, {
    aktif,
    tokenVersion: Number(account.tokenVersion || 1) + 1,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });
  batch.update(personRef, { aktif, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true, aktif };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  try {
    assertSameOrigin(req);
    const admin = await verifyAdminRequest(req);
    const db = getDb();
    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, accounts: await listAccounts(db) });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
    const body = readBody(req);
    let result;
    switch (body.action) {
      case 'createPerson':
        result = { ok: true, person: await createPersonWithAccount(db, body, admin.uid) };
        break;
      case 'createAccount':
        result = await createAccountForExistingPerson(db, body, admin.uid);
        break;
      case 'resetPassword':
        result = await resetPassword(db, body, admin.uid);
        break;
      case 'setActive':
        result = await setActive(db, body, admin.uid);
        break;
      default:
        return sendJson(res, 400, { error: 'Aksi pengelolaan akun tidak dikenal.' });
    }
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, errorStatus(error), { error: error.message || 'Permintaan pengelolaan akun gagal.' });
  }
};
