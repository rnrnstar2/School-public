# ATOM Capability Backfill

- generated_at: 2026-04-18 JST
- mode: write
- scanned_yaml_files: 576
- changed_yaml_files: 0
- replacements_total: 0
- alias_replacements: 0
- deprecated_alias_replacements: 0
- unknown_ids_retained: 0
- capability_master_aliases: 0
- capability_master_deprecated_aliases: 0

## Notes

- Only `capability_inputs` / `capability_outputs` are rewritten in this task.
- `blocker_it_solves` and `related_action_types` stay untouched in TQ-146 by design.
- YAML write-back uses `yaml` Document round-trip with `lineWidth: 0`; top-level key order is preserved, but parser-owned spacing/comments may normalize when a file is rewritten.

## Changed YAML

None.
## Unknown IDs Retained

None.
