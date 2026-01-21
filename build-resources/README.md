# Build Resources

This directory contains resources used when building the Electron desktop app.

## Required Icons

To customize the app icon, add the following files:

### Windows
- `icon.ico` - Windows application icon (256x256 minimum, can contain multiple sizes)

### macOS
- `icon.icns` - macOS application icon (1024x1024 recommended)

### Linux
- `icons/` directory containing PNG files at various sizes:
  - `16x16.png`
  - `32x32.png`
  - `48x48.png`
  - `64x64.png`
  - `128x128.png`
  - `256x256.png`
  - `512x512.png`

## Generating Icons

You can use tools like:
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder) - Generate all formats from a single PNG
- [IconConverter](https://iconverticons.com/) - Online converter
- [makeicon.io](https://makeicon.io/) - Online icon generator

### Quick Generation with electron-icon-builder

```bash
npm install -g electron-icon-builder
electron-icon-builder --input=./source-icon.png --output=./build-resources
```

## Default Behavior

If no icons are provided, Electron will use its default icon.
