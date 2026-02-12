import json
import os
import math
import mediapipe as mp
import cv2
from pathlib import Path

# --- Constants & Helpers ---

def dist(landmarks, i, j):
    a = landmarks[i]
    b = landmarks[j]
    # Landmarks are normalized (0-1), but z is relative to width
    # Here we treat z as normalized too, effectively working in normalized space
    return math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2 + (a.z - b.z)**2)

def analyze_morphology(landmarks):
    if not landmarks or len(landmarks) < 468:
        return None

    # --- Measurements (in normalized units) ---
    faceWidth = dist(landmarks, 234, 454)
    faceHeight = dist(landmarks, 10, 152)
    jawWidth = dist(landmarks, 172, 397)
    cheekboneWidth = dist(landmarks, 123, 352)
    foreheadWidth = dist(landmarks, 71, 301)
    noseWidth = dist(landmarks, 48, 278)
    noseLength = dist(landmarks, 6, 2)
    noseBridgeWidth = dist(landmarks, 193, 417)
    
    eyeWidthL = dist(landmarks, 33, 133)
    eyeWidthR = dist(landmarks, 362, 263)
    avgEyeWidth = (eyeWidthL + eyeWidthR) / 2
    
    eyeHeightL = dist(landmarks, 159, 145)
    eyeHeightR = dist(landmarks, 386, 374)
    avgEyeHeight = (eyeHeightL + eyeHeightR) / 2
    
    interocularDist = dist(landmarks, 133, 362)
    lipWidth = dist(landmarks, 61, 291)
    upperLipHeight = dist(landmarks, 0, 13)
    lowerLipHeight = dist(landmarks, 14, 17)
    totalLipHeight = upperLipHeight + lowerLipHeight
    foreheadHeight = dist(landmarks, 10, 6)
    
    # --- Indices ---
    if faceWidth == 0: return None
    
    facialIndex = (faceHeight / faceWidth) * 100
    nasalIndex = (noseWidth / noseLength) * 100 if noseLength > 0 else 0
    mouthFaceRatio = (lipWidth / faceWidth) * 100
    interocularRatio = (interocularDist / faceWidth) * 100
    eyeAspectRatio = avgEyeHeight / avgEyeWidth if avgEyeWidth > 0 else 0
    lipFullnessRatio = totalLipHeight / lipWidth if lipWidth > 0 else 0
    jawFaceRatio = (jawWidth / cheekboneWidth) * 100 if cheekboneWidth > 0 else 0
    foreheadRatio = (foreheadHeight / faceHeight) * 100 if faceHeight > 0 else 0

    # --- Determine Types ---
    faceShape = determine_face_shape(facialIndex, jawFaceRatio, cheekboneWidth, foreheadWidth, jawWidth)
    noseType = determine_nose_type(nasalIndex, noseBridgeWidth, noseWidth)
    eyeShape = determine_eye_shape(eyeAspectRatio, landmarks)
    lipType = determine_lip_type(lipFullnessRatio, upperLipHeight, lowerLipHeight)
    jawType = determine_jaw_type(jawFaceRatio, jawWidth, faceWidth)
    foreheadType = determine_forehead_type(foreheadRatio)
    cheekboneType = determine_cheekbone_type(cheekboneWidth, faceWidth, jawWidth)

    return {
        "rawIndices": {
            "facialIndex": facialIndex,
            "nasalIndex": nasalIndex,
            "mouthFaceRatio": mouthFaceRatio,
            "interocularRatio": interocularRatio,
            "eyeAspectRatio": eyeAspectRatio,
            "lipFullnessRatio": lipFullnessRatio,
            "jawFaceRatio": jawFaceRatio,
            "foreheadRatio": foreheadRatio
        },
        "features": {
            "faceShape": faceShape,
            "noseType": noseType,
            "eyeShape": eyeShape,
            "lipType": lipType,
            "jawType": jawType,
            "foreheadType": foreheadType,
            "cheekboneType": cheekboneType
        }
    }

# --- Classification Functions ---

def determine_face_shape(facialIndex, jawFaceRatio, cheekW, foreheadW, jawW):
    if facialIndex > 100 and jawFaceRatio < 85: return "Oblong (Uzun)"
    if facialIndex > 93 and jawFaceRatio > 90: return "Kare"
    if facialIndex < 90 and jawFaceRatio > 88: return "Yuvarlak"
    if cheekW > foreheadW * 1.05 and cheekW > jawW * 1.1: return "Elmas"
    if foreheadW > jawW * 1.15: return "Kalp"
    return "Oval"

