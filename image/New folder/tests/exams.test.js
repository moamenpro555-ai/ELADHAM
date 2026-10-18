'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, startServer, createUser, Client, db } = require('./helpers');

let srv, teacher, s1, s2, s3, anon;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body-bytes')]);
const PDF = Buffer.from('%PDF-1.4\n%fake pdf body\n');
const KEY = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]; // 10 questions

async function login(email, password) { const c = new Client(srv.base); const r = await c.login(email, password); assert.equal(r.status, 200); return c; }
const upload = (c, path, buf, type = 'application/octet-stream') => c.request('POST', path, undefined, { raw: buf, headers: { 'Content-Type': type } });

let T, A, B, C; // clients: teacher, student(prep 1), student(prep 2), student(no stage)
let examId;

before(async () => {
  await resetDb();
  srv = await startServer();
  teacher = await createUser({ email: 't@example.com', name: 'Teacher', role: 'teacher', password: 'Teacher-pass-1' });
  s1 = await createUser({ email: 'a@example.com', name: 'Ahmed Ali', password: 'Student-pass-1', stage: 'prep', grade: 1 });
  s2 = await createUser({ email: 'b@example.com', name: 'Basma', password: 'Student-pass-2', stage: 'prep', grade: 2 });
  s3 = await createUser({ email: 'c@example.com', name: 'Carim', password: 'Student-pass-3' });
  T = await login('t@example.com', 'Teacher-pass-1');
  A = await login('a@example.com', 'Student-pass-1');
  B = await login('b@example.com', 'Student-pass-2');
  C = await login('c@example.com', 'Student-pass-3');
  anon = new Client(srv.base);
});
after(async () => { srv.server.close(); await db.end(); });

const base = (over = {}) => ({ title: 'امتحان اكتوبر', stage: 'prep', grade: 1, kind: 'month', month: 10, questionCount: 10, answerKey: KEY, isPublished: true, ...over });

describe('teacher exam management is teacher-only', () => {
  test('anonymous gets 401, student gets 403 on every teacher exam route', async () => {
    const paths = [['GET', '/api/teacher/exams'], ['POST', '/api/teacher/exams'], ['GET', '/api/teacher/results'],
      ['PATCH', '/api/teacher/exams/00000000-0000-4000-8000-000000000000'], ['DELETE', '/api/teacher/exams/00000000-0000-4000-8000-000000000000'],
      ['POST', '/api/teacher/exams/00000000-0000-4000-8000-000000000000/files'], ['PUT', '/api/teacher/exams/00000000-0000-4000-8000-000000000000/cover']];
    for (const [m, p] of paths) {
      assert.equal((await anon.request(m, p, m === 'GET' || m === 'DELETE' ? undefined : {}, { csrf: false })).status, 401, 'anon ' + m + p);
      assert.equal((await A.request(m, p, m === 'GET' || m === 'DELETE' ? undefined : {})).status, 403, 'student ' + m + p);
    }
  });
});

describe('creating exams validates input', () => {
  test('answer key must match the question count and choices', async () => {
    assert.equal((await T.post('/api/teacher/exams', base({ answerKey: [0, 1] }))).status, 400);
    assert.equal((await T.post('/api/teacher/exams', base({ answerKey: [0, 1, 2, 3, 4, 0, 1, 2, 3, 0] }))).status, 400); // 4 is not a valid choice of 4
    assert.equal((await T.post('/api/teacher/exams', base({ answerKey: 'abc' }))).status, 400);
    assert.equal((await T.post('/api/teacher/exams', base({ answerKey: [0, 1, 2, 3, 0, 1, 2, 3, 0, -1] }))).status, 400);
  });
  test('a monthly exam needs a month; a session exam stores no month', async () => {
    assert.equal((await T.post('/api/teacher/exams', base({ month: undefined }))).status, 400);
    const r = await T.post('/api/teacher/exams', base({ kind: 'session', month: 5, title: 'حصة 1' }));
    assert.equal(r.status, 201);
    assert.equal(r.body.data.exam.month, null);
  });
  test('bad enum / ranges are rejected', async () => {
    assert.equal((await T.post('/api/teacher/exams', base({ stage: 'university' }))).status, 400);
    assert.equal((await T.post('/api/teacher/exams', base({ grade: 9 }))).status, 400);
    assert.equal((await T.post('/api/teacher/exams', base({ questionCount: 0, answerKey: [] }))).status, 400);
    assert.equal((await T.post('/api/teacher/exams', base({ month: 13 }))).status, 400);
  });
  test('creates a valid exam and the teacher sees the answer key', async () => {
    const r = await T.post('/api/teacher/exams', base());
    assert.equal(r.status, 201);
    examId = r.body.data.exam.id;
    assert.deepEqual(r.body.data.exam.answerKey, KEY);
    assert.equal(r.body.data.exam.isPublished, true);
  });
});

