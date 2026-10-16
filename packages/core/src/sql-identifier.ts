/**
 * Table names cannot travel as `$1` placeholders, so the layers put them into SQL as
 * text. This check is what keeps that safe: a plain identifier, optionally qualified
 * by a schema, with letters, digits and underscores only and at most 63 characters a
 * part (PostgreSQL's limit). Anything else is rejected before it reaches a query.
 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}(?:\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/;

export function assertSqlIdentifier(name: string, what: string): string {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
    throw new TypeError(
      `${what} ${JSON.stringify(name)} is not a valid SQL identifier: use letters, digits and underscores, optionally schema.table`,
    );
  }
  return name;
}
