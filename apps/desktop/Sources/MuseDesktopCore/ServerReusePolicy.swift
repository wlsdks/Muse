import Foundation

/// Decides whether an already-healthy server on a candidate port may be
/// reused, or is a STALE instance that must be replaced. A stale bundled
/// server holding the port silently serves an old API (missing routes,
/// old daemons) while looking perfectly healthy — the reuse check must
/// compare build identity, not just liveness.
public enum ServerReusePolicy {
    /// - bundledBuildId: the id baked into THIS app bundle's muse-api-bin
    ///   (Info.plist MuseBuildId); nil on a bare `swift run` (no bundle) —
    ///   then any healthy server is acceptable because we have nothing to
    ///   spawn instead.
    /// - reportedVersion: the `version` field of the candidate's
    ///   /api/health; nil for pre-version servers.
    public static func shouldReuse(bundledBuildId: String?, reportedVersion: String?) -> Bool {
        guard let bundled = bundledBuildId, !bundled.isEmpty else { return true }
        guard let reported = reportedVersion, !reported.isEmpty else { return false }
        // "dev" is a developer-run source server — reusing it is the
        // deliberate override that lets the app point at work-in-progress.
        if reported == "dev" { return true }
        return reported == bundled
    }
}
