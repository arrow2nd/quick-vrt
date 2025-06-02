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
  .option('--user-agent <string>', 'custom user agent string')
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
      
      // Mask potentially video-containing iframes
      iframes.forEach((iframe, index) => {
        const src = (iframe.src || '').toLowerCase();
        const title = (iframe.title || '').toLowerCase();
        const className = (iframe.className || '').toLowerCase();
        
        // Auto-detect video-related iframes
        const isVideoIframe = src.includes('youtube') || 
                             src.includes('vimeo') || 
                             src.includes('dailymotion') ||
                             src.includes('twitch') ||
                             src.includes('wistia') ||
                             src.includes('jwplayer') ||
                             src.includes('brightcove') ||
                             src.includes('embed') ||
                             title.includes('video') ||
                             title.includes('player') ||
                             className.includes('video') ||
                             className.includes('player');
                             
        if (isVideoIframe) {
          createMask(iframe, `VIDEO IFRAME ${index + 1}`);
        }
      });
      
      // Auto-detect and mask elements with background videos
      const allElements = document.querySelectorAll('*');
      let bgVideoCount = 0;
      
      allElements.forEach((element) => {
        const style = window.getComputedStyle(element);
        const bgImage = style.backgroundImage || '';
        const elementStyle = element.getAttribute('style') || '';
        
        // Check for video file extensions in background
        const hasVideoBackground = bgImage.includes('.mp4') || 
                                  bgImage.includes('.webm') || 
                                  bgImage.includes('.mov') ||
                                  bgImage.includes('.avi') ||
                                  bgImage.includes('.mkv') ||
                                  elementStyle.includes('.mp4') ||
                                  elementStyle.includes('.webm') ||
                                  elementStyle.includes('.mov');
        
        if (hasVideoBackground) {
          createMask(element, `BG VIDEO ${++bgVideoCount}`);
        }
      });
      
      // Auto-detect canvas elements that might contain video
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach((canvas, index) => {
        // Check if canvas is being updated frequently (likely video)
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) { // Only mask significant canvases
          const className = (canvas.className || '').toLowerCase();
          const id = (canvas.id || '').toLowerCase();
          
          if (className.includes('video') || 
              className.includes('player') ||
              id.includes('video') ||
              id.includes('player')) {
            createMask(canvas, `CANVAS VIDEO ${index + 1}`);
          }
        }
      });
      
      // Auto-detect WebGL/video-related elements
      const webglElements = document.querySelectorAll('[data-video], [data-player], .video-player, .media-player');
      webglElements.forEach((element, index) => {
        createMask(element, `MEDIA ELEMENT ${index + 1}`);
      });
      
      // Auto-detect common video player class names
      const videoPlayerSelectors = [
        '.video-js', '.vjs-tech', '.plyr', '.jwplayer', '.fp-player',
        '.flowplayer', '.mediaelement', '.mejs-container', '.video-react-video',
        '.react-player', '.shaka-video-container', '.videojs-player'
      ];
      
      videoPlayerSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, index) => {
          createMask(element, `PLAYER ${index + 1}`);
        });
      });
      
    }, maskColor);
    
    // Wait for masks to be properly applied
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('    Dynamic content auto-masked');
    
  } catch (error) {
    console.warn('    Failed to mask dynamic content:', error.message);
  }
}

