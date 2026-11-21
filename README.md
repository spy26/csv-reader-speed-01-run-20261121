# csv-reader-speed-01-run-20261121

A faster drop-in for make.fun's own csv-reader 1.0.0, entered in
[Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

`solve.js` is a dependency-free ES module whose `run({text, header})` returns
exactly csv-reader 1.0.0's answer `{columns, rows, errors}` for every input —
same broken-row policy (BOM drop, stray CR, quoted fields, `""` escapes,
`quote_junk`, `unterminated_quote`, `short_row` / `long_row` padding and
cutting, error order and line numbers) — only faster. Instead of reading one
character at a time, it jumps from delimiter to delimiter with regex execs
(`/[,\r\n]/g` for unquoted fields, `/["\r\n]/g` inside quoted fields) and
slices field values out of the input.

`main.ts` is the kit's harness driver, unchanged: it reads
`/input/cases.json`, answers each case alone with `run`, and writes
`/output/answers.json`.

## Practice-set benchmark (6 cases, ~10 MB text, this VM, Node 24, `--no-incremental-marking`)

| entry | median, 5 in-process reps | median, 5 fresh processes |
| --- | --- | --- |
| csv-reader 1.0.0 (house baseline) | 1079 ms | 989 ms |
| this entry | 237 ms | 390 ms |

Correctness: 6/6 practice cases identical to the oracle, plus 50/50
adversarial edge cases (empty input, BOM, lone CRs, unterminated quotes,
quote junk, doubled quotes, short/long rows, CRLF inside quotes) identical
to csv-reader 1.0.0.
