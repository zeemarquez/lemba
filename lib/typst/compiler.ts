import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { join, resolve } from 'path';

function getCompiler() {
    return NodeCompiler.create();
}

export interface TypstOptions {
    margins?: { top: string; bottom: string; left: string; right: string };
    fontFamily?: string;
    fontSize?: string;
    header?: string;
    footer?: string;
    pageLayout?: 'portrait' | 'horizontal';
    backgroundColor?: string;
    textColor?: string;
    h1?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean; numbering?: { enabled?: boolean } };
    h2?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h3?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h4?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h5?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
    h6?: { fontSize?: string; color?: string; textAlign?: string; borderBottom?: boolean };
}

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

export function generatePreamble(options: TypstOptions): string {
    const {
        margins,
        fontFamily = 'Inter',
        fontSize = '12pt',
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

    const cleanedFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();

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
  font: "${cleanedFont}",
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

    // Get the absolute path of the current workspace
    // On Windows, this will be like C:\Users\...
    const workspaceRoot = resolve(process.cwd());
    const mainFilePath = join(workspaceRoot, 'main.typ');

    try {
        console.log(`[Typst] [Compiler] Compiling source (${source.length} chars)`);
        console.log(`[Typst] [Compiler] Workspace root: ${workspaceRoot}`);
        console.log(`[Typst] [Compiler] Main file path: ${mainFilePath}`);

        // 1. Map the main Typst file using native paths
        compiler.mapShadow(mainFilePath, Buffer.from(source));

        // 2. Map images using native paths inside the workspace
        for (const img of images) {
            if (img.buffer && img.buffer.length > 0) {
                // Ensure the path is relative to workspaceRoot
                const relPath = img.path.startsWith('/') ? img.path.slice(1) : img.path;
                const vPath = join(workspaceRoot, relPath);

                console.log(`[Typst] [Compiler] Mapping shadow file: ${vPath} (${img.buffer.length} bytes)`);
                compiler.mapShadow(vPath, img.buffer);
            }
        }

        // 3. Compile using the absolute main file path
        const result = compiler.pdf({
            mainFilePath: mainFilePath
        });

        if (result && result.length > 0) {
            console.log(`[Typst] [Compiler] SUCCESS: Generated PDF (${result.length} bytes)`);
            return result;
        } else {
            throw new Error('Typst returned an empty PDF buffer.');
        }
    } catch (error) {
        console.error("[Typst] [Compiler] ERROR:", error);
        throw error;
    }
}
