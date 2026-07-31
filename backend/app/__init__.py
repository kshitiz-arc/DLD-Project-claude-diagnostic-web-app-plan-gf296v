"""HYPERION backend — FastAPI + SQLModel + SQLite (WAL).

Serves the Class 7 diagnostic: identity provisioning, item delivery, the
append-only response event-store, and role-scoped teacher aggregates. All
scoring is delegated to the ``diagnostic_scoring`` package (the source of
truth), so the server and the research pipeline never diverge.
"""
