const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
console.log('Available models in Prisma Client:');
console.log(Object.keys(prisma).filter(key => !key.startsWith('_') && typeof prisma[key] === 'object'));
process.exit(0);
