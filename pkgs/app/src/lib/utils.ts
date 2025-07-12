import { Brand, Records } from '@atcute/client/lexicons'

export const join = (t: string | string[], s: string) =>
  Array.isArray(t) ? t.join(s) : t

export function is<
  T extends Brand.Union<U>,
  const Type extends T['$type'],
  U extends object,
>(lexicon: Type, obj: T): obj is T & { $type: Type }
export function is<T extends keyof Records>(
  lexicon: T,
  obj: unknown,
): obj is Records[T]
export function is<T, Type extends string>(
  lexicon: Type,
  obj: T,
): obj is T & { $type: Type | `${Type}#main` }
export function is(lexicon: string, obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj.$type === lexicon || obj.$type === lexicon + '#main')
  )
}

export const indent = (s: string, n: number) =>
  s
    .split('\n')
    .map((l) => ' '.repeat(n) + l)
    .join('\n')

export const ellipsis = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 3)}...` : s

export enum Platform {
  discord,
  telegram,
}
