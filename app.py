"""
CompDB — Flask Backend (flat model, no variants)
Run: python app.py
"""

import os
import json
import sqlite3
import webbrowser
import threading
from datetime import datetime
from flask import Flask, request, jsonify, render_template, g, session, redirect, url_for, send_from_directory
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'compdb-local-secret-change-me')

DATABASE = os.path.join(os.path.dirname(__file__), 'compdb.db')

# ════════════════════════════════════════════════
# CREDENTIALS  (set in .env or fall back to defaults)
# ════════════════════════════════════════════════
APP_USERNAME = os.environ.get('COMPDB_USER', 'admin')
APP_PASSWORD = os.environ.get('COMPDB_PASS', 'compdb')

# ════════════════════════════════════════════════
# DATABASE
# ════════════════════════════════════════════════

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA journal_mode=WAL')
        g.db.execute('PRAGMA foreign_keys=ON')
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.executescript('''
        CREATE TABLE IF NOT EXISTS parts (
            id      TEXT PRIMARY KEY,
            name    TEXT NOT NULL,
            cat     TEXT NOT NULL,
            value   TEXT NOT NULL,
            pkg     TEXT DEFAULT '',
            qty     INTEGER DEFAULT 0,
            loc     TEXT DEFAULT '',
            low     INTEGER DEFAULT 0,
            mpn     TEXT DEFAULT '',
            notes   TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS wishlist (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            cat         TEXT NOT NULL,
            value       TEXT DEFAULT '',
            pkg         TEXT DEFAULT '',
            qty_wanted  INTEGER DEFAULT 1,
            priority    TEXT DEFAULT 'medium',
            notes       TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS categories (
            name TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            timestamp   TEXT NOT NULL,
            items_json  TEXT NOT NULL,
            notes       TEXT DEFAULT ''
        );
    ''')

    # Add notes column to history if upgrading from older schema
    try:
        db.execute('ALTER TABLE history ADD COLUMN notes TEXT DEFAULT ""')
        db.commit()
    except Exception:
        pass

    # Seed default categories if empty
    existing = db.execute('SELECT COUNT(*) FROM categories').fetchone()[0]
    if existing == 0:
        defaults = [
            'Resistor','Capacitor','Inductor','Diode','Transistor','MOSFET','LED',
            'Crystal / Oscillator','MCU','Sensor','Module','IC — Analog','IC — Digital',
            'IC — Power','Connector','Switch / Button','Display','Relay',
            'Fuse / Protection','Other'
        ]
        db.executemany('INSERT INTO categories (name) VALUES (?)', [(c,) for c in defaults])

    db.commit()
    db.close()

# ════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

@app.route('/login', methods=['GET'])
def login_page():
    if session.get('logged_in'):
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def do_login():
    data = request.json or {}
    if data.get('username') == APP_USERNAME and data.get('password') == APP_PASSWORD:
        session['logged_in'] = True
        return jsonify({'ok': True})
    return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# ════════════════════════════════════════════════
# SERVE FRONTEND
# ════════════════════════════════════════════════

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/style.css')
def serve_css():
    return send_from_directory(app.template_folder, 'style.css', mimetype='text/css')

@app.route('/app.js')
def serve_js():
    return send_from_directory(app.template_folder, 'app.js', mimetype='application/javascript')

@app.route('/login.css')
def serve_login_css():
    return send_from_directory(app.template_folder, 'login.css', mimetype='text/css')

# Favicon / logo — same folder as app.py
@app.route('/favicon.ico')
def favicon():
    here = os.path.dirname(os.path.abspath(__file__))
    return send_from_directory(here, 'dbico.ico', mimetype='image/x-icon')

@app.route('/dbpng.png')
def logo_png():
    here = os.path.dirname(os.path.abspath(__file__))
    return send_from_directory(here, 'dbpng.png', mimetype='image/png')

# ════════════════════════════════════════════════
# API — PARTS (flat model)
# ════════════════════════════════════════════════

@app.route('/api/parts', methods=['GET'])
@login_required
def get_parts():
    db = get_db()
    parts = [dict(r) for r in db.execute('SELECT * FROM parts ORDER BY name, value').fetchall()]
    return jsonify({'parts': parts})

