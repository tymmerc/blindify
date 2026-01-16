# Testing Guide for Blindify Backend

## Overview

This project uses **Jest** as the testing framework with **TypeScript** support via ts-jest.

## Test Structure

```
backend/
├── tests/
│   ├── setup.ts                    # Global test configuration
│   ├── services/                   # Unit tests for business logic
│   │   ├── scoring.spec.ts
│   │   ├── gameStateCache.spec.ts
│   │   └── ...
│   ├── integration/                # API endpoint tests
│   │   ├── auth.spec.ts
│   │   ├── games.spec.ts
│   │   └── ...
│   └── e2e/                        # End-to-end tests
│       ├── solo-game-flow.spec.ts
│       └── multiplayer-flow.spec.ts
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### With Coverage
```bash
npm run test:coverage
```

### Specific Test File
```bash
npm test -- scoring.spec.ts
```

### Specific Test Suite
```bash
npm test -- --testNamePattern="Game Scoring System"
```

## Test Types

### 1. Unit Tests
Test individual functions and services in isolation.

**Example:** `tests/services/scoring.spec.ts`
- Tests the scoring algorithm
- No external dependencies
- Fast execution

### 2. Integration Tests
Test API endpoints and their interactions with services.

**Example:** `tests/integration/auth.spec.ts`
- Tests HTTP endpoints
- Uses supertest for HTTP assertions
- May use mocked database

### 3. End-to-End Tests
Test complete user flows across the entire system.

**Example:** `tests/e2e/solo-game-flow.spec.ts`
- Tests entire game flow
- Real database (test instance)
- Socket.IO interactions

## Writing Tests

### Basic Test Structure
```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('Specific Functionality', () => {
    it('should behave as expected', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Testing API Endpoints
```typescript
import request from 'supertest';
import app from '../../src/app';

describe('GET /api/endpoint', () => {
  it('should return 200 with data', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('data');
  });
});
```

### Testing with Authentication
```typescript
describe('Protected Endpoint', () => {
  let sessionToken: string;

  beforeEach(async () => {
    // Create guest session
    const response = await request(app)
      .post('/api/auth/guest');
    sessionToken = response.body.sessionToken;
  });

  it('should access protected resource', async () => {
    await request(app)
      .get('/api/protected')
      .set('Cookie', `session=${sessionToken}`)
      .expect(200);
  });
});
```

### Testing Async Code
```typescript
it('should handle promises', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});

it('should handle rejections', async () => {
  await expect(failingAsyncFunction()).rejects.toThrow('Error message');
});
```

### Testing Socket.IO Events
```typescript
import { io as ioClient } from 'socket.io-client';

describe('Socket Events', () => {
  let clientSocket: any;

  beforeEach((done) => {
    clientSocket = ioClient('http://localhost:3000', {
      auth: { token: sessionToken }
    });
    clientSocket.on('connect', done);
  });

  afterEach(() => {
    clientSocket.close();
  });

  it('should emit and receive events', (done) => {
    clientSocket.on('response', (data: any) => {
      expect(data).toBe('expected');
      done();
    });

    clientSocket.emit('request', { test: 'data' });
  });
});
```

## Mocking

### Mock External Services
```typescript
jest.mock('../../src/services/spotifyApi', () => ({
  getTrack: jest.fn().mockResolvedValue({
    id: 'track123',
    name: 'Test Track'
  })
}));
```

### Mock Database Queries
```typescript
jest.mock('../../src/config/db', () => ({
  query: jest.fn().mockResolvedValue({
    rows: [{ id: 1, name: 'Test User' }]
  })
}));
```

### Mock Redis
```typescript
jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  }
}));
```

## Test Database Setup

For integration and E2E tests, use a separate test database:

```bash
# Create test database
createdb blindify_test

# Run migrations
npm run init-db -- --database=blindify_test

# Tests will use TEST_DATABASE_URL if set
export TEST_DATABASE_URL="postgres://blindify:password@localhost:5432/blindify_test"
```

## Coverage Requirements

Minimum coverage thresholds are set in `jest.config.js`:
- Branches: 60%
- Functions: 60%
- Lines: 60%
- Statements: 60%

View coverage report:
```bash
npm run test:coverage
open coverage/index.html
```

## Best Practices

### 1. Test Naming
- Use descriptive test names that explain the expected behavior
- Follow the pattern: "should [expected behavior] when [condition]"
- Examples:
  - ✅ "should return 200 when user is authenticated"
  - ❌ "test auth"

### 2. Arrange-Act-Assert Pattern
```typescript
it('should calculate total price correctly', () => {
  // Arrange: Set up test data
  const items = [{ price: 10 }, { price: 20 }];

  // Act: Execute the function
  const total = calculateTotal(items);

  // Assert: Verify the result
  expect(total).toBe(30);
});
```

### 3. Test Independence
- Each test should be independent
- Don't rely on test execution order
- Clean up after each test

### 4. Mock External Dependencies
- Mock APIs, databases, and external services
- Use fixtures for complex test data
- Keep tests fast and reliable

### 5. Test Edge Cases
```typescript
describe('Edge Cases', () => {
  it('should handle empty input', () => {
    expect(process([])).toEqual([]);
  });

  it('should handle null values', () => {
    expect(process(null)).toBe(null);
  });

  it('should handle very large numbers', () => {
    expect(process(Number.MAX_SAFE_INTEGER)).toBeDefined();
  });
});
```

### 6. Avoid Test Duplication
Use `beforeEach`, `describe` blocks, and helper functions to reduce duplication.

### 7. Test Failures Too
```typescript
it('should throw error for invalid input', () => {
  expect(() => functionToTest('invalid')).toThrow('Invalid input');
});
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-commit hooks (if configured)

## Troubleshooting

### Tests Hanging
- Check for unclosed connections (database, Redis, sockets)
- Ensure all async operations complete
- Use `--detectOpenHandles` flag: `npm test -- --detectOpenHandles`

### Intermittent Failures
- Often caused by race conditions
- Use proper async/await patterns
- Increase timeouts if necessary: `jest.setTimeout(10000)`

### Database Connection Errors
- Ensure test database is running
- Check TEST_DATABASE_URL environment variable
- Verify database credentials

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing TypeScript](https://jestjs.io/docs/getting-started#via-ts-jest)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Socket.IO Testing](https://socket.io/docs/v4/testing/)
