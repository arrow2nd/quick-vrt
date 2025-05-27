#!/usr/bin/env node

const { program } = require('commander');
const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { v4: uuidv4 } = require('uuid'); // For unique test IDs
const generate = require('mochawesome/lib/generate'); // Correct way to import generator

const VRT_RESULTS_DIR = './vrt-results';
const REPORT_FILENAME = 'vrt-report'; // Mochawesome appends .html

// Function to sanitize URL for use in filenames/paths
function sanitizeUrlForPath(url, prefix = '') {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  let sanitized = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  // Truncate if too long
  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 50);
  }
  return `${safePrefix}${sanitized}`;
}


// Initialize report structure
let reportData = {
  stats: {
    suites: 0, // Will be 1, for the main suite
    tests: 0, // Will be the number of URL pairs or 1 for direct input
    passes: 0,
    pending: 0,
    failures: 0,
    start: new Date().toISOString(),
    end: new Date().toISOString(), // Will be updated
    duration: 0, // Will be updated
  },
  results: [], // Array of suite objects
  meta: { // Mock values, as we are not running Mocha
    mocha: { version: 'N/A' },
    mochawesome: { version: require('mochawesome/package.json').version },
    sinon: { version: 'N/A' },
  },
};

async function takeScreenshot(url, outputPath) {
  console.log(`Capturing screenshot for ${url}...`);
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`Screenshot saved to ${outputPath}`);
  } catch (error) {
    console.error(`Error taking screenshot for ${url}:`, error.message);
      throw error; // Re-throw to be caught by the main async try-catch
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function compareImages(imgPath1, imgPath2, diffOutputPath) {
  console.log(`Comparing images: ${imgPath1} and ${imgPath2}`);
  try {
    const img1Data = await fs.readFile(imgPath1);
    const img2Data = await fs.readFile(imgPath2);

    const img1 = PNG.sync.read(img1Data);
    const img2 = PNG.sync.read(img2Data);

    if (img1.width !== img2.width || img1.height !== img2.height) {
      console.error('Images have different dimensions. Cannot compare.');
      // For now, we'll log an error. A more robust solution might involve resizing
      // or creating a diff canvas that accommodates both.
      // Or, simply state that VRT requires same-dimension images.
      return -1; // Indicate error or incompatible images
    }

    const { width, height } = img1;
    const diff = new PNG({ width, height });

    const mismatchedPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 } // Default threshold
    );

    await fs.writeFile(diffOutputPath, PNG.sync.write(diff));
    console.log(`Diff image saved to ${diffOutputPath}`);
    return mismatchedPixels;
  } catch (error) {
    console.error('Error during image comparison:', error.message);
    throw error; // Re-throw
  }
}

