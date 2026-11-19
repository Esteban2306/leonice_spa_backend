import { ownerRecipients } from './owner-recipients';

describe('ownerRecipients', () => {
  it('encuentra a Leo entre los administradores por su nombre', () => {
    const found = ownerRecipients([
      { id: '1', name: 'Dayana Recepción' },
      { id: '2', name: 'Leo Arenas' },
      { id: '3', name: 'LEÓ' },
    ]);
    expect(found.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('no confunde nombres que solo empiezan por "leo"', () => {
    expect(
      ownerRecipients([
        { id: '1', name: 'Leonice Arenas Spa' },
        { id: '2', name: 'Leonardo' },
        { id: '3', name: 'Cleo' },
      ]),
    ).toEqual([]);
  });
});
