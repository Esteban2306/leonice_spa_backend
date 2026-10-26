import { matchTreatment } from './treatment-matcher';

const T = (id: string, name: string, slug?: string) => ({ id, name, slug });
const CATALOG = [
  T('1', 'Alisado orgánico'),
  T('2', 'Alisado con keratina'),
  T('3', 'Hidratación profunda'),
  T('4', 'Terapia de control'),
  T('5', 'Spa coreano'),
  T('6', 'Manicure semipermanente'),
  T('7', 'Manicure tradicional'),
];

describe('matchTreatment', () => {
  it('un nombre completo es un acierto', () => {
    expect(matchTreatment('hidratación profunda', CATALOG)).toMatchObject({
      status: 'found',
      treatment: { id: '3' },
    });
  });

  it('ignora artículos, tildes, mayúsculas y la palabra "tratamiento"', () => {
    expect(
      matchTreatment('el Tratamiento de HIDRATACION', CATALOG),
    ).toMatchObject({ status: 'found', treatment: { id: '3' } });
  });

  it('una palabra que coincide con varios es ambigua y lista las opciones', () => {
    const result = matchTreatment('alisado', CATALOG);
    expect(result.status).toBe('ambiguous');
    expect(
      result.status === 'ambiguous' && result.options.map((o) => o.id),
    ).toEqual(['1', '2']);
  });

  it('una palabra distintiva decide entre los parecidos', () => {
    expect(matchTreatment('alisado keratina', CATALOG)).toMatchObject({
      status: 'found',
      treatment: { id: '2' },
    });
  });

  it('acepta singular/plural cercano', () => {
    expect(matchTreatment('manicures tradicional', CATALOG)).toMatchObject({
      status: 'found',
      treatment: { id: '7' },
    });
  });

  it('lo que no es un tratamiento no se adivina', () => {
    expect(matchTreatment('cancelar', CATALOG).status).toBe('not_found');
    expect(matchTreatment('la cita', CATALOG).status).toBe('not_found');
    expect(matchTreatment('masaje tailandés', CATALOG).status).toBe(
      'not_found',
    );
  });

  it('una consulta sin palabras significativas no acierta', () => {
    expect(matchTreatment('el de la', CATALOG).status).toBe('not_found');
    expect(matchTreatment('', CATALOG).status).toBe('not_found');
  });

  it('una consulta más específica que cualquier nombre no acierta por parcial', () => {
    expect(
      matchTreatment('hidratación profunda con keratina y botox', CATALOG)
        .status,
    ).toBe('not_found');
  });
});
