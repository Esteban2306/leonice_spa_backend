import type { ConduitTemplateDefinition } from '../../conduit/templates/conduit-template-catalog';

const DAY_MS = 86_400_000;

const END_FORMAT = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'long',
});

export interface CampaignPromotion {
  name: string;
  discountPercentage: { toString(): string } | number | string;
  endsAt: Date;
}

export interface CampaignMemberData {
  name: string;
  lastVisitAt: Date | null;
}

export type CampaignVariablesResult =
  { variables: Record<string, string> } | { skip: string };

export const templateNeedsPromotion = (
  template: Pick<ConduitTemplateDefinition, 'variables'>,
): boolean =>
  ['promocion', 'descuento', 'vigencia'].some((name) =>
    template.variables.includes(name),
  );

export const templateNeedsVisit = (
  template: Pick<ConduitTemplateDefinition, 'variables'>,
): boolean => template.variables.includes('dias');

const percentageText = (value: CampaignPromotion['discountPercentage']) =>
  String(Number(value.toString()));

export function buildCampaignVariables(
  template: Pick<ConduitTemplateDefinition, 'variables'>,
  member: CampaignMemberData,
  promotion: CampaignPromotion | null,
  now: Date,
): CampaignVariablesResult {
  const values: Record<string, string> = { nombre: member.name };

  if (templateNeedsVisit(template)) {
    if (!member.lastVisitAt) return { skip: 'Todavía no tiene una visita' };
    values.dias = String(
      Math.max(
        0,
        Math.floor((now.getTime() - member.lastVisitAt.getTime()) / DAY_MS),
      ),
    );
  }

  if (templateNeedsPromotion(template)) {
    if (!promotion) return { skip: 'La campaña no tiene promoción' };
    values.promocion = promotion.name;
    values.descuento = percentageText(promotion.discountPercentage);
    values.vigencia = `hasta el ${END_FORMAT.format(promotion.endsAt)}`;
  }

  return {
    variables: Object.fromEntries(
      template.variables.map((name) => [name, values[name] ?? '']),
    ),
  };
}
