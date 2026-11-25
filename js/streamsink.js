// Pieces of an export file on their way to disk (desktop app). The muxer calls onData(bytes, position) in step
// with encoding; the pieces are sent in order, one at a time, and `room()` makes the export wait when more than
// `maxPending` bytes are queued, so the memory held is a few pieces and not the video.
// `sink` is what window.desktop.files.saveStream() resolves: { write(position, bytes), finish(), abort() }.

export function createSinkWriter(sink, { maxPending = 32 * 1024 * 1024 } = {}) {
  let chain = Promise.resolve();
  let pending = 0;
  let failure = null;
  let waiting = null;
  const w = {
    pieces: 0,
    bytes: 0,
    peakPending: 0,
    onData(data, position) {
      if (failure) return;
      const n = data.byteLength;
      pending += n;
      w.pieces++;
      w.bytes += n;
      if (pending > w.peakPending) w.peakPending = pending;
      chain = chain.then(async () => {
        if (failure) return;
        try {
          await sink.write(position, data);
        } catch (e) {
          failure = e instanceof Error ? e : new Error(String(e));
        }
        pending -= n;
        if (waiting && pending <= maxPending) (waiting(), (waiting = null));
      });
    },
    /** Throws if a piece failed to write. */
    check() {
      if (failure) throw failure;
    },
    /** Resolves when the queue is below the limit (at once if it is). */
    room() {
      if (pending <= maxPending) return null;
      return new Promise((resolve) => (waiting = resolve));
    },
    /** Resolves when everything queued is written; throws if a piece failed. */
    async drain() {
      await chain;
      if (failure) throw failure;
    },
  };
  return w;
}
