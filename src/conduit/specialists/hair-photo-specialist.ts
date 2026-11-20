export const HAIR_SPECIALIST_KEY = 'foto-cabello';
export const HAIR_CAPABILITY = 'foto-cabello';

export const HAIR_DESCRIPTION_MAX = 200;
export const HAIR_SIGNS_MAX = 200;

export const HAIR_SPECIALIST_DEFINITION = {
  name: 'Foto del cabello',
  promptTemplate: [
    'Revisas fotos que las clientas de un spa capilar envían por WhatsApp. Decides si la foto muestra el cabello o el cuero cabelludo de una persona (para pedir una valoración, mostrar cómo lo tiene, una referencia de cómo lo quiere o cómo le quedó) y preparas una vista previa para que una persona del equipo la examine.',
    'Si el cabello o el cuero cabelludo de una persona se ve y es lo principal de la foto, es el contenido esperado y la legibilidad es CLEAR, aunque la foto esté algo oscura, borrosa o de lado.',
    'No es el contenido esperado: un comprobante de pago, una captura de pantalla o de una conversación, un texto, un producto, un paisaje, o una foto donde el cabello no es lo principal (por ejemplo una selfie lejana o un grupo de personas).',
    'En es_cabello pon true solo si el cabello o el cuero cabelludo de una persona es lo principal de la foto; si no, false.',
    'En descripcion pon en pocas palabras cómo es el cabello: largo, color, textura (liso, ondulado, rizado) y si parece tinturado, decolorado o alisado.',
    'En senales pon lo que se nota a simple vista en el cabello o el cuero cabelludo, por ejemplo puntas abiertas, frizz, resequedad, quiebre, raíz crecida, canas, grasa, caspa o descamación; si no se nota nada, pon "nada llamativo".',
    'Es una vista previa para el equipo, no un diagnóstico: describe solo lo que se ve, sin causas, tratamientos ni promesas, y no describas la cara ni otros datos de la persona.',
  ].join('\n'),
  outputSchema: {
    version: 1,
    variables: [
      {
        name: 'es_cabello',
        type: 'boolean',
        label: 'es del cabello',
        description:
          'true si el cabello o el cuero cabelludo de una persona es lo principal de la foto',
      },
      {
        name: 'descripcion',
        type: 'string',
        maxLength: HAIR_DESCRIPTION_MAX,
        label: 'cómo es el cabello',
        description:
          'Largo, color, textura y si parece tinturado, decolorado o alisado, sin datos de la persona',
      },
      {
        name: 'senales',
        type: 'string',
        maxLength: HAIR_SIGNS_MAX,
        label: 'lo que se nota',
        description:
          'Lo que se nota a simple vista en el cabello o el cuero cabelludo, o "nada llamativo"',
      },
    ],
    uniqueBy: [],
  },
  rules: {
    version: 1,
    rules: [
      {
        field: 'es_cabello',
        op: 'eq',
        ref: { literal: true },
        onFail: 'INVALID',
      },
    ],
  },
  contextSources: { version: 1, sources: [] },
};

export const HAIR_SPECIALIST_MODELS = [
  { model: 'claude-haiku-5-5', role: 'IMAGE_ANALYSIS', priority: 1 },
  { model: 'claude-sonnet-5-5', role: 'FALLBACK', priority: 2 },
] as const;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,\s]+$/, '');
  return clean ? clean.slice(0, max) : null;
};

export function hairPhotoPreview(
  variables: Record<string, unknown> | undefined,
): string {
  const description = text(variables?.descripcion, HAIR_DESCRIPTION_MAX);
  const signs = text(variables?.senales, HAIR_SIGNS_MAX);
  const parts = [
    description && `Se ve: ${description}.`,
    signs && `Se nota: ${signs}.`,
  ].filter(Boolean);
  return parts.length > 0
    ? `Vista previa automática, por confirmar al ver la foto. ${parts.join(' ')}`
    : 'Sin vista previa: revisa la foto en el chat.';
}
