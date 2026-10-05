import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Does an `Authorization` header carry the token? — §9, one bearer token.
 *
 * Compared in constant time, so response timing reveals nothing about how much of
 * a guess was right. Both sides are hashed first because `timingSafeEqual` needs
 * equal lengths, and comparing lengths directly would leak the token's length.
 */
export function hasToken(header: string | undefined, token: string): boolean {
  if (header === undefined || !header.startsWith('Bearer ')) return false;

  const given = createHash('sha256').update(header.slice('Bearer '.length)).digest();
  const expected = createHash('sha256').update(token).digest();
  return timingSafeEqual(given, expected);
}
