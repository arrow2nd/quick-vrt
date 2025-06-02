#!/usr/bin/env node

const { Command } = require('commander');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const os = require('os');

const program = new Command();

program
  .name('quick-vrt')
  .description('Quick Visual Regression Testing tool for web pages')
  .version('1.0.0')
  .argument('<urls...>', 'URLs to compare (format: url1 url2 [url3 url4 ...])')
  .option('-o, --output <dir>', 'output directory', './vrt-results')
  .option('--width <number>', 'viewport width', '1280')
  .option('--height <number>', 'viewport height', '720')
  .option('--concurrency <number>', 'max concurrent browsers', Math.max(1, Math.floor(os.cpus().length / 2)).toString())
  .option('--no-open', 'do not auto-open the report')
  .action(async (urls, options) => {
    if (urls.length < 2 || urls.length % 2 !== 0) {
      console.error('Error: Please provide URLs in pairs (url1 url2 [url3 url4 ...])');
      process.exit(1);
    }

    const pairs = [];
    for (let i = 0; i < urls.length; i += 2) {
      pairs.push({ before: urls[i], after: urls[i + 1] });
    }

    await runVRT(pairs, options);
  });

async function runVRT(urlPairs, options) {
  const outputDir = path.resolve(options.output);
  const screenshotsDir = path.join(outputDir, 'screenshots');
  const diffsDir = path.join(outputDir, 'diffs');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
  await fs.mkdir(diffsDir, { recursive: true });

  console.log('Starting Visual Regression Testing...');
  
  const browser = await puppeteer.launch();
  const maxConcurrency = parseInt(options.concurrency);

  // Process pairs with limited concurrency
  const results = [];
  for (let i = 0; i < urlPairs.length; i += maxConcurrency) {
    const batch = urlPairs.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (pair, batchIndex) => {
        const pairIndex = i + batchIndex;
        const pairId = `pair-${pairIndex + 1}`;
        console.log(`Comparing ${pair.before} vs ${pair.after}...`);

        try {
          const page = await browser.newPage();
          await page.setViewport({
            width: parseInt(options.width),
            height: parseInt(options.height)
          });

          // Take screenshot of before URL
          await page.goto(pair.before, { waitUntil: 'networkidle0' });
          const beforePath = path.join(screenshotsDir, `${pairId}-before.png`);
          await page.screenshot({ 
            path: beforePath, 
            fullPage: true 
          });

          // Take screenshot of after URL
          await page.goto(pair.after, { waitUntil: 'networkidle0' });
          const afterPath = path.join(screenshotsDir, `${pairId}-after.png`);
          await page.screenshot({ 
            path: afterPath, 
            fullPage: true 
          });

          await page.close();

          // Generate diff
          const diffPath = path.join(diffsDir, `${pairId}-diff.png`);
          const diffResult = await generateDiff(beforePath, afterPath, diffPath);

          return {
            id: pairId,
            beforeUrl: pair.before,
            afterUrl: pair.after,
            beforeImage: path.relative(outputDir, beforePath),
            afterImage: path.relative(outputDir, afterPath),
            diffImage: path.relative(outputDir, diffPath),
            pixelDiff: diffResult.pixelDiff,
            diffPercentage: diffResult.diffPercentage
          };

        } catch (error) {
          console.error(`Error processing pair ${pairIndex + 1}:`, error.message);
          return {
            id: pairId,
            beforeUrl: pair.before,
            afterUrl: pair.after,
            error: error.message
          };
        }
      })
    );
    results.push(...batchResults);
  }

  await browser.close();

  // Generate HTML report
  const reportPath = await generateReport(results, outputDir);
  
  console.log(`VRT completed! Report saved to: ${reportPath}`);
  
  if (options.open !== false) {
    const { default: open } = await import('open');
    await open(reportPath);
  }
}