@app.route('/api/parts', methods=['POST'])
@login_required
def add_part():
    data = request.json
    db   = get_db()
    db.execute(
        'INSERT INTO parts (id, name, cat, value, pkg, qty, loc, low, mpn, notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
        (data['id'], data['name'], data['cat'], data['value'],
         data.get('pkg',''), data.get('qty',0), data.get('loc',''),
         data.get('low',0), data.get('mpn',''), data.get('notes',''))
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/parts/<part_id>', methods=['PUT'])
@login_required
def update_part(part_id):
    data = request.json
    db   = get_db()
    db.execute(
        'UPDATE parts SET name=?, cat=?, value=?, pkg=?, qty=?, loc=?, low=?, mpn=?, notes=? WHERE id=?',
        (data['name'], data['cat'], data['value'], data.get('pkg',''),
         data.get('qty',0), data.get('loc',''), data.get('low',0),
         data.get('mpn',''), data.get('notes',''), part_id)
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/parts/<part_id>/qty', methods=['PATCH'])
@login_required
def patch_part_qty(part_id):
    data = request.json
    db   = get_db()
    db.execute('UPDATE parts SET qty=? WHERE id=?', (max(0, data['qty']), part_id))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/parts/<part_id>', methods=['DELETE'])
@login_required
def delete_part(part_id):
    db = get_db()
    db.execute('DELETE FROM parts WHERE id=?', (part_id,))
    db.commit()
    return jsonify({'ok': True})

# ════════════════════════════════════════════════
# API — BULK CSV IMPORT
# ════════════════════════════════════════════════

@app.route('/api/import/preview', methods=['POST'])
@login_required
def import_preview():
    """
    Expects JSON: { rows: [{name,category,value,package,quantity,location,low_stock,mpn,notes}] }
    Returns categorised preview: new_parts, new_to_existing, merges, errors
    """
    rows = request.json.get('rows', [])
    db   = get_db()
    existing = [dict(r) for r in db.execute('SELECT * FROM parts').fetchall()]

    def find_match(name, value, pkg):
        n = name.lower().strip()
        matches = [e for e in existing if e['name'].lower().strip() == n]
        if not matches:
            return (None, None)
        # exact: same name+value+pkg
        v, p = value.lower().strip(), pkg.lower().strip()
        for e in matches:
            ev = e['value'].lower().strip()
            ep = (e['pkg'] or '').lower().strip()
            if ev == v and ep == p:
                return ('exact', e)
        # similar: same name only
        return ('similar', matches[0])

    preview = {'new_parts': [], 'merges': [], 'errors': []}

    for i, row in enumerate(rows):
        name = (row.get('name') or '').strip()
        cat  = (row.get('category') or '').strip()
        val  = (row.get('value') or '').strip()
        pkg  = (row.get('package') or '').strip()
        if not name or not cat or not val:
            preview['errors'].append({'row': i+2, 'reason': f'Missing name/category/value: {row}'})
            continue
        match_type, matched = find_match(name, val, pkg)
        qty = int(row.get('quantity') or 0)
        entry = {
            'row': i+2, 'name': name, 'cat': cat, 'value': val, 'pkg': pkg,
            'qty': qty, 'loc': row.get('location',''), 'low': int(row.get('low_stock') or 0),
            'mpn': row.get('mpn',''), 'notes': row.get('notes','')
        }
        if match_type == 'exact':
            entry['merge_id']   = matched['id']
            entry['merge_name'] = f"{matched['name']} {matched['value']} ({matched['pkg']})"
            entry['merge_qty']  = matched['qty']
            entry['action']     = 'merge'
            preview['merges'].append(entry)
        else:
            entry['action'] = 'new'
            if match_type == 'similar':
                entry['similar_name'] = f"{matched['name']} {matched['value']} ({matched['pkg']})"
            preview['new_parts'].append(entry)

    return jsonify(preview)


@app.route('/api/import/commit', methods=['POST'])
@login_required
def import_commit():
    """
    Expects JSON: { rows: [...same as preview rows, with action override] }
    action = 'new' | 'merge' | 'skip'
    """
    rows = request.json.get('rows', [])
    db   = get_db()

    # Get max existing part id number
    existing_ids = [r['id'] for r in db.execute('SELECT id FROM parts').fetchall()]
    nums = [int(i.replace('p','')) for i in existing_ids if i.startswith('p') and i[1:].isdigit()]
    next_id = max(nums, default=0) + 1

    added = 0
    merged = 0
    skipped = 0

    for row in rows:
        action = row.get('action', 'new')
        if action == 'skip':
            skipped += 1
            continue
        if action == 'merge' and row.get('merge_id'):
            existing = db.execute('SELECT qty FROM parts WHERE id=?', (row['merge_id'],)).fetchone()
            if existing:
                new_qty = existing['qty'] + int(row.get('qty', 0))
                db.execute('UPDATE parts SET qty=? WHERE id=?', (new_qty, row['merge_id']))
                merged += 1
        else:
            part_id = f'p{next_id}'; next_id += 1
            db.execute(
                'INSERT INTO parts (id, name, cat, value, pkg, qty, loc, low, mpn, notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
                (part_id, row['name'], row['cat'], row['value'],
                 row.get('pkg',''), int(row.get('qty',0)), row.get('loc',''),
                 int(row.get('low',0)), row.get('mpn',''), row.get('notes',''))
            )
            added += 1

    db.commit()
    return jsonify({'ok': True, 'added': added, 'merged': merged, 'skipped': skipped})

# ════════════════════════════════════════════════
# API — WISHLIST
# ════════════════════════════════════════════════

@app.route('/api/wishlist', methods=['GET'])
@login_required
def get_wishlist():
    db    = get_db()
    items = [dict(r) for r in db.execute(
        'SELECT * FROM wishlist ORDER BY CASE priority WHEN "high" THEN 0 WHEN "medium" THEN 1 ELSE 2 END'
    ).fetchall()]
    for item in items:
        item['qtyWanted'] = item.pop('qty_wanted')
    return jsonify({'wishlist': items})

@app.route('/api/wishlist', methods=['POST'])
@login_required
def add_wish():
    data = request.json
    db   = get_db()
    db.execute(
        'INSERT INTO wishlist (id, name, cat, value, pkg, qty_wanted, priority, notes) VALUES (?,?,?,?,?,?,?,?)',
        (data['id'], data['name'], data['cat'], data.get('value',''), data.get('pkg',''),
         data.get('qtyWanted',1), data.get('priority','medium'), data.get('notes',''))
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/wishlist/<wish_id>', methods=['PUT'])
@login_required
def update_wish(wish_id):
    data = request.json
    db   = get_db()
    db.execute(
        'UPDATE wishlist SET name=?, cat=?, value=?, pkg=?, qty_wanted=?, priority=?, notes=? WHERE id=?',
        (data['name'], data['cat'], data.get('value',''), data.get('pkg',''),
         data.get('qtyWanted',1), data.get('priority','medium'), data.get('notes',''), wish_id)
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/wishlist/<wish_id>', methods=['DELETE'])
@login_required
def delete_wish(wish_id):
    db = get_db()
    db.execute('DELETE FROM wishlist WHERE id=?', (wish_id,))
    db.commit()
    return jsonify({'ok': True})

# ════════════════════════════════════════════════
# API — CATEGORIES
# ════════════════════════════════════════════════

@app.route('/api/categories', methods=['GET'])
@login_required
def get_categories():
    db   = get_db()
    cats = [r['name'] for r in db.execute('SELECT name FROM categories ORDER BY name').fetchall()]
    return jsonify({'categories': cats})

@app.route('/api/categories', methods=['POST'])
@login_required
def add_category():
    data = request.json
    name = data.get('name','').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    db = get_db()
    try:
        db.execute('INSERT INTO categories (name) VALUES (?)', (name,))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Already exists'}), 409
    return jsonify({'ok': True})

# ════════════════════════════════════════════════
# API — HISTORY (Sessions)
# ════════════════════════════════════════════════

@app.route('/api/history', methods=['GET'])
@login_required
def get_history():
    db   = get_db()
    rows = db.execute('SELECT * FROM history ORDER BY id DESC LIMIT 100').fetchall()
    history = []
    for r in rows:
        history.append({
            'id':        r['id'],
            'name':      r['name'],
            'timestamp': r['timestamp'],
            'items':     json.loads(r['items_json']),
            'notes':     r['notes'] or '',
        })
    return jsonify({'history': history})

@app.route('/api/history', methods=['POST'])
@login_required
def add_history():
    data = request.json
    db   = get_db()

    # Deduct part quantities (flat model — use part id directly)
    for item in data.get('items', []):
        db.execute(
            'UPDATE parts SET qty = MAX(0, qty - ?) WHERE id=?',
            (item['used'], item['partId'])
        )

    db.execute(
        'INSERT INTO history (name, timestamp, items_json, notes) VALUES (?,?,?,?)',
        (data['name'], data.get('timestamp', datetime.now().isoformat()),
         json.dumps(data['items']), data.get('notes', ''))
    )
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/history/<int:hist_id>/notes', methods=['PATCH'])
@login_required
def update_history_notes(hist_id):
    data = request.json
    db   = get_db()
    db.execute('UPDATE history SET notes=? WHERE id=?', (data.get('notes',''), hist_id))
    db.commit()
    return jsonify({'ok': True})

# ════════════════════════════════════════════════
# LAUNCH
# ════════════════════════════════════════════════

def open_browser():
    import subprocess
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for path in chrome_paths:
        if os.path.exists(path):
            subprocess.Popen([path, '--new-window', 'http://localhost:5000'])
            return
    webbrowser.open('http://localhost:5000')

if __name__ == '__main__':
    init_db()
    print('  CompDB running at http://localhost:5000\n')
    threading.Timer(1.0, open_browser).start()
    app.run(debug=False, port=5000)