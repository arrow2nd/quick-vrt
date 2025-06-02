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
- 🎭 User-Agent spoofing for better compatibility
- 🎬 Advanced video masking (Canvas, WebGL, video players)
- 🛑 Comprehensive animation blocking
- 🔄 Optimized lazy loading with timeout controls

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
  --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" \
  --no-open
```

## Options

- `-o, --output <dir>`: Output directory (default: `./vrt-results`)
- `--width <number>`: Viewport width (default: `1280`)
- `--height <number>`: Viewport height (default: `720`)
- `--concurrency <number>`: Max concurrent browsers (default: auto-detected)
- `--scroll-delay <number>`: Delay between scroll steps in ms (default: `500`)
- `--user-agent <string>`: Custom user agent string
- `--video-mask-color <color>`: Color for video masks (default: `#808080`)
- `--no-lazy-loading`: Disable lazy loading support
- `--no-disable-animations`: Keep CSS animations enabled
- `--no-mask-videos`: Disable automatic video masking
- `--no-open`: Don't auto-open the report in browser

## Report Features

The generated HTML report includes:

- **Side-by-side comparison**: View before, after, and diff images
- **Slider comparison**: Interactive slider to compare images
- **Diff visualization**: Highlighted pixel differences
- **Statistics**: Diff percentage and pixel count
- **Summary**: Overview of all comparisons

## Advanced Features

### User-Agent Spoofing
```bash
# Mobile testing
quick-vrt https://example.com https://staging.example.com \
  --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"

# Custom browser
quick-vrt https://example.com https://staging.example.com \
  --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

### Performance Optimization
```bash
# Faster execution for simple pages
quick-vrt https://example.com https://staging.example.com \
  --scroll-delay 200 \
  --no-lazy-loading

# High concurrency for multiple comparisons
quick-vrt url1 url2 url3 url4 url5 url6 \
  --concurrency 8
```

### Video and Animation Control
```bash
# Custom video masking
quick-vrt https://example.com https://staging.example.com \
  --video-mask-color "#ff0000"

# Keep animations for dynamic content testing
quick-vrt https://example.com https://staging.example.com \
  --no-disable-animations
```

## Requirements

- Node.js >= 16.0.0
- The tool will automatically install Puppeteer browsers on first run

## Example Output

```
Starting Visual Regression Testing...
Comparing https://example.com vs https://staging.example.com...
Comparing https://page1.com vs https://page2.com...
VRT completed! Report saved to: /path/to/vrt-results/report.html
```

## License

MIT