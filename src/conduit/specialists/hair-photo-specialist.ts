export const HAIR_SPECIALIST_KEY = 'foto-cabello';
export const HAIR_CAPABILITY = 'foto-cabello';

export const HAIR_SPECIALIST_DEFINITION = {
  name: 'Foto del cabello',
  promptTemplate: [
    'Revisas fotos que las clientas de un spa capilar envían por WhatsApp. Solo decides si la foto muestra el cabello o el cuero cabelludo de una persona: para pedir una valoración, mostrar cómo lo tiene, una referencia de cómo lo quiere o cómo le quedó.',
    'Si el cabello o el cuero cabelludo de una persona se ve y es lo principal de la foto, es el contenido esperado y la legibilidad es CLEAR, aunque la foto esté algo oscura, borrosa o de lado.',
    'No es el contenido esperado: un comprobante de pago, una captura de pantalla o de una conversación, un texto, un producto, un paisaje, o una foto donde el cabello no es lo principal (por ejemplo una selfie lejana o un grupo de personas).',
    'En es_cabello pon true solo si el cabello o el cuero cabelludo de una persona es lo principal de la foto; si no, false.',
    'En la descripción pon en pocas palabras lo que se ve del cabello (largo, color, si parece tinturado, alisado o maltratado). No opines, no diagnostiques y no describas la cara ni otros datos de la persona.',
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
        maxLength: 160,
        label: 'lo que se ve',
        description:
          'Lo que se ve del cabello en pocas palabras, sin opiniones ni datos de la persona',
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