async function generateDiff(beforePath, afterPath, diffPath) {
  const beforeImg = PNG.sync.read(await fs.readFile(beforePath));
  const afterImg = PNG.sync.read(await fs.readFile(afterPath));

  const { width, height } = beforeImg;
  const diff = new PNG({ width, height });

  const pixelDiff = pixelmatch(
    beforeImg.data,
    afterImg.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );

  await fs.writeFile(diffPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const diffPercentage = ((pixelDiff / totalPixels) * 100).toFixed(2);

  return { pixelDiff, diffPercentage };
}

async function generateReport(results, outputDir) {
  const reportPath = path.join(outputDir, 'report.html');
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visual Regression Test Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            color: #333;
        }
        
        .header {
            background: #fff;
            padding: 20px;
            border-bottom: 1px solid #ddd;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            color: #2c3e50;
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .summary {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        
        .summary-item {
            background: #e3f2fd;
            padding: 10px 15px;
            border-radius: 6px;
            border-left: 4px solid #2196f3;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .comparison {
            background: #fff;
            margin-bottom: 30px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .comparison-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #ddd;
        }
        
        .comparison-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 5px;
        }
        
        .urls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
        }
        
        .url {
            font-size: 12px;
            color: #666;
            word-break: break-all;
        }
        
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        
        .stat {
            font-size: 12px;
        }
        
        .stat.warning {
            color: #f57c00;
        }
        
        .stat.success {
            color: #388e3c;
        }
        
        .stat.error {
            color: #d32f2f;
        }
        
        .comparison-content {
            padding: 20px;
        }
        
        .view-modes {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .view-mode {
            padding: 8px 16px;
            border: 1px solid #ddd;
            background: #f8f9fa;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        
        .view-mode.active {
            background: #2196f3;
            color: white;
            border-color: #2196f3;
        }
        
        .image-container {
            position: relative;
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
            background: #f8f9fa;
        }
        
        .side-by-side {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
        }
        
        .image-section {
            text-align: center;
        }
        
        .image-section h4 {
            padding: 10px;
            background: #f8f9fa;
            border-bottom: 1px solid #ddd;
            margin-bottom: 0;
            font-size: 14px;
            color: #666;
        }
        
        .image-section img {
            max-width: 100%;
            height: auto;
            display: block;
        }
        
        .slider-container {
            position: relative;
            display: none;
            max-width: 800px;
            margin: 0 auto;
        }
        
        .slider-container.active {
            display: block;
        }
        
        .slider-images {
            position: relative;
            overflow: hidden;
        }
        
        .slider-before,
        .slider-after {
            width: 100%;
            display: block;
        }
        
        .slider-after {
            position: absolute;
            top: 0;
            left: 0;
            clip-path: inset(0 50% 0 0);
        }
        
        .slider-handle {
            position: absolute;
            top: 0;
            left: 50%;
            width: 4px;
            height: 100%;
            background: #2196f3;
            cursor: ew-resize;
            transform: translateX(-50%);
        }
        
        .slider-handle::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            background: #2196f3;
            border-radius: 50%;
            transform: translate(-50%, -50%);
        }
        
        .error-message {
            background: #ffebee;
            border: 1px solid #ffcdd2;
            color: #c62828;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Visual Regression Test Report</h1>
        <div class="summary">
            <div class="summary-item">
                <strong>${results.length}</strong> comparisons
            </div>
            <div class="summary-item">
                <strong>${results.filter(r => !r.error && parseFloat(r.diffPercentage) === 0).length}</strong> identical
            </div>
            <div class="summary-item">
                <strong>${results.filter(r => !r.error && parseFloat(r.diffPercentage) > 0).length}</strong> different
            </div>
            <div class="summary-item">
                <strong>${results.filter(r => r.error).length}</strong> errors
            </div>
        </div>
    </div>
    
    <div class="container">
        ${results.map(result => {
          if (result.error) {
            return `
                <div class="comparison">
                    <div class="comparison-header">
                        <div class="comparison-title">${result.id}</div>
                        <div class="urls">
                            <div class="url">Before: ${result.beforeUrl}</div>
                            <div class="url">After: ${result.afterUrl}</div>
                        </div>
                    </div>
                    <div class="error-message">
                        <strong>Error:</strong> ${result.error}
                    </div>
                </div>
            `;
          }
          
          const diffClass = parseFloat(result.diffPercentage) === 0 ? 'success' : 
                           parseFloat(result.diffPercentage) > 5 ? 'error' : 'warning';
          
          return `
            <div class="comparison">
                <div class="comparison-header">
                    <div class="comparison-title">${result.id}</div>
                    <div class="urls">
                        <div class="url">Before: ${result.beforeUrl}</div>
                        <div class="url">After: ${result.afterUrl}</div>
                    </div>
                    <div class="stats">
                        <div class="stat ${diffClass}">
                            <strong>${result.diffPercentage}%</strong> difference
                        </div>
                        <div class="stat">
                            <strong>${result.pixelDiff.toLocaleString()}</strong> pixels changed
                        </div>
                    </div>
                </div>
                <div class="comparison-content">
                    <div class="view-modes">
                        <div class="view-mode active" data-mode="side-by-side" data-target="${result.id}">
                            Side by Side
                        </div>
                        <div class="view-mode" data-mode="slider" data-target="${result.id}">
                            Slider
                        </div>
                    </div>
                    
                    <div class="side-by-side active" id="${result.id}-side-by-side">
                        <div class="image-section">
                            <h4>Before</h4>
                            <div class="image-container">
                                <img src="${result.beforeImage}" alt="Before">
                            </div>
                        </div>
                        <div class="image-section">
                            <h4>After</h4>
                            <div class="image-container">
                                <img src="${result.afterImage}" alt="After">
                            </div>
                        </div>
                        <div class="image-section">
                            <h4>Diff</h4>
                            <div class="image-container">
                                <img src="${result.diffImage}" alt="Diff">
                            </div>
                        </div>
                    </div>
                    
                    <div class="slider-container" id="${result.id}-slider">
                        <div class="slider-images">
                            <img class="slider-before" src="${result.beforeImage}" alt="Before">
                            <img class="slider-after" src="${result.afterImage}" alt="After">
                            <div class="slider-handle"></div>
                        </div>
                    </div>
                </div>
            </div>
          `;
        }).join('')}
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // View mode switching
            document.querySelectorAll('.view-mode').forEach(button => {
                button.addEventListener('click', function() {
                    const mode = this.dataset.mode;
                    const target = this.dataset.target;
                    
                    // Update active button
                    this.parentElement.querySelectorAll('.view-mode').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Show/hide content
                    const sideBySide = document.getElementById(target + '-side-by-side');
                    const slider = document.getElementById(target + '-slider');
                    
                    if (mode === 'side-by-side') {
                        sideBySide.style.display = 'grid';
                        slider.classList.remove('active');
                    } else {
                        sideBySide.style.display = 'none';
                        slider.classList.add('active');
                    }
                });
            });
            
            // Slider functionality
            document.querySelectorAll('.slider-container').forEach(container => {
                const handle = container.querySelector('.slider-handle');
                const afterImg = container.querySelector('.slider-after');
                
                let isDragging = false;
                
                handle.addEventListener('mousedown', function(e) {
                    isDragging = true;
                    e.preventDefault();
                });
                
                document.addEventListener('mousemove', function(e) {
                    if (!isDragging) return;
                    
                    const rect = container.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                    
                    handle.style.left = percentage + '%';
                    afterImg.style.clipPath = \`inset(0 \${100 - percentage}% 0 0)\`;
                });
                
                document.addEventListener('mouseup', function() {
                    isDragging = false;
                });
            });
        });
    </script>
</body>
</html>`;

  await fs.writeFile(reportPath, html);
  return reportPath;
}

program.parse();