import { endpoint, transaction } from '../../../../lib/server';
export const DELETE = endpoint(async (_request, userId) =>
  transaction(userId, async (db) => {
    const result = await db.query(
      "update video_jobs set status='deleting',cancel_requested=true where user_id=$1",
      [userId],
    );
    return { deletion_requested: result.rowCount };
  }),
);
