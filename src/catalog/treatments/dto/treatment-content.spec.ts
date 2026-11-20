import { ValidationPipe } from '@nestjs/common';
import { UpdateTreatmentDto } from './update-treatment.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const update = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: UpdateTreatmentDto,
  }) as Promise<UpdateTreatmentDto>;

describe('ficha de un servicio editada desde el panel', () => {
  it('acepta el resultado, la duración del liso, los beneficios y los cuidados', async () => {
    const dto = await update({
      results: '  90 % liso, dura de 5 a 6 meses  ',
      benefits: ['Orgánico', ' ', 'Sin formol'],
      aftercare: ['No lavar en 48 horas'],
      recommendedFrequency: 'Cada 5 a 6 meses',
    });
    expect(dto.results).toBe('90 % liso, dura de 5 a 6 meses');
    expect(dto.benefits).toEqual(['Orgánico', 'Sin formol']);
    expect(dto.aftercare).toEqual(['No lavar en 48 horas']);
  });

  it('un texto vacío borra el campo', async () => {
    expect((await update({ results: '   ' })).results).toBeNull();
  });

  it('rechaza textos demasiado largos o listas enormes', async () => {
    await expect(update({ results: 'x'.repeat(601) })).rejects.toBeDefined();
    await expect(
      update({ benefits: Array.from({ length: 13 }, (_, i) => `b${i}`) }),
    ).rejects.toBeDefined();
  });
});
