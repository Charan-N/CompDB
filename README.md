# CompDB

A local, desktop-first electronics component inventory manager. Runs entirely on your machine — no cloud, no subscription, no internet required after setup.

---

## What it does

- Track your electronics components with quantity, location, package, and notes
- Log "use sessions" to bulk-deduct parts when you build something
- Maintain a wishlist of components to acquire
- Generate a shopping/restock list as CSV
- See a heatmap of your most-used parts over time
- Bulk import components from CSV

---

## Requirements

- Python 3.8+
- Google Chrome (for the auto-launch feature — falls back to your default browser if not found)

---

## Setup

**1. Clone the repo**
```
git clone https://github.com/yourusername/compdb.git
cd compdb
```

**2. Install dependencies**
```
pip install flask python-dotenv
```

**3. Add your icon files (optional)**

Place `dbpng.png` and `dbico.ico` in the root folder alongside `app.py`. These show as the logo and browser tab favicon. If absent, a fallback symbol is used.

**4. Set credentials (optional)**

By default the login is `admin` / `compdb`. To change it, create a `.env` file in the root folder:
```
COMPDB_USER=yourname
COMPDB_PASS=yourpassword
```

**5. Run**
```
python app.py
```

CompDB will open automatically in Chrome at `http://localhost:5000`. The database (`compdb.db`) is created automatically on first run.

---

## Folder structure

```
compdb/
├── app.py              ← Flask server + SQLite API
├── compdb.db           ← SQLite database (auto-created, gitignored)
├── requirements.txt    ← flask, python-dotenv
├── dbico.ico           ← tab favicon (use default or add your own)
├── dbpng.png           ← sidebar logo (use default or add your own)
└── templates/
    ├── index.html      ← app shell + modals
    ├── login.html      ← login screen
    ├── style.css       ← light + dark theme styles
    └── app.js          ← all frontend logic
```

---

## Using the app

### Adding parts

Click **+ Add Part** or press `N`. Fill in:
- **Name** — what the component is (e.g. `Resistor`, `NPN Transistor`)
- **Category** — pick from the list or add a custom one
- **Value** — the spec (e.g. `10k`, `100nF`, `BC547`)
- **Package** — footprint or form factor (e.g. `0402`, `SOT-23`, `THT`)
- **Quantity / Location / Low Stock Alert** — optional but useful
- **MPN** — manufacturer part number, optional

If a part with the same name already exists, a duplicate warning appears. You can tick **Merge qty** to add the quantity to the existing entry instead of creating a new one.

### Editing and deleting

Click **Edit** on any part row. From there you can update any field or delete the part entirely.

### Adjusting quantity inline

Use the `+` and `−` buttons on each part row for quick qty adjustments without opening the edit modal.

### Use Sessions

Press `U` or click **Use Components**. Give the session a name (e.g. `Spark V1 Proto`), optionally add notes, then search and add parts. When done, click **Commit & Deduct** — all quantities are deducted at once and the session is logged to history.

### Session History

Press `S` to open session history. Each session is expandable to show what was used. You can add or edit notes on any past session, or export a BOM CSV for it.

### Wishlist

Press `W` to go to the wishlist. Add components you want to buy, set priority (high / medium / low), and they'll show up on the Restock page.

### Restock

Press `R` to see all low-stock parts and wishlist items in one place. Check what you need and click **↓ Shopping List** to export a CSV for ordering.

### Bulk CSV Import

Click **Import CSV** in the sidebar. Your CSV must have these headers:
```
name, category, value, package, quantity, location, low_stock, mpn, notes
```
You'll get a preview screen showing new parts and merge candidates before anything is committed. For each row you can choose to add, merge qty into an existing part, or skip.

### Export Inventory

Click **↓ Export CSV** on the Inventory page to download your full parts list as a CSV.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `N` | Add part (or wishlist item on Wishlist page) |
| `U` | Open Use Session |
| `S` | Open Session History |
| `I` | Inventory |
| `W` | Wishlist |
| `R` | Restock |
| `H` | Heatmap |
| `Esc` | Close any modal |

Hover over **Shortcuts ⌨** at the bottom of the sidebar for a quick reference.

---

## Default credentials

| Field | Default |
|-------|---------|
| Username | `admin` |
| Password | `compdb` |

Change these via `.env` as described in Setup.

---

## Notes

- All data is stored locally in `compdb.db` — SQLite, single file, easy to back up
- No internet connection required after initial font load (Google Fonts)
- The session secret key defaults to a hardcoded string — fine for local use, change it in `.env` via `SECRET_KEY=...` if exposing to a network