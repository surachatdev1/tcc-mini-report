# Public overview dashboard

Route: `/dashboard/overview`. The existing `/dashboard` search and `/admin` remain protected by individual Google-account access.

The approved design has one Overview menu, filters applied only by Search, vehicle icons beside headings, unobstructed charts, a province map and aggregate Excel export. All defaults are All. The fifth filter is result grade: education level is not stored in the assessment records.

## Publication

Deploy Hosting, Firestore rules and indexes together. Sign in as an existing project administrator at `/dashboard` or `/admin`, then click **อัปเดตภาพรวมสาธารณะ**. Open `/dashboard/overview` without signing in to verify the result.

New assessments do not automatically republish the snapshot. Administrators use the same button to refresh it. The footer displays the publication time. Before first publication, the page displays an explicit unpublished state, never sample data. No new backend service or Cloud Function is required, and assessment submission writes are unchanged.

Public readers access only the current aggregate version and its selected-year cells. They never read `submissions` or `submission_assessors`. Payloads contain no institution names, submission IDs, evaluator details or free-text answers.

Cells are partitioned by year (including a precomputed All-years scope), province and affiliation. Precomputed type/grade combinations keep school counts distinct across assessments. A version becomes public after all cells are written. A private revision document guards concurrent publication/deletion. Deleting submissions atomically invalidates the current overview; publish again afterwards. Old versions cannot be read publicly.

## Metrics

- Schools: unique normalized name + province; agencies counted separately.
- Grade donuts/bars: submitted assessment sets, not unique schools.
- Map: school counts for the applied year/type/affiliation/grade. Province selection highlights a province while preserving map context.
- No participation percentage is shown because there is no verified target denominator.
- All-types safety cards group related original rubric categories. Categories within each assessment are averaged with original category weights, then applicable assessments are averaged. Driver includes motorcycle behavior; management includes trip planning/support. These display groups do not change original scores or grades. The information panel explains this.
- Choosing a type displays its original categories; agency categories stay separated by subtype. Missing data displays a dash.
- Gap percentages use only assessments containing that question. Long questions expand in place.
- Excel exports the aggregate view, applied filters and publication time only.

## Release

```sh
git pull --ff-only origin main
npm ci
npm run firebase:build
npx firebase deploy --only hosting,firestore:rules,firestore:indexes --project tcc-safe-travel
npm run firebase:smoke
```

Run `npx firebase login` first if needed. Node 22.13+; Java 21+ for Firestore Emulator tests.

Validation: `npm run test:firebase`; `npm run test:rules`; browser widths 320/390/768/1024/1536 px; explicit Search/reset; Excel output; empty/error/unpublished states; public vs protected routes. Emulator integration covers actual Admin publication, guest aggregate queries, deletion invalidation and republishing.

Geometry: apisit/thailand.json (MIT), notice at `/notices/thailand-map-license.txt`. Decorative illustrations come from the user-supplied approved reference; data and charts are real components.

## Troubleshooting public search

A page shell loading successfully does not mean Firestore is ready. If the public manifest returns `403 PERMISSION_DENIED`, deploy the rules and indexes as well as Hosting; verify App Check configuration if access remains denied. Do not open raw `submissions` to anonymous readers.

```sh
npx firebase deploy --only hosting,firestore:rules,firestore:indexes --project tcc-safe-travel
npm run firebase:smoke
```

The smoke check now verifies anonymous access to the manifest and published cells. A missing manifest (`404`) requires an administrator to publish the first snapshot. Search is disabled with an explanatory message until public data is available. Filters still apply only when Search is pressed.

Summary cards, grade legends, bar segments, category cards and pilot provinces open an accessible detail dialog. Details preserve the applied year/type/affiliation/grade and expose only published aggregates. The full gaps table includes the numerator and eligible denominator. Individual submissions remain behind staff authentication. Icons use a shared SVG viewBox; charts and the map preserve their native aspect ratios across responsive layouts.
