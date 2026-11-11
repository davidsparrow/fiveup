# Discord setup — from zero to a working `/link`

The code for D1 is in the repo and the migration is applied. What is left is
the Discord side, which cannot be done from here: it is portal clicks and
five environment variables.

Order matters in exactly two places. **The endpoint has to be deployed before
Discord will accept its URL**, and **the bot's own role has to sit above the
roles it grants** — Discord lets a role manage only roles below itself, so a
bot at the bottom of the list silently fails to grant Member.

Everything else can be done in any order.

## Decided 2026-10-15

- **The server is called 5⭐️s.** Not Questmates — that name stays unspent
  for the game layer, which is also what the standalone-product track wants:
  keep brand equity off the thing being sold.
- **The app lives on `app.proofsignals.net`.** The apex `proofsignals.net`
  is a WordPress site on SiteGround; this Next app is a separate host.
- **Done 2026-10-17: the CNAME is in place and propagated.** The endpoint is
  live and answering:
  `GET https://app.proofsignals.net/api/discord/interactions` →
  `{"endpoint":"discord-interactions","ready":false,"canGrantRoles":false}`.
  `ready:false` is correct — it means `DISCORD_PUBLIC_KEY` is not set yet,
  which step 6 fixes. **Every step below is now unblocked.**
- **Steps 6 and 7 still go together.** Registering `/link` without a live
  endpoint makes the command appear in Discord and fail with "application
  did not respond", which is worse than it not being there.

## The subdomain — done

`app.proofsignals.net` is pointed at the Vercel project via a CNAME in
SiteGround's DNS and has propagated. `NEXT_PUBLIC_SITE_URL` is set: the live
`robots.txt` reports `Host: https://app.proofsignals.net` and the sitemap
emits that host, so canonical tags, OG images and every link the bot posts
resolve to a page that can sign a member in.

The apex and `www` stay with WordPress on SiteGround and are untouched.

The **Interactions Endpoint URL is effectively permanent** — Discord
re-verifies it with a live PING whenever you change it, and members never see
it. It is `https://app.proofsignals.net/api/discord/interactions`.

## 1 · Create the application

<https://discord.com/developers/applications> → **New Application**.

From **General Information**, copy:

- **Application ID** → `DISCORD_APP_ID`
- **Public Key** → `DISCORD_PUBLIC_KEY`

## 2 · Add the bot

**Bot** tab → reveal and copy the **token** → `DISCORD_BOT_TOKEN`. It is
shown once; regenerating it invalidates the old one.

Leave **every privileged intent off**. An HTTPS interactions bot never reads
message content, and asking for the intent would need justification at
verification time. It is also what makes the Discord-side moderation story
honest: the bot cannot see what is said in a thread, so
`scan_text_for_blocked_phrases` never will either.

## 3 · Create the server

Name it **5⭐️s**. Build the channels and roles from the build spec's server
section; the minimum D1 needs is the **Member** role and `#start-here`.

Then, in **Server Settings → Roles**, drag the bot's own role **above**
Member. This is the step that is silent when you skip it: linking succeeds,
the row is written, and the role never appears.

- Right-click the server with Developer Mode on → **Copy Server ID** →
  `DISCORD_GUILD_ID`
- Right-click the Member role → **Copy Role ID** → `DISCORD_MEMBER_ROLE_ID`

## 4 · Invite the bot

**OAuth2 → URL Generator**, scopes `bot` and `applications.commands`,
permissions:

Manage Roles · Manage Channels · Manage Threads · Create Private Threads ·
Send Messages · Send Messages in Threads · Embed Links · Read Message History

Use the generator's URL rather than a hand-written permissions integer.
Afterwards, create a server invite → `NEXT_PUBLIC_DISCORD_INVITE_URL`.

## 5 · Wire Discord login into Supabase (road 1)

This is the one-click path for someone already on the site. Skip it and the
`/link` code path still works on its own.

1. **OAuth2** tab → add the redirect
   `https://<project-ref>.supabase.co/auth/v1/callback`
2. Copy the **Client ID** and **Client Secret**
3. Supabase → **Authentication → Providers → Discord** → enable, paste both.
   Scopes `identify` and `email`.
4. Supabase → **Authentication → Providers** → make sure **Manual linking**
   is enabled. `supabase.auth.linkIdentity()` returns
   `manual_linking_disabled` without it, and that is the call behind the
   "Connect with Discord" button.
5. Set `NEXT_PUBLIC_DISCORD_OAUTH_ENABLED=true` so the button renders.

## 6 · Deploy the endpoint, then give Discord its URL

**On hold** until the domain decision above. Do steps 6 and 7 in one sitting.

In this order:

1. Deploy, with `DISCORD_PUBLIC_KEY` set in the Vercel project.
2. Check it is answering:
   `GET https://app.proofsignals.net/api/discord/interactions` returns
   `{"endpoint":"discord-interactions","ready":true,...}`. `ready:false`
   means `DISCORD_PUBLIC_KEY` is missing.
3. Paste `https://app.proofsignals.net/api/discord/interactions` into
   **General Information → Interactions Endpoint URL** and save.

Discord sends a signed PING when you save and refuses the URL if the response
is not a correctly verified PONG. It also probes with a deliberately invalid
signature and expects a `401` — which the route returns.

## 7 · Register the commands

