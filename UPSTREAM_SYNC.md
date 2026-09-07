# Upstream sync provenance

This fork periodically imports reviewed changes from `kalepail/aisonggenerator-worker` rather than allowing the two histories to drift silently.

The September 2026 sync brings the fork forward from common ancestor `70a28994` through upstream `18c4459d`, including API endpoint fixes, structured Cloudflare AI output handling, the v4 song model bump, and preservation of missing song-status rows.

Local fork changes remain reviewable independently. Future syncs should record the upstream range in their pull request and preserve original authorship.