program
  .version('0.0.1')
  .description('A CLI tool for Visual Regression Testing (VRT) that compares two URLs or a list of URL pairs from a file.')
  .argument('<url1>', 'The first URL to compare.')
  .argument('<url2>', 'The second URL to compare.')
  .option('-f, --file <filePath>', 'Specify a file containing pairs of URLs for comparison (one pair per line, space-separated).')
  .action(async (url1Arg, url2Arg, options) => {
    await fs.ensureDir(VRT_RESULTS_DIR);
    const overallStartTime = Date.now();
    reportData.stats.start = new Date(overallStartTime).toISOString();
    reportData.stats.suites = 1; // We'll always have one main suite

    const mainSuite = {
      uuid: uuidv4(),
      title: options.file ? `VRT for file: ${path.basename(options.file)}` : `VRT for ${url1Arg} vs ${url2Arg}`,
      fullFile: '', file: '', beforeHooks: [], afterHooks: [],
      tests: [], suites: [], passes: [], failures: [], pending: [], skipped: [],
      duration: 0, root: true, rootEmpty: true,
    };
    reportData.results.push(mainSuite);

    if (options.file) {
      if (url1Arg && url2Arg) {
        console.log("Both file option and direct URLs provided. Prioritizing file input.");
      }
      console.log(`Processing URL pairs from file: ${options.file}`);
      try {
        const fileContent = await fs.readFile(options.file, 'utf-8');
        const lines = fileContent.split(/\r?\n/);
        let pairIndex = 0;

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith('#')) continue; // Skip empty lines and comments

          const urls = trimmedLine.split(/[\s,]+/); // Split by space or comma
          if (urls.length !== 2 || !urls[0] || !urls[1]) {
            console.warn(`Skipping malformed line: "${line}" (expected two URLs separated by space or comma)`);
            continue;
          }
          
          const [url1, url2] = urls;
          reportData.stats.tests++;
          mainSuite.rootEmpty = false;
          const pairStartTime = Date.now();

          // Create unique directory for this pair
          const pairDirName = `pair_${pairIndex}_${sanitizeUrlForPath(url1)}_${sanitizeUrlForPath(url2)}`;
          const pairResultsDir = path.join(VRT_RESULTS_DIR, pairDirName);
          await fs.ensureDir(pairResultsDir);

          const screenshot1Path = path.join(pairResultsDir, 'screenshot1.png');
          const screenshot2Path = path.join(pairResultsDir, 'screenshot2.png');
          const diffOutputPath = path.join(pairResultsDir, 'diff.png');
          
          // Relative paths for report context (relative to VRT_RESULTS_DIR)
          const reportScreenshot1Path = path.join(pairDirName, 'screenshot1.png');
          const reportScreenshot2Path = path.join(pairDirName, 'screenshot2.png');
          const reportDiffOutputPath = path.join(pairDirName, 'diff.png');

          const test = {
            title: `Pair ${pairIndex + 1}: ${url1} vs ${url2}`,
            fullTitle: `Visual Test Pair ${pairIndex + 1}: ${url1} vs ${url2}`,
            timedOut: false, duration: 0, state: 'failed', pass: false, fail: true, pending: false,
            code: trimmedLine, err: {}, isRoot: false, uuid: uuidv4(), parentUUID: mainSuite.uuid,
            skipped: false, context: [],
          };
          mainSuite.tests.push(test);

          try {
            await takeScreenshot(url1, screenshot1Path);
            await takeScreenshot(url2, screenshot2Path);

            test.context.push(JSON.stringify({ title: 'Screenshot 1', value: reportScreenshot1Path }));
            test.context.push(JSON.stringify({ title: 'Screenshot 2', value: reportScreenshot2Path }));

            if (await fs.pathExists(screenshot1Path) && await fs.pathExists(screenshot2Path)) {
              const mismatchedPixels = await compareImages(screenshot1Path, screenshot2Path, diffOutputPath);
              test.context.push(JSON.stringify({ title: 'Diff Image', value: reportDiffOutputPath }));
              test.context.push(JSON.stringify({ title: 'Mismatched Pixels', value: mismatchedPixels }));

              if (mismatchedPixels === 0) {
                test.state = 'passed'; test.pass = true; test.fail = false; reportData.stats.passes++; mainSuite.passes.push(test.uuid);
                console.log(`Pair ${pairIndex + 1}: No visual differences detected.`);
              } else if (mismatchedPixels > 0) {
                test.err = { message: `${mismatchedPixels} mismatched pixels found.` }; reportData.stats.failures++; mainSuite.failures.push(test.uuid);
                console.log(`Pair ${pairIndex + 1}: Differences found. Check ${diffOutputPath} for details.`);
              } else {
                test.err = { message: 'Image comparison failed (e.g., different dimensions).' }; reportData.stats.failures++; mainSuite.failures.push(test.uuid);
                console.log(`Pair ${pairIndex + 1}: Image comparison could not be performed.`);
              }
            } else {
              test.err = { message: 'One or both screenshots failed to capture.' }; reportData.stats.failures++; mainSuite.failures.push(test.uuid);
              console.log(`Pair ${pairIndex + 1}: One or both screenshots failed.`);
            }
          } catch (pairError) {
            console.error(`Error processing pair ${url1} vs ${url2}:`, pairError.message);
            test.err = { message: pairError.message, stack: pairError.stack };
            if (!mainSuite.failures.includes(test.uuid)) { // Avoid double counting if already marked as failure
                reportData.stats.failures++; mainSuite.failures.push(test.uuid);
            }
          } finally {
            test.duration = Date.now() - pairStartTime;
          }
          pairIndex++;
        }
        if(pairIndex === 0 && lines.length > 0){ // File had lines, but none were valid pairs
            console.warn("No valid URL pairs found in the provided file.");
            // Optionally create a "pending" or "skipped" test to indicate this in the report
        }

      } catch (fileError) {
        console.error(`Error reading or parsing file ${options.file}:`, fileError.message);
        // Create a single failed test for the suite to indicate file error
        const fileTest = {
            title: "File Processing Error",
            fullTitle: `Error processing file: ${options.file}`,
            timedOut: false, duration: 0, state: 'failed', pass: false, fail: true, pending: false,
            code: '', err: { message: fileError.message, stack: fileError.stack }, isRoot: false, 
            uuid: uuidv4(), parentUUID: mainSuite.uuid, skipped: false, context: [],
        };
        mainSuite.tests.push(fileTest);
        reportData.stats.tests = 1; // Ensure at least one test is reported for the file error
        reportData.stats.failures = 1;
        mainSuite.failures.push(fileTest.uuid);
        mainSuite.rootEmpty = false;
      }
    } else if (url1Arg && url2Arg) { // Process direct URLs if no file is specified
      reportData.stats.tests = 1;
      mainSuite.rootEmpty = false;
      const singleTestStartTime = Date.now();
      
      const screenshot1Path = path.join(VRT_RESULTS_DIR, 'screenshot1.png'); // Direct screenshots in root of VRT_RESULTS_DIR
      const screenshot2Path = path.join(VRT_RESULTS_DIR, 'screenshot2.png');
      const diffOutputPath = path.join(VRT_RESULTS_DIR, 'diff.png');

      const test = {
        title: `Compare ${url1Arg} and ${url2Arg}`,
        fullTitle: `Visual Regression Test: Compare ${url1Arg} and ${url2Arg}`,
        timedOut: false, duration: 0, state: 'failed', pass: false, fail: true, pending: false,
        code: '', err: {}, isRoot: false, uuid: uuidv4(), parentUUID: mainSuite.uuid,
        skipped: false, context: [],
      };
      mainSuite.tests.push(test);

      try {
        await takeScreenshot(url1Arg, screenshot1Path);
        await takeScreenshot(url2Arg, screenshot2Path);
        test.context.push(JSON.stringify({ title: 'Screenshot 1', value: './screenshot1.png' }));
        test.context.push(JSON.stringify({ title: 'Screenshot 2', value: './screenshot2.png' }));

        if (await fs.pathExists(screenshot1Path) && await fs.pathExists(screenshot2Path)) {
          const mismatchedPixels = await compareImages(screenshot1Path, screenshot2Path, diffOutputPath);
          test.context.push(JSON.stringify({ title: 'Diff Image', value: './diff.png' }));
          test.context.push(JSON.stringify({ title: 'Mismatched Pixels', value: mismatchedPixels }));

          if (mismatchedPixels === 0) {
            test.state = 'passed'; test.pass = true; test.fail = false; reportData.stats.passes++; mainSuite.passes.push(test.uuid);
          } else if (mismatchedPixels > 0) {
            test.err = { message: `${mismatchedPixels} mismatched pixels found.` }; reportData.stats.failures++; mainSuite.failures.push(test.uuid);
          } else {
            test.err = { message: 'Image comparison failed (e.g., different dimensions).' }; reportData.stats.failures++; mainSuite.failures.push(test.uuid);
          }
        } else {
          test.err = { message: 'One or both screenshots failed to capture.' }; reportData.stats.failures++; mainSuite.failures.push(test.uuid);
        }
      } catch (error) {
        console.error('An error occurred during direct URL processing:', error.message);
        test.err = { message: error.message, stack: error.stack };
        if (!mainSuite.failures.includes(test.uuid)) {
             reportData.stats.failures++; mainSuite.failures.push(test.uuid);
        }
      } finally {
        test.duration = Date.now() - singleTestStartTime;
      }
    } else { // No file and no direct URLs
      if (process.argv.length > 2 && !program.opts().help) { // only show if not help
        console.log('Please provide two URLs or a file path using -f.');
        program.help(); // Show help if arguments are missing and not explicitly asking for help
        // Add a test to report this problem
        const noInputTest = {
            title: "No Input Provided",
            fullTitle: "No URLs or file provided for VRT.",
            timedOut: false, duration: 0, state: 'failed', pass: false, fail: true, pending: false,
            code: '', err: { message: "No input URLs or file specified." }, isRoot: false, 
            uuid: uuidv4(), parentUUID: mainSuite.uuid, skipped: false, context: [],
        };
        mainSuite.tests.push(noInputTest);
        reportData.stats.tests = 1;
        reportData.stats.failures = 1;
        mainSuite.failures.push(noInputTest.uuid);
        mainSuite.rootEmpty = false;
      }
    }
    // Finalize main suite stats
    mainSuite.duration = Date.now() - overallStartTime;
    reportData.stats.duration = mainSuite.duration;
    reportData.stats.end = new Date().toISOString();
    if (mainSuite.tests.length === 0 && !mainSuite.rootEmpty) { // if it was set to false but no tests were actually added.
        mainSuite.rootEmpty = true;
    }
     // Ensure stats are consistent
    if (reportData.stats.tests > 0) {
        if (reportData.stats.passes + reportData.stats.failures !== reportData.stats.tests) {
            // This can happen if a test fails in a way that doesn't increment failures (e.g. an early exit or unhandled promise rejection not caught per test)
            // Or if a test was added but not marked pass/fail
            const unaccountedTests = reportData.stats.tests - (reportData.stats.passes + reportData.stats.failures);
            if (unaccountedTests > 0) {
                 // console.warn(`Correcting stats: ${unaccountedTests} tests were not accounted for as pass/fail. Marking as failed.`);
                 reportData.stats.failures += unaccountedTests;
                 // It's hard to link these to specific tests in the report at this stage without more complex tracking
            }
        }
    } else if (mainSuite.rootEmpty && reportData.stats.suites === 1 && !options.file && !(url1Arg && url2Arg)) {
        // If no file and no args, and not invoking help, it's an error state we want to report.
        // This was handled above by adding a noInputTest, so stats should be set.
        // If somehow it gets here with 0 tests and suite is empty, but it shouldn't be.
    }


  });

