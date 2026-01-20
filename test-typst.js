const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('Starting Typst test...');
    const compiler = NodeCompiler.create();
    const source = '= Hello\n#image("tea.png")';

    // Create a dummy image buffer (1x1 transparent pixel or similar)
    // Actually a real valid PNG is better
    const teaPath = path.join(__dirname, 'public/tea.png');
    let buffer;
    if (fs.existsSync(teaPath)) {
        buffer = fs.readFileSync(teaPath);
        console.log('Using real tea.png');
    } else {
        buffer = Buffer.alloc(10, 0); // Invalid PNG but triggers mapping
        console.log('Using dummy buffer');
    }

    const root = process.cwd().replace(/\\/g, '/');
    const main = `${root}/test_main.typ`;
    const imgV = `${root}/tea.png`;

    console.log('Mapping:', main);
    compiler.mapShadow(main, Buffer.from(source));
    console.log('Mapping image:', imgV);
    compiler.mapShadow(imgV, buffer);

    try {
        const pdf = compiler.pdf({ mainFilePath: main });
        console.log('PDF generated, size:', pdf.length);
        fs.writeFileSync('test_output.pdf', pdf);
        console.log('Written to test_output.pdf');
    } catch (e) {
        console.error('Compilation failed:', e);
    }
}

test();
