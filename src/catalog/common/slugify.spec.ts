import { slugify, uniqueSlug } from './slugify';

describe('slugify', () => {
  it('removes accents, ñ and symbols', () => {
    expect(slugify('Terapia baño de color')).toBe('terapia-bano-de-color');
    expect(slugify('Uñas Press On soft gel')).toBe('unas-press-on-soft-gel');
    expect(slugify('  Terapia antiácida! ')).toBe('terapia-antiacida');
  });

  it('appends a numeric suffix until the slug is free', async () => {
    const taken = new Set(['alisado', 'alisado-2']);
    await expect(
      uniqueSlug('Alisado', (candidate) =>
        Promise.resolve(taken.has(candidate)),
      ),
    ).resolves.toBe('alisado-3');
  });

  it('falls back to a generic slug when the name has no letters', async () => {
    await expect(
      uniqueSlug('¡¡!!', () => Promise.resolve(false)),
    ).resolves.toBe('item');
  });
});
