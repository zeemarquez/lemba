/**
 * Resolve Lucide icon name to SVG string for Typst image.decode.
 * Uses dynamic import of lucide-react icons and builds SVG from __iconNode.
 */

/** Convert color (hex or hsl/hsla) to #hex for SVG. */
export function colorToHex(color: string | undefined): string | undefined {
    if (!color || typeof color !== 'string') return undefined;
    const t = color.trim();
    if (/^#[0-9A-Fa-f]{3,8}$/.test(t)) return t.length <= 7 ? t : t.slice(0, 7);
    const hslMatch = t.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%/);
    if (hslMatch) {
        const h = parseInt(hslMatch[1], 10) / 360;
        const s = parseInt(hslMatch[2], 10) / 100;
        const l = parseInt(hslMatch[3], 10) / 100;
        const hue2rgb = (p: number, q: number, hue: number) => {
            if (hue < 0) hue += 1;
            if (hue > 1) hue -= 1;
            if (hue < 1 / 6) return p + (q - p) * 6 * hue;
            if (hue < 1 / 2) return q;
            if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const r = hue2rgb(p, q, h + 1 / 3);
        const g = hue2rgb(p, q, h);
        const b = hue2rgb(p, q, h - 1 / 3);
        return '#' + [r, g, b].map((x) => {
            const hx = Math.round(x * 255).toString(16);
            return hx.length === 1 ? '0' + hx : hx;
        }).join('');
    }
    return undefined;
}

function pascalToKebab(s: string): string {
    return s
        .replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`)
        .replace(/([A-Z])/g, (c) => c.toLowerCase())
        .replace(/^-/, '');
}

function attrsToStr(attrs: Record<string, string | number>): string {
    return Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
        .join(' ');
}

function buildSvgFromIconNode(
    nodes: [string, Record<string, string | number>][],
    strokeColor: string
): string {
    const stroke = strokeColor.startsWith('#') ? strokeColor : `#${strokeColor}`;
    const parts: string[] = [];
    for (const [tag, attrs] of nodes) {
        const a = { ...attrs };
        if (tag === 'path' && a.d) {
            parts.push(`<path d="${String(a.d).replace(/"/g, '&quot;')}"/>`);
        } else if (tag === 'circle') {
            parts.push(`<circle ${attrsToStr(a)}/>`);
        } else if (tag === 'rect') {
            parts.push(`<rect ${attrsToStr(a)}/>`);
        } else if (tag === 'line') {
            parts.push(`<line ${attrsToStr(a)}/>`);
        } else if (tag === 'polyline' && a.points) {
            parts.push(`<polyline points="${a.points}"/>`);
        } else if (tag === 'polygon' && a.points) {
            parts.push(`<polygon points="${a.points}"/>`);
        } else if (tag === 'path') {
            parts.push(`<path ${attrsToStr(a)}/>`);
        }
    }
    return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${stroke}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${parts.join('')}</svg>`;
}

/** Escape SVG for embedding inside Typst image.decode("...") double-quoted string. */
export function escapeSvgForTypst(svg: string): string {
    return svg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const cache = new Map<string, string>();

export async function getLucideSvg(
    iconName: string,
    strokeColor: string
): Promise<string> {
    const kebab = pascalToKebab(iconName);
    const cacheKey = `${kebab}:${strokeColor}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const mod = await import(
            /* @vite-ignore */
            `lucide-react/dist/esm/icons/${kebab}.js`
        );
        const nodes = (mod as any).__iconNode as [string, Record<string, string | number>][];
        if (!nodes || !Array.isArray(nodes)) {
            return '';
        }
        const svg = buildSvgFromIconNode(nodes, strokeColor);
        cache.set(cacheKey, svg);
        return svg;
    } catch {
        return '';
    }
}

const STROKE_BY_TYPE: Record<string, string> = {
    NOTE: '#0070f3',
    TIP: '#38b2ac',
    IMPORTANT: '#9f7aea',
    WARNING: '#ed8936',
    CAUTION: '#f56565',
};

/** Default Lucide icons per alert type. Used when no template override. */
export const DEFAULT_ALERT_ICONS: Record<string, string> = {
    note: 'lucide:info',
    tip: 'lucide:lightbulb',
    important: 'lucide:circle-alert',
    warning: 'lucide:triangle-alert',
    caution: 'lucide:siren',
};

export async function resolveLucideIconsFromAlerts(
    alerts: {
        showHeader?: boolean;
        note?: { icon?: string; labelColor?: string };
        tip?: { icon?: string; labelColor?: string };
        important?: { icon?: string; labelColor?: string };
        warning?: { icon?: string; labelColor?: string };
        caution?: { icon?: string; labelColor?: string };
    } | undefined
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const types = ['note', 'tip', 'important', 'warning', 'caution'] as const;

    for (const t of types) {
        const icon = (alerts?.[t]?.icon && alerts[t].icon.startsWith('lucide:')) ? alerts[t].icon : DEFAULT_ALERT_ICONS[t];
        if (!icon || !icon.startsWith('lucide:')) continue;
        const name = icon.replace(/^lucide:/, '').trim();
        if (!name) continue;
        const typeKey = t.toUpperCase();
        const labelHex = colorToHex(alerts?.[t]?.labelColor);
        const stroke = labelHex ?? (STROKE_BY_TYPE[typeKey] ?? '#0070f3');
        const svg = await getLucideSvg(name, stroke);
        if (svg) {
            const key = name.includes('-') ? name : pascalToKebab(name);
            out[key] = svg;
            out[name] = svg;
        }
    }
    return out;
}
