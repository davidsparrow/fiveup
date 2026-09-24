# Discord Member Accelerator — course plan (parked)

Status: **parked until the ProofSignals Discord bot (Refactor Phase C) is built and running with real members.**
Recorded: 2026-09-24. Owner: Robbie (IndieOps / ProofSignals).

This note keeps the course plan in mind while Phases B–D of the refactor (`docs/REFACTOR-PLAN.md.pdf`) are built. Nothing here changes the refactor's scope.

## The product

- **Name:** Discord Member Accelerator
- **Price:** $197 one-time — course + setup guide download
- **Audience:** Skool group owners who want a Discord alongside their Skool community
- **Face:** Robbie, as the person behind the IndieOps community / Skool group and the ProofSignals ecosystem
- **Positioning:** tool-neutral. It can say the system is "loosely based on the ProofSignals and Proof Lab Skool group designs", but it must work for any Skool group without ProofSignals.
- **Primary goal:** serve ProofSignals members. The course is a secondary product built from what we learn.

## Where the value is (and what's free)

### How the bot works: receptionist and back office

There is **one** ProofSignals bot. "Thin" describes its architecture, not a smaller version:

- **The bot is the receptionist.** A member types `/assist @maya helped with my landing page`. The bot checks the request really came from Discord (Ed25519 signature), passes it to the back office, and relays the answer, all within Discord's 3-second limit. It makes no decisions.
- **The database is the back office** (Supabase RPCs). All the real work happens here: checking whether this member may award this assist, blocking self-awards and repeat awards, writing the points ledger, queuing admin approval, updating the member graph and matching, and forming squads.

So "full vs. Lite" is about the size of the back office, not the bot:

| | Bot (receptionist) | Back office |
|---|---|---|
| **ProofSignals** (private) | Thin | Full engine: points ledger, approvals, anti-gaming, member graph, matching, squads, redemptions |
| **Lite** (free with course) | Thin, the same kind of bot | Simple: points table, basic approval, leaderboard. No matching, squads or graph |

The two bots look almost identical. Everything worth protecting is behind them, which is why giving away the Lite bot costs nothing. This explanation doubles as course material.

The plan also mentions an optional later **always-on listener** (discord.js) that only collects activity metrics (messages, voice time) and never awards points. It's a nice-to-have, not a "robust" bot.

**The bot is free.** Buyers can't be charged for bot code, since AI can write a Discord bot in an afternoon. What they pay for:

1. **The system design:** channel and role layout, the points economy (why an assist is worth more than a claim), approval rules, rules that stop members gaming the points, squads, weekly rituals, and how it all links back to Skool.
2. **Proof:** real numbers from our own communities (see metrics below).
3. **Speed:** a Discord server template, copy-paste setup, and the walkthroughs that get a group live in a weekend.
4. **Robbie's credibility, plus ongoing updates and a buyer community.**

Free vs. private:

| Free / included with course | Stays private (ProofSignals) |
|---|---|
| "Lite" bot: `/assist`, `/claim`, `/points`, `/board` with a simple DB | Member graph + matching engine |
| Written spec + AI build prompts for the Lite bot | Squad formation logic |
| Discord server template, channel/role design | Anti-gaming / review-integrity checks (Phase F) |
| No-code path (existing bots + spreadsheet) | Redemptions / points spending (Phase E) |
| Rules, rituals, announcement & leaderboard templates | Anything in `supabase/migrations/` as written |

The Lite bot must be written **from a fresh spec**, never copied from ProofSignals code. The private column is the natural upsell (done-for-you setup, later a hosted ProofSignals tier).

## Asks for whoever builds Phases B–D

1. **Keep Discord code isolated** in `src/lib/discord/` plus `src/app/api/discord/`. Keep ProofSignals-specific logic in the RPCs, not in command handlers. That makes the Lite spec easy to derive.
2. **Use generic names** for the community tables (points ledger, accomplishments, assists/interactions, squads). Avoid baking ProofSignals product terms into them.
3. **Timestamp everything** in the points ledger and interactions tables so these metrics can be queried later:
   - weekly active Discord members
   - assists per week
   - claims submitted vs. approved
   - retention of members after joining a squad (vs. not)
4. **Keep a build journal** (decisions, what broke, what members loved). This becomes course content.

## When to start the course

Start the course once all of these are true:
- ProofSignals Discord bot is live, with Phase C commands working.
- About 4–8 weeks of real member activity, enough to quote the metrics above.
- Buyer technical level decided. If most buyers aren't technical, the no-code path is the main track and the AI build path is a bonus module.

Then write: course outline → Lite bot spec + prompt pack → server template → videos.
