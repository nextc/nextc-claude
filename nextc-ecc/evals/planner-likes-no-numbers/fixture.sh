#!/usr/bin/env bash
# Seeds the empty workspace with an invented API (Murmur: TypeScript, Express, PostgreSQL). No real product data.
set -euo pipefail
mkdir -p db/migrations src/repos src/routes docs
cat > package.json <<'EOF'
{ "name": "murmur-api", "private": true, "type": "module",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "express": "^4.19.2", "pg": "^8.11.5" },
  "devDependencies": { "typescript": "^5.4.5", "@types/express": "^4.17.21", "@types/pg": "^8.11.6" } }
EOF
cat > docs/product.md <<'EOF'
# Murmur

A small social app: people post short text updates and follow each other. The mobile app talks to this API. Database: PostgreSQL 16.
EOF
cat > db/migrations/001_init.sql <<'EOF'
create table users (
  id bigserial primary key,
  handle text not null unique,
  created_at timestamptz not null default now()
);

create table follows (
  follower_id bigint not null references users(id),
  followee_id bigint not null references users(id),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

create table posts (
  id bigserial primary key,
  author_id bigint not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
EOF
cat > src/db.ts <<'EOF'
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
EOF
cat > src/repos/posts.ts <<'EOF'
import { pool } from '../db.js';

export type Post = { id: string; author_id: string; body: string; created_at: Date };

export async function createPost(authorId: string, body: string): Promise<Post> {
  const { rows } = await pool.query('insert into posts (author_id, body) values ($1, $2) returning *', [authorId, body]);
  return rows[0];
}

export async function listPostsByAuthor(authorId: string, page = 0, pageSize = 20): Promise<Post[]> {
  const { rows } = await pool.query(
    'select * from posts where author_id = $1 order by created_at desc limit $2 offset $3',
    [authorId, pageSize, page * pageSize],
  );
  return rows;
}
EOF
cat > src/repos/follows.ts <<'EOF'
import { pool } from '../db.js';

export async function follow(followerId: string, followeeId: string): Promise<void> {
  await pool.query('insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [followerId, followeeId]);
}

export async function listFollowing(followerId: string): Promise<string[]> {
  const { rows } = await pool.query('select followee_id from follows where follower_id = $1', [followerId]);
  return rows.map((r) => r.followee_id);
}
EOF
cat > src/routes/posts.ts <<'EOF'
import { Router } from 'express';
import { createPost, listPostsByAuthor } from '../repos/posts.js';

export const posts = Router();

// req.userId is set by the auth middleware in src/app.ts
posts.post('/posts', async (req, res) => {
  res.status(201).json(await createPost((req as any).userId, req.body.body));
});

posts.get('/users/:id/posts', async (req, res) => {
  res.json(await listPostsByAuthor(req.params.id, Number(req.query.page ?? 0)));
});
EOF
cat > src/app.ts <<'EOF'
import express from 'express';
import { posts } from './routes/posts.js';

export const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).userId = req.header('x-user-id'); next(); });
app.use(posts);
EOF
