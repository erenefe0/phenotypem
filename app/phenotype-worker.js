/**
 * phenotype-worker.js — Fenotip eşleştirme işçisi (Hibrit: Embedding + Morfoloji)
 * list.json'u yükler, morphology-profiles.json'u yükler.
 * Eşleştirmeyi %70 embedding + %30 morfoloji ağırlığıyla yapar.
 */

let phenotypes = [];
let morphologyProfiles = null;
let isReady = false;

self.onmessage = async (e) => {
  const msg = e.data || {};

  try {
    if (msg.type === 'load') {
      // 1. list.json yükle
      const resp = await fetch(msg.url);
      const text = await resp.text();
      const data = JSON.parse(text);
      phenotypes = decodePhenotypes(data);

      // 2. morphology-profiles.json yükle (opsiyonel)
      try {
        const morphResp = await fetch('./morphology-profiles.json');
        if (morphResp.ok) {
          morphologyProfiles = await morphResp.json();
          // console.log('[Worker] Morfoloji profilleri yüklendi.');
        } else {
          console.warn('[Worker] morphology-profiles.json bulunamadı.');
        }
      } catch (err) {
        console.warn('[Worker] Morfoloji yükleme hatası:', err);
      }

      isReady = true;
      self.postMessage({ type: 'ready', count: phenotypes.length });
      return;
    }

    if (msg.type === 'match') {
      if (!isReady) {
        self.postMessage({ type: 'error', id: msg.id, message: 'Fenotip verileri hazır değil.' });
        return;
      }
      const sex = msg.sex === 'm' ? 'm' : 'f';
      const desc = new Float32Array(msg.descriptor);
      const topN = msg.topN || 25;
      const userMorphology = msg.userMorphology || null;

      const results = match(desc, sex, topN, userMorphology);
      self.postMessage({ type: 'match', id: msg.id, results });
      return;
    }

  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message || String(err) });
  }
};

// --- Decoding & Math Helpers ---

function decodePhenotypes(list) {
  const out = [];
  for (const group of list) {
    const len = group.length;
    let groupName = null;

    if (len > 1) {
      const basic = decodeEntry(group[0]);
      groupName = basic.name;
      out.push({
        name: basic.name,
        groupName: basic.name,
        isBasic: true,
        m: basic.m,
        f: basic.f
      });
    }

    const subtypes = group[len - 1];
    for (const sub of subtypes) {
      const entry = decodeEntry(sub);
      out.push({
        name: entry.name,
        groupName: groupName || entry.name,
        isBasic: len > 1,
        m: entry.m,
        f: entry.f
      });
    }
  }
  return out;
}

function decodeEntry(arr) {
  return {
    name: arr[0],
    m: b64ToF32(arr[1]),
    f: b64ToF32(arr[2])
  };
}

function b64ToF32(str) {
  const bin = atob(str);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) return 0;
  return dot / denom;
}

// --- Matching Logic ---

function match(descriptor, sex, topN, userMorphology) {
  const results = [];
  const useHybrid = morphologyProfiles && userMorphology;

  for (const p of phenotypes) {
    const refDesc = sex === 'm' ? p.m : p.f;

    // 1. Embedding Similarity
    let score = cosine(refDesc, descriptor) * 100;

    // 2. Morphology Similarity
    if (useHybrid) {
      const profileKey = `${p.name}_${sex}`;
      const refProfile = morphologyProfiles[profileKey];
      if (refProfile) {
        const morphScore = calculateMorphologyScore(userMorphology, refProfile);
        // %70 Embedding + %30 Morfoloji
        score = (score * 0.9) + (morphScore * 0.1);
      }
    }

    results.push({
      name: p.name,
      score,
      groupName: p.groupName,
      isBasic: p.isBasic,
      sex
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

function calculateMorphologyScore(user, ref) {
  let totalScore = 0;
  let maxScore = 0;

  // A. Sayısal İndeksler (Toleranslı karşılaştırma)
  const largeIndices = ['facialIndex', 'nasalIndex', 'jawFaceRatio', 'foreheadRatio', 'mouthFaceRatio', 'interocularRatio'];
  for (const key of largeIndices) {
    if (user.rawIndices[key] !== undefined && ref[key] !== undefined) {
      const diff = Math.abs(user.rawIndices[key] - ref[key]);
      const points = Math.max(0, 1 - (diff / 15)); // 15 birim fark = 0 puan
      totalScore += points;
      maxScore += 1;
    }
  }

  const smallIndices = ['eyeAspectRatio', 'lipFullnessRatio'];
  for (const key of smallIndices) {
    if (user.rawIndices[key] !== undefined && ref[key] !== undefined) {
      const diff = Math.abs(user.rawIndices[key] - ref[key]);
      const points = Math.max(0, 1 - (diff / 0.15)); // 0.15 birim fark = 0 puan
      totalScore += points;
      maxScore += 1;
    }
  }

  // B. Kategorik Özellikler (Tam Eşleşme)
  // user.features içinde her özellik bir obje: { value: 'Oval', ... }
  // ref içinde direkt string: 'Oval'
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
