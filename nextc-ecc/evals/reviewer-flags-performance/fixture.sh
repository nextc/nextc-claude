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
git init -q -b main 2>/dev/null || git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -qm "base"
cat > db/migrations/002_likes.sql <<'EOF'
create table likes (
  id bigserial primary key,
  user_id bigint not null,
  post_id bigint not null,
  created_at timestamptz not null default now()
);
EOF
cat > src/repos/likes.ts <<'EOF'
import { pool } from '../db.js';

export async function likePost(userId: string, postId: string): Promise<void> {
  const existing = await pool.query('select 1 from likes where user_id = $1 and post_id = $2', [userId, postId]);
  if (existing.rows.length === 0) {
    await pool.query('insert into likes (user_id, post_id) values ($1, $2)', [userId, postId]);
  }
}

export async function unlikePost(userId: string, postId: string): Promise<void> {
  await pool.query('delete from likes where user_id = $1 and post_id = $2', [userId, postId]);
}

export async function countLikes(postId: string): Promise<number> {
  const { rows } = await pool.query('select count(*)::int as n from likes where post_id = $1', [postId]);
  return rows[0].n;
}

export async function hasLiked(userId: string, postId: string): Promise<boolean> {
  const { rows } = await pool.query('select 1 from likes where user_id = $1 and post_id = $2', [userId, postId]);
  return rows.length > 0;
}

export async function listLikedPostIds(userId: string): Promise<string[]> {
  const { rows } = await pool.query('select post_id from likes where user_id = $1 order by created_at desc', [userId]);
  return rows.map((r) => r.post_id);
}
EOF
cat > src/routes/posts.ts <<'EOF'
import { Router } from 'express';
import { pool } from '../db.js';
import { createPost, listPostsByAuthor } from '../repos/posts.js';
import { countLikes, hasLiked, likePost, listLikedPostIds, unlikePost } from '../repos/likes.js';

export const posts = Router();

// req.userId is set by the auth middleware in src/app.ts
posts.post('/posts', async (req, res) => {
  res.status(201).json(await createPost((req as any).userId, req.body.body));
});

posts.get('/users/:id/posts', async (req, res) => {
  const list = await listPostsByAuthor(req.params.id, Number(req.query.page ?? 0));
  const out = [];
  for (const post of list) {
    out.push({ ...post, like_count: await countLikes(post.id), liked_by_me: await hasLiked((req as any).userId, post.id) });
  }
  res.json(out);
});

posts.post('/posts/:id/like', async (req, res) => {
  await likePost((req as any).userId, req.params.id);
  res.status(204).end();
});

posts.delete('/posts/:id/like', async (req, res) => {
  await unlikePost((req as any).userId, req.params.id);
  res.status(204).end();
});

posts.get('/users/:id/liked', async (req, res) => {
  const ids = await listLikedPostIds(req.params.id);
  const out = [];
  for (const id of ids) {
    const { rows } = await pool.query('select * from posts where id = $1', [id]);
    out.push(rows[0]);
  }
  res.json(out);
});
EOF
