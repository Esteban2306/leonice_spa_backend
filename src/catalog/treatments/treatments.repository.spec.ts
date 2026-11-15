import { TreatmentsRepository } from './treatments.repository';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('TreatmentsRepository.findAllActive', () => {
  it('solo trae tratamientos activos de categorías activas, para que una categoría oculta no se filtre al sitio ni al bot', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      client: { treatment: { findMany } },
    } as unknown as PrismaService;

    await new TreatmentsRepository(prisma).findAllActive();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, category: { isActive: true } },
      }),
    );
  });
});
