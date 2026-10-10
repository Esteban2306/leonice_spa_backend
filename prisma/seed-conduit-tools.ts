import {
  CONDUIT_TOOL_CATALOG,
  ConduitToolDefinition,
} from '../src/conduit/tools/conduit-tool-catalog';

interface RemoteTool {
  id: string;
  name: string;
  endpointUrl: string;
  isActive: boolean;
}

const REQUIRED_ENV = [
  'CONDUIT_BASE_URL',
  'CONDUIT_API_KEY',
  'CONDUIT_DEFAULT_BOT_ID',
  'CONDUIT_TOOL_API_KEY',
  'CONDUIT_TOOLS_PUBLIC_URL',
] as const;

export async function seedConduitTools(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.log(
      `[conduit] Herramientas omitidas: faltan ${missing.join(', ')}.`,
    );
    return;
  }
  const baseUrl = env.CONDUIT_BASE_URL!;
  const apiKey = env.CONDUIT_API_KEY!;
  const botId = env.CONDUIT_DEFAULT_BOT_ID!;
  const publicUrl = env.CONDUIT_TOOLS_PUBLIC_URL!.replace(/\/+$/, '');
  const overwrite = env.CONDUIT_TOOLS_OVERWRITE === 'true';

  const request = async <T>(
    method: 'GET' | 'POST' | 'PATCH',
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

  const listed = await request<RemoteTool[] | { data: RemoteTool[] }>(
    'GET',
    `bots/${botId}/tools`,
  );
  const existing = Array.isArray(listed) ? listed : listed.data;
  const byName = new Map(existing.map((tool) => [tool.name, tool]));

  const payload = (tool: ConduitToolDefinition) => ({
    name: tool.name,
    description: tool.description,
    parametersSchema: tool.parametersSchema,
    endpointUrl: `${publicUrl}${tool.path}`,
    httpMethod: tool.httpMethod,
    authHeaderName: 'x-api-key',
    authSecret: env.CONDUIT_TOOL_API_KEY,
    isActive: true,
    requiresImageAttachment: tool.requiresImageAttachment ?? false,
    ...(tool.imageParamName && { imageParamName: tool.imageParamName }),
    ...(tool.injectPhoneParamName && {
      injectPhoneParamName: tool.injectPhoneParamName,
    }),
    ...(tool.pausesBotMinutes && { pausesBotMinutes: tool.pausesBotMinutes }),
  });

  for (const tool of CONDUIT_TOOL_CATALOG) {
    const current = byName.get(tool.name);
    if (!current) {
      await request('POST', `bots/${botId}/tools`, payload(tool));
      console.log(`[conduit] herramienta ${tool.name}: creada`);
      continue;
    }
    if (overwrite) {
      await request(
        'PATCH',
        `bots/${botId}/tools/${current.id}`,
        payload(tool),
      );
      console.log(`[conduit] herramienta ${tool.name}: actualizada`);
      continue;
    }
    const notes = [
      current.isActive ? null : 'está desactivada',
      current.endpointUrl === `${publicUrl}${tool.path}`
        ? null
        : `apunta a ${current.endpointUrl}`,
    ].filter(Boolean);
    console.log(
      `[conduit] herramienta ${tool.name}: ya existía${notes.length ? ` (⚠ ${notes.join('; ')})` : ''}`,
    );
  }

  const known = new Set(CONDUIT_TOOL_CATALOG.map((tool) => tool.name));
  for (const tool of existing.filter((t) => !known.has(t.name))) {
    console.warn(
      `[conduit]   ⚠ ${tool.name} no está en el catálogo; revisa en el panel si sobra o duplica otra herramienta.`,
    );
  }
}

if (require.main === module) {
  seedConduitTools().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
