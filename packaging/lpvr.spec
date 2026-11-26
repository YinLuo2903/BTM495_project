# PyInstaller spec: one double-click program that runs the local website.
# Build from the repository root after `npm run build` in frontend/:
#     pyinstaller packaging/lpvr.spec
# The release workflow (.github/workflows/release.yml) runs exactly this on each OS.
from pathlib import Path

ROOT = Path(SPECPATH).parent

# Files the server reads at run time, at the same relative paths as in the repository.
datas = [
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT / "frontend" / "assets"), "frontend/assets"),
    (str(ROOT / "database" / "schema.sql"), "database"),
    (str(ROOT / "database" / "Mockdata"), "database/Mockdata"),
]

a = Analysis([str(ROOT / "run_local_website.py")], pathex=[str(ROOT)], datas=datas)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="LPVR-Bike-Shop",
    console=True,  # the window shows the server log; closing it stops the site
    icon=str(SPECPATH + "/icon.png"),  # Windows .exe icon (PyInstaller converts it with Pillow)
    upx=False,
)
