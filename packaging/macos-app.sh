#!/bin/sh
# Wrap the PyInstaller program in "LPVR Bike Shop.app" so it shows up in Spotlight and
# Launchpad with the logo icon. The app opens the program in a Terminal window, so the
# server log stays visible and closing the window stops the site.
#   packaging/macos-app.sh <program> <version> <output folder>
set -e
PROGRAM="$1"; VERSION="$2"; OUT="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$OUT/LPVR Bike Shop.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$PROGRAM" "$APP/Contents/Resources/LPVR-Bike-Shop"

ICONSET="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$HERE/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$HERE/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"

cat > "$APP/Contents/MacOS/launch" <<'EOF'
#!/bin/sh
exec open -a Terminal "$(cd "$(dirname "$0")/../Resources" && pwd)/LPVR-Bike-Shop"
EOF
chmod +x "$APP/Contents/MacOS/launch" "$APP/Contents/Resources/LPVR-Bike-Shop"

cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>LPVR Bike Shop</string>
  <key>CFBundleDisplayName</key><string>LPVR Bike Shop</string>
  <key>CFBundleIdentifier</key><string>com.github.yinluo2903.lpvr-bike-shop</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
</dict></plist>
EOF
echo "Built $APP"
