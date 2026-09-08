# Unified projects and cancellable tasks

`packages/project` is an independent JSON-only domain library. Schema 2 (`formalyth-project`) contains the version-1 modeling document plus assembly components/joints, manufacturing setups/operations, additive jobs, sheet plans, analysis studies, drawing sheets, electronics boards/circuits, view state, and extension data. `Project.parse` migrates the prior native modeling format without discarding its manufacturing, drawing or board fields.

Mutations use synchronous `transact(label, draft => ...)`. Committed state is deeply immutable. Invalid input and failed mutations do not change the document or undo stacks. Undo/redo are cross-domain and bounded by both history count and estimated serialized memory. Snapshot cloning and validation are currently proportional to project size; large mesh documents need future structural-sharing work.

`put(domain, collection, record, {linked:true})` associates output with the current geometry version. `isStale` detects changed geometry or deleted source features. Appearance and view changes do not invalidate geometry. Undo restores both geometry and result validity. Stale toolpaths must not be silently posted.

`ProjectStorage` atomically stores entire serialized projects in IndexedDB and serializes save requests. User-initiated file export remains the portable backup mechanism.

`packages/tasks` is a bounded FIFO Worker queue with keyed latest-request coalescing, AbortSignal cancellation, explicit disposal, crash handling, and timeouts. Hard cancellation terminates the Worker, including a synchronous numerical operation, and restarts it for subsequent tasks. Late messages from old workers are ignored. `transferableCopy` clones outgoing arrays before transfer, so cached geometry is never detached.

Tests cover the above behaviors, including rollback, invalid values, cyclic references, duplicate records, migration, transfer ownership, worker crashes, queue budgets and late-result suppression.
