export const maxPrefixBytes = 1_000_000;

type Box = { type: string; start: number; data: number; end: number };

function box(view: DataView, start: number, end: number, offset = 0): Box {
  const i = start - offset;
  const size32 = view.getUint32(i);
  const header = size32 === 1 ? 16 : 8;
  const size = size32 === 1 ? Number(view.getBigUint64(i + 8)) : size32;
  if (!Number.isSafeInteger(size) || size < header || size > end - start)
    throw new Error('Unsupported box size');
  return {
    type: String.fromCharCode(
      ...Array.from({ length: 4 }, (_, j) => view.getUint8(i + 4 + j)),
    ),
    start,
    data: start + header,
    end: start + size,
  };
}

function children(view: DataView, start: number, end: number) {
  const result: Box[] = [];
  while (start < end) {
    if (end - start < 8 || result.length >= 512)
      throw new Error('Invalid box list');
    const item = box(view, start, end);
    result.push(item);
    start = item.end;
  }
  return result;
}

function only(boxes: Box[], type: string) {
  const matches = boxes.filter((item) => item.type === type);
  if (matches.length !== 1) throw new Error('Missing or repeated box');
  return matches[0];
}

function topLevel(boxes: Box[]) {
  if (
    boxes[0]?.type !== 'ftyp' ||
    boxes.some(
      ({ type }) =>
        !['ftyp', 'free', 'skip', 'wide', 'moov', 'mdat'].includes(type),
    )
  )
    throw new Error('Unsupported MP4 layout');
  only(boxes, 'ftyp');
  return { moov: only(boxes, 'moov'), mdat: only(boxes, 'mdat') };
}

function inspectTracks(
  view: DataView,
  moov: Box,
  payloadStart: number,
  payloadEnd: number,
  shift = 0,
) {
  const movie = children(view, moov.data, moov.end);
  if (movie.some(({ type }) => type === 'mvex'))
    throw new Error('Fragmented MP4');
  const videos = [];
  for (const track of movie.filter(({ type }) => type === 'trak')) {
    const mdia = only(children(view, track.data, track.end), 'mdia');
    const media = children(view, mdia.data, mdia.end);
    const hdlr = only(media, 'hdlr');
    const handler = view.getUint32(hdlr.data + 8);
    if (
      hdlr.end - hdlr.data < 12 ||
      ![0x76696465, 0x736f756e, 0x746d6364].includes(handler)
    )
      throw new Error('Unsupported track');
    const minf = only(media, 'minf');
    const mediaInfo = children(view, minf.data, minf.end);
    const dinf = only(mediaInfo, 'dinf');
    const dref = only(children(view, dinf.data, dinf.end), 'dref');
    const reference = only(children(view, dref.data + 8, dref.end), 'url ');
    if (
      view.getUint32(dref.data + 4) !== 1 ||
      reference.end !== reference.data + 4 ||
      view.getUint32(reference.data) !== 1
    )
      throw new Error('External media reference');
    const stbl = only(mediaInfo, 'stbl');
    const tables = children(view, stbl.data, stbl.end);
    if (tables.some(({ type }) => type === 'saio'))
      throw new Error('Auxiliary offsets are not supported');
    const offsets = tables.filter(
      ({ type }) => type === 'stco' || type === 'co64',
    );
    if (offsets.length !== 1) throw new Error('Invalid chunk offset table');
    const table = offsets[0];
    const stride = table.type === 'co64' ? 8 : 4;
    const count = view.getUint32(table.data + 4);
    if (!count || table.end - table.data !== 8 + count * stride)
      throw new Error('Invalid chunk offset count');
    for (let i = table.data + 8; i < table.end; i += stride) {
      const value =
        stride === 8 ? Number(view.getBigUint64(i)) : view.getUint32(i);
      if (
        !Number.isSafeInteger(value) ||
        value < payloadStart ||
        value >= payloadEnd
      )
        throw new Error('Chunk outside video payload');
      if (shift) {
        if (stride === 8) view.setBigUint64(i, BigInt(value + shift));
        else view.setUint32(i, value + shift);
      }
    }
    if (handler !== 0x76696465) continue;
    const stsd = only(tables, 'stsd');
    const sample = children(view, stsd.data + 8, stsd.end);
    if (
      view.getUint32(stsd.data + 4) !== 1 ||
      sample.length !== 1 ||
      !['avc1', 'avc3', 'hev1', 'hvc1'].includes(sample[0].type) ||
      sample[0].end - sample[0].data < 78
    )
      throw new Error('Unsupported video codec');
    const width = view.getUint16(sample[0].data + 24);
    const height = view.getUint16(sample[0].data + 26);
    const mdhd = only(media, 'mdhd');
    const version = view.getUint8(mdhd.data);
    const scaleOffset = version === 1 ? 20 : 12;
    if (version > 1 || mdhd.end - mdhd.data < scaleOffset + 4)
      throw new Error('Invalid media header');
    const timescale = view.getUint32(mdhd.data + scaleOffset);
    const stts = only(tables, 'stts');
    const entries = view.getUint32(stts.data + 4);
    if (!entries || stts.end - stts.data !== 8 + entries * 8)
      throw new Error('Invalid timing table');
    let samples = 0;
    let ticks = 0;
    for (let i = stts.data + 8; i < stts.end; i += 8) {
      const count = view.getUint32(i);
      const duration = view.getUint32(i + 4);
      if (!count || !duration) throw new Error('Invalid sample timing');
      samples += count;
      ticks += count * duration;
    }
    const fps = (samples * timescale) / ticks;
    if (!width || !height || !fps || !Number.isFinite(fps))
      throw new Error('Invalid video metadata');
    videos.push({ width, height, fps });
  }
  if (videos.length !== 1) throw new Error('Expected one video track');
  return videos[0];
}

