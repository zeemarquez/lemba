'use client';

export interface FontData {
    family: string;        // User-provided family name
    data: Uint8Array;
    internalName?: string; // Actual font family name from file metadata
}

interface HeadingNumbering {
    enabled?: boolean;
    style?: 'decimal' | 'decimal-leading-zero' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha';
    separator?: string;
    prefix?: string;
    suffix?: string;
}

interface HeadingOptions {
    fontSize?: string;
    color?: string;
    textAlign?: string;
    borderBottom?: boolean;
    numbering?: HeadingNumbering;
}

export interface TypstOptions {
    margins?: { top: string; bottom: string; left: string; right: string };
    fontFamily?: string;
    fontSize?: string;
    header?: string;
    headerMargins?: { bottom: string; left: string; right: string };
    headerStartPage?: number;
    footer?: string;
    footerMargins?: { top: string; left: string; right: string };
    footerStartPage?: number;
    frontPage?: string;
    pageLayout?: 'portrait' | 'horizontal' | 'vertical';
    pageSize?: {
        preset?: string; // e.g., 'a4', 'letter', 'a3', etc.
        custom?: {
            width: string; // e.g., '210mm'
            height: string; // e.g., '297mm'
        };
    };
    backgroundColor?: string;
    textColor?: string;
    h1?: HeadingOptions;
    h2?: HeadingOptions;
    h3?: HeadingOptions;
    h4?: HeadingOptions;
    h5?: HeadingOptions;
    h6?: HeadingOptions;
    codeBlocks?: {
        showLanguage?: boolean;
        showLineNumbers?: boolean;
        backgroundColor?: string;
        borderColor?: string;
        borderWidth?: string;
    };
}

// Track loaded custom fonts to avoid re-adding them
const loadedCustomFonts = new Set<string>();

// Custom font families that have been registered (for font mapping)
// Maps user-provided name -> internal font name from file
const registeredCustomFontFamilies = new Map<string, string>();

/**
 * Parse font family name from TTF/OTF/WOFF font file
 * Reads the 'name' table to extract the font family (nameID 1)
 */
