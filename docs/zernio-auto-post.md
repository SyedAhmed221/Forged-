# Zernio Auto Post

Forged users supply their own Zernio API key in the completed-video panel. The
key stays in browser memory for the current page and goes to authenticated
server endpoints over HTTPS. Forged does not store it in PostgreSQL, R2, Git,
or Vercel environment variables. The TikTok account must already be connected
in that user's Zernio account.

The server lists TikTok accounts from that key and reads creator info for the
chosen account. The user selects an allowed privacy level, writes a caption,
and confirms content review and posting consent. Optimization alone never
triggers publishing. After consent, the server copies the private completed
video to Zernio's temporary storage, then submits one `publishNow` TikTok
post. The user can check the final outcome in Zernio.

A unique partial index on `job_events` prevents a second submission of the same
Forged video. The guard is written immediately before the Zernio create-post
request. If that request times out, its result is uncertain and the user must
check Zernio before trying again with a new video.

Apply `supabase/migrations/202611010001_zernio_post_guard.sql` before deploying
the frontend. No shared Zernio credential or new environment variable is
required. User keys must be allowed to list accounts, read TikTok creator info,
presign media, and create posts.

Zernio stores temporary media for up to seven days according to its
[media upload guide](https://docs.zernio.com/guides/media-uploads). Its
[TikTok guide](https://docs.zernio.com/platforms/tiktok) describes privacy,
interaction settings, consent, and posting limits. Zernio may compress media
above a platform limit; Forged transfers the patched file unchanged.
