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
  .version('1.1.1');

// Main command for running VRT
program
  .argument('<urls...>', 'URLs to compare (format: url1 url2 [url3 url4 ...])')
  .option('-o, --output <dir>', 'output directory', './vrt-results')
  .option('--width <number>', 'viewport width', '1280')
  .option('--height <number>', 'viewport height', '720')
  .option('--concurrency <number>', 'max concurrent browsers', Math.max(1, Math.floor(os.cpus().length / 2)).toString())
  .option('--scroll-delay <number>', 'delay between scroll steps (ms)', '500')
  .option('--no-lazy-loading', 'disable lazy loading support')
  .option('--no-disable-animations', 'keep CSS animations and transitions enabled')
  .option('--no-mask-videos', 'disable automatic video masking')
  .option('--video-mask-color <color>', 'color for video masks', '#808080')
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

// Open command for viewing existing reports
program
  .command('open')
  .description('Open an existing test report')
  .argument('[path]', 'path to report.html or results directory', './vrt-results')
  .option('-l, --list', 'list recent reports instead of opening')
  .action(async (reportPath, options) => {
    if (options.list) {
      await listReports();
    } else {
      await openReport(reportPath);
    }
  });

async function listReports() {
  try {
    console.log('Searching for recent VRT reports...\n');
    
    // Common locations to search for reports
    const searchPaths = [
      './vrt-results',
      './test-results',
      './screenshots',
      './visual-regression',
      '.'
    ];
    
    const reports = [];
    
    for (const searchPath of searchPaths) {
      try {
        const dirExists = await fs.access(searchPath).then(() => true).catch(() => false);
        if (!dirExists) continue;
        
        const entries = await fs.readdir(searchPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.includes('vrt')) {
            // Check if this directory contains a report.html
            const reportPath = path.join(searchPath, entry.name, 'report.html');
            const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
            
            if (reportExists) {
              const stats = await fs.stat(reportPath);
              reports.push({
                path: path.resolve(reportPath),
                dir: path.resolve(searchPath, entry.name),
                modified: stats.mtime,
                size: stats.size
              });
            }
          } else if (entry.isFile() && entry.name === 'report.html') {
            // Direct report.html file
            const reportPath = path.join(searchPath, entry.name);
            const stats = await fs.stat(reportPath);
            reports.push({
              path: path.resolve(reportPath),
              dir: path.resolve(searchPath),
              modified: stats.mtime,
              size: stats.size
            });
          }
        }
      } catch (error) {
        // Ignore errors for individual paths
      }
    }
    
    if (reports.length === 0) {
      console.log('No VRT reports found.');
      console.log('Run a VRT test first with: quick-vrt <url1> <url2>');
      return;
    }
    
    // Sort by modification time (newest first)
    reports.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    
    console.log('Found reports:');
    console.log('─'.repeat(80));
    
    reports.slice(0, 10).forEach((report, index) => {
      const relativeDir = path.relative(process.cwd(), report.dir);
      const timeAgo = getTimeAgo(report.modified);
      const sizeMB = (report.size / (1024 * 1024)).toFixed(2);
      
      console.log(`${(index + 1).toString().padStart(2)}. ${relativeDir}`);
      console.log(`    Modified: ${timeAgo} (${sizeMB} MB)`);
      console.log(`    Command:  quick-vrt open "${relativeDir}"`);
      console.log('');
    });
    
    if (reports.length > 10) {
      console.log(`... and ${reports.length - 10} more reports`);
    }
    
  } catch (error) {
    console.error('Error listing reports:', error.message);
  }
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}

