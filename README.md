# quick-vrt

Quick Visual Regression Testing tool for web pages

## Features

- 📸 Full-page screenshot comparison
- 🔄 Multiple URL pair support
- 📊 Interactive HTML test reports
- 🎚️ Side-by-side and slider comparison modes
- 🎯 Pixel-level diff visualization
- 🚀 Auto-browser launch for report viewing
- ⚡ Instant execution with npx

## Installation

```bash
# Install globally
npm install -g quick-vrt

# Or use with npx (no installation required)
npx quick-vrt <urls...>
```

## Usage

### Basic comparison (2 URLs)
```bash
quick-vrt https://example.com https://staging.example.com
```

### Multiple comparisons
```bash
quick-vrt https://site1.com https://site2.com https://page1.com https://page2.com
```

### With options
```bash
quick-vrt https://example.com https://staging.example.com \
  --output ./my-vrt-results \
  --width 1920 \
  --height 1080 \
  --no-open
```

## Options

- `-o, --output <dir>`: Output directory (default: `./vrt-results`)
- `--width <number>`: Viewport width (default: `1280`)
- `--height <number>`: Viewport height (default: `720`)
- `--no-open`: Don't auto-open the report in browser

## Report Features

The generated HTML report includes:

- **Side-by-side comparison**: View before, after, and diff images
- **Slider comparison**: Interactive slider to compare images
- **Diff visualization**: Highlighted pixel differences
- **Statistics**: Diff percentage and pixel count
- **Summary**: Overview of all comparisons

## Requirements

- Node.js >= 16.0.0
- The tool will automatically install Playwright browsers on first run

## Example Output

```
Starting Visual Regression Testing...
Comparing https://example.com vs https://staging.example.com...
Comparing https://page1.com vs https://page2.com...
VRT completed! Report saved to: /path/to/vrt-results/report.html
```

## License

MIT