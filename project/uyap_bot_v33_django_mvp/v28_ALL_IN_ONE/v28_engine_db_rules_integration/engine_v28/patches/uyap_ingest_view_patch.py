"""Drop-in patch for UyapEventIngestView to use DB RuleLoader.

Replace the 'rules = runner.load_rules(RULE_PATHS)' loop with:

  from engine_v28.engine_runner.db_rule_runner import run_db_rules_for_event
  matched = run_db_rules_for_event(case_id=case_id, event=event, factstore=FACTSTORE, pack_name="uyap_default")
  return Response({"case_id": case_id, "matched": matched}, status=200)

"""
