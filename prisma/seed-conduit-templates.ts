import {
  CONDUIT_TEMPLATE_CATALOG,
  ConduitTemplateDefinition,
  templatePlaceholders,
} from '../src/conduit/templates/conduit-template-catalog';

interface RemoteTemplate {
  id: string;
  name: string;
  bodyHandlebars: string;
}

type Outcome = 'created' | 'updated' | 'kept';

const LIST_PAGE_SIZE = 100;

export async function seedConduitTemplates(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const baseUrl = env.CONDUIT_BASE_URL;
  const apiKey = env.CONDUIT_API_KEY;
  if (!baseUrl || !apiKey) {
    console.log(
      '[conduit] Plantillas omitidas: faltan CONDUIT_BASE_URL o CONDUIT_API_KEY.',
    );
    return;
  }
  const overwrite = env.CONDUIT_TEMPLATES_OVERWRITE === 'true';

  const request = async <T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const res = await fetch(new URL(`/api/v1/${path}`, baseUrl), {
      method,
      headers: {
        'X-API-Key': apiKey,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${method} ${path} → HTTP ${res.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  };

  const existing = await listWhatsappTemplates(request);
  const byName = new Map(existing.map((t) => [t.name, t]));

  const results: Array<{
    template: ConduitTemplateDefinition;
    id: string;
    outcome: Outcome;
    missing: string[];
  }> = [];

  for (const template of CONDUIT_TEMPLATE_CATALOG) {
    const payload = {
      name: template.name,
      description: template.description,
      channel: 'WHATSAPP',
      bodyHandlebars: template.body,
      variadblesSchema: Object.fromEntries(
        template.variables.map((variable) => [variable, 'string']),
      ),
    };
    const current = byName.get(template.name);

    if (!current) {
      const created = await request<RemoteTemplate>(
        'POST',
        'templates',
        payload,
      );
      results.push({
        template,
        id: created.id,
        outcome: 'created',
        missing: [],
      });
      continue;
    }

    if (overwrite && current.bodyHandlebars !== template.body) {
      await request('PUT', `templates/${current.id}`, payload);
      results.push({
        template,
        id: current.id,
        outcome: 'updated',
        missing: [],
      });
      continue;
    }

    const used = templatePlaceholders(current.bodyHandlebars);
    results.push({
      template,
      id: current.id,
      outcome: 'kept',
      missing: template.variables.filter((v) => !used.includes(v)),
    });
  }

  const label: Record<Outcome, string> = {
    created: 'creada',
    updated: 'actualizada',
    kept: 'ya existía (se conserva el texto actual)',
  };
  for (const { template, outcome, missing } of results) {
    console.log(`[conduit] ${template.name}: ${label[outcome]}`);
    const unknown = templatePlaceholders(
      byName.get(template.name)?.bodyHandlebars ?? template.body,
    ).filter((v) => !template.variables.includes(v));
    if (outcome === 'kept' && unknown.length > 0) {
      console.warn(
        `[conduit]   ⚠ usa variables que el backend no envía: ${unknown.join(', ')} (quedarán vacías)`,
      );
    }
    if (missing.length > 0) {
      console.warn(
        `[conduit]   ⚠ no muestra: ${missing.join(', ')}. Corrígela en el panel o vuelve a correr con CONDUIT_TEMPLATES_OVERWRITE=true`,
      );
    }
  }

  const pendingEnv = results.filter(
    ({ template, id }) => env[template.envKey] !== id,
  );
  if (pendingEnv.length === 0) {
    console.log(
      '[conduit] Las variables CONDUIT_TEMPLATE_* ya apuntan a estas plantillas.',
    );
    return;
  }
  console.log(
    '\n[conduit] Copia estas líneas en el .env del backend y reinícialo:\n',
  );
  for (const { template, id } of results) {
    console.log(`${template.envKey}=${id}`);
  }
  console.log('');
}

async function listWhatsappTemplates(
  request: <T>(method: 'GET', path: string) => Promise<T>,
): Promise<RemoteTemplate[]> {
  const all: RemoteTemplate[] = [];
  for (let page = 1; ; page++) {
    const response = await request<{
      data: RemoteTemplate[];
      meta: { totalPages: number };
    }>(
      'GET',
      `templates?channel=WHATSAPP&limit=${LIST_PAGE_SIZE}&page=${page}`,
    );
    all.push(...response.data);
    if (page >= response.meta.totalPages) return all;
  }
}

if (require.main === module) {
  seedConduitTemplates().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
