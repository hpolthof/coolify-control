import { describe, it, expect } from 'vitest';
import { shellQuote, isSafeContainerName } from '../src/collect/quote';

describe('shellQuote', () => {
  it('should quote plain text', () => {
    expect(shellQuote('hello')).toBe("'hello'");
  });

  it('should quote text with spaces', () => {
    expect(shellQuote('hello world')).toBe("'hello world'");
  });

  it('should escape single quotes', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it('should handle multiple single quotes', () => {
    expect(shellQuote("'hello'")).toBe("''\\''hello'\\'''");
  });

  it('should handle $() syntax safely', () => {
    expect(shellQuote('$(whoami)')).toBe("'$(whoami)'");
  });

  it('should handle empty string', () => {
    expect(shellQuote('')).toBe("''");
  });
});

describe('isSafeContainerName', () => {
  it('should accept valid names starting with letter', () => {
    expect(isSafeContainerName('myapp')).toBe(true);
  });

  it('should accept names starting with digit', () => {
    expect(isSafeContainerName('a1')).toBe(true);
  });

  it('should accept names with underscores', () => {
    expect(isSafeContainerName('my_app')).toBe(true);
  });

  it('should accept names with dots', () => {
    expect(isSafeContainerName('my.app')).toBe(true);
  });

  it('should accept names with hyphens', () => {
    expect(isSafeContainerName('my-app')).toBe(true);
  });

  it('should accept complex valid name', () => {
    expect(isSafeContainerName('my-app_1.prod')).toBe(true);
  });

  it('should reject names starting with hyphen', () => {
    expect(isSafeContainerName('-app')).toBe(false);
  });

  it('should reject names starting with underscore', () => {
    expect(isSafeContainerName('_app')).toBe(false);
  });

  it('should reject names starting with dot', () => {
    expect(isSafeContainerName('.app')).toBe(false);
  });

  it('should reject names with invalid characters', () => {
    expect(isSafeContainerName('app@test')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isSafeContainerName('')).toBe(false);
  });

  it('should reject names longer than 255 characters', () => {
    expect(isSafeContainerName('a' + 'b'.repeat(255))).toBe(false); // 256 total
  });

  it('should accept names with exactly 255 characters', () => {
    expect(isSafeContainerName('a' + 'b'.repeat(254))).toBe(true); // 255 total
  });
});
