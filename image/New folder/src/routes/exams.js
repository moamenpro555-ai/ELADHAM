'use strict';
// Exams. The teacher uploads the paper (images / PDF) and enters the answer key; the student answers on an answer
// sheet and the SERVER grades. The answer key is never sent to students before they submit.
const db = require('../db');
const { PgError } = require('../pg');
const { HttpError } = require('../http');
const { schema, rules, paramId } = require('../lib/validate');
const { sniff, LIMITS } = require('../lib/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

const teacherOnly = [requireAuth, requireRole('teacher')];
const studentOnly = [requireAuth, requireRole('student')];
const STAGES = ['primary', 'prep', 'secondary'];
const MAX_FILES = 15;
const RAW_LIMIT = LIMITS.pdf + 1024;

const bad = (field, msg) => new HttpError(400, 'VALIDATION_ERROR', msg, { field });

const metaOut = (r) => ({
  id: r.id, title: r.title, description: r.description, stage: r.stage, grade: r.grade, kind: r.kind, month: r.month,
  questionCount: r.question_count, choicesCount: r.choices_count, maxAttempts: r.max_attempts, showAnswers: r.show_answers,
  isPublished: r.is_published, hasCover: !!r.has_cover,
});

const EXAM_COLS = `e.id, e.title, e.description, e.stage, e.grade, e.kind, e.month, e.question_count, e.choices_count,
  e.max_attempts, e.show_answers, e.is_published, (e.cover_data IS NOT NULL) AS has_cover`;

// Teachers may open any exam. A student may open an exam only if it is published AND matches the student's stage and grade.
async function examAccess(ctx, id) {
  const { rows } = await db.query(`SELECT ${EXAM_COLS}, e.answer_key FROM exams e WHERE e.id = $1`, [id]);
  const e = rows[0];
  if (!e) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
  if (ctx.user.role === 'teacher') return e;
  const u = (await db.query('SELECT stage, grade FROM users WHERE id = $1', [ctx.user.id])).rows[0];
  if (!e.is_published || !u || u.stage !== e.stage || u.grade !== e.grade) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
  return e;
}

// answerKey: array of integers, one per question, each between 0 and choicesCount - 1
function checkKey(key, questionCount, choicesCount) {
  if (!Array.isArray(key) || key.length !== questionCount) throw bad('answerKey', `مفتاح الإجابات لازم يكون ${questionCount} إجابة بالظبط`);
  if (!key.every((k) => Number.isInteger(k) && k >= 0 && k < choicesCount)) throw bad('answerKey', 'في إجابة في المفتاح مش من الاختيارات المتاحة');
  return key;
}

const examFields = (optional) => ({
  title: rules.string({ min: 1, max: 200, optional }),
  description: rules.string({ max: 2000, optional: true }),
  stage: rules.oneOf(STAGES, { optional }),
  grade: rules.int({ min: 1, max: 6, optional }),
  kind: rules.oneOf(['session', 'month'], { optional }),
  month: rules.int({ min: 1, max: 12, optional: true, nullable: true }),
  questionCount: rules.int({ min: 1, max: 100, optional }),
  choicesCount: rules.int({ min: 2, max: 5, optional: true }),
  maxAttempts: rules.int({ min: 0, max: 50, optional: true }),
  showAnswers: rules.bool({ optional: true }),
  isPublished: rules.bool({ optional: true }),
});
const createSchema = schema({ ...examFields(false) });
const updateSchema = schema({ ...examFields(true) });

function normalizePlace(kind, month) {
  if (kind === 'month' && !month) throw bad('month', 'اختار الشهر لامتحان الشهر');
  return kind === 'month' ? month : null;
}

module.exports = (app) => {
  // ======================= student =======================
  app.get('/api/exams', ...studentOnly, async (ctx) => {
    const { rows } = await db.query(
      `SELECT ${EXAM_COLS},
              (SELECT count(*) FROM exam_attempts a WHERE a.exam_id = e.id AND a.user_id = $1)::int AS attempts_used,
              (SELECT max(a.score) FROM exam_attempts a WHERE a.exam_id = e.id AND a.user_id = $1) AS best_score,
              (SELECT max(a.created_at) FROM exam_attempts a WHERE a.exam_id = e.id AND a.user_id = $1) AS last_at
         FROM exams e JOIN users u ON u.id = $1
        WHERE e.is_published AND u.stage = e.stage AND u.grade = e.grade
        ORDER BY e.kind, e.month NULLS LAST, e.created_at`, [ctx.user.id]);
    ctx.json(200, { exams: rows.map((r) => ({ ...metaOut(r), attemptsUsed: r.attempts_used, bestScore: r.best_score, lastAttemptAt: r.last_at })) });
  });

  app.get('/api/exams/:id', requireAuth, async (ctx) => {
    const e = await examAccess(ctx, paramId(ctx));
    const files = (await db.query('SELECT id, content_type, filename, position FROM exam_files WHERE exam_id = $1 ORDER BY position', [e.id])).rows
      .map((f) => ({ id: f.id, contentType: f.content_type, filename: f.filename, position: f.position }));
    const attempts = (await db.query('SELECT attempt_no, score, total, created_at FROM exam_attempts WHERE exam_id = $1 AND user_id = $2 ORDER BY attempt_no', [e.id, ctx.user.id])).rows
      .map((a) => ({ attemptNo: a.attempt_no, score: a.score, total: a.total, createdAt: a.created_at }));
    ctx.json(200, { exam: metaOut(e), files, attempts, canAttempt: e.max_attempts === 0 || attempts.length < e.max_attempts });
  });

  app.get('/api/exams/:id/files/:fileId', requireAuth, async (ctx) => {
    const e = await examAccess(ctx, paramId(ctx));
    const { rows } = await db.query('SELECT content_type, data FROM exam_files WHERE id = $1 AND exam_id = $2', [paramId(ctx, 'fileId'), e.id]);
    if (!rows[0]) throw new HttpError(404, 'FILE_NOT_FOUND', 'الملف غير موجود');
    ctx.sendBinary(rows[0].content_type, rows[0].data);
  });

  app.get('/api/exams/:id/cover', requireAuth, async (ctx) => {
    const e = await examAccess(ctx, paramId(ctx));
    const { rows } = await db.query('SELECT cover_type, cover_data FROM exams WHERE id = $1', [e.id]);
    if (!rows[0] || !rows[0].cover_data) throw new HttpError(404, 'FILE_NOT_FOUND', 'مفيش صورة للامتحان');
    ctx.sendBinary(rows[0].cover_type, rows[0].cover_data);
  });

  app.post('/api/exams/:id/submit', ...studentOnly, async (ctx) => {
    const e = await examAccess(ctx, paramId(ctx));
    const answers = (ctx.body || {}).answers;
    if (!Array.isArray(answers) || answers.length !== e.question_count) throw bad('answers', `لازم تبعت ${e.question_count} إجابة (null للسؤال اللي ما اتحلش)`);
    if (!answers.every((a) => a === null || (Number.isInteger(a) && a >= 0 && a < e.choices_count))) throw bad('answers', 'في إجابة مش من الاختيارات المتاحة');
    const key = e.answer_key;
    const wrong = []; let score = 0; let skipped = 0;
    answers.forEach((a, i) => {
      if (a === null) { skipped++; wrong.push(i + 1); } else if (a === key[i]) score++; else wrong.push(i + 1);
    });
    const u = (await db.query('SELECT stage, grade FROM users WHERE id = $1', [ctx.user.id])).rows[0];
    let attemptNo;
    try {
      attemptNo = await db.tx(async (tx) => {
        const n = (await tx.query('SELECT count(*)::int AS n FROM exam_attempts WHERE exam_id = $1 AND user_id = $2', [e.id, ctx.user.id])).rows[0].n;
        if (e.max_attempts !== 0 && n >= e.max_attempts) throw new HttpError(403, 'NO_ATTEMPTS_LEFT', 'خلّصت عدد محاولات الامتحان ده');
        await tx.query(
          `INSERT INTO exam_attempts (exam_id, user_id, attempt_no, answers, score, total, wrong, stage, grade)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9)`,
          [e.id, ctx.user.id, n + 1, JSON.stringify(answers), score, e.question_count, JSON.stringify(wrong), u.stage, u.grade]);
        return n + 1;
      });
    } catch (err) {
      if (err instanceof PgError && err.code === '23505') throw new HttpError(409, 'ALREADY_SUBMITTED', 'الامتحان اتسلّم قبل كده');
      throw err;
    }
    ctx.json(201, {
      attempt: { attemptNo, score, total: e.question_count, percent: Math.round((score / e.question_count) * 100), skipped },
      wrong,
      // correct answers are revealed only after submission, and only if the teacher allowed it
      answerKey: e.show_answers ? key : null,
      yourAnswers: answers,
    });
  });

  // ======================= teacher =======================
  app.get('/api/teacher/exams', ...teacherOnly, async (ctx) => {
    const { rows } = await db.query(
      `SELECT ${EXAM_COLS},
              (SELECT count(*) FROM exam_files f WHERE f.exam_id = e.id)::int AS file_count,
              (SELECT count(*) FROM exam_attempts a WHERE a.exam_id = e.id)::int AS attempt_count
         FROM exams e ORDER BY e.stage, e.grade, e.kind, e.month NULLS LAST, e.created_at DESC`);
    ctx.json(200, { exams: rows.map((r) => ({ ...metaOut(r), fileCount: r.file_count, attemptCount: r.attempt_count })) });
  });

  app.post('/api/teacher/exams', ...teacherOnly, async (ctx) => {
    const b = createSchema(ctx.body);
    const choices = b.choicesCount ?? 4;
    const key = checkKey((ctx.body || {}).answerKey, b.questionCount, choices);
    const month = normalizePlace(b.kind, b.month);
    const { rows } = await db.query(
      `INSERT INTO exams (title, description, stage, grade, kind, month, question_count, choices_count, answer_key, max_attempts, show_answers, is_published, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13) RETURNING id`,
      [b.title, b.description ?? '', b.stage, b.grade, b.kind, month, b.questionCount, choices, JSON.stringify(key),
        b.maxAttempts ?? 1, b.showAnswers ?? true, b.isPublished ?? false, ctx.user.id]);
    ctx.json(201, await teacherDetail(rows[0].id));
  });

  async function teacherDetail(id) {
    const e = (await db.query(`SELECT ${EXAM_COLS}, e.answer_key FROM exams e WHERE e.id = $1`, [id])).rows[0];
    if (!e) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
    const files = (await db.query('SELECT id, content_type, filename, position, size FROM exam_files WHERE exam_id = $1 ORDER BY position', [id])).rows
      .map((f) => ({ id: f.id, contentType: f.content_type, filename: f.filename, position: f.position, size: f.size }));
    return { exam: { ...metaOut(e), answerKey: e.answer_key }, files };
  }

  app.get('/api/teacher/exams/:id', ...teacherOnly, async (ctx) => { ctx.json(200, await teacherDetail(paramId(ctx))); });

  app.patch('/api/teacher/exams/:id', ...teacherOnly, async (ctx) => {
    const id = paramId(ctx);
    const cur = (await db.query('SELECT * FROM exams WHERE id = $1', [id])).rows[0];
    if (!cur) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
    const b = updateSchema(ctx.body);
    const raw = ctx.body || {};
    const merged = {
      title: b.title ?? cur.title, description: b.description ?? cur.description, stage: b.stage ?? cur.stage, grade: b.grade ?? cur.grade,
      kind: b.kind ?? cur.kind, questionCount: b.questionCount ?? cur.question_count, choicesCount: b.choicesCount ?? cur.choices_count,
      maxAttempts: b.maxAttempts ?? cur.max_attempts, showAnswers: b.showAnswers ?? cur.show_answers, isPublished: b.isPublished ?? cur.is_published,
    };
    const month = normalizePlace(merged.kind, b.month !== undefined ? b.month : cur.month);
    const key = checkKey(raw.answerKey !== undefined ? raw.answerKey : cur.answer_key, merged.questionCount, merged.choicesCount);
    await db.query(
      `UPDATE exams SET title=$1, description=$2, stage=$3, grade=$4, kind=$5, month=$6, question_count=$7, choices_count=$8,
              answer_key=$9::jsonb, max_attempts=$10, show_answers=$11, is_published=$12, updated_at=now() WHERE id=$13`,
      [merged.title, merged.description, merged.stage, merged.grade, merged.kind, month, merged.questionCount, merged.choicesCount,
        JSON.stringify(key), merged.maxAttempts, merged.showAnswers, merged.isPublished, id]);
    ctx.json(200, await teacherDetail(id));
  });

  app.delete('/api/teacher/exams/:id', ...teacherOnly, async (ctx) => {
    const { rowCount } = await db.query('DELETE FROM exams WHERE id = $1', [paramId(ctx)]); // files and attempts go with it
    if (!rowCount) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
    ctx.json(200, { deleted: true });
  });

  // ---- uploads: raw bytes in the request body (Content-Type is ignored; the real type is detected from the bytes) ----
  app.put('/api/teacher/exams/:id/cover', { rawLimit: RAW_LIMIT }, ...teacherOnly, async (ctx) => {
    const id = paramId(ctx);
    const buf = await ctx.readRaw();
    const type = sniff(buf);
    if (!type || type === 'application/pdf') throw bad('file', 'صورة الامتحان لازم تكون PNG أو JPG أو WebP');
    if (buf.length > LIMITS.cover) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'صورة الامتحان لازم تكون أصغر من 1 ميجا');
    const { rowCount } = await db.query('UPDATE exams SET cover_type = $1, cover_data = $2, updated_at = now() WHERE id = $3', [type, buf, id]);
    if (!rowCount) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
    ctx.json(200, { hasCover: true });
  });

  app.delete('/api/teacher/exams/:id/cover', ...teacherOnly, async (ctx) => {
    await db.query('UPDATE exams SET cover_type = NULL, cover_data = NULL, updated_at = now() WHERE id = $1', [paramId(ctx)]);
    ctx.json(200, { hasCover: false });
  });

  app.post('/api/teacher/exams/:id/files', { rawLimit: RAW_LIMIT }, ...teacherOnly, async (ctx) => {
    const id = paramId(ctx);
    const exists = (await db.query('SELECT 1 FROM exams WHERE id = $1', [id])).rows[0];
    if (!exists) throw new HttpError(404, 'EXAM_NOT_FOUND', 'الامتحان غير موجود');
    const count = (await db.query('SELECT count(*)::int AS n FROM exam_files WHERE exam_id = $1', [id])).rows[0].n;
    if (count >= MAX_FILES) throw bad('file', `الحد الأقصى ${MAX_FILES} ملف للامتحان`);
    const buf = await ctx.readRaw();
    const type = sniff(buf);
    if (!type) throw bad('file', 'الملف لازم يكون صورة PNG أو JPG أو WebP أو ملف PDF');
    const limit = type === 'application/pdf' ? LIMITS.pdf : LIMITS.image;
    if (buf.length > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `حجم الملف أكبر من ${Math.round(limit / 1048576)} ميجا`);
    const name = String(ctx.query.name || '').replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 100);
    const { rows } = await db.query(
      `INSERT INTO exam_files (exam_id, position, content_type, filename, size, data)
       VALUES ($1, COALESCE((SELECT max(position) FROM exam_files WHERE exam_id = $1), 0) + 1, $2, $3, $4, $5)
       RETURNING id, content_type, filename, position, size`, [id, type, name, buf.length, buf]);
    const f = rows[0];
    ctx.json(201, { file: { id: f.id, contentType: f.content_type, filename: f.filename, position: f.position, size: f.size } });
  });

  app.delete('/api/teacher/exams/:id/files/:fileId', ...teacherOnly, async (ctx) => {
    const { rowCount } = await db.query('DELETE FROM exam_files WHERE id = $1 AND exam_id = $2', [paramId(ctx, 'fileId'), paramId(ctx)]);
    if (!rowCount) throw new HttpError(404, 'FILE_NOT_FOUND', 'الملف غير موجود');
    ctx.json(200, { deleted: true });
  });

  // ---- results log ----
  app.get('/api/teacher/results', ...teacherOnly, async (ctx) => {
    const q = ctx.query;
    const where = []; const vals = [];
    const add = (sql, v) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
    if (q.examId) add('a.exam_id = ?', paramId({ params: { examId: q.examId } }, 'examId'));
    if (q.stage && STAGES.includes(q.stage)) add('a.stage = ?', q.stage);
    if (q.grade && /^[1-6]$/.test(q.grade)) add('a.grade = ?', Number(q.grade));
    if (q.kind === 'session' || q.kind === 'month') add('e.kind = ?', q.kind);
    if (q.month && /^(?:[1-9]|1[0-2])$/.test(q.month)) add('e.month = ?', Number(q.month));
    const term = (q.q || '').trim().slice(0, 100);
    if (term) {
      vals.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(u.name ILIKE $${vals.length} OR u.email ILIKE $${vals.length})`);
    }
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const base = `FROM exam_attempts a JOIN exams e ON e.id = a.exam_id JOIN users u ON u.id = a.user_id ${w}`;
    const { rows } = await db.query(
      `SELECT a.id, a.attempt_no, a.score, a.total, a.wrong, a.stage, a.grade, a.created_at,
              e.id AS exam_id, e.title AS exam_title, e.kind, e.month, u.id AS user_id, u.name, u.email
         ${base} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`, vals);
    const sum = (await db.query(`SELECT count(*)::int AS n, COALESCE(round(avg(a.score * 100.0 / a.total)), 0)::int AS avg ${base}`, vals)).rows[0];
    ctx.json(200, {
      results: rows.map((r) => ({
        id: r.id, attemptNo: r.attempt_no, score: r.score, total: r.total, percent: Math.round((r.score / r.total) * 100), wrong: r.wrong,
        stage: r.stage, grade: r.grade, createdAt: r.created_at, examId: r.exam_id, examTitle: r.exam_title, kind: r.kind, month: r.month,
        studentId: r.user_id, studentName: r.name, studentEmail: r.email,
      })),
      total: sum.n, averagePercent: sum.avg, limit, offset,
    });
  });

  // Deleting an attempt lets the student take the exam again (when attempts are limited).
  app.delete('/api/teacher/results/:id', ...teacherOnly, async (ctx) => {
    const { rowCount } = await db.query('DELETE FROM exam_attempts WHERE id = $1', [paramId(ctx)]);
    if (!rowCount) throw new HttpError(404, 'ATTEMPT_NOT_FOUND', 'المحاولة غير موجودة');
    ctx.json(200, { deleted: true });
  });
};
