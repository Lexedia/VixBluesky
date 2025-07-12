import { $type } from '@atcute/lexicons'
import { Records } from '@atcute/lexicons/ambient'

export const concatQueryParams = (params: Record<string, string | string[]>) =>
  Object.entries(params)
    .map(([ key, value ]) => {
      if (Array.isArray(value)) {
        return value.map((v) => `${key}=${v}`).join('&')
      }
      return `${key}=${value}`
    })
    .join('&')

export const join = (t: string | string[], s: string) =>
  Array.isArray(t) ? t.join(s) : t

export function is<
  T extends $type.enforce<U>,
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

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export const ellipsis = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 3)}...` : s
