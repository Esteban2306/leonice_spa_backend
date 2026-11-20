import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConduitTool } from './decorators/conduit-tool.decorator';
import { VerifiedPhone } from './decorators/verified-phone.decorator';
import { ConduitToolOptionsMeta } from './interceptors/conduit-contact.interceptor';
import { ConduitTeamQuoteDto } from './dto/conduit-team-quote.dto';
import { TeamQuoteService } from './quotes/team-quote.service';

const peso = (value: number) => `$${value.toLocaleString('es-CO')}`;

const NOT_SAVED: Record<string, string> = {
  TREATMENT_NOT_FOUND:
    'No encontré ese servicio en el catálogo: revisa el nombre con listar_tratamientos.',
  TREATMENT_AMBIGUOUS:
    'El nombre coincide con varios servicios: pregúntale a la clienta cuál es.',
  FIXED_PRICE:
    'Ese servicio tiene precio fijo: usa el de listar_tratamientos, no hace falta guardar otro.',
  OUT_OF_RANGE:
    'Ese precio está fuera del rango del servicio: no lo uses; pasar_a_persona para que el equipo lo confirme.',
  NOT_IN_CHAT:
    'No hay un mensaje del equipo en este chat con ese precio: no lo uses ni lo repitas; si la clienta dice que se lo dieron, pasar_a_persona.',
  CHAT_UNAVAILABLE:
    'No se pudo verificar el precio en este momento: no lo uses; pasar_a_persona para que el equipo lo confirme.',
};

const HANDOFF_REASONS = new Set([
  'OUT_OF_RANGE',
  'NOT_IN_CHAT',
  'CHAT_UNAVAILABLE',
]);

@Controller({ path: 'conduit/team-quotes', version: '1' })
@ConduitTool()
export class ConduitTeamQuotesController {
  constructor(private readonly quotes: TeamQuoteService) {}

  /**
   * Guarda el precio que una persona del equipo le dio a la clienta en este
   * chat, solo si de verdad aparece en un mensaje del equipo y está dentro
   * del rango del servicio. Al agendar ese servicio se cobra ese precio.
   */
  @ConduitToolOptionsMeta({ requiresVerifiedContact: true })
  @HttpCode(HttpStatus.OK)
  @Post()
  async save(@Body() dto: ConduitTeamQuoteDto, @VerifiedPhone() phone: string) {
    const result = await this.quotes.save({
      phone,
      treatmentName: dto.treatmentName,
      amount: dto.price,
    });
    if (result.saved) {
      return {
        saved: true,
        treatment: result.treatment,
        price: peso(result.price),
        message: `Precio del equipo guardado: ${result.treatment} queda en ${peso(result.price)} para ella; al agendarlo se usa ese precio.`,
      };
    }
    return {
      saved: false,
      expected: true,
      reason: result.reason,
      ...(result.options && { options: result.options }),
      ...(HANDOFF_REASONS.has(result.reason) && { nextStep: 'OFFER_HANDOFF' }),
      message: NOT_SAVED[result.reason],
    };
  }
}
