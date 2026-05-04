# WhatsApp Scam Detector — Chrome Extension

Automatically scans messages on WhatsApp Web and flags scams using your trained ML model.
The backend runs on Render.com so anyone can use the extension — no local server needed.

---

## Project Structure

```
whatsapp-scam-detector/
├── backend/
│   ├── app.py              ← Flask API server
│   ├── requirements.txt
│   ├── render.yaml
│   └── model/              ← Put your trained model files here
│       ├── best_model.pkl
│       └── vectorizer.pkl
└── extension/
    ├── manifest.json
    ├── content.js
    ├── styles.css
    ├── popup.html
    ├── popup.js
    └── icons/
```

---

## PART 1 — Deploy Backend to Render.com

### Step 1 — Add your model files
Copy the two files saved from your notebook into backend/model/:
  backend/model/best_model.pkl
  backend/model/vectorizer.pkl

### Step 2 — Push to GitHub
```
git init
git add .
git commit -m "WhatsApp Scam Detector"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

### Step 3 — Deploy on Render
1. Go to https://render.com and sign up (free, no credit card)
2. Click New → Web Service
3. Connect GitHub and select your repo
4. Settings:
   - Root Directory: backend
   - Runtime: Python 3
   - Build Command: pip install -r requirements.txt
   - Start Command: gunicorn app:app
   - Instance Type: Free
5. Click Create Web Service
6. Your live URL will be: https://YOUR-APP-NAME.onrender.com

### Step 4 — Test it
```
curl -X POST https://YOUR-APP-NAME.onrender.com/predict \
  -H "Content-Type: application/json" \
  -d '{"message": "You have won N500000 click here to claim now"}'
```

---

## PART 2 — Update the Extension with your live URL

Replace YOUR-APP-NAME in these 3 files with your actual Render app name:

  extension/content.js  → const API_URL = 'https://YOUR-APP-NAME.onrender.com/predict';
  extension/popup.js    → const API_URL = 'https://YOUR-APP-NAME.onrender.com/health';
  extension/manifest.json → "https://YOUR-APP-NAME.onrender.com/*"

---

## PART 3 — Load Extension in Chrome

1. Open Chrome → chrome://extensions
2. Enable Developer Mode
3. Click Load unpacked → select the extension/ folder
4. Done — the shield icon appears in your toolbar

To share with others: send them the extension/ folder.
They load it the same way. No Python or server needed on their end.

---

## Notes

- Free tier on Render sleeps after 15min inactivity. First request after sleep ~30s.
- Only incoming messages (not your sent ones) are scanned.
- Nothing is stored — messages go to your Render server only.
