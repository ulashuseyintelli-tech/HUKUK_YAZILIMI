# Patch to engine_v28.rules.loader.RuleLoader.load_active

Inside loop over enabled rules:

    if r.pinned_version is not None:
        latest_ver = r.pinned_version
    else:
        latest_ver = r.revisions.aggregate(m=Max("version"))["m"]

And if you add RuleRevision.is_disabled:
    rev_qs = r.revisions.filter(is_disabled=False)
    latest_ver = rev_qs.aggregate(m=Max("version"))["m"]
    rev = rev_qs.get(version=latest_ver)

