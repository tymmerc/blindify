// Jest setup file for global test configuration
import { resolveTestDatabaseUrl } from './testDatabase';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.SESSION_SECRET = 'test-session-secret-for-testing-only';
// Plus de base par defaut : l'ancien defaut visait le serveur de la prod (voir
// tests/testDatabase.ts). Sans TEST_DATABASE_URL, DATABASE_URL vise une adresse
// qui n'existe pas : un test qui toucherait la base par erreur echoue au lieu
// d'ecrire quelque part.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  ? resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL)
  : 'postgres://aucune-base.invalid:1/aucune_base_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// Extend Jest timeout for integration tests
jest.setTimeout(10000);

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
