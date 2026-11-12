import { AppError } from '@tikquick/shared';

const tiktokOrigin = 'https://www.tiktok.com';

export function parseTikTokLink(input: string) {
  const url = URL.canParse(input) ? new URL(input) : null;
  const match = url?.pathname.match(
    /^\/@([a-z\d_.]{1,24})\/video\/(\d{15,22})\/?$/i,
  );
  if (
    !url ||
    !match ||
    url.protocol !== 'https:' ||
    !['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new AppError(
      'INVALID_TIKTOK_LINK',
      'Enter the full TikTok video link. If you have a short share link, open it in your browser first and copy the full address.',
    );
  }
  const [, handle, id] = match;
  return { handle, id, url: `${tiktokOrigin}/@${handle}/video/${id}` };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown) {
  const parsed =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof parsed === 'number' &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

function positive(value: unknown) {
  return number(value) || null;
}

function frameRate(value: unknown) {
  const parsed =
    typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)
      ? Number(value)
      : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

function string(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export function readTikTokAnalytics(
  html: string,
  link: ReturnType<typeof parseTikTokLink>,
) {
  const script =
    /<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      html,
    )?.[1];
  let payload: unknown;
  try {
    if (script) payload = JSON.parse(script);
  } catch {
    // TikTok can return a different page format instead of post metadata.
  }
  const detail = record(
    record(record(payload).__DEFAULT_SCOPE__)['webapp.video-detail'],
  );
  const post = record(record(detail.itemInfo).itemStruct);
  if (
    detail.statusCode !== 0 ||
    post.id !== link.id ||
    post.privateItem === true ||
    post.secret === true ||
    post.forFriend === true ||
    post.isProhibited === true
  ) {
    return null;
  }

  const author = record(post.author);
  const handle = string(author.uniqueId, 24);
  const canonicalLink = /^[a-z\d_.]{1,24}$/i.test(handle)
    ? `${tiktokOrigin}/@${handle}/video/${link.id}`
    : link.url;
  const stats = record(post.stats);
  const statsV2 = record(post.statsV2);
  const count = (key: string) => number(statsV2[key]) ?? number(stats[key]);
  const video = record(post.video);
  const defaultAddress = record(video.PlayAddrStruct ?? video.playAddr);
  const defaultSpecs = {
    width: positive(defaultAddress.Width) ?? positive(video.width),
    height: positive(defaultAddress.Height) ?? positive(video.height),
    fps: frameRate(video.fps),
    bitrate: positive(video.bitrate),
    size: positive(defaultAddress.DataSize) ?? positive(video.size),
    codec: string(video.codecType, 32),
  };
  const renditions = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : [];
  const candidates = renditions.map((value: unknown) => {
    const rendition = record(value);
    const address = record(rendition.PlayAddr);
    // Only fill gaps from the default stream when both entries identify the same file.
    const matchesDefault =
      (typeof address.FileHash === 'string' &&
        !!address.FileHash &&
        address.FileHash === defaultAddress.FileHash) ||
      (typeof video.playAddr === 'string' &&
        !!video.playAddr &&
        Array.isArray(address.UrlList) &&
        address.UrlList.includes(video.playAddr));
    const fallback = matchesDefault ? defaultSpecs : null;
    return {
      width: positive(address.Width) ?? fallback?.width ?? null,
      height: positive(address.Height) ?? fallback?.height ?? null,
      fps: frameRate(rendition.BitrateFPS) ?? fallback?.fps ?? null,
      bitrate: positive(rendition.Bitrate) ?? fallback?.bitrate ?? null,
      size: positive(address.DataSize) ?? fallback?.size ?? null,
      codec: string(rendition.CodecType, 32) || fallback?.codec || '',
    };
  });
  candidates.push(defaultSpecs);
  const specs =
    candidates
      .filter(({ width, height }) => width && height)
      .sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) ||
          (b.fps ?? 0) - (a.fps ?? 0) ||
          (b.bitrate ?? 0) - (a.bitrate ?? 0) ||
          (b.size ?? 0) - (a.size ?? 0),
      )[0] ?? defaultSpecs;
  const region = string(post.locationCreated, 8);
  const published = positive(post.createTime);

  return {
    url: canonicalLink,
    id: link.id,
    handle: canonicalLink === link.url ? link.handle : handle,
    name: string(author.nickname, 100),
    caption: string(post.desc, 5000),
    hashtags: (Array.isArray(post.challenges) ? post.challenges : [])
      .slice(0, 24)
      .map((value: unknown) => string(record(value).title, 100))
      .filter(Boolean),
    categories: (Array.isArray(post.diversificationLabels)
      ? post.diversificationLabels
      : []
    )
      .slice(0, 12)
      .map((value: unknown) => string(value, 100))
      .filter(Boolean),
    published: published && published <= 8_640_000_000_000 ? published : null,
    duration: positive(video.duration),
    region: /^[A-Z]{2}$/.test(region) ? region : null,
    engagement: {
      views: count('playCount'),
      likes: count('diggCount'),
      comments: count('commentCount'),
      shares: count('shareCount'),
      saves: count('collectCount'),
    },
    specs,
  };
}

export type TikTokAnalytics = NonNullable<
  ReturnType<typeof readTikTokAnalytics>
>;

export async function analyzeTikTok(link: ReturnType<typeof parseTikTokLink>) {
  const maxBytes = 4 * 1024 * 1024;
  let result: TikTokAnalytics | null;
  try {
    const response = await fetch(link.url, {
      cache: 'no-store',
      redirect: 'manual',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      return null;
    }
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.includes('text/html')
    ) {
      await response.body?.cancel();
      throw new Error('Unexpected TikTok response');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = '';
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('TikTok response is too large');
      }
      html += decoder.decode(chunk.value, { stream: true });
    }
    result = readTikTokAnalytics(html + decoder.decode(), link);
  } catch {
    throw new AppError(
      'TIKTOK_UNAVAILABLE',
      'TikTok could not be reached for this video. Try again shortly.',
      502,
    );
  }
  return result;
}
