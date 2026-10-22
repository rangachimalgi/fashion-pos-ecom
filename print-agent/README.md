# Eshwari label print agent

The shop label printer cannot be driven from the Netlify site. This small server runs on the counter PC and receives two-up hang tags from `/admin/tags`.

## Setup (Windows, once)

1. Install Node.js.
2. In this folder:

```
npm install
```

3. Share the label printer in Windows (Printer properties → Sharing), then set the share path:

```
set LABEL_PRINTER=\\localhost\TSC TE200
npm start
```

Use the exact printer share name from Windows. Leave it running while staff print tags.

4. Keep this window open, or add `npm start` to Windows startup.

## Print from the site

Open Hang tags in the browser, select sizes, click **Print**. The page posts to `http://localhost:5000/api/print-labels`. Chrome allows that even if the site is on https.

If the agent is not running, the page will say it cannot connect.

## Stock

Each job is **110 mm × 50 mm** with **BLINE** (black mark / notch), two hang tags in one row. Left column at x=60, right at x=520.
