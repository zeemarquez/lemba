/**
 * Color utilities for Template Editor: normalize to hex (#rrggbb) for inputs.
 */

const HEX_RE = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

/**
 * Convert hsl/hsla or hex to #rrggbb. Drops alpha; use for display/storage in color inputs.
 */
export function toHex(color: string | undefined): string {
    if (!color || typeof color !== 'string') return '#000000';
    const t = color.trim();
    if (HEX_RE.test(t)) {
        const h = t.replace(/^#/, '');
        if (h.length === 3) {
            return '#' + [...h].map((c) => c + c).join('');
        }
        return '#' + h;
    }
    const m = t.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
    if (m) {
        const h = parseInt(m[1], 10) / 360;
        const s = parseInt(m[2], 10) / 100;
        const l = parseInt(m[3], 10) / 100;
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const r = hue2rgb(p, q, h + 1 / 3);
        const g = hue2rgb(p, q, h);
        const b = hue2rgb(p, q, h - 1 / 3);
        return '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    }
    return '#000000';
}

/**
 * Normalize user input to #rrggbb or null if invalid.
 */
export function normalizeHexInput(input: string): string | null {
    const s = input.trim().replace(/^#/, '');
    if (/^[0-9A-Fa-f]{6}$/.test(s)) return '#' + s;
    if (/^[0-9A-Fa-f]{3}$/.test(s)) return '#' + [...s].map((c) => c + c).join('');
    return null;
}
