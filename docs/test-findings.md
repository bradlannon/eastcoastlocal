# Test Findings

Characterization-test mismatches logged during the full-coverage pass.
Each entry: date · test file · test name · expected · actual · suspected cause.

| Date | Test | Name | Expected | Actual | Cause |
|------|------|------|----------|--------|-------|
| 2026-04-14 | e2e/api/* | all Phase 4 specs | passing suite | not executed | Requires .env.test with dedicated test DB; specs validated via --list only. Run once test DB is provisioned. |
