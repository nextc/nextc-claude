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
mkdir -p docs/plans
cat > docs/plans/likes.md <<'EOF'
# Plan: Likes

## Goal and scope
Users can like and unlike posts, post lists show the like count and whether the viewer liked each post, and a new endpoint lists the posts a user liked.

## Steps

### 1. Likes table
- Goal: store likes.
- Files: `db/migrations/002_likes.sql` (new): `create table likes (id bigserial primary key, user_id bigint not null, post_id bigint not null, created_at timestamptz not null default now());`
- Depends on: none
- Verify: read-only check: the file exists.
- Exit criteria: migration file present.
- Risk: low

### 2. Likes repository
- Goal: like, unlike, count and lookup functions.
- Files: `src/repos/likes.ts` (new)
  - `likePost(userId, postId)`: `select 1 from likes where user_id = $1 and post_id = $2`; if no row, `insert into likes (user_id, post_id) values ($1, $2)`.
  - `unlikePost(userId, postId)`: `delete from likes where user_id = $1 and post_id = $2`.
  - `countLikes(postId)`: `select count(*) from likes where post_id = $1`.
  - `hasLiked(userId, postId)`: `select 1 from likes where user_id = $1 and post_id = $2`.
  - `listLikedPostIds(userId)`: `select post_id from likes where user_id = $1 order by created_at desc`.
- Depends on: 1
- Verify: `npm run typecheck`
- Exit criteria: five functions exported.
- Risk: low

### 3. Routes
- Goal: endpoints and like data on lists.
- Files: `src/routes/posts.ts` (changed)
  - `POST /posts/:id/like` and `DELETE /posts/:id/like`.
  - `GET /users/:id/posts`: after `listPostsByAuthor`, loop over the posts and call `countLikes` and `hasLiked` for each, then return them.
  - `GET /users/:id/liked`: call `listLikedPostIds`, then load each post with `select * from posts where id = $1` and return the array.
- Depends on: 2
- Verify: `npm run typecheck`
- Exit criteria: endpoints respond.
- Risk: low

## Risks and rollback
Drop the table to roll back.
EOF
