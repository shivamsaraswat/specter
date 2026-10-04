CREATE TABLE threat_entries (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
  stride_category TEXT NOT NULL CHECK (stride_category IN (
    'Spoofing',
    'Tampering',
    'Repudiation',
    'Information Disclosure',
    'Denial of Service',
    'Elevation of Privilege'
  )),
  severity        TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High')),
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
