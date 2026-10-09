import {
  describeWeeklyScheduleIssue,
  normalizeWeeklySchedule,
} from './weekly-schedule';

describe('normalizeWeeklySchedule', () => {
  it('convierte las franjas a minutos y las ordena', () => {
    const { windows, issues } = normalizeWeeklySchedule([
      {
        dayOfWeek: 1,
        windows: [
          { startTime: '14:00', endTime: '18:00' },
          { startTime: '08:00', endTime: '12:00' },
        ],
      },
      { dayOfWeek: 0, windows: [] },
    ]);

    expect(issues).toEqual([]);
    expect(windows).toEqual([
      { dayOfWeek: 1, startMinute: 480, endMinute: 720 },
      { dayOfWeek: 1, startMinute: 840, endMinute: 1080 },
    ]);
  });

  it('rechaza franjas invertidas, cruzadas y días repetidos', () => {
    const { issues } = normalizeWeeklySchedule([
      { dayOfWeek: 2, windows: [{ startTime: '12:00', endTime: '08:00' }] },
      {
        dayOfWeek: 3,
        windows: [
          { startTime: '08:00', endTime: '12:00' },
          { startTime: '11:00', endTime: '13:00' },
        ],
      },
      { dayOfWeek: 3, windows: [] },
    ]);

    expect(issues.map((issue) => issue.kind)).toEqual([
      'INVALID_RANGE',
      'OVERLAP',
      'DUPLICATED_DAY',
    ]);
    expect(describeWeeklyScheduleIssue(issues[1])).toContain('miércoles');
  });

  it('acepta franjas contiguas', () => {
    const { issues } = normalizeWeeklySchedule([
      {
        dayOfWeek: 4,
        windows: [
          { startTime: '08:00', endTime: '12:00' },
          { startTime: '12:00', endTime: '16:00' },
        ],
      },
    ]);

    expect(issues).toEqual([]);
  });

  it('no permite cerrar toda la semana', () => {
    const { issues } = normalizeWeeklySchedule([{ dayOfWeek: 1, windows: [] }]);

    expect(issues).toEqual([{ kind: 'EMPTY_WEEK' }]);
  });
});
