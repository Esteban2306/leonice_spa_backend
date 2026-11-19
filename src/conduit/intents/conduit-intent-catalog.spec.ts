import { CONDUIT_INTENT_CATALOG } from './conduit-intent-catalog';
import { CONDUIT_TOOL_CATALOG } from '../tools/conduit-tool-catalog';

const toolNames = new Set(CONDUIT_TOOL_CATALOG.map((t) => t.name));
const keys = CONDUIT_INTENT_CATALOG.map((i) => i.key);

interface Branch {
  variant: string;
  vars?: Record<string, unknown>;
}
interface RenderLike {
  branches: Branch[];
  vars?: Record<string, unknown>;
}

describe('CONDUIT_INTENT_CATALOG', () => {
  it('no repite claves', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(CONDUIT_INTENT_CATALOG.map((i) => [i.key, i]))(
    '%s: los patrones compilan',
    (_key, intent) => {
      for (const pattern of [
        ...intent.patterns,
        ...(intent.denyPatterns ?? []),
      ]) {
        expect(() => new RegExp(pattern)).not.toThrow();
      }
    },
  );

  it('las herramientas que usan las intenciones existen en el catálogo de herramientas', () => {
    for (const intent of CONDUIT_INTENT_CATALOG) {
      const config = intent.config as
        { tool?: string; slim?: { tools: string[] } } | undefined;
      if (config?.tool) expect(toolNames).toContain(config.tool);
      for (const tool of config?.slim?.tools ?? []) {
        expect(toolNames).toContain(tool);
      }
    }
  });

  it('fallbackTo apunta a una intención LLM_SLIM del catálogo', () => {
    for (const intent of CONDUIT_INTENT_CATALOG) {
      const target = (intent.config as { fallbackTo?: string } | undefined)
        ?.fallbackTo;
      if (!target) continue;
      const found = CONDUIT_INTENT_CATALOG.find((i) => i.key === target);
      expect(found?.handler).toBe('LLM_SLIM');
    }
  });

  it('cada rama de render tiene su texto y las variables de los textos las entrega el render', () => {
    for (const intent of CONDUIT_INTENT_CATALOG) {
      const render = (intent.config as { render?: RenderLike } | undefined)
        ?.render;
      const known = new Set(['agente', 'negocio']);
      if (render) {
        Object.keys(render.vars ?? {}).forEach((n) => known.add(n));
        for (const branch of render.branches) {
          Object.keys(branch.vars ?? {}).forEach((n) => known.add(n));
          expect(Object.keys(intent.variants)).toContain(branch.variant);
        }
      }
      if (intent.handler === 'LLM_SLIM') continue;
      for (const texts of Object.values(intent.variants)) {
        for (const text of texts) {
          for (const match of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
            expect(known).toContain(match[1]);
          }
        }
      }
    }
  });

  it('medios de pago queda bloqueada en sombra con una nota PENDIENTE', () => {
    const payment = CONDUIT_INTENT_CATALOG.find(
      (i) => i.key === 'payment_methods',
    )!;
    expect(payment.lockedMode).toBe('SHADOW');
    expect(payment.notes).toMatch(/^PENDIENTE/);
  });

  it('las reglas duras tienen su texto y las claves reservadas son las conocidas', () => {
    const rules = CONDUIT_INTENT_CATALOG.filter((i) =>
      i.key.startsWith('rule.'),
    );
    expect(rules.map((r) => r.key).sort()).toEqual([
      'rule.abuse',
      'rule.first_contact',
      'rule.handoff',
      'rule.handoff_failed',
      'rule.opt_in',
      'rule.opt_out',
      'rule.spam',
    ]);
    for (const rule of rules.filter((r) => r.key !== 'rule.spam')) {
      expect(rule.variants.default.length).toBeGreaterThan(0);
    }
  });

  it('la intención de saludo tiene su variante de prefijo por cada rama y las que saludan en el primer contacto existen', () => {
    const sources = CONDUIT_INTENT_CATALOG.filter(
      (i) =>
        (i.config as { greetingSource?: boolean } | undefined)?.greetingSource,
    );
    expect(sources).toHaveLength(1);
    const render = (sources[0].config as { render: RenderLike }).render;
    for (const branch of render.branches) {
      expect(Object.keys(sources[0].variants)).toContain(
        `prefix_${branch.variant}`,
      );
    }
    const greeters = CONDUIT_INTENT_CATALOG.filter(
      (i) =>
        (i.config as { greetFirstContact?: boolean } | undefined)
          ?.greetFirstContact,
    ).map((i) => i.key);
    expect(greeters).toEqual(
      expect.arrayContaining([
        'cancel_booking',
        'business_hours',
        'treatment_info',
      ]),
    );
    expect(greeters).not.toContain('human_request');
    expect(greeters).not.toContain('courtesy');
  });

  it('las quejas y pedir una persona quedan activos siempre; el aviso con el WhatsApp de Leo queda apagado', () => {
    const complaint = CONDUIT_INTENT_CATALOG.find(
      (i) => i.key === 'complaint',
    )!;
    const leo = CONDUIT_INTENT_CATALOG.find((i) => i.key === 'leo_notice')!;
    expect(complaint.lockedMode).toBe('ACTIVE');
    expect(
      CONDUIT_INTENT_CATALOG.find((i) => i.key === 'human_request')!.lockedMode,
    ).toBe('ACTIVE');
    expect(complaint.handler).toBe('HANDOFF');
    expect(leo.lockedMode).toBe('OFF');
  });

  it('reconoce la queja real de la prueba y no confunde un elogio', () => {
    const complaint = CONDUIT_INTENT_CATALOG.find(
      (i) => i.key === 'complaint',
    )!;
    const norm = (t: string) =>
      t
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const matches = (t: string) =>
      complaint.patterns.some((p) => new RegExp(p).test(norm(t))) &&
      !(complaint.denyPatterns ?? []).some((p) => new RegExp(p).test(norm(t)));
    expect(
      matches('Pésimo servicio, me dañaron el cabello y nadie me responde'),
    ).toBe(true);
    expect(matches('Me quemaron el cabello con el alisado')).toBe(true);
    expect(matches('Llevo dos días y nadie me contesta')).toBe(true);
    expect(matches('Me dejaron sin cita y nadie me responde')).toBe(true);
    expect(matches('Llevo una semana y no me han respondido')).toBe(true);
    expect(matches('Excelente servicio, gracias')).toBe(false);
    expect(matches('No tengo ninguna queja, todo bien')).toBe(false);
  });

  it('pedir hablar con Leo o su número avisa solo a Leo, salvo que sea por una cita', () => {
    const leo = CONDUIT_INTENT_CATALOG.find((i) => i.key === 'leo_request')!;
    expect(leo.handler).toBe('HANDOFF');
    expect(leo.lockedMode).toBe('ACTIVE');
    expect(leo.config?.tool).toBe('avisar_a_leo');
    expect(leo.variants.default.join(' ')).not.toMatch(/\d{7,}/);
    const hits = (t: string) =>
      leo.patterns.some((p) => new RegExp(p).test(t)) &&
      !(leo.denyPatterns ?? []).some((p) => new RegExp(p).test(t));
    expect(hits('hola necesito hablar con leo es un tema personal')).toBe(true);
    expect(hits('me pasas el numero de leo')).toBe(true);
    expect(hits('quiero comunicarme con la leo')).toBe(true);
    expect(hits('dile a leo que la llamo luego')).toBe(true);
    expect(hits('pasame con leo porfa')).toBe(true);
    expect(
      hits('necesito hablar con leo de un tema personal no es de citas'),
    ).toBe(true);
    expect(hits('quiero hablar con leo para agendar una cita')).toBe(false);
    expect(hits('mi leo me regalas direccion')).toBe(false);
    expect(hits('tu eres leo')).toBe(false);
    expect(hits('hola leo buenas tardes')).toBe(false);
    expect(hits('quiero una cita con leo')).toBe(false);
    expect(hits('hablar con leonice arenas spa')).toBe(false);
  });

  it('el aviso de Leo salta cuando preguntan por ella, no con un saludo ni con el nombre del spa', () => {
    const leo = CONDUIT_INTENT_CATALOG.find((i) => i.key === 'leo_notice')!;
    const hits = (t: string) =>
      leo.patterns.some((p) => new RegExp(p).test(t)) &&
      !(leo.denyPatterns ?? []).some((p) => new RegExp(p).test(t));
    expect(
      hits('necesito una cita de hidratacion pero sofia que paso con leo'),
    ).toBe(true);
    expect(hits('necesito hablar con leo de un tema personal')).toBe(true);
    expect(hits('hola leo buenas tardes')).toBe(false);
    expect(hits('hola leo')).toBe(false);
    expect(hits('hola leonice arenas spa')).toBe(false);
    expect(hits('me pasas el numero de leo')).toBe(true);
    expect(hits('esta leo')).toBe(true);
    expect(hits('leo ya no atiende por aqui')).toBe(true);
    expect(hits('leo no esta atendiendo')).toBe(true);
    expect(hits('tu eres leo')).toBe(true);
    expect(hits('quiero que me atienda leo')).toBe(true);
    expect(hits('dile a leo que la llamo luego')).toBe(true);
  });

  it('el aviso de Leo no salta cuando la clienta le habla a Leo como a quien la atiende', () => {
    const leo = CONDUIT_INTENT_CATALOG.find((i) => i.key === 'leo_notice')!;
    const hits = (t: string) =>
      leo.patterns.some((p) => new RegExp(p).test(t)) &&
      !(leo.denyPatterns ?? []).some((p) => new RegExp(p).test(t));
    expect(hits('mi leo me regalas direccion por favor')).toBe(false);
    expect(hits('leo pregunta tecnica')).toBe(false);
    expect(hits('buenos dias leo necesito una cita para el viernes')).toBe(
      false,
    );
    expect(hits('leo cuanto vale la hidratacion')).toBe(false);
    expect(hits('leo esta semana tienes cupo')).toBe(false);
    expect(hits('leo esta tarde puedo ir')).toBe(false);
    expect(hits('leo sigue en pie mi cita')).toBe(false);
  });
});