def determine_nose_type(nasalIndex, bridgeW, noseW):
    if nasalIndex < 55: return "Leptorhin (Dar)"
    if nasalIndex < 70: return "Mesorrhin (Orta)"
    if nasalIndex < 85: return "Platyrrhin (Geniş)"
    return "Hyperplatyrrhin (Çok Geniş)"

def determine_eye_shape(ear, landmarks):
    innerCornerDepthL = abs(landmarks[133].y - landmarks[155].y)
    innerCornerDepthR = abs(landmarks[362].y - landmarks[382].y)
    avgInnerDepth = (innerCornerDepthL + innerCornerDepthR) / 2
    hasEpicanthicFold = avgInnerDepth < 0.005

    if ear < 0.22:
        if hasEpicanthicFold: return "Çekik (Monolid)"
        return "Dar / Derin"
    if ear < 0.30: return "Badem"
    return "Yuvarlak"

def determine_lip_type(ratio, upper, lower):
    if ratio < 0.15: return "İnce"
    if ratio < 0.25: return "Orta"
    return "Dolgun / Kalın"

def determine_jaw_type(ratio, jawW, faceW):
    if ratio > 92: return "Kare / Geniş"
    if ratio > 82: return "Orta"
    return "Sivri / Dar"

def determine_forehead_type(ratio):
    if ratio > 38: return "Yüksek"
    if ratio > 30: return "Orta"
    return "Düşük"

def determine_cheekbone_type(cheekW, faceW, jawW):
    aboveJaw = cheekW / jawW if jawW > 0 else 0
    if aboveJaw > 1.2: return "Çok Belirgin"
    if aboveJaw > 1.08: return "Belirgin"
    return "Düz / Normal"


# --- Main ---

def main():
    base_dir = Path(__file__).parent.parent
    faces_dir = base_dir / "faces_lowres"
    output_path = base_dir / "app" / "morphology-profiles.json"
    
    # Load list.json
    try:
        with open(base_dir / "list.json", "r", encoding="utf-8") as f:
            data_list = json.load(f)
    except Exception as e:
        print(f"Error loading list.json: {e}")
        return

    # Extract names
    names = []
    for group in data_list:
        subtypes = group[-1]
        for sub in subtypes:
            names.append(sub[0]) # Name is first element
    
    print(f"Found {len(names)} phenotypes to process.")
    
    # MediaPipe setup
    try:
        mp_face_mesh = mp.solutions.face_mesh
    except AttributeError:
        # Fallback for some environments
        try:
            from mediapipe.python.solutions import face_mesh as mp_face_mesh
        except ImportError:
            print("❌ Error: Could not import mediapipe.solutions.face_mesh.")
            print("Please ensure mediapipe is installed correctly: pip install mediapipe --upgrade")
            return

    profiles = {}
    
    print("Initializing MediaPipe FaceMesh...")
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    ) as face_mesh:
        
        sexes = ["m", "f"]
        total_images = len(names) * 2
        processed = 0
        
        for name in names:
            for sex in sexes:
                id = f"{name}_{sex}"
                filename = f"{name.lower()}{sex}.jpg"
                filepath = faces_dir / filename
                
                # Try loading image
                image = cv2.imread(str(filepath))
                if image is None:
                    # Try basic folder
                    filepath = faces_dir / "basic" / filename
                    image = cv2.imread(str(filepath))
                
                if image is None:
                    print(f"⚠️ Image not found: {filename}")
                    processed += 1
                    continue
                
                # Convert to RGB
                results = face_mesh.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                
                if results.multi_face_landmarks:
                    landmarks = results.multi_face_landmarks[0].landmark
                    # landmarks is a list of objects with x, y, z
                    
                    analysis = analyze_morphology(landmarks)
                    
                    if analysis:
                        profiles[id] = {
                            **analysis["rawIndices"],
                            "faceShape": analysis["features"]["faceShape"],
                            "noseType": analysis["features"]["noseType"],
                            "eyeShape": analysis["features"]["eyeShape"],
                            "lipType": analysis["features"]["lipType"],
                            "jawType": analysis["features"]["jawType"],
                            "foreheadType": analysis["features"]["foreheadType"],
                            "cheekboneType": analysis["features"]["cheekboneType"]
                        }
                        # print(f"✅ Processed {id}")
                else:
                    print(f"❌ No face detected: {id}")
                
                processed += 1
                if processed % 10 == 0:
                    print(f"Progress: {processed}/{total_images}")

    # Save output
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2)
    
    print(f"\n✨ Generation complete! Saved {len(profiles)} profiles to {output_path}")

if __name__ == "__main__":
    main()
