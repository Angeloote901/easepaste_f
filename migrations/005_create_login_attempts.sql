CREATE TABLE login_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  ip_address   TEXT,
  success      BOOLEAN     NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX login_attempts_email_idx        ON login_attempts (email);
CREATE INDEX login_attempts_attempted_at_idx ON login_attempts (attempted_at);
CREATE INDEX login_attempts_email_time_idx   ON login_attempts (email, attempted_at DESC);