describe('who can see an exam', () => {
  test('matching stage+grade student sees it; other grade / no stage do not', async () => {
    const la = await A.get('/api/exams'); assert.ok(la.body.data.exams.some((e) => e.id === examId));
    const lb = await B.get('/api/exams'); assert.ok(!lb.body.data.exams.some((e) => e.id === examId));
    const lc = await C.get('/api/exams'); assert.equal(lc.body.data.exams.length, 0);
    assert.equal((await B.get('/api/exams/' + examId)).status, 404);
    assert.equal((await C.get('/api/exams/' + examId)).status, 404);
    assert.equal((await anon.get('/api/exams/' + examId)).status, 401);
    assert.equal((await anon.get('/api/exams')).status, 401);
  });
  test('the answer key is never sent to students before submitting', async () => {
    const d = await A.get('/api/exams/' + examId);
    assert.equal(d.status, 200);
    assert.ok(!/answerKey|answer_key/.test(d.text));
    assert.ok(!/answerKey|answer_key/.test((await A.get('/api/exams')).text));
  });
  test('unpublished exams are hidden from students (but not from the teacher)', async () => {
    const r = await T.post('/api/teacher/exams', base({ title: 'مخفي', isPublished: false }));
    const id = r.body.data.exam.id;
    assert.equal((await A.get('/api/exams/' + id)).status, 404);
    assert.ok(!(await A.get('/api/exams')).body.data.exams.some((e) => e.id === id));
    assert.equal((await T.get('/api/teacher/exams/' + id)).status, 200);
    assert.equal((await T.patch('/api/teacher/exams/' + id, { isPublished: true })).status, 200);
    assert.equal((await A.get('/api/exams/' + id)).status, 200);
    await T.patch('/api/teacher/exams/' + id, { isPublished: false });
  });
});

