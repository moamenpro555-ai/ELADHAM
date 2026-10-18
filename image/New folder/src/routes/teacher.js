'use strict';
// Teacher dashboard API. EVERY route here is behind requireAuth + requireRole('teacher'); the role is read from the
// database for the logged-in session. There is deliberately no endpoint that creates or promotes a teacher
// (use `npm run create-teacher` on the server).
const config = require('../config');
const db = require('../db');
const { PgError } = require('../pg');
const { HttpError } = require('../http');
const { schema, rules, paramId } = require('../lib/validate');
const { hashPassword, validatePasswordStrength, generateTempPassword } = require('../lib/passwords');
const { randomToken, sha256 } = require('../lib/tokens');
const { requireAuth, requireRole } = require('../middleware/auth');

const guard = [requireAuth, requireRole('teacher')];

const STAGES = ['primary', 'prep', 'secondary'];
const KINDS = ['video', 'exam'];
const PROVIDERS = ['direct', 'signed'];

const courseOut = (r) => ({
  id: r.id, title: r.title, description: r.description, stage: r.stage, grade: r.grade, isPublished: r.is_published,
  lessonCount: r.lesson_count, enrolledCount: r.enrolled_count, createdAt: r.created_at, updatedAt: r.updated_at,
});
const lessonOut = (r) => ({
  id: r.id, courseId: r.course_id, title: r.title, description: r.description, kind: r.kind, section: r.section,
  position: r.position, videoProvider: r.video_provider, videoRef: r.video_ref, durationSeconds: r.duration_seconds,
  isPublished: r.is_published,
});
const studentOut = (r) => ({
  id: r.id, name: r.name, email: r.email, isActive: r.is_active, mustChangePassword: r.must_change_password, stage: r.stage ?? null, grade: r.grade ?? null,
  createdAt: r.created_at, courseCount: r.course_count, completedLessons: r.completed_lessons, lastActivity: r.last_activity,
});

