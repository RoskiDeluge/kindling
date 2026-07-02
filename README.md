# kindling

Export all of your Kindle highlights from [read.amazon.com/notebook](https://read.amazon.com/notebook) into Markdown files — one file per book.

## Setup

```sh
npm install
npx playwright install chromium
```

## Usage

```sh
# Export into a specific directory
node src/index.js ~/notes/kindle

# Or into ./highlights (the default)
node src/index.js
```

Or link it as a global command:

```sh
npm link
kindling ~/notes/kindle
```

On the first run a Chromium window opens — sign in to Amazon there. The session is stored under `~/.kindling/browser-profile`, so subsequent runs go straight to scraping.

### Options

| Option | Description |
| --- | --- |
| `--base-url <url>` | Kindle notebook base URL, e.g. `https://read.amazon.co.uk` for UK accounts (default: `https://read.amazon.com`) |
| `--fresh-login` | Discard the saved session and sign in again |

## Output

Each book becomes `<slugified-title>.md` containing the title, author, ASIN, and every highlight as a blockquote with its location, color, and any attached note.