async function disableAnimations(page) {
  try {
    // First, disable CSS animations and transitions
    await page.addStyleTag({
      content: `
        /* Disable all CSS animations and transitions */
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          animation-iteration-count: 1 !important;
          animation-fill-mode: both !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          transition-property: none !important;
          transform-origin: center !important;
        }
        
        /* Force stop all animations */
        * {
          animation-play-state: paused !important;
          animation: none !important;
          transition: none !important;
        }
        
        /* Disable smooth scrolling */
        html, * {
          scroll-behavior: auto !important;
        }
        
        /* Stop video autoplay and controls */
        video, audio {
          autoplay: false !important;
          preload: none !important;
        }
        
        /* Reset transforms that might be mid-animation */
        *[style*="transform"], *[class*="animate"], *[class*="transition"] {
          transform: none !important;
          animation: none !important;
          transition: none !important;
        }
        
        /* Common animation libraries */
        .animate__animated, [class*="animate-"], [class*="fade"], [class*="slide"], 
        [class*="bounce"], [class*="zoom"], [class*="rotate"], [class*="flip"] {
          animation: none !important;
          transition: none !important;
          transform: none !important;
        }
        
        /* CSS frameworks animations */
        .animated, .animation, .aos-animate, .wow, .reveal, .motion, 
        .gsap, .tween, .velocity-animating {
          animation: none !important;
          transition: none !important;
          transform: none !important;
        }
        
        /* Loading spinners and progress bars */
        .spinner, .loader, .loading, .progress, [class*="spin"], [class*="pulse"] {
          animation: none !important;
          transform: none !important;
        }
        
        /* Hover and focus effects */
        *:hover, *:focus, *:active {
          transition: none !important;
          animation: none !important;
        }
      `
    });
    
    // Wait for CSS to be properly applied
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Disable JavaScript-based animations
    await page.evaluate(() => {
      // Store original functions
      const originalRAF = window.requestAnimationFrame;
      const originalCAF = window.cancelAnimationFrame;
      const originalSetTimeout = window.setTimeout;
      const originalSetInterval = window.setInterval;
      const originalClearTimeout = window.clearTimeout;
      const originalClearInterval = window.clearInterval;
      
      // Override requestAnimationFrame to execute immediately
      window.requestAnimationFrame = (callback) => {
        return originalSetTimeout(callback, 0);
      };
      
      window.cancelAnimationFrame = (id) => {
        return originalClearTimeout(id);
      };
      
      // Override setTimeout/setInterval for animation-like delays
      window.setTimeout = (callback, delay, ...args) => {
        // Make very short delays (likely animations) immediate
        if (delay < 100) delay = 0;
        return originalSetTimeout(callback, delay, ...args);
      };
      
      window.setInterval = (callback, delay, ...args) => {
        // Slow down frequent intervals (likely animations)
        if (delay < 100) delay = 10000; // Very slow
        return originalSetInterval(callback, delay, ...args);
      };
      
      // Stop Web Animations API
      if (document.getAnimations) {
        try {
          document.getAnimations().forEach(animation => {
            animation.pause();
            // Set to final state
            if (animation.effect && animation.effect.getTiming) {
              const timing = animation.effect.getTiming();
              animation.currentTime = timing.duration || 0;
            }
          });
        } catch (e) {
          console.warn('Could not stop Web Animations:', e);
        }
      }
      
      // Disable common animation libraries
      // jQuery animations
      if (window.jQuery || window.$) {
        const $ = window.jQuery || window.$;
        if ($.fx) {
          $.fx.off = true;
          $.fx.interval = 10000;
        }
      }
      
      // GSAP
      if (window.gsap) {
        try {
          window.gsap.globalTimeline.pause();
          window.gsap.set('*', { clearProps: 'all' });
        } catch (e) {
          console.warn('Could not disable GSAP:', e);
        }
      }
      
      // Anime.js
      if (window.anime) {
        try {
          window.anime.suspendWhenDocumentHidden = false;
          // Pause all running animations
          if (window.anime.running) {
            window.anime.running.forEach(anim => anim.pause());
          }
        } catch (e) {
          console.warn('Could not disable Anime.js:', e);
        }
      }
      
      // Three.js
      if (window.THREE) {
        try {
          // Stop render loops by overriding requestAnimationFrame for Three.js
          const originalTHREERAF = window.THREE.DefaultLoadingManager.onProgress;
        } catch (e) {
          console.warn('Could not disable Three.js:', e);
        }
      }
      
      // Velocity.js
      if (window.Velocity) {
        try {
          window.Velocity.mock = true;
        } catch (e) {
          console.warn('Could not disable Velocity.js:', e);
        }
      }
      
      // AOS (Animate On Scroll)
      if (window.AOS) {
        try {
          window.AOS.refresh = () => {};
          window.AOS.refreshHard = () => {};
        } catch (e) {
          console.warn('Could not disable AOS:', e);
        }
      }
      
      // Disable CSS animation events
      const animationEvents = [
        'animationstart', 'animationend', 'animationiteration',
        'transitionstart', 'transitionend', 'transitioncancel'
      ];
      
      animationEvents.forEach(event => {
        document.addEventListener(event, (e) => {
          e.stopPropagation();
          e.preventDefault();
        }, true);
      });
      
      // Force layout recalculation to apply changes
      document.body.offsetHeight;
      
    });
    
    // Wait for all animation changes to take effect
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('    All animations disabled');
    
  } catch (error) {
    console.warn('    Failed to disable animations:', error.message);
  }
}

