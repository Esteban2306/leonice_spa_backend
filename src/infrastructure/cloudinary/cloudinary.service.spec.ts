import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService.signAuthenticatedUrl', () => {
  const publicId =
    'leonice-spa/deposit-proofs/deposit-242e9725-be5b-4971-902f-cccc9582a723-1793145660149';
  let service: CloudinaryService;

  beforeAll(() => {
    cloudinary.config({
      cloud_name: 'demo-cloud',
      api_key: '123',
      api_secret: 'secret-de-prueba',
      secure: true,
    });
    service = new CloudinaryService(cloudinary);
  });

  const uploadResponseUrl = () =>
    cloudinary
      .url(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        sign_url: true,
        secure: true,
        version: '1793145661',
        format: 'jpg',
      })
      .split('?')[0];

  it('la URL que devuelve Cloudinary al subir ya viene firmada: conserva una sola firma y el mismo recurso', () => {
    const stored = uploadResponseUrl();
    expect(stored).toContain('/image/authenticated/s--');

    const signed = service.signAuthenticatedUrl(stored);

    expect(signed.split('?')[0]).toBe(stored);
    expect(signed.match(/\/s--/g)).toHaveLength(1);
  });

  it('firma una URL autenticada que llega sin firma', () => {
    const unsigned = `https://res.cloudinary.com/demo-cloud/image/authenticated/v1793145661/${publicId}.jpg`;

    expect(service.signAuthenticatedUrl(unsigned).split('?')[0]).toBe(
      uploadResponseUrl(),
    );
  });

  it('firmarla dos veces no la corrompe', () => {
    const once = service.signAuthenticatedUrl(uploadResponseUrl());

    expect(service.signAuthenticatedUrl(once)).toBe(once);
  });

  it('deja intactas las URL que no son autenticadas', () => {
    const open = 'https://res.cloudinary.com/demo-cloud/image/upload/v1/a.jpg';

    expect(service.signAuthenticatedUrl(open)).toBe(open);
  });
});
