# PhenoType AI

Browser-based facial phenotype analysis application powered by artificial intelligence. All processing runs entirely client-side — no images are ever sent to a server.

**Demo:** [phenotypeai.netlify.app](https://phenotypeai.netlify.app)

## Features

- **Face Detection** — SSD MobileNetV1, Tiny Face Detector, and MTCNN options
- **468-Point Face Mesh** — Detailed facial mapping via MediaPipe Face Mesh
- **Morphological Analysis** — 20+ facial measurements (facial index, nasal index, eye ratio, lip fullness, etc.)
- **Phenotype Matching** — Hybrid scoring against 200+ human phenotypes (embedding + morphology)
- **Age & Gender Estimation** — Pre-trained deep learning models
- **Facial Expression Recognition** — Emotion detection
- **Multilingual** — Turkish (default), English, German
- **Offline Support** — PWA with Service Worker
- **Privacy-First** — All data stays in the browser, nothing is sent to any server

## Project Structure

```
phenotypem-main/
├── index.html                  # Splash screen
├── manifest.webmanifest        # PWA configuration
├── service-worker.js           # Offline support
├── face-api.min.js             # Face detection library
├── list.json                   # Phenotype database (embedding vectors)
├── app/
│   ├── index.html              # Main application UI
│   ├── app.js                  # Core application logic
│   ├── morphology.js           # Facial morphology analysis
│   ├── phenotype-matcher.js    # Phenotype matching module
│   ├── phenotype-worker.js     # Web Worker (background computation)
│   ├── locales.js              # i18n translations
│   ├── morphology-profiles.json# Morphology reference profiles
│   └── styles.css              # Styles
├── models/                     # Pre-trained neural network models (~15MB)
├── faces/                      # Full-resolution phenotype reference images
└── faces_lowres/               # Low-resolution phenotype images
```

## Installation & Usage

The project is a fully static web application. No build process required.

```bash
# Clone the repository
git clone <repo-url>
cd phenotypem-main

# Serve with any static server
# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx http-server

# Option 3: PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## How It Works

```
Image upload → Face detection (face-api.js) →
MediaPipe Face Mesh (468 landmarks) →
Morphological measurements (20+ metrics) →
Phenotype matching (cosine similarity + morphology) →
Hybrid scoring (90% embedding + 10% morphology) →
Results visualization
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Vanilla JavaScript (no framework dependencies) |
| ML/AI | face-api.js, MediaPipe Face Mesh, TensorFlow.js |
| Web APIs | Service Workers, Web Workers, Canvas API, File API, IndexedDB |
| Styling | Pure CSS |
| Deployment | Netlify (any static hosting supported) |

## Data & Privacy

- All image processing happens in the browser
- No data is sent to external servers
- Analysis history is stored only in local storage (localStorage/IndexedDB)
- Works fully offline after first load thanks to Service Worker

## Notes

- The project is in beta; morphological measurements may contain errors
- Beards and facial hair can affect morphological accuracy
- Images are scaled to a maximum of 1280px
- Models are cached after the first download

## License

MIT License — See [LICENSE](LICENSE) for details.

Copyright (c) 2025 sidstuff
