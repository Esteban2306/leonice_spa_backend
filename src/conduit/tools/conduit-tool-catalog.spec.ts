import { CONDUIT_TOOL_CATALOG } from './conduit-tool-catalog';

const schemaAt = (
  schema: Record<string, unknown>,
  path: string,
): Record<string, unknown> | undefined =>
  path
    .split('.')
    .reduce<Record<string, unknown> | undefined>(
      (node, key) =>
        (
          node?.properties as
            Record<string, Record<string, unknown>> | undefined
        )?.[key],
      schema,
    );

describe('CONDUIT_TOOL_CATALOG', () => {
  it('trae las 13 herramientas que revisa el panel', () => {
    expect(CONDUIT_TOOL_CATALOG.map((t) => t.name).sort()).toEqual(
      [
        'info_negocio',
        'listar_tratamientos',
        'consultar_disponibilidad',
        'disponibilidad_combo',
        'registrar_cliente',
        'actualizar_perfil_cliente',
        'crear_reserva_whatsapp',
        'reservas_proximas',
        'reagendar_reserva_whatsapp',
        'cancelar_reserva_whatsapp',
        'depositos_pendientes',
        'registrar_comprobante_automatico',
        'pasar_a_persona',
      ].sort(),
    );
  });

  it.each(CONDUIT_TOOL_CATALOG.map((t) => [t.name, t]))(
    '%s declara en el esquema todo lo que exige e inyecta',
    (_name, tool) => {
      const properties = Object.keys(
        (tool.parametersSchema.properties as object) ?? {},
      );
      for (const required of (tool.parametersSchema.required as string[]) ??
        []) {
        expect(properties).toContain(required);
      }
      if (tool.injectPhoneParamName) {
        expect(
          schemaAt(tool.parametersSchema, tool.injectPhoneParamName),
        ).toBeDefined();
      }
      expect(tool.path.startsWith('/')).toBe(true);
    },
  );

  it('solo la de comprobante pide imagen y solo pasar_a_persona pausa el bot', () => {
    expect(
      CONDUIT_TOOL_CATALOG.filter((t) => t.requiresImageAttachment).map(
        (t) => t.name,
      ),
    ).toEqual(['registrar_comprobante_automatico']);
    expect(
      CONDUIT_TOOL_CATALOG.filter((t) => t.pausesBotMinutes).map((t) => t.name),
    ).toEqual(['pasar_a_persona']);
  });
});
