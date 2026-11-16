import { describe, expect, it } from 'vitest';
import {
  assembleMp4,
  inspectMp4Prefix,
  prepareMp4,
} from '../apps/web/lib/mp4-prefix';

function atom(type: string, ...contents: Buffer[]) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(
    8 + contents.reduce((sum, part) => sum + part.length, 0),
  );
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, ...contents]);
}

function uints(...values: number[]) {
  const data = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => data.writeUInt32BE(value, index * 4));
  return data;
}

const payload = Uint8Array.from([12, 34, 56, 78]);
const ftyp = atom('ftyp', Buffer.from('isom0000'));

function movie(offset: number, wide: boolean, fragmented = false) {
  const sample = Buffer.alloc(78);
  sample.writeUInt16BE(1080, 24);
  sample.writeUInt16BE(1920, 26);
  const address = Buffer.alloc(wide ? 8 : 4);
  if (wide) address.writeBigUInt64BE(BigInt(offset));
  else address.writeUInt32BE(offset);
  return atom(
    'moov',
    atom(
      'trak',
      atom(
        'mdia',
        atom('hdlr', uints(0, 0), Buffer.from('vide')),
        atom('mdhd', uints(0, 0, 0, 60000)),
        atom(
          'minf',
          atom('dinf', atom('dref', uints(0, 1), atom('url ', uints(1)))),
          atom(
            'stbl',
            atom('stsd', uints(0, 1), atom('avc1', sample)),
            atom('stts', uints(0, 1, 60, 1000)),
            atom(wide ? 'co64' : 'stco', uints(0, 1), address),
          ),
        ),
      ),
    ),
    ...(fragmented ? [atom('mvex')] : []),
  );
}

function clip({
  trailing = false,
  wide = false,
  invalid = false,
  fragmented = false,
} = {}) {
  const start = ftyp.length + 8 + (trailing ? 0 : movie(0, wide).length);
  const moov = movie(invalid ? start - 1 : start, wide, fragmented);
  const mdat = atom('mdat', Buffer.from(payload));
  return new Blob([
    Uint8Array.from(
      Buffer.concat(trailing ? [ftyp, mdat, moov] : [ftyp, moov, mdat]),
    ),
  ]);
}

describe('instant patch MP4 preparation', () => {
  it.each([false, true])(
    'relocates a trailing moov and checks its chunk offsets (64-bit %s)',
    async (wide) => {
      const original = clip({ trailing: true, wide });
      const normalized = await prepareMp4(original);
      const alreadyFast = await prepareMp4(clip({ wide }));
      expect(normalized?.prefix).toEqual(alreadyFast?.prefix);
      expect(inspectMp4Prefix(normalized!.prefix, original.size)).toEqual({
        width: 1080,
        height: 1920,
        fps: 60,
      });
      expect(new Uint8Array(await normalized!.payload.arrayBuffer())).toEqual(
        payload,
      );
    },
  );

  it('falls back on bad offsets, fragmented files and truncated input', async () => {
    await expect(prepareMp4(clip({ invalid: true }))).resolves.toBeUndefined();
    await expect(
      prepareMp4(clip({ fragmented: true })),
    ).resolves.toBeUndefined();
    await expect(prepareMp4(clip().slice(0, -1))).resolves.toBeUndefined();
  });

  it('assembles the original media bytes and rejects inconsistent output sizes', async () => {
    const head = Uint8Array.of(1);
    const ghost = Uint8Array.of(2);
    const media = new Blob([payload]);
    const output = assembleMp4(head, media, ghost, 6);
    expect(new Uint8Array(await output.arrayBuffer())).toEqual(
      Uint8Array.of(1, ...payload, 2),
    );
    expect(() => assembleMp4(head, media, ghost, 7)).toThrow(
      'invalid file size',
    );
  });
});
