import { packsPost } from '../../../../lib/packs/http';
import { user } from '../../../../lib/server';
import { isPackTestOwner } from '../../../../lib/packs/owner-test';
export const POST = packsPost(async (request) => ({
  eligible: isPackTestOwner(await user(request)),
}));
