/**
 * phenotype-matcher.js — Fenotip Eşleştirme Modülü (Hibrit)
 * 
 * list.json (embedding) ve morphology-profiles.json (morfoloji) yükler.
 * Worker varsa hesaplamayı ona yaptırır. Yoksa ana thread'de hesaplar.
 */

const PhenotypeMatcher = (() => {

    let worker = null;
    let workerReady = null;
    let workerReadyResolve = null;
    let workerReadyReject = null;
    let usingWorker = false;

    let phenotypeList = null;
    let morphologyProfiles = null;
    let allPhenotypes = [];

    const pendingRequests = new Map();
    let requestId = 0;

    // Vektör işlemleri
    const dot = (a, b) => {
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
        return sum;
    };
    const cos = (a, b) => {
        const denom = Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b));
        if (!denom) return 0;
        return dot(a, b) / denom;
    };

    function setupWorker() {
        worker = new Worker('phenotype-worker.js');
        workerReady = new Promise((resolve, reject) => {
            workerReadyResolve = resolve;
            workerReadyReject = reject;
        });

        worker.onmessage = (e) => {
            const msg = e.data || {};
            if (msg.type === 'ready') {
                usingWorker = true;
                console.log(`[PhenotypeMatcher] ${msg.count} fenotip (worker)`);
                if (workerReadyResolve) workerReadyResolve();
            } else if (msg.type === 'match') {
                const pending = pendingRequests.get(msg.id);
                if (pending) {
                    pending.resolve(msg.results);
                    pendingRequests.delete(msg.id);
                }
            } else if (msg.type === 'error') {
                console.warn('[PhenotypeMatcher] Worker error:', msg.message);
                if (msg.id && pendingRequests.has(msg.id)) {
                    pendingRequests.get(msg.id).reject(new Error(msg.message));
                    pendingRequests.delete(msg.id);
                } else if (workerReadyReject) {
                    workerReadyReject(new Error(msg.message));
                }
            }
        };

        worker.onerror = (err) => {
            console.warn('[PhenotypeMatcher] Worker failed:', err);
            if (workerReadyReject) workerReadyReject(err);
            usingWorker = false;
            worker = null;
        };
    }

    /**
     * Verileri yükle (list.json + morphology-profiles.json)
     */
    async function loadData() {
        if (window.Worker) {
            setupWorker();
            worker.postMessage({ type: 'load', url: '../list.json' });
            try {
                await workerReady;
                return;
            } catch (err) {
                console.warn('[PhenotypeMatcher] Worker yok, fallback kullanılacak.', err);
                usingWorker = false;
                worker = null;
            }
        }
        await loadDataFallback();
    }

    /**
     * Hibrit Fenotip Eşleştirme
     * @param {Float32Array} descriptor — 128-D kullanıcı embedding
     * @param {string} sex — 'm' veya 'f'
     * @param {number} topN
     * @param {object} userMorphology — (Opsiyonel) Morphology.analyze() sonucu
     */
    async function match(descriptor, sex, topN = 25, userMorphology = null) {
        if (usingWorker && worker) {
            await workerReady;
            return matchWorker(descriptor, sex, topN, userMorphology);
        }
        return matchFallback(descriptor, sex, topN, userMorphology);
    }

    function matchWorker(descriptor, sex, topN, userMorphology) {
        return new Promise((resolve, reject) => {
            const id = ++requestId;
            pendingRequests.set(id, { resolve, reject });
            const copy = new Float32Array(descriptor);
            worker.postMessage({
                type: 'match',
                id,
                sex,
                topN,
                userMorphology, // Worker'a morfoloji verisi
                descriptor: copy
            }, [copy.buffer]);
        });
    }

    // --- Fallback (Main Thread) ---

    async function loadDataFallback() {
        // 1. list.json
        const response = await fetch('../list.json');
        const text = await response.text();
        phenotypeList = JSON.parse(text);

        // Decode embeddings
        const hexToF32Arr = (str) => new Float32Array(
            new Uint8Array([...atob(str)].map(c => c.charCodeAt(0))).buffer
        );
        const hexToF32 = (arr) => [arr[0], hexToF32Arr(arr[1]), hexToF32Arr(arr[2])];

        for (let i = 0; i < phenotypeList.length; i++) {
            const len = phenotypeList[i].length;
            if (len > 1) {
                phenotypeList[i][0] = hexToF32(phenotypeList[i][0]);
            }
            for (let j = 0; j < phenotypeList[i][len - 1].length; j++) {
                phenotypeList[i][len - 1][j] = hexToF32(phenotypeList[i][len - 1][j]);
            }
        }

        // 2. morphology-profiles.json
        try {
            const morphResp = await fetch('../app/morphology-profiles.json');
            if (morphResp.ok) {
                morphologyProfiles = await morphResp.json();
                console.log(`[PhenotypeMatcher] Morfoloji profilleri yüklendi (fallback)`);
            }
        } catch (err) {
            console.warn('[PhenotypeMatcher] Morfoloji yükleme hatası (fallback):', err);
        }

        // Extract phenotype names
        allPhenotypes = [];
        for (const group of phenotypeList) {
            const len = group.length;
            if (len > 1) {
                allPhenotypes.push({
                    name: group[0][0],
                    isBasic: true,
                    groupName: group[0][0]
                });
            }
            const groupName = len > 1 ? group[0][0] : null;
            for (const sub of group[len - 1]) {
                allPhenotypes.push({
                    name: sub[0],
                    isBasic: false,
                    groupName: groupName || sub[0]
                });
            }
        }

        console.log(`[PhenotypeMatcher] ${allPhenotypes.length} fenotip (fallback)`);
    }

    function matchFallback(descriptor, sex, topN = 25, userMorphology = null) {
        const i = (sex === 'm') ? 1 : 2;
        const results = [];
        const useHybrid = morphologyProfiles && userMorphology;

        for (const group of phenotypeList) {
            const groupLen = group.length;
            let groupName = null;

            if (groupLen > 1) {
                groupName = group[0][0];
            }

            const subtypes = group[groupLen - 1];
            for (const sub of subtypes) {
                const name = sub[0];

                // 1. Embedding
                let score = cos(sub[i], descriptor) * 100;

                // 2. Morphology
                if (useHybrid) {
                    const profileKey = `${name}_${sex}`;
                    const refProfile = morphologyProfiles[profileKey];
                    if (refProfile) {
                        const morphScore = calculateMorphologyScore(userMorphology, refProfile);
                        score = (score * 0.9) + (morphScore * 0.1);
                    }
                }

                results.push({
                    name,
                    score,
                    groupName: groupName || name,
                    isBasic: groupLen > 1,
                    sex
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topN);
    }

    function calculateMorphologyScore(user, ref) {
        let totalScore = 0;
        let maxScore = 0;

        const largeIndices = ['facialIndex', 'nasalIndex', 'jawFaceRatio', 'foreheadRatio', 'mouthFaceRatio', 'interocularRatio'];
        for (const key of largeIndices) {
            if (user.rawIndices[key] !== undefined && ref[key] !== undefined) {
                const diff = Math.abs(user.rawIndices[key] - ref[key]);
                const points = Math.max(0, 1 - (diff / 15));
                totalScore += points;
                maxScore += 1;
            }
        }

        const smallIndices = ['eyeAspectRatio', 'lipFullnessRatio'];
        for (const key of smallIndices) {
            if (user.rawIndices[key] !== undefined && ref[key] !== undefined) {
                const diff = Math.abs(user.rawIndices[key] - ref[key]);
                const points = Math.max(0, 1 - (diff / 0.15));
                totalScore += points;
                maxScore += 1;
            }
        }

        const categories = ['faceShape', 'noseType', 'eyeShape', 'lipType', 'jawType', 'foreheadType', 'cheekboneType'];
        for (const key of categories) {
            if (user.features[key] && ref[key]) {
                const userVal = user.features[key].value;
                const refVal = ref[key];
                if (userVal === refVal) {
                    totalScore += 1;
                }
                maxScore += 1;
            }
        }

        if (maxScore === 0) return 0;
        return (totalScore / maxScore) * 100;
    }

    // Yardımcı fonksiyonlar
    function getImagePath(name, sex) {
        return `../faces_lowres/${name.toLowerCase()}${sex}.jpg`;
    }

    function getBasicImagePath(name, sex) {
        return `../faces_lowres/basic/${name.toLowerCase()}${sex}.jpg`;
    }

    function getHPNetUrl(name) {
        return `https://humanphenotypes.net/basic/${name}.html`;
    }

    return {
        loadData,
        match,
        getImagePath,
        getBasicImagePath,
        getHPNetUrl
    };
})();
