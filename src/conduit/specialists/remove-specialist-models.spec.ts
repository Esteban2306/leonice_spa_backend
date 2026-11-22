import {
  ConduitRequest,
  removeSpecialistModels,
} from '../../../prisma/remove-specialist-models';

function fakeConduit() {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const request = ((method: string, path: string, body?: unknown) => {
    calls.push(`${method} ${path}`);
    if (body !== undefined) bodies.push(body);
    if (path === 'specialists?includeArchived=true') {
      return Promise.resolve([
        { id: 'sp-recibo', name: 'Comprobantes' },
        { id: 'sp-cabello', name: 'Foto del cabello' },
        { id: 'sp-vacio', name: 'Sin modelos' },
      ]);
    }
    if (path === 'specialists/sp-recibo/models') {
      return Promise.resolve([
        {
          id: 'm1',
          model: 'claude-haiku-5-5',
          provider: 'ANTHROPIC',
          apiKeyLast4: 'EwAA',
        },
        {
          id: 'm2',
          model: 'claude-sonnet-5-5',
          provider: 'ANTHROPIC',
          apiKeyLast4: 'EwAA',
        },
      ]);
    }
    if (path === 'specialists/sp-cabello/models') {
      return Promise.resolve({
        data: [{ id: 'm3', model: 'claude-haiku-5-5' }],
      });
    }
    if (path === 'specialists/sp-vacio/models') return Promise.resolve([]);
    if (path === 'bots/bot-1/specialists') {
      return Promise.resolve([
        {
          capability: 'image-analysis',
          specialistId: 'sp-recibo',
          mode: 'ACTIVE',
          timeoutMs: 8000,
          onFailure: 'DEGRADE',
          blockMessage: null,
        },
        { capability: 'foto-cabello', specialistId: 'sp-cabello', mode: 'OFF' },
      ]);
    }
    return Promise.resolve(null);
  }) as ConduitRequest;
  return { request, calls, bodies };
}

describe('borrar los modelos de imágenes que quedaron en los especialistas', () => {
  it('la simulación solo lee y cuenta lo que haría', async () => {
    const { request, calls } = fakeConduit();
    const lines: string[] = [];
    const plan = await removeSpecialistModels({
      request,
      botId: 'bot-1',
      apply: false,
      log: (line) => lines.push(line),
    });
    expect(plan.models).toHaveLength(3);
    expect(plan.bindingsToTurnOff.map((b) => b.capability)).toEqual([
      'image-analysis',
    ]);
    expect(calls.every((call) => call.startsWith('GET '))).toBe(true);
    expect(lines.join('\n')).toContain('clave ••••EwAA');
    expect(lines.join('\n')).not.toMatch(/sk-ant/);
  });

  it('apaga primero la revisión encendida y después borra cada modelo', async () => {
    const { request, calls, bodies } = fakeConduit();
    await removeSpecialistModels({
      request,
      botId: 'bot-1',
      apply: true,
      log: () => undefined,
    });
    const writes = calls.filter((call) => !call.startsWith('GET '));
    expect(writes).toEqual([
      'PUT bots/bot-1/specialists/image-analysis',
      'DELETE specialists/sp-recibo/models/m1',
      'DELETE specialists/sp-recibo/models/m2',
      'DELETE specialists/sp-cabello/models/m3',
    ]);
    expect(bodies[0]).toEqual({
      specialistId: 'sp-recibo',
      mode: 'OFF',
      timeoutMs: 8000,
      onFailure: 'DEGRADE',
    });
  });
});
