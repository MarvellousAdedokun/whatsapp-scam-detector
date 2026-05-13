"""
retrain.py — Active Learning Retraining Script
Run this periodically to retrain the model with new feedback data.

Usage:
    python retrain.py

It will:
1. Load original training data
2. Load feedback data collected from users
3. Combine them
4. Retrain the best model
5. Save updated model/best_model.pkl
"""

import pickle
import json
import os
import re
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

BASE_DIR      = os.path.dirname(__file__)
FEEDBACK_FILE = os.path.join(BASE_DIR, 'data', 'feedback.jsonl')
MODEL_PATH    = os.path.join(BASE_DIR, 'model', 'best_model.pkl')
VEC_PATH      = os.path.join(BASE_DIR, 'model', 'vectorizer.pkl')
DATA_PATH     = os.path.join(BASE_DIR, 'data', 'original_data.csv')  # your original dataset


def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'\d+', '', text)
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def load_feedback():
    if not os.path.exists(FEEDBACK_FILE):
        print("No feedback file found.")
        return pd.DataFrame(columns=['message', 'label'])
    
    records = []
    with open(FEEDBACK_FILE) as f:
        for line in f:
            if line.strip():
                r = json.loads(line)
                if r.get('message') and r.get('correct_label'):
                    records.append({
                        'message': r['message'],
                        'label':   r['correct_label']
                    })
    
    df = pd.DataFrame(records)
    print(f"Loaded {len(df)} feedback records")
    return df


def retrain():
    print("=" * 50)
    print("  ACTIVE LEARNING — RETRAINING")
    print("=" * 50)

    # Load original data
    if not os.path.exists(DATA_PATH):
        print(f"Original data not found at {DATA_PATH}")
        print("Please copy your original dataset CSV to data/original_data.csv")
        return

    original = pd.read_csv(DATA_PATH)
    print(f"Original dataset: {len(original)} rows")

    # Load feedback data
    feedback = load_feedback()

    # Combine
    combined = pd.concat([original[['message', 'label']], feedback], ignore_index=True)
    combined = combined.dropna(subset=['message', 'label'])
    combined['message'] = combined['message'].apply(clean_text)
    print(f"Combined dataset: {len(combined)} rows")
    print(f"New feedback added: {len(feedback)} rows")
    print(f"\nClass distribution:\n{combined['label'].value_counts()}")

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        combined['message'], combined['label'],
        test_size=0.2, random_state=42, stratify=combined['label']
    )

    # Vectorize
    vectorizer = TfidfVectorizer(stop_words='english', max_features=10000)
    X_train_tfidf = vectorizer.fit_transform(X_train)
    X_test_tfidf  = vectorizer.transform(X_test)

    # Train all 3 models and pick best
    models = {
        'Naive Bayes':         MultinomialNB(),
        'Logistic Regression': LogisticRegression(class_weight='balanced', max_iter=200),
        'SVM':                 SVC(class_weight='balanced', probability=True),
    }

    results = {}
    for name, m in models.items():
        m.fit(X_train_tfidf, y_train)
        y_pred = m.predict(X_test_tfidf)
        acc = accuracy_score(y_test, y_pred)
        results[name] = (acc, m)
        print(f"\n{name}: {acc:.4f}")
        print(classification_report(y_test, y_pred))

    # Save best model
    best_name = max(results, key=lambda k: results[k][0])
    best_model = results[best_name][1]
    print(f"\n🏆 Best Model: {best_name} ({results[best_name][0]:.4f})")

    with open(MODEL_PATH, 'wb') as f: pickle.dump(best_model, f)
    with open(VEC_PATH,   'wb') as f: pickle.dump(vectorizer, f)

    print(f"\n✅ Model saved to {MODEL_PATH}")
    print(f"✅ Vectorizer saved to {VEC_PATH}")
    print("\nRestart your Flask server to load the updated model.")


if __name__ == '__main__':
    retrain()