async function openReport(reportPath) {
  try {
    let fullPath;
    
    // Check if the path is a directory or a file
    const stats = await fs.stat(reportPath).catch(() => null);
    
    if (stats && stats.isDirectory()) {
      // If it's a directory, look for report.html inside
      fullPath = path.join(reportPath, 'report.html');
    } else if (stats && stats.isFile()) {
      // If it's a file, use it directly
      fullPath = reportPath;
    } else {
      // If path doesn't exist, try to construct the report.html path
      fullPath = path.join(reportPath, 'report.html');
    }
    
    // Check if the report file exists
    const reportExists = await fs.access(fullPath).then(() => true).catch(() => false);
    
    if (!reportExists) {
      console.error(`Error: Report not found at ${fullPath}`);
      console.log('Make sure you have run a VRT test or provide the correct path to an existing report.');
      process.exit(1);
    }
    
    console.log(`Opening report: ${fullPath}`);
    
    // Open the report
    const { default: open } = await import('open');
    await open(path.resolve(fullPath));
    
  } catch (error) {
    console.error('Error opening report:', error.message);
    process.exit(1);
  }
}

async function maskVideos(page, maskColor = '#808080') {
  try {
    await page.evaluate((color) => {
      // Find all video elements
      const videos = document.querySelectorAll('video');
      const iframes = document.querySelectorAll('iframe');
      
      // Function to create a mask overlay
      function createMask(element, label) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const mask = document.createElement('div');
        mask.style.cssText = `
          position: fixed !important;
          top: ${rect.top + window.scrollY}px !important;
          left: ${rect.left + window.scrollX}px !important;
          width: ${rect.width}px !important;
          height: ${rect.height}px !important;
          background-color: ${color} !important;
          z-index: 999999 !important;
          pointer-events: none !important;
          border-radius: ${window.getComputedStyle(element).borderRadius} !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-family: Arial, sans-serif !important;
          font-size: 14px !important;
          color: white !important;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5) !important;
        `;
        mask.textContent = `[${label} MASKED]`;
        mask.setAttribute('data-vrt-mask', 'true');
        
        // Make sure the mask stays in place even with position changes
        const observer = new MutationObserver(() => {
          const newRect = element.getBoundingClientRect();
          if (newRect.width > 0 && newRect.height > 0) {
            mask.style.top = `${newRect.top + window.scrollY}px`;
            mask.style.left = `${newRect.left + window.scrollX}px`;
            mask.style.width = `${newRect.width}px`;
            mask.style.height = `${newRect.height}px`;
          }
        });
        
        observer.observe(element, { 
          attributes: true, 
          attributeFilter: ['style', 'class'],
          subtree: false 
        });
        
        document.body.appendChild(mask);
        return mask;
      }
      
      // Mask video elements
      videos.forEach((video, index) => {
        createMask(video, `VIDEO ${index + 1}`);
      });
      
      // Mask potentially video-containing iframes (YouTube, Vimeo, etc.)
      iframes.forEach((iframe, index) => {
        const src = iframe.src.toLowerCase();
        if (src.includes('youtube') || 
            src.includes('vimeo') || 
            src.includes('dailymotion') ||
            src.includes('twitch') ||
            src.includes('embed') ||
            iframe.title.toLowerCase().includes('video')) {
          createMask(iframe, `IFRAME ${index + 1}`);
        }
      });
      
      // Also mask elements with background videos
      const elementsWithBgVideo = document.querySelectorAll('[style*="background"]');
      elementsWithBgVideo.forEach((element, index) => {
        const style = window.getComputedStyle(element);
        const bgImage = style.backgroundImage;
        if (bgImage && (bgImage.includes('.mp4') || bgImage.includes('.webm') || bgImage.includes('.mov'))) {
          createMask(element, `BG VIDEO ${index + 1}`);
        }
      });
      
    }, maskColor);
    
    // Wait a moment for masks to be applied
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('    Videos masked');
    
  } catch (error) {
    console.warn('    Failed to mask videos:', error.message);
  }
}

