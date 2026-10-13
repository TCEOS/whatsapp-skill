"""Offline installer regressions. Run: python scripts/tests/install.test.py"""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("skill_installer", Path(__file__).parents[1] / "install-skill.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / "source" / "baileys-skill"
        self.source.mkdir(parents=True)
        self.previous_root = installer.ROOT
        installer.ROOT = self.source
        self.addCleanup(setattr, installer, "ROOT", self.previous_root)
        (self.source / "SKILL.md").write_text("fixture", encoding="utf8")
        (self.source / "scripts").mkdir()
        (self.source / "scripts" / "example.mjs").write_text("updated", encoding="utf8")

    def test_refuses_source_and_child_destinations_before_writing(self):
        for target in (self.source.parent, self.source / "nested"):
            with self.assertRaises(ValueError):
                installer.install(target)
        self.assertEqual((self.source / "scripts" / "example.mjs").read_text(), "updated")
        self.assertFalse((self.source / "nested").exists())

    def test_upgrade_preserves_local_runtime_and_excludes_private_source(self):
        target = self.base / "installed"
        destination = target / "baileys-skill"
        for directory in ("data", "scripts/node_modules"):
            existing = destination / directory
            existing.mkdir(parents=True)
            (existing / "keep.txt").write_text("keep", encoding="utf8")
            source_private = self.source / directory
            source_private.mkdir(parents=True)
            (source_private / "do-not-copy.txt").write_text("private", encoding="utf8")
        result = installer.install(target)
        self.assertEqual(result, destination)
        self.assertEqual((destination / "scripts/example.mjs").read_text(), "updated")
        for directory in ("data", "scripts/node_modules"):
            self.assertEqual((destination / directory / "keep.txt").read_text(), "keep")
            self.assertFalse((destination / directory / "do-not-copy.txt").exists())

    def test_refuses_destination_link_before_any_copy(self):
        target = self.base / "installed"
        destination = target / "baileys-skill"
        outside = self.base / "outside"
        destination.mkdir(parents=True)
        outside.mkdir()
        try:
            (destination / "scripts").symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"Symbolic links unavailable: {error}")
        with self.assertRaises(ValueError):
            installer.install(target)
        self.assertFalse((destination / "SKILL.md").exists())
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
