import {
  CONDUIT_TEMPLATE_CATALOG,
  FOLLOW_UP_TEMPLATES,
  type ConduitTemplateDefinition,
} from '../../conduit/templates/conduit-template-catalog';

export interface FollowUpRule {
  templateCode: string | null;
  reactivationDays: number;
}

export interface FollowUpPromotion {
  name: string;
  discountPercentage: { toString(): string };
}

export interface FollowUpContext {
  clientName: string;
  treatmentName: string;
  promotion: FollowUpPromotion | null;
}

export type FollowUpMessage =
  | { template: ConduitTemplateDefinition; variables: Record<string, string> }
  | { skip: string };

export const FOLLOW_UP_LABELS: Record<string, string> = {
  MAINTENANCE_REMINDER: 'Recordatorio de mantenimiento',
  REACTIVATION: 'Te extrañamos: invitación a volver',
  REACTIVATION_PROMO: 'Te extrañamos con una promoción',
};

export const templateNeedsFollowUpPromotion = (
  template: Pick<ConduitTemplateDefinition, 'variables'>,
): boolean => template.variables.includes('promocion');

const byCode = (code: string) =>
  CONDUIT_TEMPLATE_CATALOG.find((template) => template.code === code);

export function buildFollowUpMessage(
  rule: FollowUpRule,
  context: FollowUpContext,
): FollowUpMessage {
  const explicit = rule.templateCode
    ? FOLLOW_UP_TEMPLATES.find((item) => item.code === rule.templateCode)
    : undefined;
  if (rule.templateCode && !explicit) {
    return { skip: 'La plantilla de la regla ya no existe' };
  }

  const fallback = byCode(
    context.promotion ? 'REACTIVATION_PROMO' : 'REACTIVATION',
  );
  const template = explicit ?? fallback;
  if (!template) return { skip: 'No hay plantilla de seguimiento' };

  if (templateNeedsFollowUpPromotion(template) && !context.promotion) {
    return { skip: 'La promoción de la regla ya no está vigente' };
  }

  const values: Record<string, string> = {
    nombre: context.clientName,
    dias: String(rule.reactivationDays),
    tratamiento: context.treatmentName,
    promocion: context.promotion?.name ?? '',
    descuento: context.promotion
      ? String(Number(context.promotion.discountPercentage.toString()))
      : '',
  };

  return {
    template,
    variables: Object.fromEntries(
      template.variables.map((name) => [name, values[name] ?? '']),
    ),
  };
}
