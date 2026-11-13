# UI primitives

The primitives here are registry output and are re-addable with `shadcn add --overwrite`. Anything hand-edited carries a `LOCAL MODIFICATIONS` comment at the top of the file saying what changed and why, so an update can re-apply it — currently `table.tsx` and `pagination.tsx`.

Auditing that claim means re-adding every primitive with the pinned `shadcn` dev dependency into a clean project carrying only `components.json`, `tsconfig.json` and `app/globals.css`, then diffing Biome-formatted output against the repo — files drift from the registry without local intent, and only a diff separates those from real modifications.
