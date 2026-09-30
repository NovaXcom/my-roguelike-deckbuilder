"""Run: python3 -m unittest scripts/test_audio_dsp.py  (needs numpy)"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import numpy as np  # noqa: E402
import generate_audio as g  # noqa: E402


def band_db(x, sr, f0):
    spec = np.abs(np.fft.rfft(x)) / len(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return 20 * np.log10(spec[np.argmin(np.abs(f - f0))] + 1e-12)


class DspTests(unittest.TestCase):
    sr = 32000

    def test_eq_cuts_200_and_boosts_highs(self):
        t = np.arange(self.sr * 2) / self.sr
        x = (np.sin(2 * np.pi * 200 * t) + np.sin(2 * np.pi * 1000 * t) + np.sin(2 * np.pi * 9000 * t)).astype("float32")
        y = g.apply_eq(x, self.sr)
        self.assertLess(band_db(y, self.sr, 200) - band_db(x, self.sr, 200), -3.0)
        self.assertLess(abs(band_db(y, self.sr, 1000) - band_db(x, self.sr, 1000)), 1.0)
        self.assertGreater(band_db(y, self.sr, 9000) - band_db(x, self.sr, 9000), 2.0)

    def test_postprocess_normalises_peak(self):
        x = (np.random.RandomState(0).randn(self.sr) * 0.01).astype("float32")
        for loop in (True, False):
            y = g.postprocess(x, self.sr, loop)
            self.assertAlmostEqual(float(np.abs(y).max()), g.PEAK_TARGET, places=3)

    def test_ui_is_44k_clean_and_deterministic(self):
        for i in ("ui_click_1", "ui_click_2", "ui_select", "ui_cancel"):
            a, sr = g.synth_ui(i)
            b, _ = g.synth_ui(i)
            self.assertEqual(sr, 44100)
            self.assertTrue(np.array_equal(a, b))
            self.assertLessEqual(float(np.abs(a).max()), 0.71)
            self.assertLess(abs(float(a[0])), 0.01)      # starts at ~0: no click
            self.assertLess(abs(float(a[-1])), 0.01)     # ends at ~0
        self.assertFalse(np.array_equal(g.synth_ui("ui_click_1")[0], g.synth_ui("ui_click_2")[0]))


if __name__ == "__main__":
    unittest.main()
