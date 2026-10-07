// Crea (o reactiva) un admin de QA en la BD de desarrollo con una contraseña aleatoria.
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const crypto = require('crypto');
const fs = require('fs');
(async () => {
  const prisma = new PrismaClient();
  const email = 'qa-admin@leonice.test';
  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = await argon2.hash(password);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, failedLoginAttempts: 0, lockedUntil: null },
    create: { email, passwordHash },
  });
  fs.writeFileSync(process.argv[2], JSON.stringify({ email, password }), { mode: 0o600 });
  await prisma.$disconnect();
  console.log('qa admin listo:', email);
})();