(async () => {
  try {
    await program.parseAsync(process.argv);

    // Generate report only if there was an attempt to run tests (file or args)
    // and not if only help was invoked by commander directly
    const opts = program.opts();
    const args = program.args;
    
    // Check if any processing was attempted or if it was just a help call
    const processingAttempted = opts.file || (args[0] && args[1]);
    // Check if help was explicitly requested or implicitly triggered by commander for invalid args
    const helpShown = opts.help || (process.argv.length <= 2);


    if (processingAttempted && (reportData.stats.tests > 0 || reportData.stats.failures > 0 || mainSuiteIsEmptyAndShouldNotBe())) {
      await fs.ensureDir(VRT_RESULTS_DIR); // ensure dir for report
      console.log('Generating HTML report...');
      try {
        // Before generating, if the main suite is empty but was expected to have tests (e.g. file processing failed early)
        // ensure it's correctly marked.
        if (reportData.results.length > 0 && reportData.results[0].tests.length === 0 && !reportData.results[0].rootEmpty && reportData.stats.tests === 0) {
            // This implies an error before any tests could be added to the suite, e.g. file read error.
            // The action handler should have added a specific error test in this case.
            // If not, we might need to add a generic one here or ensure stats reflect this.
            if (reportData.stats.failures === 0) reportData.stats.failures = 1; // Count the suite-level failure
            reportData.results[0].rootEmpty = false; // It's not empty in the sense of "no tests defined", but "tests failed to initialize"
        }


        await generate(reportData, {
          reportDir: VRT_RESULTS_DIR,
          reportFilename: REPORT_FILENAME,
          inlineAssets: true,
          autoOpen: false,
          // reportTitle: `VRT Report - ${options.file ? path.basename(options.file) : (url1Arg || 'Direct Input')}`,
          // enableCharts: true,
        });
        console.log(`Report saved to ${path.join(VRT_RESULTS_DIR, REPORT_FILENAME + '.html')}`);
      } catch (genError) {
        console.error("Failed to generate Mochawesome report:", genError.message, genError.stack);
      }
    } else if (processingAttempted && !helpShown) {
      console.log("No valid tests were run or arguments were invalid, skipping report generation.");
    } else if (!processingAttempted && !helpShown && process.argv.length > 2) {
        // E.g. "node quick-vrt.js somearg" (but not enough for url1, url2)
        // Commander handles this by showing help, so this condition might not be hit often.
        console.log("Invalid command usage. No tests run. Skipping report generation.");
    }


  } catch (error) {
    // This top-level catch is for unexpected errors or errors from commander parsing.
    if (error.code && typeof error.code === 'string' && error.code.startsWith('commander.')) {
        // Commander likely already printed help or an error message.
        // process.exitCode = 1; // Set exit code, commander might do this already
    } else {
        console.error("An critical unexpected error occurred in the CLI tool:", error.message, error.stack);
        process.exitCode = 1; // Ensure non-zero exit code for unexpected errors
    }
  }
})();

// Helper function to determine if the main suite is empty but shouldn't be
// (e.g. file processing was requested but failed before any tests could be added)
function mainSuiteIsEmptyAndShouldNotBe() {
    if (!reportData || !reportData.results || reportData.results.length === 0) return false;
    const mainSuite = reportData.results[0];
    const opts = program.opts(); // Assuming program is accessible here or pass as arg
    
    return opts.file && mainSuite.tests.length === 0 && mainSuite.rootEmpty && reportData.stats.tests === 0;
}
      console.log('File path:', options.file);
      console.log('File processing not yet implemented.');
      // Future: Loop through URL pairs from file, take screenshots, and compare each pair.
    } else {
      // This case should ideally be caught by Commander's argument validation.
      console.log('Please provide two URLs or a file path.');
      program.help(); // Show help if arguments are missing
    }
  });

(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Errors re-thrown from takeScreenshot or compareImages will be caught here.
    // Commander also throws its own errors for invalid options/arguments.
    console.error("An unexpected error occurred in the CLI tool:", error.message);
    // Adding a stack trace might be useful for debugging, but for users, a clear message is often better.
    // console.error(error.stack); 
    process.exit(1);
  }
})();
