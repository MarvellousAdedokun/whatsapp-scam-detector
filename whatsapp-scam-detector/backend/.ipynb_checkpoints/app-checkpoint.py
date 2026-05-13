from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import re
import os

app = Flask(__name__)

# Allow requests from WhatsApp Web and local testing
CORS(app, origins=[
    "https://web.whatsapp.com",
    "http://localhost:5000",
])

# ── Load model & vectorizer ──────────────────────────────────────
BASE_DIR        = os.path.dirname(__file__)
MODEL_PATH      = os.path.join(BASE_DIR, 'model', 'best_model.pkl')
VECTORIZER_PATH = os.path.join(BASE_DIR, 'model', 'vectorizer.pkl')

with open(MODEL_PATH, 'rb')      as f: model      = pickle.load(f)
with open(VECTORIZER_PATH, 'rb') as f: vectorizer = pickle.load(f)

print("✅ Model and vectorizer loaded.")


# ── Same clean_text used in training ────────────────────────────
def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)      # remove URLs
    text = re.sub(r'\d+', '', text)                  # remove numbers
    text = re.sub(r'[^\w\s]', '', text)              # remove punctuation
    text = re.sub(r'\s+', ' ', text).strip()         # collapse spaces
    return text


# ── Routes ───────────────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()

    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    message = data['message']
    if not message.strip():
        return jsonify({'error': 'Empty message'}), 400

    cleaned    = clean_text(message)
    vectorized = vectorizer.transform([cleaned])
    prediction = model.predict(vectorized)[0]

    try:
        proba      = model.predict_proba(vectorized)[0]
        confidence = float(proba[list(model.classes_).index(prediction)])
    except Exception:
        confidence = None

    return jsonify({
        'prediction': prediction,           # "scam" or "not_scam"
        'confidence': confidence,           # 0.0 – 1.0
        'is_scam':    prediction == 'scam', # boolean for easy use
    })


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': type(model).__name__})


# Render injects a PORT environment variable — must bind to it
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
