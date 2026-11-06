"use client";

// The Groups tab — D2's web surface for feedback groups.
//
// The ordering rule from the build spec: groups work on the site before they
// work in Discord. Everything here calls the same RPCs D3's slash commands
// will call, so the bot is a client of a tested surface and a Discord outage
// degrades to a usable product rather than no product.
//
// Nothing in this file enforces a rule. Caps, the demo wall, separation
// preferences and who may invite are all decided in the database; the only
// job here is to ask, and to render the sentence that comes back when the
// answer is no. `can_join` from discoverable_groups is advisory for exactly
// that reason — a page left open for ten minutes must never be what lets
// someone past a cap.

import { useCallback, useEffect, useState } from "react";

import { T } from "@/lib/fivestarz/theme";
import { TRACKS, trackLabel } from "@/lib/fivestarz/tracks";
import { Av, Btn, Card, Pill } from "@/components/fivestarz/ui";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/fivestarz/format";
import { ASSET_TYPE_DB_TO_LABEL } from "@/lib/fivestarz/enums";
import {
  closeGroup,
  createGroup,
  getGroupRoster,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  listDiscoverableGroups,
  listMyGroups,
  pairInGroup,
  recommendGroupMembers,
  respondToGroupInvite,
  reviewGroupJoinRequest,
  setGroupAsset,
} from "@/lib/fivestarz/data";

const VISIBILITY_COPY = {
  private: { label: "Private", help: "Invite only, and not listed anywhere." },
  listed: { label: "Listed", help: "Members can find it and ask to join. You approve." },
  open: { label: "Open", help: "Any member can join, up to their own plan's cap." },
};

const STATUS_PILL = {
  forming: { label: "Forming", color: T.gold, bg: T.goldL + "55" },
  active: { label: "Active", color: T.green, bg: T.greenP },
  closed: { label: "Closed", color: T.brownL, bg: T.cream },
};

const MY_STATUS_PILL = {
  invited: { label: "Invited", color: T.orange, bg: T.orangeP },
  requested: { label: "Requested", color: T.gold, bg: T.goldL + "55" },
  active: { label: "Member", color: T.teal, bg: T.tealP },
};

