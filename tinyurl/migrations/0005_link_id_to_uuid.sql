BEGIN TRANSACTION;

CREATE TEMP TABLE link_id_map (
  old_id INTEGER PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);

INSERT INTO link_id_map (old_id, new_id)
SELECT id, CAST(id AS TEXT)
FROM links;

CREATE TEMP TABLE link_tags_copy (
  link_id TEXT NOT NULL,
  tag_id  INTEGER NOT NULL
);

INSERT INTO link_tags_copy (link_id, tag_id)
SELECT m.new_id, lt.tag_id
FROM link_tags lt
JOIN link_id_map m ON m.old_id = lt.link_id;

CREATE TEMP TABLE comments_copy (
  id              INTEGER PRIMARY KEY,
  link_id         TEXT NOT NULL,
  author_user_id  TEXT NOT NULL,
  body            TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

INSERT INTO comments_copy (id, link_id, author_user_id, body, created_at)
SELECT c.id, m.new_id, c.author_user_id, c.body, c.created_at
FROM comments c
JOIN link_id_map m ON m.old_id = c.link_id;

CREATE TEMP TABLE link_permissions_copy (
  id             INTEGER PRIMARY KEY,
  link_id        TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id   TEXT NOT NULL,
  role           TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

INSERT INTO link_permissions_copy (
  id,
  link_id,
  principal_type,
  principal_id,
  role,
  created_at
)
SELECT
  p.id,
  m.new_id,
  p.principal_type,
  p.principal_id,
  p.role,
  p.created_at
FROM link_permissions p
JOIN link_id_map m ON m.old_id = p.link_id;

CREATE TABLE links_new (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  title           TEXT,
  description     TEXT,
  og_image_url    TEXT,
  owner_user_id   TEXT NOT NULL,
  owner_chapter_id INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at      INTEGER
);

INSERT INTO links_new (
  id,
  slug,
  destination_url,
  title,
  description,
  og_image_url,
  owner_user_id,
  owner_chapter_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  m.new_id,
  l.slug,
  l.destination_url,
  l.title,
  l.description,
  l.og_image_url,
  l.owner_user_id,
  l.owner_chapter_id,
  l.created_at,
  l.updated_at,
  l.deleted_at
FROM links l
JOIN link_id_map m ON m.old_id = l.id;

DROP TABLE link_permissions;
DROP TABLE comments;
DROP TABLE link_tags;
DROP TABLE links;

ALTER TABLE links_new RENAME TO links;

CREATE TABLE link_tags (
  link_id TEXT NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (link_id, tag_id),
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);

INSERT INTO link_tags (link_id, tag_id)
SELECT link_id, tag_id
FROM link_tags_copy;

CREATE TABLE comments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id         TEXT NOT NULL,
  author_user_id  TEXT NOT NULL,
  body            TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
);

INSERT INTO comments (id, link_id, author_user_id, body, created_at)
SELECT id, link_id, author_user_id, body, created_at
FROM comments_copy;

CREATE TABLE link_permissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id        TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'chapter')),
  principal_id   TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(link_id, principal_type, principal_id),
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
);

INSERT INTO link_permissions (
  id,
  link_id,
  principal_type,
  principal_id,
  role,
  created_at
)
SELECT
  id,
  link_id,
  principal_type,
  principal_id,
  role,
  created_at
FROM link_permissions_copy;

CREATE INDEX idx_links_owner ON links(owner_user_id, deleted_at);
CREATE INDEX idx_links_chapter ON links(owner_chapter_id, deleted_at);
CREATE INDEX idx_link_tags_tag ON link_tags(tag_id);
CREATE INDEX idx_comments_link ON comments(link_id, created_at);
CREATE INDEX idx_link_permissions_link ON link_permissions(link_id);
CREATE INDEX idx_link_permissions_user
  ON link_permissions(principal_type, principal_id) WHERE principal_type = 'user';
CREATE INDEX idx_link_permissions_chapter
  ON link_permissions(principal_type, principal_id) WHERE principal_type = 'chapter';

DROP TABLE link_permissions_copy;
DROP TABLE comments_copy;
DROP TABLE link_tags_copy;
DROP TABLE link_id_map;

COMMIT;
