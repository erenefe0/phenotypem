import sys
import os
from unittest.mock import MagicMock

# Mock dependencies before importing the module under test
sys.modules["mediapipe"] = MagicMock()
sys.modules["cv2"] = MagicMock()
sys.modules["numpy"] = MagicMock()

# Add the current directory to sys.path to ensure tools can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from tools.generate_profiles import determine_jaw_type  # noqa: E402
import pytest  # noqa: E402

@pytest.mark.parametrize("ratio, expected", [
    (93, "Kare / Geniş"),    # Above 92
    (92.1, "Kare / Geniş"),  # Slightly above 92
    (92, "Orta"),            # Exactly 92 (should be Orta since 92 > 92 is False)
    (91.9, "Orta"),          # Slightly below 92
    (83, "Orta"),            # Above 82
    (82.1, "Orta"),          # Slightly above 82
    (82, "Sivri / Dar"),     # Exactly 82 (should be Sivri / Dar since 82 > 82 is False)
    (81.9, "Sivri / Dar"),   # Slightly below 82
    (70, "Sivri / Dar"),     # Well below 82
])
def test_determine_jaw_type(ratio, expected):
    # jawW and faceW are currently unused but required by the signature
    assert determine_jaw_type(ratio, 0, 0) == expected