function parseFontFamilyName(data: Uint8Array): string | null {
    try {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        
        // Check for TrueType/OpenType signature
        const signature = view.getUint32(0, false);
        const isTTF = signature === 0x00010000 || signature === 0x74727565; // 'true'
        const isOTF = signature === 0x4F54544F; // 'OTTO'
        const isWOFF = signature === 0x774F4646; // 'wOFF'
        const isWOFF2 = signature === 0x774F4632; // 'wOF2'
        
        if (!isTTF && !isOTF && !isWOFF && !isWOFF2) {
            console.warn('[Typst] Unknown font format, signature:', signature.toString(16));
            return null;
        }
        
        // For WOFF/WOFF2, the structure is different - tables are compressed
        // We need to find the 'name' table differently
        let numTables: number;
        let tableOffset: number;
        let tableEntrySize: number;
        
        if (isWOFF) {
            // WOFF header: signature(4), flavor(4), length(4), numTables(2), reserved(2), ...
            numTables = view.getUint16(12, false);
            tableOffset = 44; // WOFF table directory starts at offset 44
            tableEntrySize = 20; // Each WOFF table entry is 20 bytes
        } else if (isWOFF2) {
            // WOFF2 is more complex with compressed tables - skip for now
            console.warn('[Typst] WOFF2 font parsing not fully supported, using filename as fallback');
            return null;
        } else {
            // TTF/OTF: offset subtable starts at 0
            numTables = view.getUint16(4, false);
            tableOffset = 12;
            tableEntrySize = 16;
        }
        
        // Find 'name' table
        let nameTableOffset = 0;
        let nameTableCompLength = 0;
        let nameTableOrigLength = 0;
        
        for (let i = 0; i < numTables; i++) {
            const entryOffset = tableOffset + i * tableEntrySize;
            const tag = String.fromCharCode(
                view.getUint8(entryOffset),
                view.getUint8(entryOffset + 1),
                view.getUint8(entryOffset + 2),
                view.getUint8(entryOffset + 3)
            );
            if (tag === 'name') {
                if (isWOFF) {
                    // WOFF: tag(4), offset(4), compLength(4), origLength(4), origChecksum(4)
                    nameTableOffset = view.getUint32(entryOffset + 4, false);
                    nameTableCompLength = view.getUint32(entryOffset + 8, false);
                    nameTableOrigLength = view.getUint32(entryOffset + 12, false);
                } else {
                    // TTF/OTF: tag(4), checksum(4), offset(4), length(4)
                    nameTableOffset = view.getUint32(entryOffset + 8, false);
                }
                break;
            }
        }
        
        if (nameTableOffset === 0) {
            console.warn('[Typst] No name table found in font');
            return null;
        }
        
        // For WOFF, check if table is compressed (compLength !== origLength)
        if (isWOFF && nameTableCompLength !== nameTableOrigLength) {
            console.warn('[Typst] WOFF name table is compressed, cannot parse');
            return null;
        }
        
        // Parse name table
        const nameCount = view.getUint16(nameTableOffset + 2, false);
        const stringOffset = view.getUint16(nameTableOffset + 4, false);
        
        // Look for font family name (nameID 1) - prefer Windows platform
        let fallbackName: string | null = null;
        
        for (let i = 0; i < nameCount; i++) {
            const recordOffset = nameTableOffset + 6 + i * 12;
            const platformID = view.getUint16(recordOffset, false);
            const encodingID = view.getUint16(recordOffset + 2, false);
            const nameID = view.getUint16(recordOffset + 6, false);
            const length = view.getUint16(recordOffset + 8, false);
            const offset = view.getUint16(recordOffset + 10, false);
            
            // nameID 1 = Font Family
            if (nameID === 1) {
                const strOffset = nameTableOffset + stringOffset + offset;
                
                // Platform 3 (Windows), Encoding 1 (Unicode BMP) - UTF-16BE
                if (platformID === 3 && encodingID === 1) {
                    let name = '';
                    for (let j = 0; j < length; j += 2) {
                        name += String.fromCharCode(view.getUint16(strOffset + j, false));
                    }
                    if (name) {
                        return name; // Windows platform is preferred
                    }
                }
                // Platform 1 (Macintosh), Encoding 0 (Roman) - ASCII
                else if (platformID === 1 && encodingID === 0) {
                    let name = '';
                    for (let j = 0; j < length; j++) {
                        name += String.fromCharCode(view.getUint8(strOffset + j));
                    }
                    if (name && !fallbackName) {
                        fallbackName = name;
                    }
                }
            }
        }
        
        return fallbackName;
    } catch (e) {
        console.error('[Typst] Error parsing font:', e);
        return null;
    }
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

/**
 * Generate Typst heading numbering configuration
 * Uses custom counters to properly handle cases where some heading levels have numbering disabled.
 * For example: H1 disabled, H2 enabled -> H2 shows as "1.", "2." (not "1.1", "1.2")
 * 
 * Also exports the enabled levels configuration for use in outline generation.
 */
function generateHeadingNumbering(settings: any): string {
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
    
    // Check which levels have numbering enabled
    const levelConfigs = levels.map((tag, i) => ({
        level: i + 1,
        tag,
        enabled: settings[tag]?.numbering?.enabled || false,
        style: settings[tag]?.numbering?.style || 'decimal',
        separator: settings[tag]?.numbering?.separator || '.',
        prefix: settings[tag]?.numbering?.prefix || '',
        suffix: settings[tag]?.numbering?.suffix || '.'
    }));
    
    // Find enabled levels
    const enabledLevels = levelConfigs.filter(l => l.enabled);
    if (enabledLevels.length === 0) {
        return '#set heading(numbering: none)';
    }
    
    // Map CSS numbering style to Typst format
    const styleToTypst = (style: string): string => {
        switch (style) {
            case 'decimal': return '"1"';
            case 'decimal-leading-zero': return '"01"';
            case 'lower-roman': return '"i"';
            case 'upper-roman': return '"I"';
            case 'lower-alpha': return '"a"';
            case 'upper-alpha': return '"A"';
            default: return '"1"';
        }
    };
    
    // Strategy: Use custom counters (h1c, h2c, etc.) that we manage ourselves
    // This allows us to only count and display enabled levels
    let result = '// Disable default heading numbering - we use custom counters\n';
    result += '#set heading(numbering: none)\n\n';
    
    // Create custom counters for each enabled level
    enabledLevels.forEach(config => {
        result += `#let h${config.level}c = counter("h${config.level}-counter")\n`;
    });
    result += '\n';
    
    // For each heading level, create show rules
    levelConfigs.forEach((levelConfig) => {
        if (!levelConfig.enabled) {
            // Disabled level: just show the heading body, but reset child counters
            const childCountersToReset = enabledLevels
                .filter(l => l.level > levelConfig.level)
                .map(l => `h${l.level}c.update(0)`);
            
            if (childCountersToReset.length > 0) {
                result += `#show heading.where(level: ${levelConfig.level}): it => {\n`;
                result += `  ${childCountersToReset.join('\n  ')}\n`;
                result += `  block(above: 1.4em, below: 0.5em, it.body)\n`;
                result += `}\n`;
            }
            // If no children to reset, no need for a show rule - default display is fine
        } else {
            // Enabled level: increment counter, reset child counters, display numbering
            const { prefix, suffix } = levelConfig;
            
            // Find child enabled levels to reset
            const childCountersToReset = enabledLevels
                .filter(l => l.level > levelConfig.level)
                .map(l => `h${l.level}c.update(0)`);
            
            // Find all enabled ancestor levels (including self) for building the number
            const ancestorLevels = enabledLevels
                .filter(l => l.level <= levelConfig.level);
            
            result += `#show heading.where(level: ${levelConfig.level}): it => {\n`;
            result += `  h${levelConfig.level}c.step()\n`;
            if (childCountersToReset.length > 0) {
                result += `  ${childCountersToReset.join('\n  ')}\n`;
            }
            
            // Build the numbering display parts
            let numberingParts: string[] = [];
            ancestorLevels.forEach((ancestor, idx) => {
                numberingParts.push(`h${ancestor.level}c.display(${styleToTypst(ancestor.style)})`);
                if (idx < ancestorLevels.length - 1) {
                    numberingParts.push(`[${ancestor.separator}]`);
                }
            });
            
            result += `  context block(above: 1.4em, below: 0.5em)[\n`;
            result += `    #text(weight: "bold")[`;
            
            // Add prefix if present
            if (prefix) {
                result += `${prefix}`;
            }
            
            // Add counter displays
            numberingParts.forEach(part => {
                if (part.startsWith('[')) {
                    // It's a separator literal
                    result += `#${part}`;
                } else {
                    // It's a counter display
                    result += `#${part}`;
                }
            });
            
            // Add suffix
            result += `${suffix} `;
            result += `]\n`;
            result += `    #it.body\n`;
            result += `  ]\n`;
            result += `}\n`;
        }
    });
    
    return result;
}

/**
 * Get which heading levels have numbering enabled
 * Used by outline generation to know which counters to query
 */
export function getEnabledHeadingLevels(settings: any): number[] {
    const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
    return levels
        .map((tag, i) => ({ level: i + 1, enabled: settings[tag]?.numbering?.enabled || false }))
        .filter(l => l.enabled)
        .map(l => l.level);
}

/**
 * Determine if a hex color is dark (for choosing text color)
 */
function isColorDark(hexColor: string): boolean {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Using relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
}

/**
 * Syntax highlighting color schemes for different themes
 */
interface SyntaxColors {
    text: string;
    keyword: string;
    string: string;
    comment: string;
    number: string;
    function: string;
    type: string;
    operator: string;
    punctuation: string;
}

const THEME_COLORS: Record<string, SyntaxColors> = {
    // Light themes
    '#f6f8fa': { // GitHub Light
        text: '#24292f',
        keyword: '#cf222e',
        string: '#0a3069',
        comment: '#6e7781',
        number: '#0550ae',
        function: '#8250df',
        type: '#116329',
        operator: '#24292f',
        punctuation: '#24292f',
    },
    '#ffffff': { // Light
        text: '#383a42',
        keyword: '#a626a4',
        string: '#50a14f',
        comment: '#a0a1a7',
        number: '#986801',
        function: '#4078f2',
        type: '#c18401',
        operator: '#383a42',
        punctuation: '#383a42',
    },
    '#fafafa': { // One Light
        text: '#383a42',
        keyword: '#a626a4',
        string: '#50a14f',
        comment: '#a0a1a7',
        number: '#986801',
        function: '#4078f2',
        type: '#c18401',
        operator: '#383a42',
        punctuation: '#383a42',
    },
    '#fdf6e3': { // Solarized Light
        text: '#657b83',
        keyword: '#859900',
        string: '#2aa198',
        comment: '#93a1a1',
        number: '#d33682',
        function: '#268bd2',
        type: '#b58900',
        operator: '#657b83',
        punctuation: '#657b83',
    },
    '#f5f5f5': { // Light Gray
        text: '#333333',
        keyword: '#0000ff',
        string: '#a31515',
        comment: '#008000',
        number: '#098658',
        function: '#795e26',
        type: '#267f99',
        operator: '#333333',
        punctuation: '#333333',
    },
    '#fffffe': { // Nord Light (Snow Storm)
        text: '#2e3440',
        keyword: '#5e81ac',
        string: '#a3be8c',
        comment: '#4c566a',
        number: '#b48ead',
        function: '#88c0d0',
        type: '#81a1c1',
        operator: '#2e3440',
        punctuation: '#2e3440',
    },
    // Dark themes
    '#1e1e1e': { // VS Code Dark
        text: '#d4d4d4',
        keyword: '#569cd6',
        string: '#ce9178',
        comment: '#6a9955',
        number: '#b5cea8',
        function: '#dcdcaa',
        type: '#4ec9b0',
        operator: '#d4d4d4',
        punctuation: '#d4d4d4',
    },
    '#282c34': { // One Dark
        text: '#abb2bf',
        keyword: '#c678dd',
        string: '#98c379',
        comment: '#5c6370',
        number: '#d19a66',
        function: '#61afef',
        type: '#e5c07b',
        operator: '#56b6c2',
        punctuation: '#abb2bf',
    },
    '#282a36': { // Dracula
        text: '#f8f8f2',
        keyword: '#ff79c6',
        string: '#f1fa8c',
        comment: '#6272a4',
        number: '#bd93f9',
        function: '#50fa7b',
        type: '#8be9fd',
        operator: '#ff79c6',
        punctuation: '#f8f8f2',
    },
    '#24292e': { // GitHub Dark
        text: '#e1e4e8',
        keyword: '#f97583',
        string: '#9ecbff',
        comment: '#6a737d',
        number: '#79b8ff',
        function: '#b392f0',
        type: '#85e89d',
        operator: '#e1e4e8',
        punctuation: '#e1e4e8',
    },
    '#272822': { // Monokai
        text: '#f8f8f2',
        keyword: '#f92672',
        string: '#e6db74',
        comment: '#75715e',
        number: '#ae81ff',
        function: '#a6e22e',
        type: '#66d9ef',
        operator: '#f92672',
        punctuation: '#f8f8f2',
    },
    '#002b36': { // Solarized Dark
        text: '#839496',
        keyword: '#859900',
        string: '#2aa198',
        comment: '#586e75',
        number: '#d33682',
        function: '#268bd2',
        type: '#b58900',
        operator: '#839496',
        punctuation: '#839496',
    },
};

// Default fallback colors
const DEFAULT_LIGHT_COLORS: SyntaxColors = {
    text: '#24292e',
    keyword: '#d73a49',
    string: '#032f62',
    comment: '#6a737d',
    number: '#005cc5',
    function: '#6f42c1',
    type: '#22863a',
    operator: '#24292e',
    punctuation: '#24292e',
};

const DEFAULT_DARK_COLORS: SyntaxColors = {
    text: '#d4d4d4',
    keyword: '#c586c0',
    string: '#ce9178',
    comment: '#6a9955',
    number: '#b5cea8',
    function: '#dcdcaa',
    type: '#4ec9b0',
    operator: '#d4d4d4',
    punctuation: '#d4d4d4',
};

/**
 * Get syntax colors for a given background color
 */
function getSyntaxColors(backgroundColor: string): SyntaxColors {
    // Check if we have specific colors for this background
    if (THEME_COLORS[backgroundColor]) {
        return THEME_COLORS[backgroundColor];
    }
    // Fall back to light/dark default
    return isColorDark(backgroundColor) ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS;
}

/**
 * Generate custom code block styling with built-in syntax highlighting
 * that works for both light and dark themes
 */
function generateCodeBlockStyles(options: TypstOptions): string {
    const codeBlocks = options.codeBlocks || {};
    
    // Default values
    const showLineNumbers = codeBlocks.showLineNumbers !== false; // Default: true
    const showLanguage = codeBlocks.showLanguage === true; // Default: false
    const backgroundColor = codeBlocks.backgroundColor || '#f6f8fa';
    const borderColor = codeBlocks.borderColor || '#e0e0e0';
    const borderWidth = codeBlocks.borderWidth || '1';
    
    // Get theme-specific colors
    const isDark = isColorDark(backgroundColor);
    const colors = getSyntaxColors(backgroundColor);
    const lineNumberColor = isDark ? '#6e7681' : '#8b949e';
    const labelTextColor = isDark ? '#cccccc' : '#24292e';
    
    // Build stroke value
    const strokeValue = borderWidth === '0' ? 'none' : `${borderWidth}pt + rgb("${borderColor}")`;
    
    // Generate Typst code with custom syntax highlighting function
    return `
// Custom syntax highlighting colors
#let hl-text = rgb("${colors.text}")
#let hl-keyword = rgb("${colors.keyword}")
#let hl-string = rgb("${colors.string}")
#let hl-comment = rgb("${colors.comment}")
#let hl-number = rgb("${colors.number}")
#let hl-function = rgb("${colors.function}")
#let hl-type = rgb("${colors.type}")
#let hl-operator = rgb("${colors.operator}")
#let hl-punctuation = rgb("${colors.punctuation}")

// Keywords for common languages
#let keywords = ("def", "class", "import", "from", "return", "if", "else", "elif", "for", "while", "in", "not", "and", "or", "is", "None", "True", "False", "try", "except", "finally", "with", "as", "lambda", "yield", "async", "await", "pass", "break", "continue", "raise", "global", "nonlocal", "assert", "del",
  "function", "const", "let", "var", "new", "this", "typeof", "instanceof", "null", "undefined", "true", "false", "export", "default", "extends", "static", "get", "set", "constructor", "super", "switch", "case", "throw", "catch",
  "fn", "let", "mut", "pub", "impl", "struct", "enum", "trait", "use", "mod", "crate", "self", "Self", "match", "loop", "move", "ref", "where", "dyn", "unsafe", "extern", "type", "async",
  "func", "package", "interface", "go", "defer", "chan", "select", "fallthrough", "range", "map", "make",
  "public", "private", "protected", "void", "int", "float", "double", "char", "boolean", "byte", "short", "long", "final", "abstract", "synchronized", "volatile", "transient", "native", "throws", "implements",
  "print", "println", "printf", "echo", "console")

// Simple syntax highlighter function
#let highlight-code(code, lang) = {
  let result = ()
  let i = 0
  let chars = code.clusters()
  let len = chars.len()
  
  while i < len {
    let c = chars.at(i)
    
    // Comments (// or #)
    if c == "/" and i + 1 < len and chars.at(i + 1) == "/" {
      let comment = ""
      while i < len and chars.at(i) != "\\n" {
        comment += chars.at(i)
        i += 1
      }
      result = result + (text(fill: hl-comment, comment),)
    }
    else if c == "#" and (lang == "python" or lang == "py" or lang == "ruby" or lang == "rb" or lang == "shell" or lang == "bash" or lang == "sh") {
      let comment = ""
      while i < len and chars.at(i) != "\\n" {
        comment += chars.at(i)
        i += 1
      }
      result = result + (text(fill: hl-comment, comment),)
    }
    // Strings
    else if c == "\\"" or c == "'" {
      let quote = c
      let s = c
      i += 1
      while i < len {
        let ch = chars.at(i)
        s += ch
        i += 1
        if ch == quote { break }
        if ch == "\\\\" and i < len {
          s += chars.at(i)
          i += 1
        }
      }
      result = result + (text(fill: hl-string, s),)
    }
    // Numbers
    else if c.match(regex("^[0-9]$")) != none {
      let num = ""
      while i < len and chars.at(i).match(regex("^[0-9.xXa-fA-F]$")) != none {
        num += chars.at(i)
        i += 1
      }
      result = result + (text(fill: hl-number, num),)
    }
    // Words (identifiers/keywords)
    else if c.match(regex("^[a-zA-Z_]$")) != none {
      let word = ""
      while i < len and chars.at(i).match(regex("^[a-zA-Z0-9_]$")) != none {
        word += chars.at(i)
        i += 1
      }
      if word in keywords {
        result = result + (text(fill: hl-keyword, word),)
      } else if i < len and chars.at(i) == "(" {
        result = result + (text(fill: hl-function, word),)
      } else if word.len() > 0 and word.at(0).match(regex("^[A-Z]$")) != none {
        result = result + (text(fill: hl-type, word),)
      } else {
        result = result + (text(fill: hl-text, word),)
      }
    }
    // Operators
    else if c in ("=", "+", "-", "*", "/", "<", ">", "!", "&", "|", "^", "%", "~") {
      result = result + (text(fill: hl-operator, c),)
      i += 1
    }
    // Punctuation
    else if c in ("(", ")", "[", "]", "{", "}", ",", ".", ":", ";") {
      result = result + (text(fill: hl-punctuation, c),)
      i += 1
    }
    // Whitespace and other
    else {
      result = result + (text(fill: hl-text, c),)
      i += 1
    }
  }
  
  result.join()
}

// Code block styling
#show raw.where(block: true): it => {
  let lang-label = if it.lang != none and ${showLanguage} { it.lang } else { none }
  let lang = if it.lang != none { it.lang } else { "" }
  let lines = it.text.split("\\n")
  let num-lines = lines.len()
  let max-digits = str(num-lines).len()
  
  block(
    width: 100%,
    fill: rgb("${backgroundColor}"),
    stroke: ${strokeValue},
    radius: 4pt,
    clip: true,
    {
      if lang-label != none {
        place(top + right, box(
          fill: rgb("${borderColor}"),
          inset: (x: 8pt, y: 4pt),
          radius: (bottom-left: 4pt),
          text(size: 0.75em, weight: "medium", fill: rgb("${labelTextColor}"), lang-label)
        ))
      }
      
      pad(10pt, {
        set text(font: "DejaVu Sans Mono", size: 0.9em)
        ${showLineNumbers ? `grid(
          columns: (auto, 1fr),
          column-gutter: 12pt,
          row-gutter: 0.3em,
          ..{
            let result = ()
            for (i, line) in lines.enumerate() {
              let num = str(i + 1)
              let padding = " " * (max-digits - num.len())
              result.push(text(fill: rgb("${lineNumberColor}"), padding + num))
              result.push(highlight-code(line, lang))
            }
            result
          }
        )` : `{
          for (i, line) in lines.enumerate() {
            highlight-code(line, lang)
            if i < num-lines - 1 { linebreak() }
          }
        }`}
      })
    }
  )
}`;
}

export function generatePreamble(options: TypstOptions): string {
    const {
        margins,
        fontFamily = 'sans-serif', // Use generic font that Typst has
        fontSize = '12pt',
        header = '',
        headerMargins,
        headerStartPage = 1,
        footer = '',
        footerMargins,
        footerStartPage = 1,
        frontPage = '',
        pageLayout = 'portrait'
    } = options;

    const isFlipped = pageLayout === 'horizontal';

    // Handle page size - support both preset and custom sizes
    let pageSizeConfig = '';
    if (options.pageSize?.custom) {
        // Custom size: use width and height
        const customWidth = fixTypstUnit(options.pageSize.custom.width || '210mm');
        const customHeight = fixTypstUnit(options.pageSize.custom.height || '297mm');
        pageSizeConfig = `width: ${customWidth}, height: ${customHeight}`;
    } else if (options.pageSize?.preset) {
        // Preset size: use paper parameter
        pageSizeConfig = `paper: "${options.pageSize.preset}"`;
    } else {
        // Default to A4
        pageSizeConfig = `paper: "a4"`;
    }

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

    // Map common font names to fonts from typst.ts text assets
    // Available: DejaVu Sans Mono, Libertinus Serif, New Computer Modern
    // Plus any custom fonts that have been registered
    let cleanedFont = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const cleanedFontLower = cleanedFont.toLowerCase();
    
    console.log(`[Typst] [generatePreamble] Input fontFamily: "${fontFamily}", cleaned: "${cleanedFont}"`);
    console.log(`[Typst] [generatePreamble] Registered custom fonts:`, Array.from(registeredCustomFontFamilies.entries()));
    
    // Check if this is a registered custom font first (case-insensitive check)
    // registeredCustomFontFamilies maps user-provided name -> internal font name
    let customFontInternalName: string | undefined;
    for (const [userFontName, internalName] of registeredCustomFontFamilies.entries()) {
        if (userFontName.toLowerCase() === cleanedFontLower) {
            customFontInternalName = internalName;
            break;
        }
    }
    
    if (customFontInternalName) {
        // Use the internal font name that Typst will recognize
        cleanedFont = customFontInternalName;
        console.log(`[Typst] [generatePreamble] Using custom font: "${fontFamily}" -> "${cleanedFont}"`);
    } else {
        // Fall back to built-in fonts
        const fontMap: Record<string, string> = {
            // Serif fonts -> Libertinus Serif
            'times new roman': 'Libertinus Serif',
            'georgia': 'Libertinus Serif',
            'serif': 'Libertinus Serif',
            'linux libertine': 'Libertinus Serif',
            'libertinus serif': 'Libertinus Serif',
            'merriweather': 'Libertinus Serif',
            'playfair display': 'Libertinus Serif',
            'lora': 'Libertinus Serif',
            // Sans-serif fonts -> Libertinus Serif (no sans in text assets, use serif as fallback)
            'inter': 'Libertinus Serif',
            'arial': 'Libertinus Serif',
            'helvetica': 'Libertinus Serif',
            'verdana': 'Libertinus Serif',
            'sans-serif': 'Libertinus Serif',
            'roboto': 'Libertinus Serif',
            'open sans': 'Libertinus Serif',
            'montserrat': 'Libertinus Serif',
            'outfit': 'Libertinus Serif',
            'system-ui': 'Libertinus Serif',
            // Monospace fonts -> DejaVu Sans Mono
            'jetbrains mono': 'DejaVu Sans Mono',
            'fira code': 'DejaVu Sans Mono',
            'source code pro': 'DejaVu Sans Mono',
            'consolas': 'DejaVu Sans Mono',
            'monaco': 'DejaVu Sans Mono',
            'dejavu sans mono': 'DejaVu Sans Mono',
            'monospace': 'DejaVu Sans Mono',
            // Math font
            'computer modern': 'New Computer Modern',
        };
        cleanedFont = fontMap[cleanedFontLower] || 'Libertinus Serif';
        console.log(`[Typst] Mapped font "${fontFamily}" -> "${cleanedFont}"`);
    }

    // Header/footer margins (simplified):
    // - Header: bottom margin (gap to content), left/right (horizontal inset)
    // - Footer: top margin (gap from content), left/right (horizontal inset)
    const typstHeaderMargins = {
        bottom: fixTypstUnit(headerMargins?.bottom || '5mm'),
        left: fixTypstUnit(headerMargins?.left || '0mm'),
        right: fixTypstUnit(headerMargins?.right || '0mm'),
    };
    
    const typstFooterMargins = {
        top: fixTypstUnit(footerMargins?.top || '5mm'),
        left: fixTypstUnit(footerMargins?.left || '0mm'),
        right: fixTypstUnit(footerMargins?.right || '0mm'),
    };

    // Build header content with left/right padding for horizontal inset
    // Use context to conditionally show header based on page number
    const paddedHeaderContent = header.trim() 
        ? `#pad(left: ${typstHeaderMargins.left}, right: ${typstHeaderMargins.right})[${header}]`
        : '';
    
    // Build footer content with left/right padding for horizontal inset
    const paddedFooterContent = footer.trim()
        ? `#pad(left: ${typstFooterMargins.left}, right: ${typstFooterMargins.right})[${footer}]`
        : '';

    // header-ascent: gap between header and main content (header's bottom margin)
    // footer-descent: gap between main content and footer (footer's top margin)
    // When no header/footer, use 0pt so margins are exact
    const headerAscent = header.trim() ? typstHeaderMargins.bottom : '0pt';
    const footerDescent = footer.trim() ? typstFooterMargins.top : '0pt';

    // When front page is enabled, header/footer should start from page 2 at minimum
    // (page 1 is the front page which shouldn't have header/footer)
    const hasFrontPage = frontPage.trim().length > 0;
    const effectiveHeaderStartPage = hasFrontPage ? Math.max(headerStartPage, 2) : headerStartPage;
    const effectiveFooterStartPage = hasFrontPage ? Math.max(footerStartPage, 2) : footerStartPage;

    // Build header value - always use context since placeholders like page numbers require it
    let headerValue: string;
    if (!header.trim()) {
        headerValue = '[]';
    } else if (effectiveHeaderStartPage > 1) {
        headerValue = `context { if counter(page).get().first() >= ${effectiveHeaderStartPage} [${paddedHeaderContent}] }`;
    } else {
        headerValue = `context [${paddedHeaderContent}]`;
    }

    // Build footer value - always use context since placeholders like page numbers require it
    let footerValue: string;
    if (!footer.trim()) {
        footerValue = '[]';
    } else if (effectiveFooterStartPage > 1) {
        footerValue = `context { if counter(page).get().first() >= ${effectiveFooterStartPage} [${paddedFooterContent}] }`;
    } else {
        footerValue = `context [${paddedFooterContent}]`;
    }

    return `
#set page(
  ${pageSizeConfig},
  flipped: ${isFlipped},
  margin: (
    top: ${typstMargins.top}, 
    bottom: ${typstMargins.bottom}, 
    left: ${typstMargins.left}, 
    right: ${typstMargins.right}
  ),
  fill: rgb("${bgColor}"),
  header: ${headerValue},
  header-ascent: ${headerAscent},
  footer: ${footerValue},
  footer-descent: ${footerDescent}
)

#set text(
  font: "${cleanedFont}",
  size: ${fixTypstUnit(fontSize)},
  fill: rgb("${textColor}"),
  lang: "en"
)

// Heading numbering configuration
${generateHeadingNumbering(settings)}

${headingStyles}

// Common styles
#show link: underline
#show table: set table(stroke: 0.5pt + gray)

${generateCodeBlockStyles(options)}
`;
}

// Compiler state
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let typstCompiler: any = null;

// CDN URLs
const CDN_BASE = 'https://cdn.jsdelivr.net/npm';
const TYPST_VERSION = '0.7.0-rc2';

/**
 * Initialize the Typst WASM compiler
 */
export async function initializeCompiler(): Promise<void> {
    if (isInitialized && typstCompiler) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            console.log('[Typst] [Client] Initializing WASM compiler...');
            
            const typstModule = await import('@myriaddreamin/typst.ts');
            const { createTypstCompiler, initOptions, loadFonts } = typstModule;
            
            // Get the preloadFontAssets function from initOptions namespace
            const preloadFontAssets = initOptions.preloadFontAssets;
            
            // Create the compiler
            typstCompiler = createTypstCompiler();
            
            // Prepare beforeBuild hooks
            const beforeBuildHooks: any[] = [
                // Load built-in text fonts (includes DejaVu Sans Mono, Libertinus Serif, New Computer Modern)
                preloadFontAssets({
                    assets: ['text'],
                })
            ];
            
            // Add custom fonts if any are pending
            if (pendingCustomFonts.length > 0) {
                console.log(`[Typst] [Client] Loading ${pendingCustomFonts.length} custom fonts...`);
                console.log(`[Typst] [Client] Font mapping:`, Array.from(registeredCustomFontFamilies.entries()));
                
                // Convert FontData to Uint8Array for loadFonts
                const customFontData = pendingCustomFonts.map(f => f.data);
                
                // Add custom fonts loader
                beforeBuildHooks.push(
                    loadFonts(customFontData, { assets: false })
                );
            }
            
            // Initialize with WASM from CDN and fonts
            await typstCompiler.init({
                getModule: () => {
                    const wasmUrl = `${CDN_BASE}/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;
                    console.log('[Typst] [Client] Fetching WASM from:', wasmUrl);
                    return fetch(wasmUrl);
                },
                beforeBuild: beforeBuildHooks
            });
            
            isInitialized = true;
            console.log('[Typst] [Client] WASM compiler initialized successfully');
            console.log('[Typst] [Client] Built-in fonts: Libertinus Serif, DejaVu Sans Mono, New Computer Modern');
            
            if (registeredCustomFontFamilies.size > 0) {
                const fontList = Array.from(registeredCustomFontFamilies.entries())
                    .map(([user, internal]) => user === internal ? user : `${user} -> ${internal}`)
                    .join(', ');
                console.log(`[Typst] [Client] Custom fonts loaded: ${fontList}`);
            } else {
                console.log('[Typst] [Client] No custom fonts loaded');
            }
        } catch (error) {
            console.error('[Typst] [Client] Failed to initialize compiler:', error);
            initPromise = null;
            throw error;
        }
    })();

    return initPromise;
}

export interface TypstImage {
    path: string;
    data: Uint8Array;
}

export interface CompileArgs {
    source: string;
    images?: TypstImage[];
    fonts?: FontData[];
}

// Store pending custom fonts to be loaded on next init
let pendingCustomFonts: FontData[] = [];

/**
 * Register custom fonts to be loaded with the compiler
 * If compiler is already initialized, it will be reinitialized with the new fonts
 * @param fonts Array of font data with family name and binary data
 */
export async function setCustomFonts(fonts: FontData[]): Promise<void> {
    // Check if fonts have changed
    const currentFontIds = Array.from(loadedCustomFonts).sort().join(',');
    const newFontIds = fonts.map(f => `${f.family}-${f.data.length}`).sort().join(',');
    
    if (currentFontIds === newFontIds && isInitialized) {
        console.log('[Typst] [Client] Custom fonts unchanged, skipping reinit');
        return;
    }

    console.log(`[Typst] [Client] Setting ${fonts.length} custom fonts:`, fonts.map(f => f.family));

    // Update pending fonts
    pendingCustomFonts = fonts;
    
    // Pre-populate font family mapping by parsing font files NOW
    // This ensures generatePreamble can use the correct names even before init completes
    registeredCustomFontFamilies.clear();
    loadedCustomFonts.clear();
    
    for (const font of fonts) {
        const fontId = `${font.family}-${font.data.length}`;
        loadedCustomFonts.add(fontId);
        
        // Parse the internal font family name from the font file
        const internalName = parseFontFamilyName(font.data);
        if (internalName) {
            console.log(`[Typst] [Client] Pre-parsed font "${font.family}" -> internal: "${internalName}"`);
            registeredCustomFontFamilies.set(font.family, internalName);
        } else {
            console.log(`[Typst] [Client] Could not parse internal name for "${font.family}", using as-is`);
            registeredCustomFontFamilies.set(font.family, font.family);
        }
    }

    // If compiler is already initialized, we need to reinitialize to add new fonts
    if (isInitialized) {
        console.log('[Typst] [Client] Custom fonts changed, reinitializing compiler...');
        isInitialized = false;
        initPromise = null;
        typstCompiler = null;
        await initializeCompiler();
    }
}

/**
 * Get list of registered custom font family names (returns user-provided names)
 */
export function getRegisteredCustomFonts(): string[] {
    return Array.from(registeredCustomFontFamilies.keys());
}

/**
 * Extract data URLs from source and add them as shadow files
 */
function processDataUrlsToShadow(source: string, compiler: any): string {
    const dataUrlRegex = /image\s*\(\s*["'](data:image\/[^"']+)["']/g;
    let match;
    let newSource = source;
    let imageIndex = 0;
    const replacements: [string, string][] = [];
    
    // Reset regex
    dataUrlRegex.lastIndex = 0;
    
    while ((match = dataUrlRegex.exec(source)) !== null) {
        const dataUrl = match[1];
        
        // Determine extension from mime type
        let ext = '.png';
        if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) ext = '.jpg';
        else if (dataUrl.includes('image/gif')) ext = '.gif';
        else if (dataUrl.includes('image/webp')) ext = '.webp';
        else if (dataUrl.includes('image/svg')) ext = '.svg';
        
        const virtualPath = `/image_${imageIndex++}${ext}`;
        
        try {
            // Parse data URL
            const commaIndex = dataUrl.indexOf(',');
            if (commaIndex !== -1) {
                const base64Data = dataUrl.substring(commaIndex + 1);
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Add to compiler's shadow filesystem
                compiler.mapShadow(virtualPath, bytes);
                replacements.push([dataUrl, virtualPath]);
                console.log(`[Typst] [Client] Mapped data URL to ${virtualPath} (${bytes.length} bytes)`);
            }
        } catch (e) {
            console.error('[Typst] [Client] Failed to process data URL:', e);
        }
    }
    
    // Replace data URLs with virtual paths
    for (const [dataUrl, virtualPath] of replacements) {
        newSource = newSource.split(`"${dataUrl}"`).join(`"${virtualPath}"`);
        newSource = newSource.split(`'${dataUrl}'`).join(`'${virtualPath}'`);
    }
    
    return newSource;
}

/**
 * Compile Typst source to PDF using the WASM compiler
 */
export async function compileTypstToPdf({ source }: CompileArgs): Promise<Uint8Array> {
    await initializeCompiler();

    if (!typstCompiler) {
        throw new Error('Typst compiler not initialized');
    }

    console.log(`[Typst] [Client] Compiling source (${source.length} chars)`);

    try {
        // Reset shadow files for fresh compilation
        typstCompiler.resetShadow();
        
        // Process data URLs in the source and add images to shadow filesystem
        const processedSource = processDataUrlsToShadow(source, typstCompiler);
        
        // Add main file using addSource (for text files)
        typstCompiler.addSource('/main.typ', processedSource);
        
        // Compile directly to PDF format
        // CompileFormatEnum.pdf = 1
        const result = await typstCompiler.compile({
            mainFilePath: '/main.typ',
            format: 1 // CompileFormatEnum.pdf
        });
        
        if (!result.result) {
            const diagnostics = result.diagnostics || [];
            let errorMsg = diagnostics.map((d: any) => d.message || JSON.stringify(d)).join('\n') || 'Compilation failed';
            
            // Add helpful info about available fonts if there's a font error
            if (errorMsg.toLowerCase().includes('font')) {
                const availableFonts = ['Libertinus Serif', 'DejaVu Sans Mono', 'New Computer Modern'];
                const customFontsList = Array.from(registeredCustomFontFamilies.entries())
                    .map(([user, internal]) => `${user} (internal: ${internal})`);
                errorMsg += `\n\nAvailable built-in fonts: ${availableFonts.join(', ')}`;
                if (customFontsList.length > 0) {
                    errorMsg += `\nLoaded custom fonts: ${customFontsList.join(', ')}`;
                } else {
                    errorMsg += `\nNo custom fonts loaded.`;
                }
            }
            
            throw new Error(errorMsg);
        }

        const pdfData = result.result;

        if (!pdfData || pdfData.length === 0) {
            throw new Error('Typst returned an empty PDF buffer.');
        }

        console.log(`[Typst] [Client] SUCCESS: Generated PDF (${pdfData.length} bytes)`);
        return pdfData;
    } catch (error) {
        console.error('[Typst] [Client] Compilation error:', error);
        throw error;
    }
}

/**
 * Reset the compiler state
 */
export async function resetCompiler(): Promise<void> {
    if (typstCompiler) {
        typstCompiler.resetShadow();
    }
    console.log('[Typst] [Client] Compiler ready for new compilation');
}
