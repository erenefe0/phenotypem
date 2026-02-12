/**
 * morphology.js — Yüz Morfoloji Analiz Modülü
 * MediaPipe Face Mesh 468 landmark noktası kullanarak yüz ölçümleri yapar.
 */

const Morphology = (() => {

  // Landmark arası Öklid mesafesi
  function dist(landmarks, i, j) {
    const a = landmarks[i], b = landmarks[j];
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
  }

  // İki nokta arasındaki orta nokta
  function midpoint(landmarks, i, j) {
    const a = landmarks[i], b = landmarks[j];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /**
   * Ana analiz fonksiyonu
   * @param {Array} landmarks — MediaPipe Face Mesh landmarks (468 nokta)
   * @returns {Object} Morfoloji analiz sonuçları
   */
  function analyze(landmarks) {
    if (!landmarks || landmarks.length < 468) {
      return null;
    }

    // ============================
    // Temel Ölçümler
    // ============================

    // Yüz genişliği (şakaktan şakağa)
    const faceWidth = dist(landmarks, 234, 454);

    // Yüz uzunluğu (alın tepesi - çene ucu)
    const faceHeight = dist(landmarks, 10, 152);

    // Çene genişliği
    const jawWidth = dist(landmarks, 172, 397);

    // Elmacık kemik genişliği
    const cheekboneWidth = dist(landmarks, 123, 352);

    // Alın genişliği
    const foreheadWidth = dist(landmarks, 71, 301);

    // Burun genişliği (burun kanatları)
    const noseWidth = dist(landmarks, 48, 278);

    // Burun uzunluğu (burun köprüsü - burun ucu)
    const noseLength = dist(landmarks, 6, 2);

    // Burun köprüsü genişliği (üst kısım)
    const noseBridgeWidth = dist(landmarks, 193, 417);

    // Göz genişliği (sol)
    const eyeWidthL = dist(landmarks, 33, 133);
    // Göz genişliği (sağ)
    const eyeWidthR = dist(landmarks, 362, 263);
    const avgEyeWidth = (eyeWidthL + eyeWidthR) / 2;

    // Göz yüksekliği (sol)
    const eyeHeightL = dist(landmarks, 159, 145);
    // Göz yüksekliği (sağ)
    const eyeHeightR = dist(landmarks, 386, 374);
    const avgEyeHeight = (eyeHeightL + eyeHeightR) / 2;

    // Gözler arası mesafe
    const interocularDist = dist(landmarks, 133, 362);

    // Dudak genişliği
    const lipWidth = dist(landmarks, 61, 291);

    // Üst dudak kalınlığı
    const upperLipHeight = dist(landmarks, 0, 13);

    // Alt dudak kalınlığı
    const lowerLipHeight = dist(landmarks, 14, 17);

    // Toplam dudak kalınlığı
    const totalLipHeight = upperLipHeight + lowerLipHeight;

    // Alın yüksekliği (alın tepesi - kaş ortası)
    const foreheadHeight = dist(landmarks, 10, 6);

    // Alt yüz uzunluğu (burun ucu - çene)
    const lowerFaceHeight = dist(landmarks, 2, 152);

    // Orta yüz uzunluğu (kaşlar arası - burun ucu)
    const midFaceHeight = dist(landmarks, 6, 2);

    // ============================
    // Antropometrik İndeksler
    // ============================

    // Facial Index (yüz uzunluğu / yüz genişliği * 100)
    const facialIndex = (faceHeight / faceWidth) * 100;

    // Nasal Index (burun genişliği / burun uzunluğu * 100)
    const nasalIndex = (noseWidth / noseLength) * 100;

    // Mouth-Face Width Ratio
    const mouthFaceRatio = (lipWidth / faceWidth) * 100;

    // Interocular-Face Ratio
    const interocularRatio = (interocularDist / faceWidth) * 100;

    // Eye Aspect Ratio
    const eyeAspectRatio = avgEyeHeight / avgEyeWidth;

    // Lip Fullness Ratio
    const lipFullnessRatio = totalLipHeight / lipWidth;

    // Jaw-Face Width Ratio
    const jawFaceRatio = (jawWidth / cheekboneWidth) * 100;

    // Forehead-Face Ratio
    const foreheadRatio = (foreheadHeight / faceHeight) * 100;

    // ============================
    // Şekil ve Tip Tespiti
    // ============================

    // Yüz Şekli
    const faceShape = determineFaceShape(facialIndex, jawFaceRatio, cheekboneWidth, foreheadWidth, jawWidth);

    // Burun Tipi
    const noseType = determineNoseType(nasalIndex, noseBridgeWidth, noseWidth);

    // Göz Şekli
    const eyeShape = determineEyeShape(eyeAspectRatio, landmarks);

    // Dudak Tipi
    const lipType = determineLipType(lipFullnessRatio, upperLipHeight, lowerLipHeight);

    // Çene Tipi
    const jawType = determineJawType(jawFaceRatio, jawWidth, faceWidth);

    // Alın Tipi
    const foreheadType = determineForeheadType(foreheadRatio);

    // Elmacık Kemikleri
    const cheekboneType = determineCheekboneType(cheekboneWidth, faceWidth, jawWidth);

    return {
      rawIndices: {
        facialIndex, nasalIndex, mouthFaceRatio, interocularRatio,
        eyeAspectRatio, lipFullnessRatio, jawFaceRatio, foreheadRatio
      },
      measurements: {
        faceWidth, faceHeight, jawWidth, cheekboneWidth, foreheadWidth,
        noseWidth, noseLength, avgEyeWidth, avgEyeHeight, interocularDist,
        lipWidth, upperLipHeight, lowerLipHeight, totalLipHeight, foreheadHeight
      },
      indices: {
        facialIndex: { value: facialIndex.toFixed(1), label: 'label_facialIndex', descKey: classifyFacialIndex(facialIndex), params: { val: facialIndex.toFixed(1) } },
        nasalIndex: { value: nasalIndex.toFixed(1), label: 'label_nasalIndex', descKey: classifyNasalIndex(nasalIndex), params: { val: nasalIndex.toFixed(1) } },
        mouthFaceRatio: { value: mouthFaceRatio.toFixed(1), label: 'label_mouthFaceRatio', descKey: 'desc_percent', params: { val: mouthFaceRatio.toFixed(1) } },
        interocularRatio: { value: interocularRatio.toFixed(1), label: 'label_interocularRatio', descKey: 'desc_percent', params: { val: interocularRatio.toFixed(1) } },
      },
      features: {
        faceShape: { label: 'label_faceShape', ...faceShape, icon: '🔷' },
        noseType: { label: 'label_noseType', ...noseType, icon: '👃' },
        eyeShape: { label: 'label_eyeShape', ...eyeShape, icon: '👁️' },
        lipType: { label: 'label_lipType', ...lipType, icon: '👄' },
        jawType: { label: 'label_jawType', ...jawType, icon: '🦴' },
        foreheadType: { label: 'label_foreheadType', ...foreheadType, icon: '🧠' },
        cheekboneType: { label: 'label_cheekboneType', ...cheekboneType, icon: '💎' },
      }
    };
  }

  // --- Sınıflandırma Fonksiyonları ---

  function determineFaceShape(facialIndex, jawFaceRatio, cheekW, foreheadW, jawW) {
    if (facialIndex > 100 && jawFaceRatio < 85) return { valueKey: 'val_oblong', detailKey: 'detail_oblong', params: { val: facialIndex.toFixed(1) } };
    if (facialIndex > 93 && jawFaceRatio > 90) return { valueKey: 'val_square', detailKey: 'detail_square' };
    if (facialIndex < 90 && jawFaceRatio > 88) return { valueKey: 'val_round', detailKey: 'detail_round' };
    if (cheekW > foreheadW * 1.05 && cheekW > jawW * 1.1) return { valueKey: 'val_diamond', detailKey: 'detail_diamond' };
    if (foreheadW > jawW * 1.15) return { valueKey: 'val_heart', detailKey: 'detail_heart' };
    return { valueKey: 'val_oval', detailKey: 'detail_oval' };
  }

  function determineNoseType(nasalIndex, bridgeW, noseW) {
    if (nasalIndex < 55) return { valueKey: 'val_leptorrhin', detailKey: 'detail_leptorrhin', params: { val: nasalIndex.toFixed(1) } };
    if (nasalIndex < 70) return { valueKey: 'val_mesorrhin', detailKey: 'detail_mesorrhin', params: { val: nasalIndex.toFixed(1) } };
    if (nasalIndex < 85) return { valueKey: 'val_platyrrhin', detailKey: 'detail_platyrrhin', params: { val: nasalIndex.toFixed(1) } };
    return { valueKey: 'val_hyperplatyrrhin', detailKey: 'detail_hyperplatyrrhin', params: { val: nasalIndex.toFixed(1) } };
  }

  function determineEyeShape(ear, landmarks) {
    const innerCornerDepthL = Math.abs(landmarks[133].y - landmarks[155].y);
    const innerCornerDepthR = Math.abs(landmarks[362].y - landmarks[382].y);
    const avgInnerDepth = (innerCornerDepthL + innerCornerDepthR) / 2;
    const hasEpicanthicFold = avgInnerDepth < 0.005;

    if (ear < 0.22) {
      if (hasEpicanthicFold) return { valueKey: 'val_monolid', detailKey: 'detail_monolid' };
      return { valueKey: 'val_narrow', detailKey: 'detail_narrow', params: { val: ear.toFixed(3) } };
    }
    if (ear < 0.30) {
      return { valueKey: 'val_almond', detailKey: 'detail_almond', params: { val: ear.toFixed(3) } };
    }
    return { valueKey: 'val_round_eye', detailKey: 'detail_round_eye', params: { val: ear.toFixed(3) } };
  }

  function determineLipType(ratio, upper, lower) {
    const balance = upper / lower;
    let balanceKey = 'bal_balanced';
    if (balance < 0.6) balanceKey = 'bal_lower';
    else if (balance > 0.9) balanceKey = 'bal_upper';

    const pct = (ratio * 100).toFixed(1);
    if (ratio < 0.15) return { valueKey: 'val_thin', detailKey: 'detail_lip', params: { val: pct, bal: balanceKey } };
    if (ratio < 0.25) return { valueKey: 'val_medium', detailKey: 'detail_lip', params: { val: pct, bal: balanceKey } };
    return { valueKey: 'val_full', detailKey: 'detail_lip', params: { val: pct, bal: balanceKey } };
  }

  function determineJawType(jawFaceRatio, jawW, faceW) {
    const val = jawFaceRatio.toFixed(1);
    if (jawFaceRatio > 92) return { valueKey: 'val_square_jaw', detailKey: 'detail_jaw_square', params: { val } };
    if (jawFaceRatio > 82) return { valueKey: 'val_medium_jaw', detailKey: 'detail_jaw_medium', params: { val } };
    return { valueKey: 'val_narrow_jaw', detailKey: 'detail_jaw_narrow', params: { val } };
  }

  function determineForeheadType(ratio) {
    const val = ratio.toFixed(1);
    if (ratio > 38) return { valueKey: 'val_high', detailKey: 'detail_forehead', params: { val } };
    if (ratio > 30) return { valueKey: 'val_medium_forehead', detailKey: 'detail_forehead', params: { val } };
    return { valueKey: 'val_low', detailKey: 'detail_forehead', params: { val } };
  }

  function determineCheekboneType(cheekW, faceW, jawW) {
    const aboveJaw = cheekW / jawW;
    if (aboveJaw > 1.2) return { valueKey: 'val_very_prominent', detailKey: 'detail_cheek_very_prominent' };
    if (aboveJaw > 1.08) return { valueKey: 'val_prominent', detailKey: 'detail_cheek_prominent' };
    return { valueKey: 'val_flat', detailKey: 'detail_cheek_flat' };
  }

  function classifyFacialIndex(fi) {
    if (fi > 97) return 'class_hyperleptoprosop';
    if (fi > 93) return 'class_leptoprosop';
    if (fi > 88) return 'class_mesoprosop';
    if (fi > 83) return 'class_euryprosop';
    return 'class_hypereuryprosop';
  }

  function classifyNasalIndex(ni) {
    if (ni < 55) return 'class_leptorrhin';
    if (ni < 70) return 'class_mesorrhin';
    if (ni < 85) return 'class_platyrrhin';
    return 'class_hyperplatyrrhin';
  }

  return { analyze };
})();
window.Morphology = Morphology;
