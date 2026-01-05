# Patch EngineRunner to use because_from_expr

In your EngineRunner.decisions loop, replace:

    because = [cond]

with:

    from engine_v28.explain.because import because_from_expr
    because = because_from_expr(cond, ctx)

Then store it in TimelineEntry.body["because"] as you already do.

This makes decisions auditable for humans.
