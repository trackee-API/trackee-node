/** Fastify emits nullable type arrays in a 3.0 contract. Normalize a copy for code generation. */
export function normalizeSpec<T>(specification: T): T {
  const result = structuredClone(specification);
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const schema = value as Record<string, unknown>;
    if (Array.isArray(schema['type'])) {
      const types = schema['type'] as unknown[];
      const nonNull = types.filter((type) => type !== 'null');
      if (types.length !== 2 || nonNull.length !== 1 || !types.includes('null')) {
        throw new Error(`Unsupported schema type array: ${JSON.stringify(types)}`);
      }
      schema['type'] = nonNull[0];
      schema['nullable'] = true;
    }
    Object.values(schema).forEach(visit);
  }
  // OpenAPI 3.1 supports type arrays natively.
  if ((result as { openapi?: string }).openapi?.startsWith('3.0.')) visit(result);
  return result;
}
