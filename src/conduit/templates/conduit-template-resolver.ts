import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConduitApiClient } from '../client/conduit-api.client';
import { CONDUIT_TEMPLATE_CATALOG } from './conduit-template-catalog';

export type TemplateSource = 'env' | 'catalog';

export interface TemplateUsage {
  name: string;
  envKey: string;
  templateId: string | null;
  configured: boolean;
  source: TemplateSource | null;
  catalogName: string;
  description: string;
  suggestedBody: string;
}

interface RemoteTemplate {
  id: string;
  name: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;

@Injectable()
export class ConduitTemplateResolver {
  private readonly logger = new Logger(ConduitTemplateResolver.name);
  private cache: { loadedAt: number; byName: Map<string, string> } | null =
    null;

  constructor(
    private readonly conduit: ConduitApiClient,
    private readonly config: ConfigService,
  ) {}

  async resolve(envKey: string): Promise<string | null> {
    const fromEnv = this.config.get<string>(envKey);
    if (fromEnv) return fromEnv;
    const entry = CONDUIT_TEMPLATE_CATALOG.find((t) => t.envKey === envKey);
    if (!entry) return null;
    return (await this.templatesByName()).get(entry.name) ?? null;
  }

  async describe(): Promise<TemplateUsage[]> {
    const byName = await this.templatesByName();
    return CONDUIT_TEMPLATE_CATALOG.map((entry) => {
      const fromEnv = this.config.get<string>(entry.envKey) || null;
      const fromCatalog = byName.get(entry.name) ?? null;
      const templateId = fromEnv ?? fromCatalog;
      return {
        name: entry.code,
        envKey: entry.envKey,
        templateId,
        configured: templateId !== null,
        source: fromEnv ? 'env' : fromCatalog ? 'catalog' : null,
        catalogName: entry.name,
        description: entry.description,
        suggestedBody: entry.body,
      };
    });
  }

  invalidate(): void {
    this.cache = null;
  }

  private async templatesByName(): Promise<Map<string, string>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.byName;
    }
    try {
      const byName = new Map<string, string>();
      for (let page = 1; ; page++) {
        const response = await this.conduit.admin<{
          data: RemoteTemplate[];
          meta: { totalPages: number };
        }>('GET', 'templates', {
          query: { channel: 'WHATSAPP', limit: PAGE_SIZE, page },
        });
        for (const template of response.data) {
          if (!byName.has(template.name))
            byName.set(template.name, template.id);
        }
        if (page >= response.meta.totalPages) break;
      }
      this.cache = { loadedAt: Date.now(), byName };
      return byName;
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer las plantillas de Conduit: ${(error as Error).message}`,
      );
      return this.cache?.byName ?? new Map();
    }
  }
}
