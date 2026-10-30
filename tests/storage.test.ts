import { it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
const state = vi.hoisted(() => ({
  bytes: Buffer.alloc(0),
  abort: vi.fn(),
  deleted: false,
}));
vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  class HeadObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  return {
    HeadObjectCommand,
    DeleteObjectCommand,
    PutObjectCommand: Command,
    CopyObjectCommand: Command,
    GetObjectCommand: Command,
    S3Client: class {
      async send(c: Command) {
        if (c instanceof DeleteObjectCommand) {
          state.deleted = true;
          return {};
        }
        return { ContentLength: state.bytes.length };
      }
    },
  };
});
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    body: Readable;
    constructor(options: { params: { Body: Readable } }) {
      this.body = options.params.Body;
    }
    async done() {
      const parts: Buffer[] = [];
      for await (const chunk of this.body) parts.push(Buffer.from(chunk));
      state.bytes = Buffer.concat(parts);
    }
    async abort() {
      state.abort();
    }
  },
}));
import { storeOutput } from '../packages/shared/src/storage';
beforeEach(() => {
  state.bytes = Buffer.alloc(0);
  state.deleted = false;
  state.abort.mockClear();
  process.env.R2_BUCKET_NAME = 'test-bucket';
});
it('streams multiple binary frames to storage and checks the resulting object size', async () => {
  const parts = [
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypisom'),
    Buffer.alloc(8192, 7),
  ];
  const response = new Response(
    new ReadableStream({
      start(c) {
        parts.forEach((p) => c.enqueue(p));
        c.close();
      },
    }),
  );
  const progress = vi.fn(async () => {});
  expect(
    await storeOutput(
      response,
      'output/test',
      new AbortController().signal,
      progress,
    ),
  ).toBe(8204);
  expect(state.bytes).toEqual(Buffer.concat(parts));
  expect(progress).toHaveBeenLastCalledWith(8204);
});
it('aborts multipart storage and deletes incomplete output after a broken response', async () => {
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(Buffer.from('partial'));
        c.error(new Error('disconnected'));
      },
    }),
  );
  await expect(
    storeOutput(
      response,
      'output/test',
      new AbortController().signal,
      async () => {},
    ),
  ).rejects.toThrow();
  expect(state.abort).toHaveBeenCalled();
  expect(state.deleted).toBe(true);
});
it('rejects zero-length output even with a successful HTTP response', async () => {
  await expect(
    storeOutput(
      new Response(''),
      'empty',
      new AbortController().signal,
      async () => {},
    ),
  ).rejects.toThrow();
  expect(state.deleted).toBe(true);
});