async function triggerLazyLoading(page, scrollDelay = 500) {
  try {
    console.log('    Triggering optimized lazy loading...');
    const startTime = Date.now();
    
    // Use more conservative scroll delay for stability
    const stableScrollDelay = Math.max(scrollDelay, 300); // Minimum 300ms for stability
    
    // First, trigger all lazy loading mechanisms
    await page.evaluate(() => {
      // Immediately trigger all lazy loading attributes
      const lazySelectors = [
        'img[data-src]', 'img[data-srcset]', 'img[loading="lazy"]',
        'picture[data-src]', 'source[data-srcset]',
        '[data-bg]', '[data-background]', '[data-background-image]',
        '.lazy', '.lazyload', '.lazy-load', '.b-lazy',
        '[class*="lazy"]', '[id*="lazy"]'
      ];
      
      // Force load all lazy elements immediately
      lazySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (el.dataset.src && !el.src) {
            el.src = el.dataset.src;
            el.removeAttribute('data-src');
          }
          if (el.dataset.srcset && !el.srcset) {
            el.srcset = el.dataset.srcset;
            el.removeAttribute('data-srcset');
          }
          if (el.loading === 'lazy') {
            el.loading = 'eager';
          }
          
          // Trigger background images
          const bgSrc = el.dataset.bg || el.dataset.background || el.dataset.backgroundImage;
          if (bgSrc) {
            el.style.backgroundImage = `url(${bgSrc})`;
          }
        });
      });
      
      // Fire all lazy loading events immediately
      const events = ['lazyload', 'lazy:load', 'reveal', 'unveil', 'appear', 'inview', 
                     'scroll', 'resize', 'DOMContentLoaded', 'load', 'focus'];
      events.forEach(eventName => {
        try {
          document.dispatchEvent(new CustomEvent(eventName));
          window.dispatchEvent(new CustomEvent(eventName));
        } catch (e) {
          // Ignore event errors
        }
      });
    });
    
    // Wait for initial triggers to take effect
    await new Promise(resolve => setTimeout(resolve, stableScrollDelay / 2));
    
    // Get page dimensions
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const scrollStep = Math.floor(viewportHeight * 0.8); // Larger steps for speed
    
    console.log(`    Fast scrolling through page (height: ${currentHeight}px)...`);
    
    // Stable scrolling with reasonable termination
    let position = 0;
    let unchangedCount = 0;
    const maxUnchangedCount = 3; // More patient for stability
    const maxScrollTime = 15000; // 15 second timeout for scrolling
    
    while (position < currentHeight && unchangedCount < maxUnchangedCount && 
           (Date.now() - startTime) < maxScrollTime) {
      
      const previousHeight = currentHeight;
      
      // Fast scroll to position
      await page.evaluate((pos) => {
        window.scrollTo({ top: pos, behavior: 'auto' });
        
        // Immediate trigger of lazy elements in viewport
        const potentialLazyElements = document.querySelectorAll(
          'img[loading="lazy"], [data-src], [data-srcset], .lazy, .lazyload, [class*="lazy"]'
        );
        
        potentialLazyElements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight + 500) { // Larger buffer
            if (el.dataset.src && !el.src) {
              el.src = el.dataset.src;
            }
            if (el.dataset.srcset && !el.srcset) {
              el.srcset = el.dataset.srcset;
            }
            if (el.loading === 'lazy') {
              el.loading = 'eager';
            }
          }
        });
        
        // Trigger scroll events
        window.dispatchEvent(new Event('scroll'));
      }, position);
      
      // Stable wait time
      await new Promise(resolve => setTimeout(resolve, stableScrollDelay / 2));
      
      // Check for height changes
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight > previousHeight) {
        console.log(`    Content loaded, height: ${currentHeight}px`);
        unchangedCount = 0;
      } else {
        unchangedCount++;
      }
      
      position += scrollStep;
    }
    
    // Quick final scroll to bottom and back
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
      window.dispatchEvent(new Event('scroll'));
    });
    await new Promise(resolve => setTimeout(resolve, stableScrollDelay / 2));
    
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      
      // Final aggressive loading attempt
      document.querySelectorAll('img').forEach(img => {
        if (img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }
        if (img.dataset.srcset && !img.srcset) {
          img.srcset = img.dataset.srcset;
        }
        if (img.loading === 'lazy') {
          img.loading = 'eager';
        }
      });
    });
    
    // Stable image loading with reasonable timeout
    const imageLoadTimeout = Math.min(3000, scrollDelay * 3); // Max 3 seconds, more stable
    
    await page.evaluate((timeout) => {
      const images = Array.from(document.images).filter(img => !img.complete || !img.naturalWidth);
      
      if (images.length === 0) return Promise.resolve();
      
      console.log(`Waiting for ${images.length} images to load...`);
      
      return Promise.race([
        // Race between image loading and timeout
        Promise.all(
          images.slice(0, 30).map(img => new Promise(resolve => { // Increased to 30 images for completeness
            if (img.complete && img.naturalWidth) {
              resolve();
              return;
            }
            
            const quickTimeout = setTimeout(resolve, timeout);
            
            img.onload = () => {
              clearTimeout(quickTimeout);
              resolve();
            };
            
            img.onerror = () => {
              clearTimeout(quickTimeout);
              resolve();
            };
            
            // Force loading
            if (!img.src && img.dataset.src) {
              img.src = img.dataset.src;
            }
          }))
        ),
        // Global timeout
        new Promise(resolve => setTimeout(resolve, timeout))
      ]);
    }, imageLoadTimeout);
    
    const totalTime = Date.now() - startTime;
    const finalHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`    Lazy loading complete in ${totalTime}ms (final height: ${finalHeight}px)`);
    
  } catch (error) {
    console.warn('    Optimized lazy loading failed:', error.message);
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
          
          // Set appropriate User-Agent
          const userAgent = options.userAgent || 
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
          await page.setUserAgent(userAgent);
          
          // Optimize page settings for speed
          await page.setViewport({
            width: parseInt(options.width),
            height: parseInt(options.height)
          });
          
          // Set stable timeouts
          page.setDefaultTimeout(45000); // 45 second timeout for stability
          page.setDefaultNavigationTimeout(45000);
          
          // Shared processing function to avoid code duplication
          const processPage = async (url, imagePath) => {
            await page.goto(url, { 
              waitUntil: 'networkidle0', // Back to networkidle0 for stability
              timeout: 45000 // Increased timeout for stability
            });
            
            // Sequential processing for more stability
            if (options.disableAnimations !== false) {
              await disableAnimations(page);
            }
            
            if (options.lazyLoading !== false) {
              await triggerLazyLoading(page, parseInt(options.scrollDelay));
            }
            
            if (options.maskVideos !== false) {
              await maskVideos(page, options.videoMaskColor);
            }
            
            // Take screenshot with longer timeout
            await page.screenshot({ 
              path: imagePath, 
              fullPage: true,
              timeout: 30000 // Increased screenshot timeout
            });
          };

          // Process both URLs
          const beforePath = path.join(screenshotsDir, `${pairId}-before.png`);
          await processPage(pair.before, beforePath);
          
          const afterPath = path.join(screenshotsDir, `${pairId}-after.png`);
          await processPage(pair.after, afterPath);

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