describe('uploads', () => {
  test('accepts PNG and PDF, detects the type from the bytes, rejects everything else', async () => {
    const p = await upload(T, `/api/teacher/exams/${examId}/files?name=${encodeURIComponent('صفحة 1.png')}`, PNG, 'text/plain');
    assert.equal(p.status, 201); assert.equal(p.body.data.file.contentType, 'image/png');
    const f = await upload(T, `/api/teacher/exams/${examId}/files`, PDF, 'image/png');
    assert.equal(f.status, 201); assert.equal(f.body.data.file.contentType, 'application/pdf');
    assert.equal((await upload(T, `/api/teacher/exams/${examId}/files`, Buffer.from('MZ\x90\x00 fake exe 123456789'))).status, 400);
    assert.equal((await upload(T, `/api/teacher/exams/${examId}/files`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).status, 400);
    assert.equal((await upload(T, `/api/teacher/exams/${examId}/files`, Buffer.from('<html><script>alert(1)</script></html>'))).status, 400);
  });
  test('size limits: cover > 1MB and body > 8MB are refused', async () => {
    const bigPng = Buffer.concat([PNG, Buffer.alloc(1100 * 1024)]);
    const r = await T.request('PUT', `/api/teacher/exams/${examId}/cover`, undefined, { raw: bigPng, headers: { 'Content-Type': 'image/png' } });
    assert.equal(r.status, 413);
    const huge = Buffer.concat([PDF, Buffer.alloc(9 * 1024 * 1024)]);
    assert.equal((await upload(T, `/api/teacher/exams/${examId}/files`, huge)).status, 413);
  });
  test('cover must be an image (not a PDF) and then it is served', async () => {
    assert.equal((await T.request('PUT', `/api/teacher/exams/${examId}/cover`, undefined, { raw: PDF, headers: { 'Content-Type': 'application/pdf' } })).status, 400);
    assert.equal((await T.request('PUT', `/api/teacher/exams/${examId}/cover`, undefined, { raw: PNG, headers: { 'Content-Type': 'image/png' } })).status, 200);
    const got = await A.get(`/api/exams/${examId}/cover`);
    assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png');
    assert.ok(got.buffer.equals(PNG), 'cover bytes survive the round trip');
    assert.equal((await B.get(`/api/exams/${examId}/cover`)).status, 404);
    assert.equal((await anon.get(`/api/exams/${examId}/cover`)).status, 401);
  });
  test('paper files are served only to allowed students, byte for byte', async () => {
    const d = await A.get('/api/exams/' + examId);
    assert.equal(d.body.data.files.length, 2);
    const [f1, f2] = d.body.data.files;
    const g1 = await A.get(`/api/exams/${examId}/files/${f1.id}`);
    assert.equal(g1.status, 200); assert.ok(g1.buffer.equals(PNG)); assert.equal(g1.headers.get('x-content-type-options'), 'nosniff');
    const g2 = await A.get(`/api/exams/${examId}/files/${f2.id}`);
    assert.ok(g2.buffer.equals(PDF)); assert.equal(g2.headers.get('content-type'), 'application/pdf');
    assert.equal((await B.get(`/api/exams/${examId}/files/${f1.id}`)).status, 404);
    assert.equal((await C.get(`/api/exams/${examId}/files/${f1.id}`)).status, 404);
    assert.equal((await anon.get(`/api/exams/${examId}/files/${f1.id}`)).status, 401);
    assert.equal((await T.get(`/api/exams/${examId}/files/${f1.id}`)).status, 200); // teacher preview
  });
  test('a file id from another exam cannot be read through this exam', async () => {
    const other = (await T.post('/api/teacher/exams', base({ title: 'ثاني', isPublished: true }))).body.data.exam.id;
    const f = (await A.get('/api/exams/' + examId)).body.data.files[0];
    assert.equal((await A.get(`/api/exams/${other}/files/${f.id}`)).status, 404);
  });
  test('uploading as a student is refused', async () => {
    assert.equal((await upload(A, `/api/teacher/exams/${examId}/files`, PNG)).status, 403);
  });
});

describe('grading', () => {
  test('rejects malformed answer sheets', async () => {
    assert.equal((await A.post(`/api/exams/${examId}/submit`, { answers: [0, 1] })).status, 400);
    assert.equal((await A.post(`/api/exams/${examId}/submit`, { answers: [...KEY.slice(0, 9), 7] })).status, 400);
    assert.equal((await A.post(`/api/exams/${examId}/submit`, { answers: [...KEY.slice(0, 9), 'x'] })).status, 400);
    assert.equal((await A.post(`/api/exams/${examId}/submit`, {})).status, 400);
  });
  test('other-grade students cannot submit; anonymous cannot; CSRF is required', async () => {
    assert.equal((await B.post(`/api/exams/${examId}/submit`, { answers: KEY })).status, 404);
    assert.equal((await anon.post(`/api/exams/${examId}/submit`, { answers: KEY }, { csrf: false })).status, 401);
    assert.equal((await A.post(`/api/exams/${examId}/submit`, { answers: KEY }, { csrf: false })).status, 403);
  });
  test('computes score, wrong list and skipped; reveals the key after submit', async () => {
    const answers = [0, 1, 2, 3, null, 0, 0, 3, 0, 1]; // q5 skipped, q6 wrong (key 1), q7 wrong (key 1) -> 7 right
    const r = await A.post(`/api/exams/${examId}/submit`, { answers });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.attempt.score, 7);
    assert.equal(r.body.data.attempt.total, 10);
    assert.equal(r.body.data.attempt.percent, 70);
    assert.equal(r.body.data.attempt.skipped, 1);
    assert.deepEqual(r.body.data.wrong, [5, 6, 7]);
    assert.deepEqual(r.body.data.answerKey, KEY);
  });
  test('one attempt only by default: second submit is refused, teacher can reset it', async () => {
    const again = await A.post(`/api/exams/${examId}/submit`, { answers: KEY });
    assert.equal(again.status, 403); assert.equal(again.body.error.code, 'NO_ATTEMPTS_LEFT');
    assert.equal((await A.get('/api/exams/' + examId)).body.data.canAttempt, false);
    const list = await T.get('/api/teacher/results?examId=' + examId);
    assert.equal(list.body.data.results.length, 1);
    assert.equal((await A.del('/api/teacher/results/' + list.body.data.results[0].id)).status, 403);
    assert.equal((await T.del('/api/teacher/results/' + list.body.data.results[0].id)).status, 200);
    const ok = await A.post(`/api/exams/${examId}/submit`, { answers: KEY });
    assert.equal(ok.status, 201); assert.equal(ok.body.data.attempt.percent, 100);
  });
  test('two simultaneous submits with 1 attempt allowed: exactly one wins', async () => {
    const id = (await T.post('/api/teacher/exams', base({ title: 'سباق', maxAttempts: 1 }))).body.data.exam.id;
    const rs = await Promise.all([1, 2, 3].map(() => A.post(`/api/exams/${id}/submit`, { answers: KEY })));
    assert.equal(rs.filter((r) => r.status === 201).length, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM exam_attempts WHERE exam_id = $1', [id])).rows[0].n, 1);
  });
  test('hide-answers exams do not reveal the key; unlimited attempts keep working', async () => {
    const id = (await T.post('/api/teacher/exams', base({ title: 'بدون إجابات', showAnswers: false, maxAttempts: 0 }))).body.data.exam.id;
    for (let i = 0; i < 3; i++) {
      const r = await A.post(`/api/exams/${id}/submit`, { answers: KEY });
      assert.equal(r.status, 201); assert.equal(r.body.data.answerKey, null); assert.equal(r.body.data.attempt.attemptNo, i + 1);
    }
  });
  test('a stored attempt keeps the student grade at that time', async () => {
    const row = (await db.query('SELECT stage, grade FROM exam_attempts WHERE user_id = $1 LIMIT 1', [s1.id])).rows[0];
    assert.deepEqual([row.stage, row.grade], ['prep', 1]);
  });
});

describe('results log', () => {
  test('teacher sees name, grade, exam, score; students and anonymous cannot', async () => {
    const r = await T.get('/api/teacher/results');
    assert.equal(r.status, 200);
    const row = r.body.data.results.find((x) => x.examId === examId);
    assert.equal(row.studentName, 'Ahmed Ali'); assert.equal(row.grade, 1); assert.equal(row.stage, 'prep'); assert.equal(row.examTitle, 'امتحان اكتوبر');
    assert.equal(row.percent, 100);
    assert.ok(typeof r.body.data.averagePercent === 'number');
    assert.equal((await A.get('/api/teacher/results')).status, 403);
  });
  test('filters work (exam, grade, month, search)', async () => {
    await B.post(`/api/exams/${examId}/submit`, { answers: KEY }); // B is grade 2 -> 404, nothing stored
    const byGrade2 = await T.get('/api/teacher/results?grade=2'); assert.equal(byGrade2.body.data.results.length, 0);
    const byGrade1 = await T.get('/api/teacher/results?grade=1'); assert.ok(byGrade1.body.data.results.length >= 1);
    assert.ok((await T.get('/api/teacher/results?month=10')).body.data.results.length >= 1);
    assert.equal((await T.get('/api/teacher/results?month=11')).body.data.results.length, 0);
    assert.ok((await T.get('/api/teacher/results?q=ahmed')).body.data.results.length >= 1);
    assert.equal((await T.get('/api/teacher/results?q=nobody')).body.data.results.length, 0);
  });
  test('SQL-injection-looking filters are treated as plain text', async () => {
    for (const q of ["' OR '1'='1", "'; DROP TABLE exams; --", '%', '_', '\\']) {
      const r = await T.get('/api/teacher/results?q=' + encodeURIComponent(q));
      assert.equal(r.status, 200, q);
      assert.equal(r.body.data.results.length, 0, q);
    }
    assert.equal((await T.get('/api/teacher/results?examId=not-a-uuid')).status, 400);
    assert.equal((await db.query('SELECT count(*)::int n FROM exams')).rows[0].n > 0, true);
  });
});

describe('editing and deleting', () => {
  test('changing the question count requires a matching key; editing the key works', async () => {
    assert.equal((await T.patch('/api/teacher/exams/' + examId, { questionCount: 12 })).status, 400);
    const r = await T.patch('/api/teacher/exams/' + examId, { questionCount: 11, answerKey: [...KEY, 2] });
    assert.equal(r.status, 200); assert.equal(r.body.data.exam.questionCount, 11);
    assert.equal((await T.patch('/api/teacher/exams/' + examId, { questionCount: 10, answerKey: KEY })).status, 200);
  });
  test('moving the exam to another grade hides it from the old grade', async () => {
    await T.patch('/api/teacher/exams/' + examId, { grade: 2 });
    assert.equal((await A.get('/api/exams/' + examId)).status, 404);
    assert.equal((await B.get('/api/exams/' + examId)).status, 200);
    await T.patch('/api/teacher/exams/' + examId, { grade: 1 });
  });
  test('switching kind to session clears the month', async () => {
    const r = await T.patch('/api/teacher/exams/' + examId, { kind: 'session' });
    assert.equal(r.body.data.exam.month, null);
    assert.equal((await T.patch('/api/teacher/exams/' + examId, { kind: 'month' })).status, 400); // month required again
    assert.equal((await T.patch('/api/teacher/exams/' + examId, { kind: 'month', month: 12 })).status, 200);
  });
  test('deleting an exam removes its files and attempts', async () => {
    const r = await T.del('/api/teacher/exams/' + examId);
    assert.equal(r.status, 200);
    assert.equal((await db.query('SELECT count(*)::int n FROM exam_files WHERE exam_id = $1', [examId])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM exam_attempts WHERE exam_id = $1', [examId])).rows[0].n, 0);
    assert.equal((await T.del('/api/teacher/exams/' + examId)).status, 404);
  });
});

describe('students get a stage and grade from the teacher', () => {
  test('create with stage/grade, invalid values refused, update works', async () => {
    const r = await T.post('/api/teacher/students', { name: 'Nour', email: 'nour@example.com', stage: 'secondary', grade: 3 });
    assert.equal(r.status, 201); assert.equal(r.body.data.student.stage, 'secondary'); assert.equal(r.body.data.student.grade, 3);
    assert.equal((await T.post('/api/teacher/students', { name: 'X', email: 'x@example.com', stage: 'nope' })).status, 400);
    assert.equal((await T.post('/api/teacher/students', { name: 'X', email: 'x@example.com', grade: 12 })).status, 400);
    const u = await T.patch('/api/teacher/students/' + r.body.data.student.id, { grade: 2 });
    assert.equal(u.status, 200); assert.equal(u.body.data.student.grade, 2);
    const list = await T.get('/api/teacher/students?q=nour');
    assert.equal(list.body.data.students[0].grade, 2);
  });
});