function Label({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: T.brownL, fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #E8DDD5",
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 14,
  color: T.brown,
  background: "#fff",
  boxSizing: "border-box",
};

// Degrees of separation, stated bare. The house rule for the review-separation
// report is that a degree is shown with no guidance text and never names an
// intermediary; the same restraint applies here, where the number is a hint
// about distance and not advice about whether to invite.
function DegreePill({ degree }) {
  if (degree === null || degree === undefined) {
    return <Pill color={T.teal} bg={T.tealP}>No connection</Pill>;
  }
  return <Pill color={T.brownL} bg={T.cream}>{degree}° away</Pill>;
}

function CreateGroupForm({ assets, onCreated, busy, setBusy, onError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [track, setTrack] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [maxMembers, setMaxMembers] = useState(6);

  useEffect(() => {
    if (!assetId && assets[0]?.id) setAssetId(assets[0].id);
  }, [assets, assetId]);

  if (!open) {
    return (
      <Btn sz="sm" onClick={() => setOpen(true)} disabled={assets.length === 0}>
        + New group
      </Btn>
    );
  }

  const submit = async () => {
    setBusy(true);
    onError(null);
    try {
      const supabase = createClient();
      await createGroup(supabase, {
        name,
        assetId,
        track: track || null,
        visibility,
        maxMembers: Number(maxMembers),
      });
      setOpen(false);
      setName("");
      await onCreated();
    } catch (err) {
      onError(err.message ?? "Could not create the group.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ padding: 20, width: "100%" }} hover={false}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <Label>Group name</Label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Thursday teardown crew" maxLength={120} />
        </div>
        <div>
          <Label>What you bring to be reviewed</Label>
          <select style={inputStyle} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 6 }}>
            A feedback group pairs members by what they want looked at, so every seat needs an asset.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <Label>Track</Label>
            <select style={inputStyle} value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">Cross-track</option>
              {TRACKS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Seats</Label>
            <select style={inputStyle} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)}>
              {[4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>Who can get in</Label>
          <select style={inputStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {Object.entries(VISIBILITY_COPY).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 6 }}>
            {VISIBILITY_COPY[visibility].help}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn sz="sm" onClick={submit} disabled={busy || !name.trim() || !assetId}>
            {busy ? "…" : "Create group"}
          </Btn>
          <Btn sz="sm" v="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn>
        </div>
      </div>
    </Card>
  );
}

// The roster, the owner's request queue, and the recommendations — all loaded
// on demand, because a member in three groups should not pay for three
// rosters they did not open.
function GroupDetail({ group, assets, onChanged, onError }) {
  const [roster, setRoster] = useState(null);
  const [recs, setRecs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newSeatAsset, setNewSeatAsset] = useState("");
  const isOwner = group.my_role === "owner" && group.my_status === "active";

  const loadRoster = useCallback(async () => {
    try {
      const supabase = createClient();
      setRoster(await getGroupRoster(supabase, group.group_id));
    } catch (err) {
      onError(err.message ?? "Could not load the roster.");
    }
  }, [group.group_id, onError]);

  useEffect(() => {
    if (group.my_status === "active") loadRoster();
  }, [group.my_status, loadRoster]);

  const act = async (fn, label) => {
    setBusy(true);
    onError(null);
    try {
      await fn(createClient());
      await loadRoster();
      await onChanged();
    } catch (err) {
      onError(err.message ?? `Could not ${label}.`);
    } finally {
      setBusy(false);
    }
  };

  const loadRecs = async () => {
    setBusy(true);
    onError(null);
    try {
      const supabase = createClient();
      setRecs(await recommendGroupMembers(supabase, { groupId: group.group_id, limit: 10 }));
    } catch (err) {
      onError(err.message ?? "Could not load recommendations.");
    } finally {
      setBusy(false);
    }
  };

  const active = (roster ?? []).filter((r) => r.member_status === "active");
  const requests = (roster ?? []).filter((r) => r.member_status === "requested");
  const invited = (roster ?? []).filter((r) => r.member_status === "invited");

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F0E8E0", display: "grid", gap: 18 }}>
      {/* group_members.asset_id is ON DELETE SET NULL, so deleting an asset
          empties the seat rather than blocking the deletion or ejecting the
          member. This is the way back in. */}
      {group.my_asset_id === null && (
        <div style={{ padding: "12px 14px", background: T.orangeP, borderRadius: 12, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: T.brownM, fontFamily: "'DM Sans',sans-serif" }}>
            Your seat here has no asset on it — the one you brought was deleted. Pick another before pairing up.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 180 }} value={newSeatAsset}
              onChange={(e) => setNewSeatAsset(e.target.value)}>
              <option value="">Choose an asset…</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <Btn sz="sm" disabled={busy || !newSeatAsset}
              onClick={() => act((sb) => setGroupAsset(sb, { groupId: group.group_id, assetId: newSeatAsset }), "set that asset")}>
              Use this one
            </Btn>
          </div>
        </div>
      )}

      {roster === null ? (
        <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Loading the room…</div>
      ) : (
        <div>
          <Label>In the room ({active.length}/{group.max_members})</Label>
          <div style={{ display: "grid", gap: 10 }}>
            {active.map((m) => (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Av txt={initials(m.display_name)} color={m.member_role === "owner" ? T.gold : T.orange} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{m.display_name}</span>
                    {m.member_role === "owner" && <Pill color={T.gold} bg={T.goldL + "55"}>Owner</Pill>}
                    {m.track && <Pill color={T.teal} bg={T.tealP}>{trackLabel(m.track)}</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                    {m.asset_name ? `${m.asset_name} · ${ASSET_TYPE_DB_TO_LABEL[m.asset_type] || m.asset_type}` : "No asset"}
                  </div>
                </div>
                {group.my_status === "active" && m.member_status === "active" && (
                  <Btn sz="sm" v="ghost" disabled={busy}
                    onClick={() => act((sb) => pairInGroup(sb, { groupId: group.group_id, otherUserId: m.user_id }), "start that pairing")}>
                    Pair up
                  </Btn>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 8 }}>
            A pairing inside a group does not count against your monthly match quota or your open match-up limit.
          </div>
        </div>
      )}

      {invited.length > 0 && (
        <div>
          <Label>Invited, not yet in</Label>
          <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
            {invited.map((m) => m.display_name).join(", ")}
          </div>
        </div>
      )}

      {isOwner && requests.length > 0 && (
        <div>
          <Label>Asking to join ({requests.length})</Label>
          <div style={{ display: "grid", gap: 10 }}>
            {requests.map((m) => (
              <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <Av txt={initials(m.display_name)} color={T.brownL} size={32} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{m.display_name}</div>
                  <div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>{m.asset_name ?? "No asset"}</div>
                </div>
                <Btn sz="sm" v="teal" disabled={busy}
                  onClick={() => act((sb) => reviewGroupJoinRequest(sb, { groupId: group.group_id, userId: m.user_id, approve: true }), "approve that request")}>
                  Let them in
                </Btn>
                <Btn sz="sm" v="ghost" disabled={busy}
                  onClick={() => act((sb) => reviewGroupJoinRequest(sb, { groupId: group.group_id, userId: m.user_id, approve: false }), "decline that request")}>
                  Decline
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <Label>Recommended members</Label>
            <Btn sz="sm" v="ghost" onClick={loadRecs} disabled={busy} sx={{ marginBottom: 6 }}>
              {recs === null ? "Show recommendations" : "Refresh"}
            </Btn>
          </div>
          {recs !== null && recs.length === 0 && (
            <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>
              Nobody to suggest right now. Recommendations respect every member&rsquo;s degrees-of-separation
              setting against everyone already in the room, so a full group narrows the field.
            </div>
          )}
          {recs !== null && recs.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {recs.map((c) => (
                <div key={c.candidate_user_id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Av txt={initials(c.candidate_display_name)} color={T.teal} size={32} />
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, color: T.brown }}>{c.candidate_display_name}</span>
                      <DegreePill degree={c.shortest_path_degree} />
                      {c.candidate_track && <Pill color={T.teal} bg={T.tealP}>{trackLabel(c.candidate_track)}</Pill>}
                    </div>
                    <div style={{ fontSize: 12, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                      {c.candidate_asset_name} · {ASSET_TYPE_DB_TO_LABEL[c.candidate_asset_type] || c.candidate_asset_type}
                    </div>
                  </div>
                  <Btn sz="sm" disabled={busy}
                    onClick={() => act(
                      (sb) => inviteToGroup(sb, { groupId: group.group_id, userId: c.candidate_user_id, joinedVia: "recommender" }),
                      "send that invitation",
                    )}>
                    Invite
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {group.my_status === "active" && (
          <Btn sz="sm" v="ghost" disabled={busy}
            onClick={() => act((sb) => leaveGroup(sb, group.group_id), "leave the group")}>
            Leave group
          </Btn>
        )}
        {isOwner && group.status !== "closed" && (
          <Btn sz="sm" v="ghost" disabled={busy}
            onClick={() => act((sb) => closeGroup(sb, group.group_id), "close the group")}>
            Close group
          </Btn>
        )}
      </div>
    </div>
  );
}

export default function GroupsTab({ assets = [], isMobile = false }) {
  const [groups, setGroups] = useState([]);
  const [discoverable, setDiscoverable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pairableAssets = assets.filter((a) => a.status === "active" && a.moderation_status === "ok");

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [mine, open] = await Promise.all([
      listMyGroups(supabase),
      listDiscoverableGroups(supabase, { limit: 20 }),
    ]);
    setGroups(mine);
    setDiscoverable(open);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      setError(err.message ?? "Could not load your groups.");
      setLoading(false);
    });
  }, [refresh]);

  const act = async (fn, label) => {
    setBusy(true);
    setError(null);
    try {
      await fn(createClient());
      await refresh();
    } catch (err) {
      setError(err.message ?? `Could not ${label}.`);
    } finally {
      setBusy(false);
    }
  };

  const invites = groups.filter((g) => g.my_status === "invited");
  const mine = groups.filter((g) => g.my_status !== "invited");

  return (
    <div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 14, marginBottom: 18 }}>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: T.brown, margin: 0 }}>Your Groups</h3>
        <CreateGroupForm assets={pairableAssets} onCreated={refresh} busy={busy} setBusy={setBusy} onError={setError} />
      </div>

      {pairableAssets.length === 0 && (
        <div style={{ padding: "12px 16px", background: T.orangeP, borderRadius: 12, marginBottom: 16, fontSize: 13, color: T.brownM, fontFamily: "'DM Sans',sans-serif" }}>
          Add an asset first. A feedback group pairs members by what they want reviewed, so a seat without
          an asset is a seat that can never be paired.
        </div>
      )}

      {error && (
        <div style={{ padding: "12px 16px", background: `${T.red}14`, border: `1px solid ${T.red}33`, borderRadius: 12, marginBottom: 16, fontSize: 13, color: T.red, fontFamily: "'DM Sans',sans-serif" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Loading your groups…</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {invites.map((g) => (
            <Card key={g.group_id} sx={{ padding: isMobile ? 16 : "20px 24px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{g.name}</span>
                    <Pill color={MY_STATUS_PILL.invited.color} bg={MY_STATUS_PILL.invited.bg}>Invited</Pill>
                  </div>
                  <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                    {g.active_member_count}/{g.max_members} seats taken{g.track ? ` · ${trackLabel(g.track)}` : " · cross-track"}
                  </div>
                </div>
                <Btn sz="sm" v="teal" disabled={busy || pairableAssets.length === 0}
                  onClick={() => act((sb) => respondToGroupInvite(sb, { groupId: g.group_id, accept: true, assetId: pairableAssets[0]?.id }), "accept the invitation")}>
                  Accept
                </Btn>
                <Btn sz="sm" v="ghost" disabled={busy}
                  onClick={() => act((sb) => respondToGroupInvite(sb, { groupId: g.group_id, accept: false }), "decline the invitation")}>
                  Decline
                </Btn>
              </div>
            </Card>
          ))}

          {mine.length === 0 && invites.length === 0 && (
            <div style={{ padding: "32px 0", textAlign: "center", color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>
              No groups yet. Start one, or find a room below.
            </div>
          )}

          {mine.map((g) => {
            const sp = STATUS_PILL[g.status] ?? STATUS_PILL.forming;
            const mp = MY_STATUS_PILL[g.my_status];
            const isOpen = expanded === g.group_id;
            return (
              <Card key={g.group_id} sx={{ padding: isMobile ? 16 : "20px 24px" }} dim={g.status === "closed"}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{g.name}</span>
                      <Pill color={sp.color} bg={sp.bg}>{sp.label}</Pill>
                      {mp && <Pill color={mp.color} bg={mp.bg}>{mp.label}</Pill>}
                      {g.pending_request_count > 0 && (
                        <Pill color={T.orange} bg={T.orangeP}>{g.pending_request_count} waiting</Pill>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                      {g.active_member_count}/{g.max_members} seats
                      {g.track ? ` · ${trackLabel(g.track)}` : " · cross-track"}
                      {` · ${VISIBILITY_COPY[g.visibility]?.label ?? g.visibility}`}
                    </div>
                  </div>
                  {g.my_status === "requested" ? (
                    <span style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>Waiting on the owner</span>
                  ) : (
                    <Btn sz="sm" v="ghost" onClick={() => setExpanded(isOpen ? null : g.group_id)}>
                      {isOpen ? "Hide" : "Open"}
                    </Btn>
                  )}
                </div>
                {isOpen && g.my_status === "active" && (
                  <GroupDetail group={g} assets={pairableAssets} onChanged={refresh} onError={setError} />
                )}
              </Card>
            );
          })}
        </div>
      )}

      <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.brown, margin: "28px 0 14px" }}>Find a group</h3>
      {discoverable.length === 0 ? (
        <div style={{ fontSize: 13, color: T.brownL, fontFamily: "'DM Sans',sans-serif" }}>
          No open rooms right now. Listed and open groups appear here as members create them.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {discoverable.map((g) => (
            <Card key={g.group_id} sx={{ padding: isMobile ? 16 : "18px 24px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: T.brown }}>{g.name}</span>
                    <Pill color={T.brownL} bg={T.cream}>{VISIBILITY_COPY[g.visibility]?.label ?? g.visibility}</Pill>
                  </div>
                  <div style={{ fontSize: 13, color: T.slate, fontFamily: "'DM Sans',sans-serif" }}>
                    {g.active_member_count}/{g.max_members} seats
                    {g.track ? ` · ${trackLabel(g.track)}` : " · cross-track"}
                    {g.owner_display_name ? ` · run by ${g.owner_display_name}` : ""}
                  </div>
                  {g.blocked_reason && (
                    <div style={{ fontSize: 12, color: T.brownL, fontFamily: "'DM Sans',sans-serif", marginTop: 6 }}>{g.blocked_reason}</div>
                  )}
                </div>
                <Btn sz="sm" disabled={busy || !g.can_join || pairableAssets.length === 0}
                  onClick={() => act((sb) => joinGroup(sb, { groupId: g.group_id, assetId: pairableAssets[0]?.id }), "join that group")}>
                  {g.joins_by_request ? "Ask to join" : "Join"}
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
