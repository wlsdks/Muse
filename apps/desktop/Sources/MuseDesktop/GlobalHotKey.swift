import AppKit
import Carbon.HIToolbox

/// A system-wide hotkey via Carbon `RegisterEventHotKey`. Chosen over
/// `NSEvent.addGlobalMonitorForEvents` because the Carbon path needs NO
/// Accessibility permission (the global monitor silently never fires until the
/// user grants it). Default combo is Control-Option-Space: two real modifiers,
/// avoiding the macOS 15+ bug where an Option-only hotkey can fail to fire.
final class GlobalHotKey {
    private static var registry: [UInt32: () -> Void] = [:]
    private static var nextID: UInt32 = 1
    private static var handlerInstalled = false

    private var ref: EventHotKeyRef?
    private let id: UInt32

    /// keyCode is a Carbon virtual key (e.g. `UInt32(kVK_Space)`); modifiers are
    /// Carbon masks (`controlKey`, `optionKey`, `cmdKey`, `shiftKey`).
    init?(keyCode: UInt32, modifiers: UInt32, onFire: @escaping () -> Void) {
        GlobalHotKey.installHandlerIfNeeded()
        id = GlobalHotKey.nextID
        GlobalHotKey.nextID += 1
        GlobalHotKey.registry[id] = onFire
        let hotKeyID = EventHotKeyID(signature: OSType(0x4D555345), id: id) // 'MUSE'
        let status = RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &ref)
        if status != noErr {
            GlobalHotKey.registry[id] = nil
            return nil
        }
    }

    private static func installHandlerIfNeeded() {
        guard !handlerInstalled else { return }
        handlerInstalled = true
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { (_, event, _) -> OSStatus in
            var hkID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &hkID)
            GlobalHotKey.registry[hkID.id]?()
            return noErr
        }, 1, &spec, nil, nil)
    }

    deinit {
        if let ref { UnregisterEventHotKey(ref) }
        GlobalHotKey.registry[id] = nil
    }
}
