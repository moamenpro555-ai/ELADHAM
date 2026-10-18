'use strict';
// Student-facing endpoints: courses, lessons, playback links, progress.
// Authorization rule used everywhere: a student can see a course's lessons only if the course is published AND
// the student has a non-expired enrollment. Teachers can see everything.
const db = require('../db');
const { HttpError } = require('../http');
const { schema, rules, paramId } = require('../lib/validate');
const { playbackFor } = require('../lib/video');
const { requireAuth } = require('../middleware/auth');

const courseOut = (r) => ({
  id: r.id, title: r.title, description: r.description, stage: r.stage, grade: r.grade, isPublished: r.is_published,
  enrolled: r.enrolled, lessonCount: r.lesson_count, completedCount: r.completed_count,
  progressPercent: r.lesson_count ? Math.round((r.completed_count / r.lesson_count) * 100) : 0,
});

const lessonOut = (r) => ({
  id: r.id, courseId: r.course_id, title: r.title, description: r.description, kind: r.kind, section: r.section,
  position: r.position, durationSeconds: r.duration_seconds,
  completed: !!r.completed, positionSeconds: r.position_seconds || 0,
});

// Loads the course and decides whether this user may see its content. Unpublished courses look "not found" to students.
async function courseAccess(ctx, courseId) {
  const { rows } = await db.query(
    `SELECT c.*, 
            (e.user_id IS NOT NULL AND (e.expires_at IS NULL OR e.expires_at > now())) AS enrolled,
            (SELECT count(*) FROM lessons l WHERE l.course_id = c.id AND l.is_published)::int AS lesson_count,
            (SELECT count(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
              WHERE l.course_id = c.id AND l.is_published AND p.user_id = $2 AND p.completed)::int AS completed_count
       FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = $2
      WHERE c.id = $1`, [courseId, ctx.user.id]);
  const c = rows[0];
  const isTeacher = ctx.user.role === 'teacher';
  if (!c || (!c.is_published && !isTeacher)) throw new HttpError(404, 'COURSE_NOT_FOUND', 'الكورس غير موجود');
  return { course: c, allowed: isTeacher || c.enrolled };
}

async function lessonsOf(ctx, courseId) {
  const { rows } = await db.query(
    `SELECT l.id, l.course_id, l.title, l.description, l.kind, l.section, l.position, l.duration_seconds,
            COALESCE(p.completed, false) AS completed, COALESCE(p.position_seconds, 0) AS position_seconds
       FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = $2
      WHERE l.course_id = $1 AND l.is_published ORDER BY l.position, l.created_at`, [courseId, ctx.user.id]);
  return rows.map(lessonOut);
}

async function lessonAccess(ctx, lessonId) {
  const { rows } = await db.query('SELECT * FROM lessons WHERE id = $1', [lessonId]);
  const l = rows[0];
  if (!l) throw new HttpError(404, 'LESSON_NOT_FOUND', 'الدرس غير موجود');
  const { allowed } = await courseAccess(ctx, l.course_id);
  const isTeacher = ctx.user.role === 'teacher';
  if (!l.is_published && !isTeacher) throw new HttpError(404, 'LESSON_NOT_FOUND', 'الدرس غير موجود');
  if (!allowed) throw new HttpError(403, 'NOT_ENROLLED', 'مش مشترك في الكورس ده');
  return l;
}

