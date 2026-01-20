import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { join } from 'path';

// Singleton compiler instance?
let compiler: NodeCompiler | null = null;

function getCompiler() {
    if (!compiler) {
        compiler = NodeCompiler.create();
    }
    return compiler;
}

export interface TypstOptions {
    margins?: { top: string; bottom: string; left: string; right: string };
    fontFamily?: string;
    fontSize?: string;
    header?: string;
    footer?: string;
    pageLayout?: 'portrait' | 'horizontal'; // Typst uses "flipped" for landscape? no, "landscape" string usually or width/height.
    backgroundColor?: string;
    textColor?: string;
    h1?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean; numbering?: { enabled?: boolean } };
    h2?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h3?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h4?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h5?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h6?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
}

// Helper to convert CSS units (like px, %, em, etc) to Typst-friendly formats
export function fixTypstUnit(value: string | number | undefined): string {
    if (value === undefined || value === null || value === '') return '0pt';
    const s = String(value).trim();

    // If it's just a number, assume pt
    if (/^-?\d+(\.\d+)?$/.test(s)) return s + 'pt';

    // Handle px
    if (s.toLowerCase().endsWith('px')) {
        const num = parseFloat(s);
        return isNaN(num) ? '0pt' : `${num}pt`;
    }

    // Typst supports pt, em, %, cm, mm, in.
    if (/^-?\d+(\.\d+)?[a-zA-Z%]+$/.test(s)) {
        if (s.toLowerCase().endsWith('rem')) return s.slice(0, -3) + 'em';
        // Typo protection
        if (s.toLowerCase().endsWith('mc')) return s.slice(0, -2) + 'cm';
        return s;
    }

    // Fallback if valid unit name only
    if (['cm', 'mm', 'in', 'pt', 'em'].includes(s.toLowerCase())) {
        return `1${s.toLowerCase()}`;
    }

    return '0pt';
}

export function generatePreamble(options: TypstOptions): string {
    const {
        margins,
        fontFamily = 'Inter',
        fontSize = '12pt', // default size
        header = '',
        footer = '',
        pageLayout = 'portrait'
    } = options;

    const typstMargins = {
        top: fixTypstUnit(margins?.top || '2cm'),
        bottom: fixTypstUnit(margins?.bottom || '2cm'),
        left: fixTypstUnit(margins?.left || '2cm'),
        right: fixTypstUnit(margins?.right || '2cm'),
    };

    const settings = options as any;

    const bgColor = settings.backgroundColor || '#ffffff';
    const textColor = settings.textColor || '#333333';

    // Heading styling
    const headingStyles = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((tag, i) => {
        const h = settings[tag] || {};
        const level = i + 1;
        const size = fixTypstUnit(h.fontSize || (level === 1 ? '1.5em' : level === 2 ? '1.3em' : '1em'));
        const color = h.color || 'inherit';
        const align = h.textAlign || 'left';

        let rules = `#show heading.where(level: ${level}): set text(size: ${size}, fill: rgb("${color !== 'inherit' ? color : textColor}"))\n`;
        rules += `#show heading.where(level: ${level}): set align(${align})\n`;

        if (h.borderBottom) {
            rules += `#show heading.where(level: ${level}): it => block(below: 1em)[
               #it
               #line(length: 100%, stroke: 1pt + rgb("${color !== 'inherit' ? color : '#000000'}"))
             ]\n`;
        }
        return rules;
    }).join('\n');

    return `
#set page(
  paper: "a4",
  flipped: ${pageLayout === 'horizontal'},
  margin: (
    top: ${typstMargins.top}, 
    bottom: ${typstMargins.bottom}, 
    left: ${typstMargins.left}, 
    right: ${typstMargins.right}
  ),
  fill: rgb("${bgColor}"),
  header: [
    ${header}
  ],
  footer: [
    ${footer}
  ]
)

#set text(
  font: "${fontFamily}",
  size: ${fixTypstUnit(fontSize)},
  fill: rgb("${textColor}"),
  lang: "en"
)

#set heading(numbering: "1.1") 
${settings.h1?.numbering?.enabled ? '' : '#set heading(numbering: none)'}

${headingStyles}

// Common styles
#show link: underline
#show table: set table(stroke: 0.5pt + gray)
#show image: it => align(center, it)
`;
}

interface CompileArgs {
    source: string;
    images?: { path: string, buffer: Buffer }[];
}

export async function compileTypstToPdf({ source, images = [] }: CompileArgs): Promise<Buffer> {
    const compiler = getCompiler();
    try {
        // Map images into memory filesystem
        for (const img of images) {
            compiler.mapShadow(img.path, img.buffer);
        }

        return compiler.pdf({ mainFileContent: source });
    } catch (error) {
        console.error("Typst compilation error:", error);
        throw error;
    }
}




