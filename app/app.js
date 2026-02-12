/**
 * app.js — Ana Uygulama
 * Model yükleme, analiz pipeline koordinasyonu ve sonuç gösterme.
 */

(async () => {
    // ============================
    // DOM Elements
    // ============================
    const loadingSection = document.getElementById('loadingSection');
    const loadingText = document.getElementById('loadingText');
    const progressFill = document.getElementById('progressFill');
    const uploadSection = document.getElementById('uploadSection');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const previewSection = document.getElementById('previewSection');
    const previewImage = document.getElementById('previewImage');
    const previewCanvas = document.getElementById('previewCanvas');
    const previewWrapper = document.getElementById('previewWrapper');
    const faceSelectHint = document.getElementById('faceSelectHint');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    const analyzingSection = document.getElementById('analyzingSection');
    const resultsSection = document.getElementById('resultsSection');
    const faceMapCanvas = document.getElementById('faceMapCanvas');
    const newAnalysisBtn = document.getElementById('newAnalysisBtn');

    const MAX_IMAGE_DIMENSION = 1280;
    const FACE_CROP_PADDING = 0.25;

    let faceMesh = null;
    let currentImageFile = null;
    let currentObjectUrl = null;
    let pendingDetections = null;
    let selectionActive = false;
    let selectClickHandler = null;

    // ============================
    // 0. Dil Yönetimi (i18n)
    // ============================
    const langSelect = document.getElementById('langSelect');
    let currentLang = localStorage.getItem('phenotype_lang') || 'en'; // Default EN
    if (langSelect) {
        langSelect.value = currentLang;
        langSelect.addEventListener('change', (e) => {
            currentLang = e.target.value;
            localStorage.setItem('phenotype_lang', currentLang);
            updatePageLanguage();
            // Re-render results if available (to translate JS-generated content)
            if (!resultsSection.classList.contains('hidden') && lastAnalysisData) {
                displayResults(...lastAnalysisData);
            }
        });
    }

    // Helper: Translate key with params
    function t(key, params = {}) {
        const dict = (window.Translations && window.Translations[currentLang]) || {};
        let str = dict[key] || key;
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(`{${k}}`, v);
        }
        return str;
    }

    function updatePageLanguage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.innerHTML = t(key);
        });

        // Update placeholders if any
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = t(key);
        });
    }

    // Initial call
    updatePageLanguage();

    let lastAnalysisData = null; // Store data to re-render on language change

    // ============================
    // Progress Helper
    // ============================
    function setProgress(pct, text) {
        progressFill.style.width = pct + '%';
        if (text) loadingText.textContent = text; // Usually initial load is generic or handled by i18n
    }

    function setStep(stepNum, status) {
        const el = document.getElementById('step' + stepNum);
        if (!el) return;
        el.classList.remove('active', 'done');
        const iconSpan = el.querySelector('.step-icon');

        if (status === 'active') {
            el.classList.add('active');
            if (iconSpan) iconSpan.textContent = '⚡';
        } else if (status === 'done') {
            el.classList.add('done');
            if (iconSpan) iconSpan.textContent = '✅';
        } else {
            if (iconSpan) iconSpan.textContent = '⏳';
        }
    }

    // ============================
    // 1. Model Yükleme
    // ============================
    try {
        // --- MediaPipe Face Mesh ---
        setProgress(5, 'MediaPipe Face Mesh...'); // Simple logs, user sees "Loading..." from HTML
        loadingText.textContent = t('loadingModel'); // Ensure i18n

        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs');
        const { FaceLandmarker, FilesetResolver } = vision;

        setProgress(15);
        const filesetResolver = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        async function createFaceLandmarker(delegate) {
            return FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate
                },
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
                runningMode: 'IMAGE',
                numFaces: 1
            });
        }

        try {
            faceMesh = await createFaceLandmarker('GPU');
        } catch (err) {
            console.warn('[MediaPipe] GPU delegate başarısız, CPU fallback kullanılacak.', err);
            faceMesh = await createFaceLandmarker('CPU');
        }

        // --- face-api.js ---
        setProgress(35);
        await faceapi.loadSsdMobilenetv1Model('../models');
        setProgress(50);
        await faceapi.loadFaceLandmarkModel('../models');
        setProgress(60);
        await faceapi.loadFaceRecognitionModel('../models');
        setProgress(70);
        await faceapi.loadAgeGenderModel('../models');

        // --- Fenotip Verileri ---
        setProgress(85);
        await PhenotypeMatcher.loadData();

        setProgress(100);
        console.log('[App] Hazır — MediaPipe 468-landmark + face-api.js 128-D');

        await sleep(600);
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');

    } catch (err) {
        console.error('Model yükleme hatası:', err);
        setProgress(100);
        loadingText.textContent = '❌ ' + err.message;
        loadingText.style.color = '#f87171';
    }

    // ============================
    // 2. Fotoğraf Yükleme
    // ============================

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await handleImageFile(file);
        }
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (file) await handleImageFile(file);
    });

    // Clipboard paste (Ctrl+V)
    document.addEventListener('paste', async (e) => {
        if (uploadSection.classList.contains('hidden') && previewSection.classList.contains('hidden')) return;
        let imageFile = null;
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            for (const file of e.clipboardData.files) {
                if (file.type.startsWith('image/')) { imageFile = file; break; }
            }
        }
        if (!imageFile && e.clipboardData && e.clipboardData.items) {
            for (const item of e.clipboardData.items) {
                if (item.type.startsWith('image/')) { imageFile = item.getAsFile(); break; }
            }
        }
        if (imageFile) {
            e.preventDefault();
            await handleImageFile(imageFile);
        }
    });

    async function handleImageFile(file) {
        currentImageFile = file;
        resetSelectionState();
        try {
            const processed = await preprocessImageFile(file);
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = URL.createObjectURL(processed.blob);
            previewImage.src = currentObjectUrl;
            previewImage.onload = () => {
                syncPreviewCanvas();
                uploadSection.classList.add('hidden');
                previewSection.classList.remove('hidden');
                resultsSection.classList.add('hidden');
            };
        } catch (err) {
            console.error('Fotoğraf işleme hatası:', err);
            alert('Fotoğraf işlenemedi. Lütfen başka bir dosya deneyin.');
        }
    }

    changePhotoBtn.addEventListener('click', () => {
        resetSelectionState();
        previewSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        fileInput.value = '';
        cleanupObjectUrl();
    });

    analyzeBtn.addEventListener('click', () => runAnalysis());

    newAnalysisBtn.addEventListener('click', () => {
        resetSelectionState();
        resultsSection.classList.add('hidden');
        previewSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        fileInput.value = '';
        cleanupObjectUrl();
    });

    window.addEventListener('resize', () => {
        if (!previewSection.classList.contains('hidden')) {
            syncPreviewCanvas();
            if (selectionActive && pendingDetections) {
                drawFaceBoxes(pendingDetections);
            }
        }
    });

    // ============================
    // 3. Analiz Pipeline
    // ============================
    async function runAnalysis(selectedDetection = null, options = {}) {
        const useCrop = options.useCrop === true;

        previewSection.classList.add('hidden');
        analyzingSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        const analyzingTextEl = document.getElementById('analyzingText');
        analyzingTextEl.style.background = '';
        analyzingTextEl.style.color = '';
        analyzingTextEl.style.webkitTextFillColor = '';

        for (let i = 1; i <= 3; i++) setStep(i, '');

        try {
            // --- Step 1: Yüz Algılama ---
            setStep(1, 'active');
            analyzingTextEl.textContent = t('analyzing_face');
            await sleep(200);

            const img = previewImage;
            let detection = selectedDetection;

            if (!detection) {
                const detections = await faceapi
                    .detectAllFaces(img)
                    .withFaceLandmarks()
                    .withAgeAndGender()
                    .withFaceDescriptors();

                if (!detections || detections.length === 0) {
                    throw new Error(t('faceSelectHint') || 'Yüz algılanamadı.'); // Fallback
                }

                if (detections.length > 1) {
                    analyzingSection.classList.add('hidden');
                    previewSection.classList.remove('hidden');
                    enterFaceSelection(detections);
                    return;
                }
                detection = detections[0];
            } else {
                analyzingTextEl.textContent = t('analyzing_face'); // Reuse detection text
                await sleep(150);
            }

            const age = Math.round(detection.age);
            const gender = detection.gender;
            const genderProb = (detection.genderProbability * 100).toFixed(1);
            const sex = gender === 'male' ? 'm' : 'f';

            // MediaPipe Face Mesh
            let analysisInput = img;
            let mpResult = null;
            let mpLandmarks = null;

            // 1. Durum: Kullanıcı zaten crop istedi mi?
            if (useCrop) {
                const crop = cropFace(img, detection.detection.box, FACE_CROP_PADDING);
                if (crop) analysisInput = crop.canvas;
            }

            // İlk deneme
            try {
                mpResult = faceMesh.detect(analysisInput);
                mpLandmarks = mpResult.faceLandmarks && mpResult.faceLandmarks[0];
            } catch (e) {
                console.warn('[FaceMesh] İlk deneme başarısız:', e);
            }

            // Fallback: Eğer landmark bulunamadıysa ve henüz crop yapmadıysak, crop yapıp tekrar dene
            if ((!mpLandmarks || mpLandmarks.length < 468) && !useCrop) {
                console.log('[FaceMesh] Landmark bulunamadı. Crop uygulanıp tekrar deneniyor...');
                const crop = cropFace(img, detection.detection.box, FACE_CROP_PADDING);
                if (crop) {
                    analysisInput = crop.canvas;
                    try {
                        mpResult = faceMesh.detect(analysisInput);
                        mpLandmarks = mpResult.faceLandmarks && mpResult.faceLandmarks[0];
                    } catch (e) {
                        console.warn('[FaceMesh] Crop denemesi başarısız:', e);
                    }
                }
            }

            if (!mpLandmarks || mpLandmarks.length < 468) {
                // Hata mesajını i18n uyumlu yapalım
                throw new Error(t('landmarksError') || 'Yüz detayları okunamadı (Landmarks not found). Lütfen yüzün daha net olduğu bir fotoğraf deneyin.');
            }

            const descriptor = detection.descriptor;
            setStep(1, 'done');

            // --- Step 2: Morfoloji ---
            setStep(2, 'active');
            analyzingTextEl.textContent = t('analyzing_morph');
            await sleep(300);

            const morphResult = Morphology.analyze(mpLandmarks);
            setStep(2, 'done');

            // --- Step 3: Fenotip Eşleştirme ---
            setStep(3, 'active');
            analyzingTextEl.textContent = t('analyzing_match');
            await sleep(300);

            const includeMorphology = document.getElementById('morphologyToggle').checked;
            const matches = await PhenotypeMatcher.match(descriptor, sex, 25, includeMorphology ? morphResult : null);
            setStep(3, 'done');

            analyzingTextEl.textContent = t('analyzing_done');
            await sleep(500);

            // --- Sonuçları Göster ---
            analyzingSection.classList.add('hidden');
            displayResults(morphResult, matches, mpLandmarks,
                { age, gender, genderProb, sex }, analysisInput);

        } catch (err) {
            console.error('Analiz hatası:', err);
            analyzingTextEl.textContent = '❌ ' + (err.message || 'Error');
            analyzingTextEl.style.background = 'none';
            analyzingTextEl.style.color = '#f87171';
            analyzingTextEl.style.webkitTextFillColor = '#f87171';
            setTimeout(() => {
                analyzingSection.classList.add('hidden');
                previewSection.classList.remove('hidden');
            }, 3000);
        }
    }

    // ============================
    // 4. Sonuç Gösterimi
    // ============================
    function displayResults(morph, matches, landmarks, info, img) {
        lastAnalysisData = [morph, matches, landmarks, info, img]; // Save for re-render

        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth' });

        const cards = resultsSection.querySelectorAll('.result-card');
        cards.forEach((card, i) => { card.style.animationDelay = (i * 0.1) + 's'; });

        // Face Map
        drawFaceMap(landmarks, img);

        // Gender & Age
        const genderLabel = info.gender === 'male' ? t('genderMale') : t('genderFemale');
        const ageRange = formatAgeRange(info.age);

        document.getElementById('genderAgeInfo').innerHTML = `
      <div class="info-item">
        <div class="info-label">${t('label_gender')}</div>
        <div class="info-value">${genderLabel} ${info.gender === 'male' ? '♂️' : '♀️'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${t('confidence')}</div>
        <div class="info-value">${info.genderProb}%</div>
      </div>
      <div class="info-item">
        <div class="info-label">${t('estAge')}</div>
        <div class="info-value">${ageRange}</div>
      </div>
    `;

        // Morphology
        if (morph) {
            let morphHTML = '';
            for (const [key, feat] of Object.entries(morph.features)) {
                // feat has { label, valueKey, detailKey, params, icon }
                const label = t(feat.label);
                const val = t(feat.valueKey, feat.params);
                const detail = t(feat.detailKey, feat.params);

                morphHTML += `
          <div class="morph-item">
            <div class="morph-label">${feat.icon} ${label}</div>
            <div class="morph-value">${val}</div>
            <div class="morph-detail">${detail}</div>
          </div>
        `;
            }
            document.getElementById('morphologyResults').innerHTML = morphHTML;

            let indicesHTML = '';
            for (const [key, idx] of Object.entries(morph.indices)) {
                // idx has { label, value, descKey, params }
                const label = t(idx.label);
                const desc = t(idx.descKey, idx.params);

                indicesHTML += `
          <div class="index-item">
            <div class="index-label">${label}</div>
            <div class="index-value">${idx.value}</div>
            <div class="index-desc">${desc}</div>
          </div>
        `;
            }
            document.getElementById('indicesResults').innerHTML = indicesHTML;
        }

        // Phenotype Matches
        let phenoHTML = '';
        matches.forEach((m, idx) => {
            const primarySrc = m.isBasic
                ? PhenotypeMatcher.getBasicImagePath(m.name, m.sex)
                : PhenotypeMatcher.getImagePath(m.name, m.sex);
            const fallbackSrc = m.isBasic
                ? PhenotypeMatcher.getImagePath(m.name, m.sex)
                : '';
            const url = PhenotypeMatcher.getHPNetUrl(m.name);
            const isTopMatch = idx < 5;
            const scoreColor = isTopMatch ? '#06d6a0' : m.score > 50 ? '#06d6a0' : m.score > 40 ? '#38bdf8' : '#94a3b8';
            const topClass = isTopMatch ? ' top-match' : '';

            // Group name check: m.groupName is usually just name of group, kept as is (proper noun)

            phenoHTML += `
                <div class="phenotype-item${topClass}">
                    <img class="phenotype-img" src="${primarySrc}" data-fallback="${fallbackSrc}" alt="${m.name}" onerror="if (this.dataset.fallback) { const next = this.dataset.fallback; this.dataset.fallback = ''; this.src = next; } else { this.style.display='none'; }">
          <div class="phenotype-info">
            <div class="phenotype-name"><a href="${url}" target="_blank" rel="noopener noreferrer">${m.name}</a></div>
            ${m.isBasic && m.groupName !== m.name ? `<div class="phenotype-group">${m.groupName} ${currentLang === 'tr' ? 'grubu' : 'group'}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div class="phenotype-score" style="color: ${scoreColor}">${m.score.toFixed(1)}%</div>
            <div class="score-bar">
              <div class="score-bar-fill" style="width: ${Math.min(100, m.score)}%"></div>
            </div>
          </div>
        </div>
      `;
        });
        document.getElementById('phenotypeResults').innerHTML = phenoHTML;
    }

    // ============================
    // 5. Yüz Haritası Çizimi
    // ============================
    function drawFaceMap(landmarks, img) {
        const canvas = faceMapCanvas;
        const maxW = 500;
        const { width: imgW, height: imgH } = getImageSize(img);
        const scale = Math.min(maxW / imgW, 1);
        const w = Math.round(imgW * scale);
        const h = Math.round(imgH * scale);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, w, h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, w, h);

        // Face oval
        ctx.strokeStyle = 'rgba(6, 214, 160, 0.3)';
        ctx.lineWidth = 0.5;
        const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
        drawPath(ctx, landmarks, faceOval, w, h);

        // Eyes
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1;
        drawPath(ctx, landmarks, [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33], w, h);
        drawPath(ctx, landmarks, [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362], w, h);

        // Nose
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.6)';
        drawPath(ctx, landmarks, [6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 267, 269, 270, 409], w, h);

        // Lips
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.6)';
        drawPath(ctx, landmarks, [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 61], w, h);

        // Key points
        const keyPoints = [10, 152, 234, 454, 6, 2, 48, 278, 33, 133, 362, 263, 61, 291, 172, 397];
        ctx.fillStyle = 'rgba(6, 214, 160, 0.8)';
        for (const idx of keyPoints) {
            const pt = landmarks[idx];
            ctx.beginPath();
            ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawPath(ctx, landmarks, indices, w, h) {
        ctx.beginPath();
        for (let i = 0; i < indices.length; i++) {
            const pt = landmarks[indices[i]];
            if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
            else ctx.lineTo(pt.x * w, pt.y * h);
        }
        ctx.stroke();
    }

    function formatAgeRange(age) {
        const safeAge = Number.isFinite(age) ? age : 0;
        const span = safeAge < 18 ? 3 : safeAge < 35 ? 4 : safeAge < 55 ? 6 : 8;
        const min = Math.max(1, Math.round(safeAge - span));
        const max = Math.max(min + 1, Math.round(safeAge + span));
        return `${min}–${max}`;
    }

    // ============================
    // 6. Face Selection
    // ============================
    function enterFaceSelection(detections) {
        pendingDetections = detections;
        selectionActive = true;
        faceSelectHint.classList.remove('hidden');
        previewWrapper.classList.add('selecting');
        previewCanvas.style.pointerEvents = 'auto';

        syncPreviewCanvas();
        drawFaceBoxes(detections);

        selectClickHandler = (e) => {
            const rect = previewCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const scaleX = previewImage.naturalWidth / previewCanvas.width;
            const scaleY = previewImage.naturalHeight / previewCanvas.height;
            const imgX = x * scaleX;
            const imgY = y * scaleY;

            const idx = detections.findIndex(d => {
                const box = d.detection.box;
                return imgX >= box.x && imgX <= box.x + box.width && imgY >= box.y && imgY <= box.y + box.height;
            });

            if (idx === -1) return;
            const selected = detections[idx];
            exitFaceSelection();
            runAnalysis(selected, { useCrop: true });
        };

        previewCanvas.addEventListener('click', selectClickHandler);
    }

    function exitFaceSelection() {
        selectionActive = false;
        pendingDetections = null;
        faceSelectHint.classList.add('hidden');
        previewWrapper.classList.remove('selecting');
        previewCanvas.style.pointerEvents = 'none';
        clearPreviewCanvas();

        if (selectClickHandler) {
            previewCanvas.removeEventListener('click', selectClickHandler);
            selectClickHandler = null;
        }
    }

    function drawFaceBoxes(detections) {
        if (!detections || detections.length === 0) return;
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        const scaleX = previewCanvas.width / previewImage.naturalWidth;
        const scaleY = previewCanvas.height / previewImage.naturalHeight;

        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.fillStyle = 'rgba(10, 14, 26, 0.8)';
        ctx.font = '14px Inter, sans-serif';

        detections.forEach((d, idx) => {
            const box = d.detection.box;
            const x = box.x * scaleX;
            const y = box.y * scaleY;
            const w = box.width * scaleX;
            const h = box.height * scaleY;

            ctx.strokeRect(x, y, w, h);
            const label = String(idx + 1);
            const labelW = 18;
            const labelH = 18;
            const labelY = Math.max(0, y - labelH - 4);
            ctx.fillRect(x, labelY, labelW, labelH);
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(label, x + 5, labelY + 13);
            ctx.fillStyle = 'rgba(10, 14, 26, 0.8)';
        });
    }

    function clearPreviewCanvas() {
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }

    function resetSelectionState() {
        if (selectionActive) exitFaceSelection();
        pendingDetections = null;
    }

    function syncPreviewCanvas() {
        const rect = previewImage.getBoundingClientRect();
        previewCanvas.width = Math.round(rect.width);
        previewCanvas.height = Math.round(rect.height);
    }

    // ============================
    // 7. Image Helpers
    // ============================
    function cleanupObjectUrl() {
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }
    }

    async function preprocessImageFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const orientation = getExifOrientation(arrayBuffer);
        const blob = new Blob([arrayBuffer], { type: file.type || 'image/jpeg' });
        const img = await loadImageElement(blob);

        const { canvas } = drawImageWithOrientation(img, orientation, MAX_IMAGE_DIMENSION);
        const outType = (file.type === 'image/png' || file.type === 'image/webp') ? file.type : 'image/jpeg';
        const outBlob = await canvasToBlob(canvas, outType, 0.92);
        return { blob: outBlob };
    }

    function loadImageElement(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(url);
                reject(err);
            };
            img.src = url;
        });
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), type, quality);
        });
    }

    function drawImageWithOrientation(img, orientation, maxSize) {
        const { width: scaledW, height: scaledH } = scaleDimensions(img.width, img.height, maxSize);
        const swap = orientation >= 5 && orientation <= 8;
        const canvasW = swap ? scaledH : scaledW;
        const canvasH = swap ? scaledW : scaledH;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');

        // EXIF orientation transforms
        switch (orientation) {
            case 2: ctx.transform(-1, 0, 0, 1, canvasW, 0); break; // flip horizontal
            case 3: ctx.transform(-1, 0, 0, -1, canvasW, canvasH); break; // rotate 180
            case 4: ctx.transform(1, 0, 0, -1, 0, canvasH); break; // flip vertical
            case 5: ctx.transform(0, 1, 1, 0, 0, 0); break; // transpose
            case 6: ctx.transform(0, 1, -1, 0, canvasW, 0); break; // rotate 90
            case 7: ctx.transform(0, -1, -1, 0, canvasW, canvasH); break; // transverse
            case 8: ctx.transform(0, -1, 1, 0, 0, canvasH); break; // rotate 270
            default: break;
        }

        ctx.drawImage(img, 0, 0, scaledW, scaledH);
        return { canvas };
    }

    function scaleDimensions(width, height, maxSize) {
        const max = Math.max(width, height);
        if (max <= maxSize) return { width, height };
        const scale = maxSize / max;
        return { width: Math.round(width * scale), height: Math.round(height * scale) };
    }

    function getExifOrientation(arrayBuffer) {
        try {
            const view = new DataView(arrayBuffer);
            if (view.getUint16(0, false) !== 0xFFD8) return 1; // not jpeg
            let offset = 2;
            const length = view.byteLength;
            while (offset < length) {
                const marker = view.getUint16(offset, false);
                offset += 2;
                if (marker === 0xFFE1) {
                    const app1Length = view.getUint16(offset, false);
                    offset += 2;
                    if (view.getUint32(offset, false) !== 0x45786966) return 1; // "Exif"
                    offset += 6;
                    const little = view.getUint16(offset, false) === 0x4949;
                    offset += 2;
                    if (view.getUint16(offset, little) !== 0x002A) return 1;
                    offset += 2;
                    const ifdOffset = view.getUint32(offset, little);
                    offset = offset - 4 + ifdOffset;
                    const entries = view.getUint16(offset, little);
                    offset += 2;
                    for (let i = 0; i < entries; i++) {
                        const entryOffset = offset + i * 12;
                        const tag = view.getUint16(entryOffset, little);
                        if (tag === 0x0112) {
                            const value = view.getUint16(entryOffset + 8, little);
                            return value;
                        }
                    }
                } else if ((marker & 0xFF00) !== 0xFF00) {
                    break;
                } else {
                    offset += view.getUint16(offset, false);
                }
            }
        } catch (err) {
            console.warn('EXIF okuma hatası:', err);
        }
        return 1;
    }

    function cropFace(img, box, paddingRatio) {
        if (!box) return null;
        const { width: imgW, height: imgH } = getImageSize(img);
        const padX = box.width * paddingRatio;
        const padY = box.height * paddingRatio;

        const sx = Math.max(0, box.x - padX);
        const sy = Math.max(0, box.y - padY);
        const ex = Math.min(imgW, box.x + box.width + padX);
        const ey = Math.min(imgH, box.y + box.height + padY);

        const sw = Math.max(1, ex - sx);
        const sh = Math.max(1, ey - sy);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        return { canvas, rect: { x: sx, y: sy, w: sw, h: sh } };
    }

    function getImageSize(img) {
        return {
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
        };
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

})();




