export interface PreloadedFont {
    family: string;
    fileName: string;
    format: string;
    category: 'Sans-Serif' | 'Serif' | 'Monospace';
}

export const PRELOADED_FONTS: PreloadedFont[] = [
    { family: 'Inter', fileName: 'Inter.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Roboto', fileName: 'Roboto.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Montserrat', fileName: 'Montserrat.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Open Sans', fileName: 'Open_Sans.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Lato', fileName: 'Lato.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Playfair Display', fileName: 'Playfair_Display.ttf', format: 'truetype', category: 'Serif' },
    { family: 'Merriweather', fileName: 'Merriweather.ttf', format: 'truetype', category: 'Serif' },
    { family: 'Lora', fileName: 'Lora.ttf', format: 'truetype', category: 'Serif' },
    { family: 'JetBrains Mono', fileName: 'JetBrains_Mono.ttf', format: 'truetype', category: 'Monospace' },
    { family: 'Fira Code', fileName: 'Fira_Code.ttf', format: 'truetype', category: 'Monospace' },
    { family: 'Oswald', fileName: 'Oswald.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Raleway', fileName: 'Raleway.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Poppins', fileName: 'Poppins.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Ubuntu', fileName: 'Ubuntu.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Nunito', fileName: 'Nunito.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Quicksand', fileName: 'Quicksand.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Kanit', fileName: 'Kanit.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Bebas Neue', fileName: 'Bebas_Neue.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Bitter', fileName: 'Bitter.ttf', format: 'truetype', category: 'Serif' },
    { family: 'Work Sans', fileName: 'Work_Sans.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Nanum Gothic', fileName: 'Nanum_Gothic.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'PT Sans', fileName: 'PT_Sans.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'PT Serif', fileName: 'PT_Serif.ttf', format: 'truetype', category: 'Serif' },
    { family: 'Inconsolata', fileName: 'Inconsolata.ttf', format: 'truetype', category: 'Monospace' },
    { family: 'Source Code Pro', fileName: 'Source_Code_Pro.ttf', format: 'truetype', category: 'Monospace' },
    { family: 'DM Sans', fileName: 'DM_Sans.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Manrope', fileName: 'Manrope.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Josefin Sans', fileName: 'Josefin_Sans.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Cabin', fileName: 'Cabin.ttf', format: 'truetype', category: 'Sans-Serif' },
    { family: 'Arimo', fileName: 'Arimo.ttf', format: 'truetype', category: 'Sans-Serif' },
];
