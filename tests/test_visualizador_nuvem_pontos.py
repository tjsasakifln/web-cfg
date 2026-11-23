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
        self.assertIn("vendor/potree-1.8.2/potree.min.js", html)
        self.assertIn("fixture/cloud.js", (ROUTE / "viewer.js").read_text(encoding="utf-8"))

    def test_fixture_geometry_and_reference_are_reproducible(self):
        metadata = json.loads((ROUTE / "fixture" / "cloud.js").read_text(encoding="utf-8"))
        binary = (ROUTE / "fixture" / "data" / "r" / "r.bin").read_bytes()
        hierarchy = (ROUTE / "fixture" / "data" / "r" / "r.hrc").read_bytes()

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
            "potree.min.js": "c53cd9954c25746e286155fc76ab3c0de8b8f7efd3f9a37c6e74b8d8d7bddd18",
            "jquery-3.1.1.min.js": "1cf30e59d21d4ae560af7143f5913efcc8222bcaa4fcc7508eb802b5faa9e94e",
            "tween.min.js": "13ceb8b6e922d1e1f956b0a541f26e97c9328769fe42e6e6d82b7c69f7d013f9",
            "proj4.js": "3744bf6f4563dc03f246454cfdc0e7fdd556ef14492baf99da0bfe1563b44d8d",
            "BinaryHeap.js": "a77f4c6948e128d8578a2116a0003480ea05a3430cb978611ca6b4307b125a82",
            "workers/BinaryDecoderWorker.js": "ccc78118e38f3464e1254fede611d7a4fe5a1abe314472d15ce17eca19b9143c",
        }
        vendor = ROUTE / "vendor" / "potree-1.8.2"
        for relative, digest in expected.items():
            with self.subTest(relative=relative):
                self.assertEqual(hashlib.sha256((vendor / relative).read_bytes()).hexdigest(), digest)
        for license_name in ("LICENSE-Potree.txt", "LICENSE-jQuery.txt", "LICENSE-Tween.txt", "LICENSE-Proj4js.md", "LICENSE-BinaryHeap.txt"):
            self.assertTrue((vendor / license_name).is_file())


if __name__ == "__main__":
    unittest.main()
