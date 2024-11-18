export const concatQueryParams = (params: Record<string, string | string[]>) =>
  Object.entries(params)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((v) => `${key}=${v}`).join('&');
      }
      return `${key}=${value}`;
    })
    .join('&');

export const join = (t: string | string[], s: string) =>
  Array.isArray(t) ? t.join(s) : t;

export const checkType = (t: string, o: any): boolean =>
  typeof o?.$type === 'string' && (o?.$type === t || o?.$type.startsWith(t));

export const indent = (s: string, n: number) =>
  s
    .split('\n')
    .map((l) => ' '.repeat(n) + l)
    .join('\n');

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export const ellipsis = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 3)}...` : s;
