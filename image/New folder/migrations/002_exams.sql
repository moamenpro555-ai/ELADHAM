-- Exams: teacher uploads the paper (images / PDF) + answer key; students answer on an answer sheet; the server grades.
-- Files are stored in the database (bytea) so they can only be read through the API after an access check.

ALTER TABLE users ADD COLUMN stage text CHECK (stage IN ('primary', 'prep', 'secondary'));
ALTER TABLE users ADD COLUMN grade smallint CHECK (grade BETWEEN 1 AND 6);

CREATE TABLE exams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  stage           text NOT NULL CHECK (stage IN ('primary', 'prep', 'secondary')),
  grade           smallint NOT NULL CHECK (grade BETWEEN 1 AND 6),
  kind            text NOT NULL CHECK (kind IN ('session', 'month')),
  month           smallint CHECK (month BETWEEN 1 AND 12),
  question_count  integer NOT NULL CHECK (question_count BETWEEN 1 AND 100),
  choices_count   integer NOT NULL DEFAULT 4 CHECK (choices_count BETWEEN 2 AND 5),
  answer_key      jsonb NOT NULL,
  max_attempts    integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 0 AND 50),
  show_answers    boolean NOT NULL DEFAULT true,
  is_published    boolean NOT NULL DEFAULT false,
  cover_type      text,
  cover_data      bytea,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'month') = (month IS NOT NULL))
);
CREATE INDEX exams_place_idx ON exams (stage, grade, kind, month);

CREATE TABLE exam_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  position      integer NOT NULL,
  content_type  text NOT NULL,
  filename      text NOT NULL DEFAULT '',
  size          integer NOT NULL,
  data          bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_files_exam_idx ON exam_files (exam_id, position);

CREATE TABLE exam_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_no  integer NOT NULL,
  answers     jsonb NOT NULL,
  score       integer NOT NULL,
  total       integer NOT NULL,
  wrong       jsonb NOT NULL,
  stage       text,
  grade       smallint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, user_id, attempt_no)
);
CREATE INDEX exam_attempts_user_idx ON exam_attempts (user_id, created_at DESC);
CREATE INDEX exam_attempts_exam_idx ON exam_attempts (exam_id, created_at DESC);
