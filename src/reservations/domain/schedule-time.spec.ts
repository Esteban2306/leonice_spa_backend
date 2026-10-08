import { formatTimeOfDay, parseTimeOfDay } from './schedule-time';

describe('schedule time', () => {
  it.each([
    ['00:00', 0],
    ['08:30', 510],
    ['23:59', 1439],
  ])('parsea %s → %i', (value, minute) => {
    expect(parseTimeOfDay(value)).toBe(minute);
  });

  it.each(['24:00', '8:30', '12:60', 'abc', ''])('rechaza %p', (value) => {
    expect(parseTimeOfDay(value)).toBeNull();
  });

  it.each([
    [0, '00:00'],
    [510, '08:30'],
    [960, '16:00'],
    [1440, '24:00'],
  ])('formatea %i → %s', (minute, value) => {
    expect(formatTimeOfDay(minute)).toBe(value);
  });
});