module.exports = (app) => {
  app.get('/api/courses', requireAuth, async (ctx) => {
    const { rows } = await db.query(
      `SELECT c.id, c.title, c.description, c.stage, c.grade, c.is_published,
              (e.user_id IS NOT NULL AND (e.expires_at IS NULL OR e.expires_at > now())) AS enrolled,
              (SELECT count(*) FROM lessons l WHERE l.course_id = c.id AND l.is_published)::int AS lesson_count,
              (SELECT count(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
                WHERE l.course_id = c.id AND l.is_published AND p.user_id = $1 AND p.completed)::int AS completed_count
         FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1
        WHERE c.is_published ORDER BY c.stage, c.grade, c.title`, [ctx.user.id]);
    ctx.json(200, { courses: rows.map(courseOut) });
  });

  app.get('/api/courses/:id', requireAuth, async (ctx) => {
    const { course, allowed } = await courseAccess(ctx, paramId(ctx));
    const out = courseOut(course);
    // the lesson list (titles, order, progress) is only sent to people who have access
    ctx.json(200, { course: out, lessons: allowed ? await lessonsOf(ctx, course.id) : [] });
  });

  app.get('/api/courses/:id/lessons', requireAuth, async (ctx) => {
    const { course, allowed } = await courseAccess(ctx, paramId(ctx));
    if (!allowed) throw new HttpError(403, 'NOT_ENROLLED', 'مش مشترك في الكورس ده');
    ctx.json(200, { lessons: await lessonsOf(ctx, course.id) });
  });

  app.get('/api/lessons/:id', requireAuth, async (ctx) => {
    const l = await lessonAccess(ctx, paramId(ctx));
    const p = (await db.query('SELECT completed, position_seconds FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [ctx.user.id, l.id])).rows[0];
    ctx.json(200, { lesson: lessonOut({ ...l, completed: p?.completed, position_seconds: p?.position_seconds }), hasVideo: !!l.video_ref });
  });

  // The only place a video URL is handed out, and only after lessonAccess() passed.
  app.get('/api/lessons/:id/playback', requireAuth, async (ctx) => {
    const l = await lessonAccess(ctx, paramId(ctx));
    const playback = playbackFor(l);
    if (!playback) throw new HttpError(404, 'NO_VIDEO', 'مفيش فيديو مرفوع للدرس ده لسه');
    ctx.json(200, { playback });
  });

  const progressBody = schema({
    completed: rules.bool({ optional: true }),
    positionSeconds: rules.int({ min: 0, max: 86400, optional: true }),
  });
  app.put('/api/lessons/:id/progress', requireAuth, async (ctx) => {
    const l = await lessonAccess(ctx, paramId(ctx));
    const b = progressBody(ctx.body);
    if (b.completed === undefined && b.positionSeconds === undefined) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'ابعت completed أو positionSeconds');
    }
    const { rows } = await db.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, completed, completed_at, position_seconds)
       VALUES ($1, $2, COALESCE($3::boolean, false), CASE WHEN $3::boolean THEN now() END, COALESCE($4::int, 0))
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         completed        = COALESCE($3::boolean, lesson_progress.completed),
         completed_at     = CASE WHEN $3::boolean IS NULL THEN lesson_progress.completed_at
                                 WHEN $3::boolean THEN COALESCE(lesson_progress.completed_at, now()) ELSE NULL END,
         position_seconds = COALESCE($4::int, lesson_progress.position_seconds),
         updated_at       = now()
       RETURNING completed, position_seconds`,
      [ctx.user.id, l.id, b.completed ?? null, b.positionSeconds ?? null]);
    ctx.json(200, { progress: { lessonId: l.id, completed: rows[0].completed, positionSeconds: rows[0].position_seconds } });
  });

  // Overview for the dashboard: progress per enrolled course.
  app.get('/api/me/progress', requireAuth, async (ctx) => {
    const { rows } = await db.query(
      `SELECT c.id, c.title, c.stage, c.grade, true AS enrolled, c.is_published,
              (SELECT count(*) FROM lessons l WHERE l.course_id = c.id AND l.is_published)::int AS lesson_count,
              (SELECT count(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
                WHERE l.course_id = c.id AND l.is_published AND p.user_id = $1 AND p.completed)::int AS completed_count,
              c.description
         FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = $1 AND c.is_published AND (e.expires_at IS NULL OR e.expires_at > now())
        ORDER BY c.stage, c.grade, c.title`, [ctx.user.id]);
    const courses = rows.map(courseOut);
    const total = courses.reduce((s, c) => s + c.lessonCount, 0);
    const done = courses.reduce((s, c) => s + c.completedCount, 0);
    ctx.json(200, { courses, overall: { lessonCount: total, completedCount: done, progressPercent: total ? Math.round((done / total) * 100) : 0 } });
  });
};
