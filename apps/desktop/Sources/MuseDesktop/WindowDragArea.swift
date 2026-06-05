import SwiftUI

/// A transparent layer that drags the window on mouse-down — placed behind the
/// SwiftUI content so empty areas reliably move the companion. (An NSHostingView
/// can swallow the background mouse events that `isMovableByWindowBackground`
/// relies on, so we drive the drag explicitly.)
struct WindowDragArea: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { DragView() }
    func updateNSView(_ nsView: NSView, context: Context) {}

    final class DragView: NSView {
        override func mouseDown(with event: NSEvent) {
            window?.performDrag(with: event)
        }
    }
}
