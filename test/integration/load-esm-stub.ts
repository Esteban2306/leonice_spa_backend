const starts = (buffer: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte);

const fileTypeFromBuffer = (buffer: Buffer) => {
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return Promise.resolve({ mime: 'image/png', ext: 'png' });
  }
  if (starts(buffer, [0xff, 0xd8, 0xff])) {
    return Promise.resolve({ mime: 'image/jpeg', ext: 'jpg' });
  }
  if (
    starts(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    starts(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return Promise.resolve({ mime: 'image/webp', ext: 'webp' });
  }
  if (starts(buffer, [0x47, 0x49, 0x46, 0x38])) {
    return Promise.resolve({ mime: 'image/gif', ext: 'gif' });
  }
  return Promise.resolve(undefined);
};

export const loadEsm = () => Promise.resolve({ fileTypeFromBuffer });
