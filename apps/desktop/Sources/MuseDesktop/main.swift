import AppKit
import Foundation

// Headless preview: `MuseDesktop --render <path> [scale]` draws the Muse sprite
// to a PNG and exits (no window) — a faithful visual check of the art.
let arguments = CommandLine.arguments
if let flag = arguments.firstIndex(of: "--render"), flag + 1 < arguments.count {
    let path = arguments[flag + 1]
    let scale = (flag + 2 < arguments.count ? Int(arguments[flag + 2]) : nil) ?? 18
    do {
        try SpriteRenderer.renderPNG(to: URL(fileURLWithPath: path), scale: scale)
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("render failed: \(error)\n".utf8))
        exit(1)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: FloatingPanel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let panel = FloatingPanel()
        panel.orderFrontRegardless()
        self.panel = panel
    }
}

let app = NSApplication.shared
// `.accessory` → no Dock icon and no menu bar; it lives as a floating companion.
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
