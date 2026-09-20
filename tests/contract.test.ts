import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { normalizeSpec } from '../scripts/normalize-spec';
import { VERSION, type GetV1BrandsByIdResponse, type GetV1ScansByIdResponse } from '../src/index';

describe('contract generation', () => {
  it('normalizes nullable schemas without mutating the API export', () => {
    const source = { openapi: '3.0.3', schema: { type: ['null', 'string'], description: 'Domain' } };
    expect(normalizeSpec(source).schema).toEqual({ type: 'string', nullable: true, description: 'Domain' });
    expect(source.schema.type).toEqual(['null', 'string']);
  });
  it('leaves native 3.1 unions untouched', () => {
    const source = { openapi: '3.1.0', schema: { type: ['null', 'string'] } };
    expect(normalizeSpec(source)).toEqual(source);
  });
  it('keeps nullable response fields strongly typed', () => {
    expectTypeOf<GetV1BrandsByIdResponse['data']['domain']>().toEqualTypeOf<string | null>();
    expectTypeOf<GetV1ScansByIdResponse['data']['results'][number]['position']>().toEqualTypeOf<
      number | null | undefined
    >();
  });
  it('keeps the user agent version aligned with the package', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });
});
