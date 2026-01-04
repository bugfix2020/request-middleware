import { describe, it, expect } from 'vitest';

import * as root from '../src/index';
import * as adapters from '../src/adapters';
import * as client from '../src/client';

describe('exports', () => {
  it('root exports should be available', () => {
    expect(root).toBeDefined();
    expect(typeof (root as any).createMiddlewareEngine).toBe('function');
    expect(typeof (root as any).createHttpClient).toBe('function');
  });

  it('adapters exports should be available', () => {
    expect(adapters).toBeDefined();
    expect(typeof (adapters as any).createFetchAdapter).toBe('function');
    expect(typeof (adapters as any).createEventSourceAdapter).toBe('function');
  });

  it('client exports should be available', () => {
    expect(client).toBeDefined();
    expect(typeof (client as any).createHttpClient).toBe('function');
  });
});