async function disableAnimations(page) {
  try {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          transform-origin: center !important;
        }
        
        /* Stop CSS keyframe animations */
        * {
          animation-play-state: paused !important;
        }
        
        /* Disable smooth scrolling */
        html {
          scroll-behavior: auto !important;
        }
        
        /* Stop video autoplay */
        video {
          autoplay: false !important;
        }
        
        /* Disable CSS transforms that might be mid-animation */
        *[style*="transform"] {
          transform: none !important;
        }
      `
    });
    
    // Also disable JavaScript-based animations by overriding common methods
    await page.evaluate(() => {
      // Override requestAnimationFrame to execute immediately
      window.requestAnimationFrame = (callback) => {
        return setTimeout(callback, 0);
      };
      
      // Override setTimeout/setInterval for very short delays (likely animations)
      const originalSetTimeout = window.setTimeout;
      const originalSetInterval = window.setInterval;
      
      window.setTimeout = (callback, delay) => {
        if (delay < 100) delay = 0; // Make short delays immediate
        return originalSetTimeout(callback, delay);
      };
      
      window.setInterval = (callback, delay) => {
        if (delay < 100) delay = 1000; // Slow down frequent intervals
        return originalSetInterval(callback, delay);
      };
      
      // Stop any currently running animations
      document.getAnimations?.().forEach(anim => {
        anim.pause();
        anim.currentTime = anim.effect?.getTiming?.().duration || 0;
      });
    });
    
    console.log('    Animations disabled');
    
  } catch (error) {
    console.warn('    Failed to disable animations:', error.message);
  }
}

async function triggerLazyLoading(page, scrollDelay = 500) {
  try {
    // Get initial page dimensions
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const scrollStep = Math.floor(viewportHeight * 0.8);
    
    let position = 0;
    let stableCount = 0;
    const maxStableCount = 3; // Stop if height doesn't change for 3 consecutive checks
    
    console.log(`    Triggering lazy loading (page height: ${currentHeight}px)...`);
    
    while (stableCount < maxStableCount && position < currentHeight) {
      // Scroll to position
      await page.evaluate((pos) => {
        window.scrollTo(0, pos);
      }, position);
      
      // Wait for content to potentially load
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
      
      // Check for height changes
      previousHeight = currentHeight;
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight > previousHeight) {
        console.log(`    Content loaded, new height: ${currentHeight}px`);
        stableCount = 0; // Reset counter when new content loads
      } else {
        stableCount++;
      }
      
      position += scrollStep;
    }
    
    // Force trigger intersection observer events for any remaining lazy images
    await page.evaluate(() => {
      // Trigger intersection observer by scrolling to bottom and back
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, scrollDelay));
    
    // Scroll back to top for screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, scrollDelay / 2));
    
    // Wait for images to complete loading
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter(img => !img.complete)
          .map(img => new Promise(resolve => {
            img.onload = img.onerror = resolve;
            // Fallback timeout for stubborn images
            setTimeout(resolve, 3000);
          }))
      );
    });
    
    console.log(`    Lazy loading complete (final height: ${currentHeight}px)`);
    
  } catch (error) {
    console.warn('    Lazy loading trigger failed:', error.message);
  }
}

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
          if (options.disableAnimations !== false) {
            await disableAnimations(page);
          }
          if (options.lazyLoading !== false) {
            await triggerLazyLoading(page, parseInt(options.scrollDelay));
          }
          if (options.maskVideos !== false) {
            await maskVideos(page, options.videoMaskColor);
          }
          const beforePath = path.join(screenshotsDir, `${pairId}-before.png`);
          await page.screenshot({ 
            path: beforePath, 
            fullPage: true 
          });

          // Take screenshot of after URL
          await page.goto(pair.after, { waitUntil: 'networkidle0' });
          if (options.disableAnimations !== false) {
            await disableAnimations(page);
          }
          if (options.lazyLoading !== false) {
            await triggerLazyLoading(page, parseInt(options.scrollDelay));
          }
          if (options.maskVideos !== false) {
            await maskVideos(page, options.videoMaskColor);
          }
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