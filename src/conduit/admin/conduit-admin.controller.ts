import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import {
  ConduitAdminError,
  ConduitApiClient,
} from '../client/conduit-api.client';
import type { AdminQuery } from '../client/conduit-api.client';
import { ConduitOutboxRepository } from '../repositories/conduit-outbox.repository';
import { ConduitOutboxService } from '../service/conduit-outbox.service';
import {
  ConduitPromptTypeParam,
  FindOutboxQueryDto,
} from './conduit-admin.dto';
import { ConduitTemplateResolver } from '../templates/conduit-template-resolver';

type Body = Record<string, unknown>;

/**
 * Backend del panel administrativo para Conduit (BFF).
 *
 * El panel nunca habla con Conduit: usa su sesión de admin (JWT + CSRF,
 * como el resto del panel) contra estas rutas, y Leonice llama a Conduit
 * con su API key. El bot y la conexión de WhatsApp salen de la
 * configuración del servidor, así que el panel no puede operar sobre
 * otros tenants, bots o conexiones. Las rutas son una lista cerrada (no un
 * proxy abierto) y los identificadores de ruta se validan como UUID.
 *
 * Los cuerpos se reenvían tal cual: Conduit los valida con sus propios
 * DTOs (whitelist estricta), así no se duplica su contrato aquí.
 */
@Controller({ path: 'admin/conduit', version: '1' })
export class ConduitAdminController {
  constructor(
    private readonly conduit: ConduitApiClient,
    private readonly config: ConfigService,
    private readonly templateResolver: ConduitTemplateResolver,
    private readonly outboxRepository: ConduitOutboxRepository,
    private readonly outbox: ConduitOutboxService,
  ) {}

  // ── Resumen ──────────────────────────────────────────────────────────

  /** Estado general para la portada del módulo WhatsApp. Tolera fallos parciales. */
  @Get('overview')
  async overview() {
    const [health, connection, connectionHealth, bot, templates] =
      await Promise.allSettled([
        this.conduit.admin('GET', 'health'),
        this.conduit.admin(
          'GET',
          `whatsapp/connections/${this.connectionId()}`,
        ),
        this.conduit.admin(
          'GET',
          `whatsapp/connections/${this.connectionId()}/health`,
        ),
        this.conduit.admin('GET', `bot/config/${this.botId()}`),
        this.templateResolver.describe(),
      ]);

    const value = (r: PromiseSettledResult<unknown>) =>
      r.status === 'fulfilled' ? r.value : null;
    const error = (r: PromiseSettledResult<unknown>) =>
      r.status === 'rejected' ? (r.reason as Error).message : null;

    return {
      reachable: health.status === 'fulfilled',
      health: value(health),
      connection: this.redactConnection(value(connection)),
      connectionHealth: value(connectionHealth),
      bot: this.redactBot(value(bot)),
      errors: {
        health: error(health),
        connection: error(connection),
        bot: error(bot),
      },
      templates: value(templates),
    };
  }

  // ── Conexión de WhatsApp ────────────────────────────────────────────

  @Get('connection')
  async connection() {
    return this.redactConnection(
      await this.call('GET', `whatsapp/connections/${this.connectionId()}`),
    );
  }

  /** QR para vincular el teléfono del spa (texto; el panel lo dibuja). */
  @Get('connection/qr')
  qr() {
    return this.call('GET', `whatsapp/connections/${this.connectionId()}/qr`);
  }