export function inspectMp4Prefix(prefix: ArrayBuffer, fileSize: number) {
  if (prefix.byteLength > maxPrefixBytes || fileSize <= prefix.byteLength)
    throw new Error('Invalid prefix size');
  const view = new DataView(prefix);
  const boxes: Box[] = [];
  let position = 0;
  while (position < prefix.byteLength && boxes.length < 512) {
    const item = box(view, position, fileSize);
    boxes.push(item);
    if (item.type === 'mdat') {
      const { moov } = topLevel(boxes);
      if (
        item.data !== prefix.byteLength ||
        item.end !== fileSize ||
        moov.end > item.start
      )
        throw new Error('Invalid media boundary');
      return inspectTracks(view, moov, item.data, item.end);
    }
    position = item.end;
  }
  throw new Error('Missing media data');
}

export async function prepareMp4(file: Blob) {
  try {
    const boxes: Box[] = [];
    for (let start = 0; start < file.size;) {
      if (boxes.length >= 512) return;
      const header = await file.slice(start, start + 16).arrayBuffer();
      const item = box(new DataView(header), start, file.size, start);
      boxes.push(item);
      start = item.end;
    }
    const { moov, mdat } = topLevel(boxes);
    const moovLength = moov.end - moov.start;
    const trailing = moov.start > mdat.start;
    if (
      trailing
        ? mdat.end !== moov.start || moov.end !== file.size
        : mdat.end !== file.size
    )
      return;
    const length = mdat.data + (trailing ? moovLength : 0);
    if (length > maxPrefixBytes) return;
    let prefix = await file.slice(0, mdat.data).arrayBuffer();
    if (trailing) {
      const metadata = await file.slice(moov.start, moov.end).arrayBuffer();
      const view = new DataView(metadata);
      inspectTracks(
        view,
        box(view, 0, moovLength),
        mdat.data,
        mdat.end,
        moovLength,
      );
      const reordered = new Uint8Array(length);
      reordered.set(new Uint8Array(prefix, 0, mdat.start));
      reordered.set(new Uint8Array(metadata), mdat.start);
      reordered.set(
        new Uint8Array(prefix, mdat.start),
        mdat.start + moovLength,
      );
      prefix = reordered.buffer;
    }
    inspectMp4Prefix(prefix, file.size);
    return { prefix, payload: file.slice(mdat.data, mdat.end) };
  } catch {
    return undefined;
  }
}

export function assembleMp4(
  prefix: Uint8Array<ArrayBuffer>,
  payload: Blob,
  ghost: Uint8Array<ArrayBuffer>,
  size: number,
) {
  const result = new Blob([prefix, payload, ghost], { type: 'video/mp4' });
  if (result.size !== size)
    throw new Error('The instant patch returned an invalid file size.');
  return result;
}
