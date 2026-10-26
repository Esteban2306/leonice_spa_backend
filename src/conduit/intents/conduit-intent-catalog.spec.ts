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
});
