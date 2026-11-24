import hashlib
import json
import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "ferramentas" / "visualizador-nuvem-pontos"


class PointCloudViewerTests(unittest.TestCase):
    def test_route_is_static_and_local_only(self):
        html = (ROUTE / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('type="file"', html)
        self.assertNotIn("cdn.", html.lower())
        self.assertNotIn("unpkg", html.lower())
        self.assertNotIn("vendor/potree-1.8.2/potree.min.js", html)
        self.assertIn('src="carregar.mjs"', html)
        loader = (ROUTE / "carregar.mjs").read_text(encoding="utf-8")
        self.assertIn("./vendor/potree-1.8.2/potree.min.js", loader)
        self.assertIn("button.addEventListener('click'", loader)
        self.assertIn("fixture/cloud.js", (ROUTE / "viewer.js").read_text(encoding="utf-8"))

    def test_fixture_geometry_and_reference_are_reproducible(self):
        metadata = json.loads((ROUTE / "fixture" / "cloud.js").read_text(encoding="utf-8"))
        binary = (ROUTE / "fixture" / "octree" / "r" / "r.bin").read_bytes()
        hierarchy = (ROUTE / "fixture" / "octree" / "r" / "r.hrc").read_bytes()

        self.assertEqual(metadata["version"], "1.7")
        self.assertEqual(metadata["scale"], 0.001)
        self.assertEqual(metadata["points"], 2242)
        self.assertEqual(len(binary), metadata["points"] * 16)
        self.assertEqual(hierarchy, b"\x00" + struct.pack("<I", metadata["points"]))

        coordinates = []
        for offset in range(0, len(binary), 16):
            x, y, z = struct.unpack_from("<III", binary, offset)
            coordinates.append((x / 1000, y / 1000, z / 1000))
        self.assertEqual(
            (min(x for x, _, _ in coordinates), min(y for _, y, _ in coordinates), min(z for _, _, z in coordinates)),
            (0, 0, 0),
        )
        self.assertEqual(
            (max(x for x, _, _ in coordinates), max(y for _, y, _ in coordinates), max(z for _, _, z in coordinates)),
            (12, 8, 4),
        )
        self.assertIn((1, 1, 0), coordinates)
        self.assertIn((11, 1, 0), coordinates)

    def test_vendored_runtime_matches_recorded_build(self):
        expected = {
            "potree.min.js": "7482303cc30bb6897c695edf935f9e2faa23acadf378fb4ba5f0b3d6babcd140",
            "jquery-3.7.1.min.js": "fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a",
            "tween.min.js": "eeb205d3d1ba5c21728424a712849a9190d61fabbf3f57b54c249aa2c4184ef8",
            "proj4.js": "3744bf6f4563dc03f246454cfdc0e7fdd556ef14492baf99da0bfe1563b44d8d",
            "BinaryHeap.js": "fd33ecd3327fdfc16dc316cc8f7b05b27da30388be86fae259a0f17f9e8d4417",
            "workers/BinaryDecoderWorker.js": "bbac3e5002670a49cd78020769e21b827a1cd34fdea1d1e9753e7a724efa9f01",
            "controls.css": "0d8513a50e088fb19e48acd1f1cb3577cb46ab2eea7d4b864d6bcab651323a41",
            "potree.css": "de5e8aa6ad859b86ee0b3237ecb1caa5739b7a6b47c60ef3f1c909d9b7d56164",
        }
        vendor = ROUTE / "vendor" / "potree-1.8.2"
        for relative, digest in expected.items():
            with self.subTest(relative=relative):
                canonical_bytes = (vendor / relative).read_bytes().replace(b"\r\n", b"\n")
                self.assertEqual(hashlib.sha256(canonical_bytes).hexdigest(), digest)
        for license_name in ("LICENSE-Potree.txt", "LICENSE-jQuery.txt", "LICENSE-Tween.txt", "LICENSE-Proj4js.md", "LICENSE-BinaryHeap.txt"):
            self.assertTrue((vendor / license_name).is_file())


if __name__ == "__main__":
    unittest.main()