**On hold with step 6.** A registered command with no working endpoint shows
up in the server and fails.

```
node src/lib/discord/register.mjs --dry-run  # validate, send nothing
node src/lib/discord/register.mjs            # guild-scoped, appears instantly
node src/lib/discord/register.mjs --global   # global, up to an hour
```

Run `--dry-run` first. It needs no credentials and checks the definitions
against Discord's documented limits locally — name shape, description length,
option counts, and required-before-optional ordering. Discord rejects the
whole payload on one bad field and the error names a JSON path rather than a
command, so a local failure is much cheaper to read.

Guild-scoped first, always: a typo in a global registration costs an hour.

As of D3 there are three commands:

| Command | What it does |
| --- | --- |
| `/link` | Identity linking, road 2 |
| `/me` | Plan, track, caps and usage |
| `/group` | `create`, `list`, `discover`, `join`, `accept`, `decline`, `invite`, `members`, `recommend`, `leave`, `close` |

## 8 · The groups channel — D3's one new piece of setup

Group rooms are **private threads off one channel**, rather than a thread
wherever `/group create` happened. That keeps rooms findable and moderatable,
and it lets `/group create` work in a DM with the bot, where there is no
parent channel to thread from.

1. Make a channel — `#groups` is the obvious name. Members do not need to
   post in it; it is a container.
2. Give the bot **View Channel**, **Send Messages**, **Create Private
   Threads** and **Send Messages in Threads** on it. Missing permissions
   surface as a specific sentence rather than a silent failure: "the bot needs
   Create Private Threads and Send Messages in the groups channel."
3. Right-click the channel → **Copy Channel ID** → set
   `DISCORD_GROUPS_CHANNEL_ID`.

**This step is optional.** With it unset, every `/group` subcommand still
works and the groups still exist — they just have no Discord room, and the
site's Groups tab remains the whole surface. That is deliberate: a room is a
view of a group's membership, never the record of it.

Threads are **archived, not deleted**, when a group closes. The feedback in a
room is the room's record of itself.

## 9 · The environment variables

| Variable | Where it comes from | Needed for |
| --- | --- | --- |
| `DISCORD_APP_ID` | General Information | Deferred replies |
| `DISCORD_PUBLIC_KEY` | General Information | Signature verification. **Unset this to switch the endpoint off** |
| `DISCORD_BOT_TOKEN` | Bot tab | Role grants |
| `DISCORD_GUILD_ID` | Right-click the server | Role grants |
| `DISCORD_MEMBER_ROLE_ID` | Right-click the Member role | Role grants |
| `DISCORD_GROUPS_CHANNEL_ID` | Right-click `#groups` (step 8) | Group rooms. Optional — unset means no threads, and every command still works |
| `NEXT_PUBLIC_DISCORD_INVITE_URL` | A server invite | The "join the server" line, and the Phase A surface gate |
| `NEXT_PUBLIC_DISCORD_OAUTH_ENABLED` | `true` once step 5 is done | Showing the one-click button |
| `NEXT_PUBLIC_SITE_URL` | `https://app.proofsignals.net` | Canonicals, OG images, the sitemap, every link the bot posts |
| `NEXT_PUBLIC_MARKETING_URL` | `https://proofsignals.net` (optional) | Links back to the WordPress site |

Set them in `.env.local` **and** in the Vercel project. Nothing throws when
they are absent: the site renders the Discord card with whichever road is
available, and the endpoint returns 503.

## What "done" looks like

### D3's gate — five testers run every command and the rows match the site

Worth doing in this order, because each step sets up the next:

1. `/me` before linking → sent to `/link`. After linking → plan, track, caps.
2. `/group create name:"<something>"` → confirms the first seat, and a thread
   appears in `#groups` if step 8 is done. Check the Groups tab on the
   dashboard shows the same group.
3. A tester with two or more assets runs `/group create` with no `asset:` →
   should be *asked which one*, not given a guess, and no group should be
   created. This is the one piece of judgement D3 added.
4. `/group invite group:<name> member:@someone` → they run `/group accept`
   → `/group members` lists both, with what each brought.
5. Invite someone who has never run `/link` → "ask them to run /link first".
6. A free (sprout) tester creates a second group → refused with "which is the
   limit on your plan". The cap is the database's, not the bot's.
7. `/group leave` as a member, `/group close` as the owner. The thread
   archives; it does not vanish.

`verify-phase23.mjs` already asserts all seven against the live database by
driving the real handlers with synthetic interactions — 126 checks. What the
testers add is whether Discord accepts the definitions and whether the bot
actually has the guild permissions. Nothing else.

### D1's gate — five testers link both ways and the Member role appears

- Road 1: signed in on the site → `/account` → **Connect with Discord** →
  back to `/account` saying "Discord connected as <handle>. Member role
  granted."
- Road 2: in Discord → `/link` → a code → paste it at `/account` → same
  result.
- A tester who links before joining the server gets "join the server and your
  Member role appears automatically", then runs `/link` again after joining
  and gets the role. That retry path is deliberate — `role_granted_at` is
  null until the grant actually lands.

## Rollback

Unset `DISCORD_PUBLIC_KEY`. The endpoint returns 503 for everything, the site
keeps working, and no data changes. To go further, unregister the commands by
running the registration script against an empty definitions list.