  @Get('connection/health')
  connectionHealth() {
    return this.call(
      'GET',
      `whatsapp/connections/${this.connectionId()}/health`,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('connection/:action')
  connectionAction(@Param('action') action: string) {
    if (!['connect', 'disconnect', 'reconnect'].includes(action)) {
      throw new AppException('NOT_FOUND');
    }
    return this.call(
      'POST',
      `whatsapp/connections/${this.connectionId()}/${action}`,
    );
  }

  @Put('connection/warmup-level')
  warmupLevel(@Body() body: Body) {
    return this.call(
      'POST',
      `whatsapp/connections/${this.connectionId()}/warmup-level`,
      { body },
    );
  }

  @Put('connection/campaign-policy')
  campaignPolicy(@Body() body: Body) {
    return this.call(
      'PATCH',
      `whatsapp/connections/${this.connectionId()}/campaign-policy`,
      { body },
    );
  }

  @Get('connection/contacts')
  contacts(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.call(
      'GET',
      `whatsapp/connections/${this.connectionId()}/contacts`,
      { query: { search, page, limit } },
    );
  }

  // ── Bot ─────────────────────────────────────────────────────────────

  @Get('bot')
  async bot() {
    return this.redactBot(await this.call('GET', `bot/config/${this.botId()}`));
  }

  /** Ajustes generales del bot (retrasos, historial, takeover, imágenes…). */
  @Put('bot')
  updateBot(@Body() body: Body) {
    return this.call('PUT', `bot/config/${this.botId()}`, { body });
  }

  /** Encender/apagar el bot (las plantillas siguen enviándose). */
  @Patch('bot/toggle')
  toggleBot() {
    return this.call('PATCH', `bot/config/${this.botId()}/toggle`);
  }

  @Get('bot/prompts/settings')
  promptSettings() {
    return this.call('GET', `bots/${this.botId()}/prompts/settings`);
  }

  @Put('bot/prompts/settings')
  updatePromptSettings(@Body() body: Body) {
    return this.call('PUT', `bots/${this.botId()}/prompts/settings`, { body });
  }

  @Get('bot/prompts')
  prompts() {
    return this.call('GET', `bots/${this.botId()}/prompts`);
  }

  @Get('bot/prompts/:type')
  prompt(@Param() params: ConduitPromptTypeParam) {
    return this.call('GET', `bots/${this.botId()}/prompts/${params.type}`);
  }

  @Put('bot/prompts/:type')
  updatePrompt(@Param() params: ConduitPromptTypeParam, @Body() body: Body) {
    return this.call('PUT', `bots/${this.botId()}/prompts/${params.type}`, {
      body,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('bot/prompts/preview')
  previewPrompt(@Body() body: Body) {
    return this.call('POST', `bots/${this.botId()}/prompts/preview`, { body });
  }

  @Get('bot/models')
  models() {
    return this.call('GET', `bot/config/${this.botId()}/models`);
  }

  /** Agregar un modelo de IA (la API key se guarda cifrada en Conduit). */
  @Post('bot/models')
  addModel(@Body() body: Body) {
    return this.call('POST', `bot/config/${this.botId()}/models`, { body });
  }

  @Delete('bot/models/:modelId')
  removeModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.call('DELETE', `bot/config/${this.botId()}/models/${modelId}`);
  }

  /** Reactivar un modelo marcado como no disponible (p. ej. sin saldo). */
  @Patch('bot/models/:modelId/reset')
  resetModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    return this.call(
      'PATCH',
      `bot/config/${this.botId()}/models/${modelId}/reset`,
    );
  }

  @Get('bot/tools')
  tools() {
    return this.call('GET', `bots/${this.botId()}/tools`);
  }

  @Post('bot/tools')
  createTool(@Body() body: Body) {
    return this.call('POST', `bots/${this.botId()}/tools`, { body });
  }

  @Patch('bot/tools/:toolId')
  updateTool(
    @Param('toolId', ParseUUIDPipe) toolId: string,
    @Body() body: Body,
  ) {
    return this.call('PATCH', `bots/${this.botId()}/tools/${toolId}`, {
      body,
    });
  }

  @Delete('bot/tools/:toolId')
  removeTool(@Param('toolId', ParseUUIDPipe) toolId: string) {
    return this.call('DELETE', `bots/${this.botId()}/tools/${toolId}`);
  }

  @Get('bot/escalation-contacts')
  escalationContacts() {
    return this.call('GET', `bots/${this.botId()}/escalation-contacts`);
  }

  @Post('bot/escalation-contacts')
  addEscalationContact(@Body() body: Body) {
    return this.call('POST', `bots/${this.botId()}/escalation-contacts`, {
      body: { connectionId: this.connectionId(), ...body },
    });
  }

  @Delete('bot/escalation-contacts/:contactId')
  removeEscalationContact(
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.call(
      'DELETE',
      `bots/${this.botId()}/escalation-contacts/${contactId}`,
    );
  }

  // ── Conversaciones ─────────────────────────────────────────────────

  @Get('conversations')
  conversations(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.call('GET', `bots/${this.botId()}/conversations`, {
      query: { status, search, page, limit },
    });
  }

  @Get('conversations/:id/messages')
  conversationMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.call(
      'GET',
      `bots/${this.botId()}/conversations/${id}/messages`,
      { query: { before, limit } },
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('conversations/:id/pause')
  pause(@Param('id', ParseUUIDPipe) id: string, @Body() body: Body) {
    return this.call('POST', `bots/${this.botId()}/conversations/${id}/pause`, {
      body,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('conversations/:id/resume')
  resume(@Param('id', ParseUUIDPipe) id: string) {
    return this.call('POST', `bots/${this.botId()}/conversations/${id}/resume`);
  }

  /** Responder como persona: el bot queda en pausa por takeover humano. */
  @HttpCode(HttpStatus.OK)
  @Post('conversations/:id/messages')
  reply(@Param('id', ParseUUIDPipe) id: string, @Body() body: Body) {
    return this.call(
      'POST',
      `bots/${this.botId()}/conversations/${id}/messages`,
      { body },
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('conversations/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.call('POST', `bots/${this.botId()}/conversations/${id}/close`);
  }

  // ── Plantillas ──────────────────────────────────────────────────────

  @Get('templates')
  templates(@Query() query: AdminQuery) {
    return this.call('GET', 'templates', { query });
  }

  /** Qué plantillas usa Leonice (variables CONDUIT_TEMPLATE_*) y si están configuradas. */
  @Get('templates/usage')
  templateUsage() {
    return this.templateResolver.describe();
  }

  @Get('templates/:id')
  template(@Param('id', ParseUUIDPipe) id: string) {
    return this.call('GET', `templates/${id}`);
  }

  @Post('templates')
  async createTemplate(@Body() body: Body) {
    const created = await this.call('POST', 'templates', { body });
    this.templateResolver.invalidate();
    return created;
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Body,
  ) {
    const updated = await this.call('PUT', `templates/${id}`, { body });
    this.templateResolver.invalidate();
    return updated;
  }

  @Delete('templates/:id')
  async removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    const removed = await this.call('DELETE', `templates/${id}`);
    this.templateResolver.invalidate();
    return removed;
  }

  @HttpCode(HttpStatus.OK)
  @Post('templates/:id/preview')
  previewTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() body: Body) {
    return this.call('POST', `templates/${id}/preview`, { body });
  }

  // ── Mensajes ────────────────────────────────────────────────────────

  @Get('messages')
  messages(@Query() query: AdminQuery) {
    return this.call('GET', 'messages', { query });
  }

  @Get('messages/:id')
  message(@Param('id', ParseUUIDPipe) id: string) {
    return this.call('GET', `messages/${id}/status`);
  }

  @Delete('messages/:id')
  cancelMessage(@Param('id', ParseUUIDPipe) id: string) {
    return this.call('DELETE', `messages/${id}`);
  }

  @Get('dead-letters')
  deadLetters(
    @Query('requeued') requeued?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.call('GET', 'dead-letters', {
      query: { requeued, page, limit },
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('dead-letters/:messageId/requeue')
  requeue(@Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.call('POST', `dead-letters/${messageId}/requeue`);
  }

  // ── Eventos de negocio hacia Conduit (outbox local) ─────────────────

  @Get('outbox')
  async outboxEvents(@Query() query: FindOutboxQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [data, total] = await this.outboxRepository.findMany({
      status: query.status,
      page,
      pageSize,
    });
    return { data, meta: { total, page, pageSize } };
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbox/:id/retry')
  async retryOutbox(@Param('id', ParseUUIDPipe) id: string) {
    const queued = await this.outbox.retry(id);
    if (!queued) throw new AppException('NOT_FOUND');
    return { id, status: 'PENDING' };
  }

  // ── Internos ────────────────────────────────────────────────────────

  private async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { query?: AdminQuery; body?: unknown } = {},
  ): Promise<T> {
    try {
      return await this.conduit.admin<T>(method, path, options);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): AppException {
    if (!(error instanceof ConduitAdminError)) {
      return new AppException('CONDUIT_UNAVAILABLE');
    }
    if (error.status === null || error.status >= 500) {
      return new AppException('CONDUIT_UNAVAILABLE', {
        details: { conduitMessage: error.message },
      });
    }
    if (error.status === 401 || error.status === 403) {
      // La API key de Leonice es inválida: es configuración del servidor.
      return new AppException('CONDUIT_NOT_CONFIGURED', {
        details: { conduitStatus: error.status },
      });
    }
    if (error.status === 404) {
      return new AppException('NOT_FOUND', { message: error.message });
    }
    return new AppException('CONDUIT_REQUEST_REJECTED', {
      message: error.message,
      details: { conduitStatus: error.status },
    });
  }

  private botId(): string {
    return this.requiredUuid('CONDUIT_DEFAULT_BOT_ID');
  }

  private connectionId(): string {
    return this.requiredUuid('CONDUIT_WHATSAPP_CONNECTION_ID');
  }

  private requiredUuid(key: string): string {
    const value = this.config.get<string>(key);
    if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
      throw new AppException('CONDUIT_NOT_CONFIGURED', {
        details: { missing: key },
      });
    }
    return value;
  }

  /**
   * `clientApiHeaders` puede contener credenciales de integraciones
   * antiguas: el panel ve qué headers hay, no sus valores.
   */
  private redactBot(bot: unknown) {
    if (!bot || typeof bot !== 'object') return bot;
    const record = bot as Record<string, unknown>;
    const headers = record.clientApiHeaders;
    if (!headers || typeof headers !== 'object') return bot;
    return {
      ...record,
      clientApiHeaders: Object.fromEntries(
        Object.keys(headers as Record<string, unknown>).map((k) => [k, '••••']),
      ),
    };
  }

  /** El QR y los datos del lease no son necesarios fuera de su endpoint. */
  private redactConnection(connection: unknown) {
    if (!connection || typeof connection !== 'object') return connection;
    const {
      lastQr: _qr,
      sessionOwner: _owner,
      sessionLeaseUntil: _lease,
      ...rest
    } = connection as Record<string, unknown>;
    return rest;
  }
}
