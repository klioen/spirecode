# Intent

The global Task home currently exposes only a filtered, paginated list. Add a global Dashboard above the list controls so users can understand total workload, attention pressure, recent throughput, cumulative execution cost, and status distribution without changing existing Task workflows.

The Dashboard must remain independent of list pagination, search, project filtering, and list view selection. It must preserve the Main/Renderer trust boundary: SQLite and Pi session files stay in Main, and Renderer receives only a bounded aggregate DTO.

## Risk

High risk: this change adds a cross-process IPC contract and reads durable Task/session data. The confirmed Task intake explicitly authorizes this narrow Dashboard command and requires exact-field validation, bounded aggregation, and no schema or generic capability expansion.
