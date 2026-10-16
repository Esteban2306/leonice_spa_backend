import { isTransientUploadError, withUploadRetry } from './upload-retry';

const networkError = (code: string) => Object.assign(new Error(code), { code });

describe('isTransientUploadError', () => {
  it('treats dropped connections and Cloudinary 5xx as transient', () => {
    expect(isTransientUploadError(networkError('EPIPE'))).toBe(true);
    expect(isTransientUploadError(networkError('ECONNRESET'))).toBe(true);
    expect(
      isTransientUploadError({ http_code: 502, message: 'Bad Gateway' }),
    ).toBe(true);
    expect(isTransientUploadError({ http_code: 499, message: 'Timeout' })).toBe(
      true,
    );
  });

  it('does not retry client errors', () => {
    expect(
      isTransientUploadError({ http_code: 400, message: 'Invalid image file' }),
    ).toBe(false);
    expect(
      isTransientUploadError({ http_code: 401, message: 'Invalid Signature' }),
    ).toBe(false);
    expect(isTransientUploadError(new Error('boom'))).toBe(false);
    expect(isTransientUploadError(null)).toBe(false);
  });
});

describe('withUploadRetry', () => {
  it('retries transient failures until the upload succeeds', async () => {
    const upload = jest
      .fn()
      .mockRejectedValueOnce(networkError('EPIPE'))
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();

    await expect(
      withUploadRetry(upload, { delayMs: 0, onRetry }),
    ).resolves.toBe('ok');
    expect(upload).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt', async () => {
    const upload = jest.fn().mockRejectedValue(networkError('EPIPE'));

    await expect(
      withUploadRetry(upload, { attempts: 3, delayMs: 0 }),
    ).rejects.toThrow('EPIPE');
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it('fails fast on non transient errors', async () => {
    const upload = jest
      .fn()
      .mockRejectedValue({ http_code: 400, message: 'Invalid image file' });

    await expect(withUploadRetry(upload, { delayMs: 0 })).rejects.toEqual({
      http_code: 400,
      message: 'Invalid image file',
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
