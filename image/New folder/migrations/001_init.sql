-- ELADHAM schema. Run with: npm run migrate
-- Uses only built-in Postgres features (gen_random_uuid is built in since PG 13).

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  name                  text NOT NULL,
  password_hash         text NOT NULL,
  role                  text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,          -- sha256 of the cookie value; the raw token is never stored
  csrf_token   text NOT NULL,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE login_attempts (
  id          bigserial PRIMARY KEY,
  email_lower text NOT NULL,
  ip          text,
  succeeded   boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (email_lower, created_at DESC);

CREATE TABLE password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens (user_id);

CREATE TABLE courses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  stage        text NOT NULL CHECK (stage IN ('primary', 'prep', 'secondary')),
  grade        smallint NOT NULL CHECK (grade BETWEEN 1 AND 6),
  is_published boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_stage_grade_idx ON courses (stage, grade);
CREATE INDEX courses_published_idx ON courses (is_published);

CREATE TABLE lessons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  kind             text NOT NULL DEFAULT 'video' CHECK (kind IN ('video', 'exam')),
  section          text,                       -- e.g. النحو / الأدب / امتحانات الشهر
  position         integer NOT NULL DEFAULT 0, -- order inside the course
  video_provider   text NOT NULL DEFAULT 'direct' CHECK (video_provider IN ('direct', 'signed')),
  video_ref        text NOT NULL DEFAULT '',   -- URL / storage key; never sent without an authorization check
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  is_published     boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lessons_course_pos_idx ON lessons (course_id, position);

-- Access permissions. 'source' lets payments be added later (source = 'payment') without a schema change.
CREATE TABLE enrollments (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'teacher',
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX enrollments_course_idx ON enrollments (course_id);

CREATE TABLE lesson_progress (
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id        uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed        boolean NOT NULL DEFAULT false,
  completed_at     timestamptz,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX lesson_progress_lesson_idx ON lesson_progress (lesson_id);
