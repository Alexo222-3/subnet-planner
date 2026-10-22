# Subnet Planner

A small web app that plans how to carve up an IPv4 network using **VLSM**
(variable length subnet masking): each department gets the *smallest* subnet
that fits its devices, instead of chopping the network into equal pieces.

Everything runs in the browser — there is no backend and no data leaves your
machine.

## Features

- **Network planner** — enter a starting block (default `192.168.0.0/16`), a
  growth buffer (default 20%), and a list of departments with device counts.
  The plan updates live as you type.
- **Per department**: subnet size, network address, CIDR prefix, subnet mask,
  first/last usable host, gateway (first usable), broadcast, usable hosts and
  unused addresses, plus an auto-suggested VLAN ID (10, 20, 30… — overridable).
- **Summary**: total allocated, overhead (network/broadcast/gateway), spare
  space inside subnets, what's still free, and the free space as CIDR blocks
  you can hand out later.
- **Friendly validation**: negative numbers, empty or duplicate names,
  invalid IPs and VLAN ranges are caught with plain-English messages, and the
  exact input box is highlighted. If the departments don't fit, it tells you
  exactly how many addresses you're short.
- **Standalone subnet calculator** tab: enter an IP plus a prefix (`/24`) or a
  mask (`255.255.255.0`) and get all the details, including the special
  `/31` (point-to-point, RFC 3021) and `/32` (single host) cases.
- **Export / save**: download the plan as CSV, save the inputs as JSON and
  load them back later, and a print-friendly report view.

## How the sizing works

For each department:

```
required = ceil(devices × (1 + buffer%)) + 3   (network + broadcast + gateway)
size     = required rounded up to the next power of two
```

Subnets are then allocated **largest first** from the start of the block.
Because every size is a power of two, each subnet lands exactly on its own
boundary with no overlaps and no gaps. The planner never allocates anything
smaller than /30.

## Running it locally

You need [Node.js](https://nodejs.org/) 20 or newer. Then, in this folder:

```bash
npm install    # download dependencies (first time only)
npm run dev    # start the dev server — prints a local address, usually http://localhost:5173
```

Other commands:

```bash
npm test          # run the unit tests (121 tests for the subnet logic)
npm run typecheck # check the TypeScript types
npm run build     # build the production site into dist/
npm run preview   # serve the built dist/ locally
```

## Project layout

```
src/
  subnet/            All the maths. Pure TypeScript — no React, no browser.
    ip.ts            IPv4 parsing/formatting, masks, CIDR helpers
    sizing.ts        The sizing formula (devices + buffer + overhead → block size)
    validate.ts      Input validation with friendly messages
    calculator.ts    The standalone subnet calculator logic
    planner.ts       The VLSM allocation planner
    csv.ts           Plan → CSV text
    persistence.ts   Plan inputs → JSON save file, and back
    *.test.ts        Unit tests (Vitest), one file per module
  Planner.tsx        The planner tab (form + results table)
  Calculator.tsx     The calculator tab
  App.tsx            App shell with the two tabs
```

The rule of the house: **all maths lives in `src/subnet/`** and the UI files
only call it and display results. That keeps everything testable.

## Deployment (GitHub + Azure Static Web Apps)

The repo includes a ready-made GitHub Actions workflow at
`.github/workflows/azure-static-web-apps.yml`. On every push to `main` it runs
the unit tests, builds the app, and deploys it to Azure. Pull requests get a
temporary preview site that is deleted when the PR closes.

### Step 1 — put the code on GitHub

```bash
git init
git add .
git commit -m "Subnet planner"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo first at https://github.com/new — don't initialise it
with a README, so the push above just works.)

### Step 2 — create the Azure Static Web App

You need an [Azure account](https://portal.azure.com/) (the free tier of
Static Web Apps is enough).

1. In the Azure portal, click **Create a resource** → **Static Web App**.
2. Fill in a name and pick a region close to you. Hosting plan: **Free**.
3. Under **Deployment**, choose **GitHub** and sign in. Select your
   repository and the `main` branch.
4. For **Build presets**, choose **Custom** (or React) and set:
   - *App location*: `/`
   - *Api location*: leave empty (there is no backend)
   - *Output location*: `dist`
5. Click **Review + create**, then **Create**.

Azure will add its own workflow file to your repo (and the deployment token
secret) and the first deploy starts automatically. A minute or two later your
site is live at the URL shown on the resource's **Overview** page
(`https://<something>.azurestaticapps.net`).

### Step 2 (alternative) — use the workflow file in this repo

If you created the Static Web App *without* linking GitHub (or want to keep
this repo's workflow, which runs the tests before deploying):

1. In the Azure portal, open your Static Web App → **Overview** →
   **Manage deployment token** and copy the token.
2. In your GitHub repo: **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**. Name it
   `AZURE_STATIC_WEB_APPS_API_TOKEN` and paste the token.
3. Commit and push. The workflow in this repo runs the tests and deploys.
   If Azure already added its own workflow file, delete one of the two so
   they don't both run.

### After deployment

Every `git push` to `main` now: runs the 121 unit tests → builds the site →
updates your live URL. If the tests fail, the deploy stops and the live site
keeps the last good version.

## Notes and limits

- **IPv4 only.** IPv6 uses completely different maths.
- **No accounts or cloud storage.** "Save plan" downloads a JSON file to your
  computer; "Load plan" reads it back. Nothing is stored server-side.
- VLAN IDs are just suggestions (10, 20, 30…); type your own to override.
