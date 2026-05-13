from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import pickle
import re
import os
import json
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ── Load model & vectorizer ──────────────────────────────────────
BASE_DIR        = os.path.dirname(__file__)
MODEL_PATH      = os.path.join(BASE_DIR, 'model', 'best_model.pkl')
VECTORIZER_PATH = os.path.join(BASE_DIR, 'model', 'vectorizer.pkl')
LOG_FILE        = os.path.join(BASE_DIR, 'data', 'predictions.jsonl')
FEEDBACK_FILE   = os.path.join(BASE_DIR, 'data', 'feedback.jsonl')

os.makedirs(os.path.join(BASE_DIR, 'data'), exist_ok=True)

with open(MODEL_PATH, 'rb')      as f: model      = pickle.load(f)
with open(VECTORIZER_PATH, 'rb') as f: vectorizer = pickle.load(f)
print("✅ Model loaded:", type(model).__name__)


# ── Text cleaning ────────────────────────────────────────────────
def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'\d+', '', text)
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def append_jsonl(filepath, record):
    with open(filepath, 'a') as f:
        f.write(json.dumps(record) + '\n')


def read_jsonl(filepath):
    if not os.path.exists(filepath):
        return []
    with open(filepath, 'r') as f:
        return [json.loads(line) for line in f if line.strip()]


# ── /predict ─────────────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    message = data['message'].strip()
    if not message:
        return jsonify({'error': 'Empty message'}), 400

    cleaned    = clean_text(message)
    vectorized = vectorizer.transform([cleaned])
    prediction = model.predict(vectorized)[0]

    try:
        proba      = model.predict_proba(vectorized)[0]
        confidence = float(proba[list(model.classes_).index(prediction)])
    except:
        confidence = None

    # Generate unique ID for this prediction (used for feedback linking)
    pred_id = str(uuid.uuid4())[:8]

    # Log prediction
    tester_id = data.get('tester_id', 'unknown')
    record = {
        'id':         pred_id,
        'timestamp':  datetime.utcnow().isoformat(),
        'tester_id':  tester_id,
        'message':    message,
        'prediction': prediction,
        'confidence': confidence,
        'is_scam':    prediction == 'scam',
        'feedback':   None   # filled later via /feedback
    }
    append_jsonl(LOG_FILE, record)

    return jsonify({
        'id':         pred_id,
        'prediction': prediction,
        'confidence': confidence,
        'is_scam':    prediction == 'scam',
    })


# ── /feedback ────────────────────────────────────────────────────
@app.route('/feedback', methods=['POST'])
def feedback():
    data = request.get_json()
    required = ['id', 'correct_label']
    if not data or not all(k in data for k in required):
        return jsonify({'error': 'Missing id or correct_label'}), 400

    record = {
        'id':            data['id'],
        'timestamp':     datetime.utcnow().isoformat(),
        'tester_id':     data.get('tester_id', 'unknown'),
        'message':       data.get('message', ''),
        'correct_label': data['correct_label'],   # "scam" or "not_scam"
        'was_correct':   data.get('was_correct'),  # True/False
    }
    append_jsonl(FEEDBACK_FILE, record)
    return jsonify({'status': 'ok', 'message': 'Feedback saved. Thank you!'})


# ── /health ──────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': type(model).__name__})


# ── /stats ───────────────────────────────────────────────────────
@app.route('/stats', methods=['GET'])
def stats():
    predictions = read_jsonl(LOG_FILE)
    feedbacks   = read_jsonl(FEEDBACK_FILE)

    total       = len(predictions)
    scams       = sum(1 for p in predictions if p.get('is_scam'))
    safe        = total - scams
    testers     = len(set(p.get('tester_id','?') for p in predictions if p.get('tester_id') != 'unknown'))
    fb_total    = len(feedbacks)
    fb_correct  = sum(1 for f in feedbacks if f.get('was_correct') is True)
    accuracy    = round(fb_correct / fb_total * 100, 1) if fb_total > 0 else 'N/A'

    # Recent predictions (last 20)
    recent = predictions[-20:][::-1]

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <title>Scam Detector Stats</title>
      <style>
        body {{ font-family: sans-serif; background: #0d1117; color: #e6edf3; padding: 30px; }}
        h1 {{ color: #25d366; }} h2 {{ color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 8px; }}
        .cards {{ display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 30px; }}
        .card {{ background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 20px 30px; min-width: 140px; }}
        .card .num {{ font-size: 36px; font-weight: 700; color: #25d366; }}
        .card.red .num {{ color: #e74c3c; }}
        .card .label {{ font-size: 13px; color: #8b949e; margin-top: 4px; }}
        table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
        th {{ background: #161b22; padding: 10px; text-align: left; color: #8b949e; }}
        td {{ padding: 9px 10px; border-bottom: 1px solid #21262d; }}
        .scam {{ color: #e74c3c; font-weight: 700; }}
        .safe {{ color: #25d366; }}
        .conf {{ color: #8b949e; }}
      </style>
    </head>
    <body>
      <h1>🛡️ WhatsApp Scam Detector — Dashboard</h1>
      <div class="cards">
        <div class="card"><div class="num">{total}</div><div class="label">Total Scanned</div></div>
        <div class="card red"><div class="num">{scams}</div><div class="label">Scams Detected</div></div>
        <div class="card"><div class="num">{safe}</div><div class="label">Safe Messages</div></div>
        <div class="card"><div class="num">{testers}</div><div class="label">Unique Testers</div></div>
        <div class="card"><div class="num">{fb_total}</div><div class="label">Feedback Received</div></div>
        <div class="card"><div class="num">{accuracy}{'%' if accuracy != 'N/A' else ''}</div><div class="label">User-Confirmed Accuracy</div></div>
      </div>
      <h2>Recent Predictions</h2>
      <table>
        <tr><th>Time</th><th>Tester</th><th>Message</th><th>Result</th><th>Confidence</th></tr>
        {''.join(f"""
        <tr>
          <td>{p.get('timestamp','')[:19].replace('T',' ')}</td>
          <td>{p.get('tester_id','?')[:8]}</td>
          <td>{p.get('message','')[:60]}{'...' if len(p.get('message',''))>60 else ''}</td>
          <td class="{'scam' if p.get('is_scam') else 'safe'}">{'⚠️ SCAM' if p.get('is_scam') else '✅ SAFE'}</td>
          <td class="conf">{round(p.get('confidence',0)*100,1) if p.get('confidence') else 'N/A'}%</td>
        </tr>""" for p in recent)}
      </table>
    </body>
    </html>
    """
    return html


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
