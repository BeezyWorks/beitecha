# @beitecha/engine

The rules engine behind [Beitecha](https://github.com/BeezyWorks/beitecha): a shul's schedule (minyanim and shiurim
as rules over zmanim and the Jewish calendar, one-time changes, sponsors) plus a date in, that day's times out. Pure
TypeScript on `@hebcal/core`, shipped as source (no build step).

Every surface runs this same code, so they always agree: Beitecha's lobby display, public page and ICS feed, and the
Siddur (SiddurOneRN). Both apps mount this repo as a git submodule at `packages/…` and depend on it with
`"@beitecha/engine": "workspace:*"`.

```ts
import { Calendar, computeRange, todayIn } from '@beitecha/engine'

const days = computeRange(schedule, todayIn(schedule.settings.location.timeZone), 7)
```

It also holds the wording every viewer surface shares (`makeT`: zman labels, weekdays, dates, "next up", in the
shul's `language`, `timeFormat` and `names`), so a shul reads the same in the Siddur as on its display.

Times are `Minutes` since local midnight in the shul's time zone (`settings.location.timeZone`), never the viewer's.

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck
```