// Builds "UPDATE ... SET a = $1, b = $2 WHERE id = $3" from a whitelist, so only known columns can be changed.
function buildUpdate(table, columns, data, id) {
  const sets = []; const vals = [];
  for (const [key, col] of Object.entries(columns)) {
    if (data[key] === undefined) continue;
    vals.push(data[key]); sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw new HttpError(400, 'VALIDATION_ERROR', 'مفيش بيانات للتعديل');
  vals.push(id);
  return { text: `UPDATE ${table} SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`, vals };
}

async function getCourse(id) {
  const { rows } = await db.query(
    `SELECT c.*, (SELECT count(*) FROM lessons l WHERE l.course_id = c.id)::int AS lesson_count,
            (SELECT count(*) FROM enrollments e WHERE e.course_id = c.id)::int AS enrolled_count
       FROM courses c WHERE c.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'COURSE_NOT_FOUND', 'الكورس غير موجود');
  return rows[0];
}

async function getStudent(id) {
  const { rows } = await db.query(`SELECT id, name, email, is_active FROM users WHERE id = $1 AND role = 'student'`, [id]);
  if (!rows[0]) throw new HttpError(404, 'STUDENT_NOT_FOUND', 'الطالب غير موجود');
  return rows[0];
}

const courseCreate = schema({
  title: rules.string({ min: 1, max: 200 }),
  description: rules.string({ max: 2000, optional: true }),
  stage: rules.oneOf(STAGES),
  grade: rules.int({ min: 1, max: 6 }),
  isPublished: rules.bool({ optional: true }),
});
const courseUpdate = schema({
  title: rules.string({ min: 1, max: 200, optional: true }),
  description: rules.string({ max: 2000, optional: true }),
  stage: rules.oneOf(STAGES, { optional: true }),
  grade: rules.int({ min: 1, max: 6, optional: true }),
  isPublished: rules.bool({ optional: true }),
});
const lessonFields = (optional) => ({
  title: rules.string({ min: 1, max: 200, optional }),
  description: rules.string({ max: 2000, optional: true }),
  kind: rules.oneOf(KINDS, { optional: true }),
  section: rules.string({ max: 100, optional: true }),
  videoProvider: rules.oneOf(PROVIDERS, { optional: true }),
  videoRef: rules.url({ optional: true }),
  durationSeconds: rules.int({ min: 0, max: 86400, optional: true, nullable: true }),
  isPublished: rules.bool({ optional: true }),
});
const lessonCreate = schema({ ...lessonFields(false), position: rules.int({ min: 0, max: 100000, optional: true }) });
const lessonUpdate = schema({ ...lessonFields(true), position: rules.int({ min: 0, max: 100000, optional: true }) });

module.exports = (app) => {
  // ---------------- courses ----------------
  app.get('/api/teacher/courses', ...guard, async (ctx) => {
    const { rows } = await db.query(
      `SELECT c.*, (SELECT count(*) FROM lessons l WHERE l.course_id = c.id)::int AS lesson_count,
              (SELECT count(*) FROM enrollments e WHERE e.course_id = c.id)::int AS enrolled_count
         FROM courses c ORDER BY c.stage, c.grade, c.title`);
    ctx.json(200, { courses: rows.map(courseOut) });
  });

  app.post('/api/teacher/courses', ...guard, async (ctx) => {
    const b = courseCreate(ctx.body);
    const { rows } = await db.query(
      `INSERT INTO courses (title, description, stage, grade, is_published, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [b.title, b.description ?? '', b.stage, b.grade, b.isPublished ?? false, ctx.user.id]);
    ctx.json(201, { course: courseOut(await getCourse(rows[0].id)) });
  });

  app.get('/api/teacher/courses/:id', ...guard, async (ctx) => {
    const course = await getCourse(paramId(ctx));
    const { rows } = await db.query('SELECT * FROM lessons WHERE course_id = $1 ORDER BY position, created_at', [course.id]);
    ctx.json(200, { course: courseOut(course), lessons: rows.map(lessonOut) });
  });

  app.patch('/api/teacher/courses/:id', ...guard, async (ctx) => {
    const id = paramId(ctx);
    await getCourse(id);
    const u = buildUpdate('courses', { title: 'title', description: 'description', stage: 'stage', grade: 'grade', isPublished: 'is_published' }, courseUpdate(ctx.body), id);
    await db.query(u.text, u.vals);
    ctx.json(200, { course: courseOut(await getCourse(id)) });
  });

  for (const [action, value] of [['publish', true], ['unpublish', false]]) {
    app.post(`/api/teacher/courses/:id/${action}`, ...guard, async (ctx) => {
      const id = paramId(ctx);
      await getCourse(id);
      await db.query('UPDATE courses SET is_published = $1, updated_at = now() WHERE id = $2', [value, id]);
      ctx.json(200, { course: courseOut(await getCourse(id)) });
    });
  }

  app.delete('/api/teacher/courses/:id', ...guard, async (ctx) => {
    const id = paramId(ctx);
    await getCourse(id);
    await db.query('DELETE FROM courses WHERE id = $1', [id]); // lessons, enrollments and progress go with it (ON DELETE CASCADE)
    ctx.json(200, { deleted: true });
  });

  // ---------------- lessons ----------------
  app.post('/api/teacher/courses/:id/lessons', ...guard, async (ctx) => {
    const courseId = paramId(ctx);
    await getCourse(courseId);
    const b = lessonCreate(ctx.body);
    const { rows } = await db.query(
      `INSERT INTO lessons (course_id, title, description, kind, section, position, video_provider, video_ref, duration_seconds, is_published)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::int, (SELECT COALESCE(max(position), 0) + 1 FROM lessons WHERE course_id = $1)), $7, $8, $9, $10)
       RETURNING *`,
      [courseId, b.title, b.description ?? '', b.kind ?? 'video', b.section ?? null, b.position ?? null,
        b.videoProvider ?? 'direct', b.videoRef ?? '', b.durationSeconds ?? null, b.isPublished ?? true]);
    ctx.json(201, { lesson: lessonOut(rows[0]) });
  });

  app.patch('/api/teacher/lessons/:id', ...guard, async (ctx) => {
    const id = paramId(ctx);
    const u = buildUpdate('lessons', {
      title: 'title', description: 'description', kind: 'kind', section: 'section', position: 'position',
      videoProvider: 'video_provider', videoRef: 'video_ref', durationSeconds: 'duration_seconds', isPublished: 'is_published',
    }, lessonUpdate(ctx.body), id);
    const { rows } = await db.query(u.text, u.vals);
    if (!rows[0]) throw new HttpError(404, 'LESSON_NOT_FOUND', 'الدرس غير موجود');
    ctx.json(200, { lesson: lessonOut(rows[0]) });
  });

  app.delete('/api/teacher/lessons/:id', ...guard, async (ctx) => {
    const { rowCount } = await db.query('DELETE FROM lessons WHERE id = $1', [paramId(ctx)]);
    if (!rowCount) throw new HttpError(404, 'LESSON_NOT_FOUND', 'الدرس غير موجود');
    ctx.json(200, { deleted: true });
  });

  // Reorder: the body must list EVERY lesson of the course exactly once, in the new order.
  const orderBody = schema({ lessonIds: rules.uuidArray({ max: 1000 }) });
  app.put('/api/teacher/courses/:id/lessons/order', ...guard, async (ctx) => {
    const courseId = paramId(ctx);
    await getCourse(courseId);
    const { lessonIds } = orderBody(ctx.body);
    const existing = (await db.query('SELECT id FROM lessons WHERE course_id = $1', [courseId])).rows.map((r) => r.id);
    const same = lessonIds.length === existing.length && new Set(lessonIds).size === lessonIds.length && lessonIds.every((x) => existing.includes(x));
    if (!same) throw new HttpError(400, 'INVALID_ORDER', 'لازم تبعت كل دروس الكورس مرة واحدة بالترتيب الجديد');
    await db.tx(async (tx) => {
      for (let i = 0; i < lessonIds.length; i++) {
        await tx.query('UPDATE lessons SET position = $1, updated_at = now() WHERE id = $2 AND course_id = $3', [i + 1, lessonIds[i], courseId]);
      }
    });
    const { rows } = await db.query('SELECT * FROM lessons WHERE course_id = $1 ORDER BY position', [courseId]);
    ctx.json(200, { lessons: rows.map(lessonOut) });
  });

  // ---------------- students ----------------
  app.get('/api/teacher/students', ...guard, async (ctx) => {
    const limit = Math.min(Math.max(parseInt(ctx.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(ctx.query.offset, 10) || 0, 0);
    const q = (ctx.query.q || '').trim().slice(0, 100);
    const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.is_active, u.must_change_password, u.created_at, u.stage, u.grade,
              (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id)::int AS course_count,
              (SELECT count(*) FROM lesson_progress p WHERE p.user_id = u.id AND p.completed)::int AS completed_lessons,
              (SELECT max(p.updated_at) FROM lesson_progress p WHERE p.user_id = u.id) AS last_activity
         FROM users u
        WHERE u.role = 'student' AND ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)
        ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`, [like, limit, offset]);
    const total = (await db.query(
      `SELECT count(*)::int AS n FROM users u WHERE u.role = 'student' AND ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)`, [like])).rows[0].n;
    ctx.json(200, { students: rows.map(studentOut), total, limit, offset });
  });

  const studentCreate = schema({
    name: rules.string({ min: 1, max: 120 }),
    email: rules.email(),
    password: rules.string({ min: 1, max: 128, trim: false, optional: true }),
    courseIds: rules.uuidArray({ max: 100, optional: true }),
    stage: rules.oneOf(STAGES, { optional: true }),
    grade: rules.int({ min: 1, max: 6, optional: true }),
  });
  app.post('/api/teacher/students', ...guard, async (ctx) => {
    const b = studentCreate(ctx.body);
    const tempPassword = b.password ?? generateTempPassword();
    const weak = validatePasswordStrength(tempPassword, b.email);
    if (weak) throw new HttpError(400, 'WEAK_PASSWORD', weak);
    const hash = await hashPassword(tempPassword);
    try {
      const student = await db.tx(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO users (email, name, password_hash, role, must_change_password, stage, grade) VALUES ($1, $2, $3, 'student', true, $4, $5)
           RETURNING id, name, email, is_active, must_change_password, stage, grade, created_at`, [b.email, b.name, hash, b.stage ?? null, b.grade ?? null]);
        for (const courseId of b.courseIds ?? []) {
          await tx.query('INSERT INTO enrollments (user_id, course_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [rows[0].id, courseId, ctx.user.id]);
        }
        return rows[0];
      });
      // The temporary password is returned ONCE here so the teacher can give it to the student. It is not stored in plain text.
      ctx.json(201, { student: studentOut({ ...student, course_count: (b.courseIds ?? []).length, completed_lessons: 0 }), temporaryPassword: tempPassword });
    } catch (e) {
      if (e instanceof PgError && e.code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'الإيميل ده مسجل قبل كده');
      if (e instanceof PgError && e.code === '23503') throw new HttpError(400, 'COURSE_NOT_FOUND', 'واحد من الكورسات المختارة غير موجود');
      throw e;
    }
  });

  const studentUpdate = schema({
    name: rules.string({ min: 1, max: 120, optional: true }), isActive: rules.bool({ optional: true }),
    stage: rules.oneOf(STAGES, { optional: true }), grade: rules.int({ min: 1, max: 6, optional: true }),
  });
  app.patch('/api/teacher/students/:id', ...guard, async (ctx) => {
    const id = paramId(ctx);
    await getStudent(id);
    const u = buildUpdate('users', { name: 'name', isActive: 'is_active', stage: 'stage', grade: 'grade' }, studentUpdate(ctx.body), id);
    const { rows } = await db.query(u.text, u.vals);
    if (rows[0].is_active === false) await db.query('DELETE FROM sessions WHERE user_id = $1', [id]); // disabled accounts are logged out at once
    ctx.json(200, { student: { id: rows[0].id, name: rows[0].name, email: rows[0].email, isActive: rows[0].is_active, stage: rows[0].stage, grade: rows[0].grade } });
  });

  // One-time link the teacher can send to a student who forgot the password (no e-mail service needed).
  app.post('/api/teacher/students/:id/reset-token', ...guard, async (ctx) => {
    const id = paramId(ctx);
    await getStudent(id);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + config.resetTokenHours * 3600 * 1000);
    await db.query('INSERT INTO password_reset_tokens (user_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4)', [id, sha256(token), ctx.user.id, expiresAt]);
    ctx.json(201, { resetUrl: `${config.frontendUrl}/reset.html#token=${token}`, expiresAt: expiresAt.toISOString() });
  });

  app.get('/api/teacher/students/:id/progress', ...guard, async (ctx) => {
    const id = paramId(ctx);
    const student = await getStudent(id);
    const { rows } = await db.query(
      `SELECT c.id AS course_id, c.title AS course_title, l.id AS lesson_id, l.title, l.position,
              COALESCE(p.completed, false) AS completed, p.completed_at, COALESCE(p.position_seconds, 0) AS position_seconds
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         JOIN lessons l ON l.course_id = c.id AND l.is_published
         LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = e.user_id
        WHERE e.user_id = $1 ORDER BY c.title, l.position`, [id]);
    const byCourse = new Map();
    for (const r of rows) {
      if (!byCourse.has(r.course_id)) byCourse.set(r.course_id, { courseId: r.course_id, title: r.course_title, lessons: [] });
      byCourse.get(r.course_id).lessons.push({ lessonId: r.lesson_id, title: r.title, position: r.position, completed: r.completed, completedAt: r.completed_at, positionSeconds: r.position_seconds });
    }
    const courses = [...byCourse.values()].map((c) => {
      const done = c.lessons.filter((l) => l.completed).length;
      return { ...c, lessonCount: c.lessons.length, completedCount: done, progressPercent: c.lessons.length ? Math.round((done / c.lessons.length) * 100) : 0 };
    });
    ctx.json(200, { student: { id: student.id, name: student.name, email: student.email }, courses });
  });

  // ---------------- enrollments (who may watch which course) ----------------
  app.get('/api/teacher/courses/:id/enrollments', ...guard, async (ctx) => {
    const id = paramId(ctx);
    await getCourse(id);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, e.source, e.expires_at, e.created_at FROM enrollments e JOIN users u ON u.id = e.user_id
        WHERE e.course_id = $1 ORDER BY u.name`, [id]);
    ctx.json(200, { enrollments: rows.map((r) => ({ userId: r.id, name: r.name, email: r.email, source: r.source, expiresAt: r.expires_at, createdAt: r.created_at })) });
  });

  const enrollBody = schema({ expiresAt: rules.string({ max: 40, optional: true }) });
  app.put('/api/teacher/courses/:id/enrollments/:userId', ...guard, async (ctx) => {
    const courseId = paramId(ctx);
    const userId = paramId(ctx, 'userId');
    await getCourse(courseId); await getStudent(userId);
    const b = enrollBody(ctx.body ?? {});
    let expires = null;
    if (b.expiresAt) {
      expires = new Date(b.expiresAt);
      if (Number.isNaN(expires.getTime())) throw new HttpError(400, 'VALIDATION_ERROR', 'تاريخ الانتهاء غير صحيح', { field: 'expiresAt' });
    }
    await db.query(
      `INSERT INTO enrollments (user_id, course_id, granted_by, expires_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, course_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by`,
      [userId, courseId, ctx.user.id, expires]);
    ctx.json(200, { enrolled: true });
  });

  app.delete('/api/teacher/courses/:id/enrollments/:userId', ...guard, async (ctx) => {
    const { rowCount } = await db.query('DELETE FROM enrollments WHERE course_id = $1 AND user_id = $2', [paramId(ctx), paramId(ctx, 'userId')]);
    if (!rowCount) throw new HttpError(404, 'ENROLLMENT_NOT_FOUND', 'الطالب غير مشترك في الكورس');
    ctx.json(200, { removed: true });
  });
};
