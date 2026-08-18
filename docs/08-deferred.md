# Deferred beyond V1 (per D10)

Not built, but the V1 schema is shaped so these need no destructive migration:

- **Document Vault** — deferred deliberately (A7). Storing minors' identity documents needs your
  decisions on encryption at rest, retention, deletion guarantees and jurisdiction first.
- **Parent / mentor sharing** — `MentorLink` + per-field `DocumentShare` grants, student-controlled,
  nothing shared by default.
- **AI advisor + natural-language conversational search** — interface and grounding layer are built
  in V1; live model calls activate with a key and a plan gate.
- **Opportunity roadmap / goal stacking** — `Goal`, `PathwayStep`, `RoadmapItem`.
- **Achievements & progress**, **analytics**, **email digests**, **subscription billing**.
