import { Pool } from "pg";
import type { FeedbackRecord } from "./types";

let pool: Pool | null = null;
const memoryFeedback: FeedbackRecord[] = [];

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function readFeedback(userId: string): Promise<FeedbackRecord[]> {
  const db = getPool();
  if (!db) return memoryFeedback.filter((record) => record.userId === userId);

  const result = await db.query(
    "select user_id, suggestion_id, liked, features from feedback where user_id = $1 order by created_at desc limit 200",
    [userId]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    suggestionId: row.suggestion_id,
    liked: row.liked,
    features: row.features
  }));
}

export async function writeFeedback(record: FeedbackRecord) {
  const db = getPool();
  if (!db) {
    memoryFeedback.push(record);
    return;
  }

  await db.query(
    "insert into feedback (user_id, suggestion_id, liked, features) values ($1, $2, $3, $4)",
    [record.userId, record.suggestionId, record.liked, record.features]
  );
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
