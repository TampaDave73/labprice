import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError, AppError } from '../errors';

describe('AppError', () => {
  it('creates error with correct properties', () => {
    const err = new AppError('test', 'TEST_CODE', 500);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(500);
  });

  it('serializes to JSON', () => {
    const err = new AppError('test', 'CODE', 400, { field: 'name' });
    expect(err.toJSON()).toEqual({
      error: { code: 'CODE', message: 'test', details: { field: 'name' } },
    });
  });
});

describe('NotFoundError', () => {
  it('creates 404 error', () => {
    const err = new NotFoundError('Test', 'abc');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('abc');
  });
});

describe('ValidationError', () => {
  it('creates 400 error', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
  });
});
