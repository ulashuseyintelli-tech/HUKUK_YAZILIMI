# Apply to engine_v28.rules.models.Rule (optional)

Add field:
    pinned_version = models.IntegerField(null=True, blank=True)

Meaning:
- If pinned_version is set, loader must load that exact revision version (if exists),
  instead of latest.

You also may add to RuleRevision:
    is_disabled = models.BooleanField(default=False)

If you add is_disabled, loader should ignore disabled revisions.

See loader_patch.py for the exact code change.
