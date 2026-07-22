import { PrismaClient } from '@prisma/client';

/**
 * Global variable for caching PrismaClient in development string hot-reloads.
 */
declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient safe for Next.js HMR.
 */
export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
