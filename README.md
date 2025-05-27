# Quick VRT

## Overview

Quick VRT is a command-line tool for performing Visual Regression Testing (VRT) on web pages. It helps you identify visual differences between two versions of a web page or a set of web pages by capturing screenshots and comparing them.

## Features

-   Compare two specific URLs directly.
-   Compare multiple pairs of URLs provided in a text file.
-   Generates an HTML report (`mochawesome`) displaying the comparison results.
-   Saves screenshots of both URLs and a diff image highlighting the differences.
-   Organizes results into subdirectories when processing multiple URL pairs from a file.

## Prerequisites

-   Node.js (which includes npm and npx).

## Installation / Usage with `npx`

You can run Quick VRT directly using `npx` without needing to install it globally or locally as a project dependency.

To compare two specific URLs:
```bash
npx quick-vrt <url1> <url2>
```

To compare multiple URL pairs from a file:
```bash
npx quick-vrt -f <path_to_your_url_file.txt>
```
(Replace `<path_to_your_url_file.txt>` with the actual path to your file.)

**Note**: The first time you run the tool with `npx`, it might take a moment to download Playwright browser binaries if they are not already cached. The package name for npx execution will be based on the `name` field in `package.json`. Assuming the published package name on npm will be `quick-vrt` or a similar scope (e.g., `@username/quick-vrt`), the npx command would reflect that. For local testing after `npm link`, you'd use `quick-vrt <url1> <url2>`. The examples above assume the package is published as `quick-vrt`.

## Command-Line Options

-   **`url1`**: The first URL to compare. (Required if not using `-f`)
-   **`url2`**: The second URL to compare. (Required if not using `-f`)
-   **`-f, --file <filePath>`**: Path to a file containing URL pairs for comparison. If this option is used, `url1` and `url2` arguments are ignored.

## URL File Format

When using the `-f, --file <filePath>` option, the specified file should contain pairs of URLs to be compared.

-   Each line in the file represents one pair of URLs.
-   The two URLs in a pair should be separated by a space or a comma.
-   Lines starting with a `#` character are treated as comments and will be ignored.
-   Empty lines are also ignored.

**Example `urls.txt`:**
```
http://example.com/old/homepage http://example.com/new/homepage
http://example.com/old/product-page, http://example.com/new/product-page
# This is a comment and will be skipped
http://example.com/featureA_v1 http://example.com/featureA_v2
```

## Output

The tool generates the following outputs in a directory named `vrt-results/` in your current working directory:

-   **Screenshots**:
    -   For direct URL comparison: `screenshot1.png` and `screenshot2.png` are saved in `vrt-results/`.
    -   For file input: Screenshots for each pair are saved in a unique subdirectory like `vrt-results/pair_0_urlA_vs_urlB/screenshot1.png` and `vrt-results/pair_0_urlA_vs_urlB/screenshot2.png`. The subdirectory name is generated based on the URLs being compared.
-   **Diff Images**:
    -   For direct URL comparison: `diff.png` showing visual differences is saved in `vrt-results/`.
    -   For file input: `diff.png` for each pair is saved in its respective unique subdirectory (e.g., `vrt-results/pair_0_urlA_vs_urlB/diff.png`).
-   **HTML Report**:
    -   An interactive HTML report named `vrt-report.html` is generated in the `vrt-results/` directory.
    -   This report provides a summary of all comparisons, shows the pass/fail status for each, and includes the captured screenshots and diff images as context for easy review.

## Example

Here’s how you can use Quick VRT:

1.  **Comparing two specific URLs:**

    ```bash
    npx quick-vrt https://www.google.com https://www.bing.com
    ```
    This command will:
    -   Capture a screenshot of `https://www.google.com` (saved as `vrt-results/screenshot1.png`).
    -   Capture a screenshot of `https://www.bing.com` (saved as `vrt-results/screenshot2.png`).
    -   Compare them and save the difference as `vrt-results/diff.png`.
    -   Generate an HTML report at `vrt-results/vrt-report.html`.

2.  **Comparing URLs from a file:**

    First, create a file named `my_urls.txt` (or any other name) with content like this:
    ```
    https://www.wikipedia.org https://www.wikia.com/fandom
    https://github.com,https://gitlab.com
    ```

    Then, run the tool:
    ```bash
    npx quick-vrt -f my_urls.txt
    ```
    This command will:
    -   Process each pair of URLs from `my_urls.txt`.
    -   For each pair, it will create a subdirectory in `vrt-results/` (e.g., `vrt-results/pair_0_wikipedia.org_vs_wikia.com/`).
    -   Inside each subdirectory, it will save `screenshot1.png`, `screenshot2.png`, and `diff.png`.
    -   Generate a consolidated HTML report at `vrt-results/vrt-report.html` summarizing all comparisons from the file.

After execution, open `vrt-results/vrt-report.html` in your web browser to view the results.
