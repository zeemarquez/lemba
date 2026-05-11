/**
 * Normalizes CSS-like dimensions to Typst length syntax.
 * Duplicated from `lib/typst/client-compiler.ts` for the standalone API package.
 */
export function fixTypstUnit(value: string | number | undefined): string {
    if (value === undefined || value === null || value === '') return '0pt';
    const s = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return s + 'pt';
    if (s.toLowerCase().endsWith('px')) {
        const num = parseFloat(s);
        return isNaN(num) ? '0pt' : `${num}pt`;
    }
    if (/^-?\d+(\.\d+)?[a-zA-Z%]+$/.test(s)) {
        if (s.toLowerCase().endsWith('rem')) return s.slice(0, -3) + 'em';
        if (s.toLowerCase().endsWith('mc')) return s.slice(0, -2) + 'cm';
        return s;
    }
    if (['cm', 'mm', 'in', 'pt', 'em'].includes(s.toLowerCase())) {
        return `1${s.toLowerCase()}`;
    }
    return '0pt';
}
