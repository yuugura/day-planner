import { Pool } from "pg";
import type { FeedbackRecord } from "./types";

let pool: Pool | null = null;
const memoryFeedback: FeedbackRecord[] = [];

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function ensureFeedbackSchema(db: NonNullable<ReturnType<typeof getPool>>) {
  await db.query("alter table feedback add column if not exists suggestion_snapshot jsonb");
}

export async function readFeedback(userId: string): Promise<FeedbackRecord[]> {
  const db = getPool();
  if (!db) return memoryFeedback.filter((record) => record.userId === userId);

  try {
    await ensureFeedbackSchema(db);
    const result = await db.query(
      `select user_id, suggestion_id, liked, features, suggestion_snapshot, created_at
       from feedback
       where user_id = $1
       order by created_at desc
       limit 200`,
      [userId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      suggestionId: row.suggestion_id,
      liked: row.liked,
      features: row.features,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      suggestion: row.suggestion_snapshot ?? null
    }));
  } catch (error) {
    console.error("Falling back to in-memory feedback after database read failed.", error);
    return memoryFeedback.filter((record) => record.userId === userId);
  }
}

export async function writeFeedback(record: FeedbackRecord) {
  const db = getPool();
  if (!db) {
    memoryFeedback.push(record);
    return;
  }

  try {
    await ensureFeedbackSchema(db);
    await db.query(
      "insert into feedback (user_id, suggestion_id, liked, features, suggestion_snapshot) values ($1, $2, $3, $4, $5)",
      [record.userId, record.suggestionId, record.liked, record.features, record.suggestion ?? null]
    );
  } catch (error) {
    console.error("Falling back to in-memory feedback after database write failed.", error);
    memoryFeedback.push(record);
  }
}

export async function deleteFeedbackForUser(userId: string) {
  const targetUserId = userId.trim();
  if (!targetUserId) return 0;

  const db = getPool();
  if (!db) {
    let deleted = 0;
    for (let index = memoryFeedback.length - 1; index >= 0; index -= 1) {
      if (memoryFeedback[index].userId === targetUserId) {
        memoryFeedback.splice(index, 1);
        deleted += 1;
      }
    }

    return deleted;
  }

  const result = await db.query("delete from feedback where user_id = $1", [targetUserId]);
  return result.rowCount ?? 0;
}

export async function claimFeedbackUser(fromUserId: string, toUserId: string) {
  const sourceUserId = fromUserId.trim();
  const targetUserId = toUserId.trim();
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) return 0;

  const db = getPool();
  if (!db) {
    let claimed = 0;
    for (const record of memoryFeedback) {
      if (record.userId === sourceUserId) {
        record.userId = targetUserId;
        claimed += 1;
      }
    }

    return claimed;
  }

  const result = await db.query("update feedback set user_id = $2 where user_id = $1", [sourceUserId, targetUserId]);
  return result.rowCount ?? 0;
}
