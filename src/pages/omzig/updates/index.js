import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  Link,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Grid } from "@mui/system";
import {
  RocketLaunchOutlined,
  ScienceOutlined,
  TerminalOutlined,
  ScheduleOutlined,
  SystemUpdateAltOutlined,
  RefreshOutlined,
  LockPersonOutlined,
  GroupsOutlined,
} from "@mui/icons-material";
import { Layout as DashboardLayout } from "../../../layouts/index.js";
import { ApiGetCall, ApiPostCall } from "../../../api/ApiCall";
import { CippHead } from "../../../components/CippComponents/CippHead";
import { CippApiResults } from "../../../components/CippComponents/CippApiResults";
import { OmzigPageHero, omzigScale } from "../../../omzig";

const execUrl = "/api/ExecOmzigUpdates";
const statusQueryKey = "OmzigUpdateStatus";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : "—";
};

// Compare dotted versions ignoring a leading v; null when not comparable.
const isNewerVersion = (remote, local) => {
  if (!remote || !local) return null;
  const parse = (v) => `${v}`.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10));
  const r = parse(remote);
  const l = parse(local);
  if (r.some(Number.isNaN) || l.some(Number.isNaN)) return null;
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] ?? 0;
    const b = l[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
};

const CHANNELS = [
  {
    key: "stable",
    title: "Stable",
    icon: <RocketLaunchOutlined />,
    from: "#14B8A6",
    to: "#0E7490",
    description:
      "The latest published CIPP release from the official GitHub. Recommended for production.",
  },
  {
    key: "prerelease",
    title: "Beta",
    icon: <ScienceOutlined />,
    from: "#F59E0B",
    to: "#B45309",
    description:
      "The latest published prerelease. When upstream has no prerelease out, installing this channel falls back to the dev branch.",
  },
  {
    key: "dev",
    title: "Canary (dev)",
    icon: <TerminalOutlined />,
    from: "#A78BFA",
    to: "#6D28D9",
    description:
      "The head of the official dev branch — the newest, least-proven code. Expect rough edges; use on the dev stack first.",
  },
];

const Page = () => {
  const status = ApiGetCall({
    url: "/api/ListOmzigUpdateStatus",
    queryKey: statusQueryKey,
  });
  const localVersion = ApiGetCall({
    url: "/version.json",
    queryKey: "OmzigLocalVersionJson",
  });

  const execUpdates = ApiPostCall({
    relatedQueryKeys: [statusQueryKey],
  });

  // Which action the shared mutation belongs to, so only that card shows
  // its spinner/result (same pattern as the GDAP bundle importer).
  const [activeAction, setActiveAction] = useState(null);

  // Schedule form — seeded from the saved settings once they load.
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [scheduleChannel, setScheduleChannel] = useState("stable");
  const [scheduleMode, setScheduleMode] = useState("install");
  // On-demand installs: install directly or open a review PR.
  const [installAsPr, setInstallAsPr] = useState(false);
  // Superadmin-only: the Entra security group whose members may trigger updates.
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    if (status.isSuccess && status.data?.Settings) {
      setAutoUpdate(Boolean(status.data.Settings.AutoUpdate));
      setScheduleChannel(status.data.Settings.Channel || "stable");
      setScheduleMode(status.data.Settings.Mode || "install");
    }
    if (status.isSuccess && status.data?.Access) {
      setGroupId(status.data.Access.UpdaterGroupId || "");
      setGroupName(status.data.Access.UpdaterGroupName || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isSuccess]);

  const githubReady = Boolean(status.data?.GitHubIntegration);
  const channels = status.data?.Channels;
  const portalVersion = localVersion.data?.version;
  const apiVersion = status.data?.LocalApiVersion;

  // Access control: only members of the configured Entra group may trigger
  // updates; a superadmin designates that group. The server re-checks both —
  // this only drives the UI (disable controls, show guidance).
  const access = status.data?.Access || {};
  const isUpdater = Boolean(access.CallerIsUpdater);
  const isSuperAdmin = Boolean(access.CallerIsSuperAdmin);
  const groupConfigured = Boolean(access.GroupConfigured);
  // Write controls are enabled only when the integration is ready AND the
  // caller is an authorized updater.
  const canWrite = githubReady && isUpdater;

  const stableTag = channels?.Frontend?.Stable?.Version;
  const stableUpdateAvailable = isNewerVersion(stableTag, portalVersion);

  // ŌMZIG audit #1: only stable may install directly; beta/canary always
  // open a review PR (the server/workflow enforce this regardless of the UI).
  const effectivePrMode = (channelKey) => installAsPr || channelKey !== "stable";

  const handleInstall = (channelKey) => {
    setActiveAction(`install-${channelKey}`);
    execUpdates.mutate({
      url: execUrl,
      data: {
        Action: "InstallNow",
        channel: channelKey,
        mode: effectivePrMode(channelKey) ? "pr" : "install",
      },
    });
  };

  const handleSaveSchedule = () => {
    setActiveAction("schedule");
    execUpdates.mutate({
      url: execUrl,
      data: {
        Action: "SetSchedule",
        autoUpdate,
        channel: scheduleChannel,
        mode: scheduleMode,
      },
    });
  };

  const handleSaveGroup = () => {
    setActiveAction("group");
    execUpdates.mutate({
      url: execUrl,
      data: {
        Action: "SetUpdaterGroup",
        groupId: groupId.trim(),
        groupName: groupName.trim(),
      },
    });
  };

  const scheduleResult =
    activeAction === "schedule" && execUpdates.isSuccess ? execUpdates.data?.data : null;

  const channelSideInfo = (side, channelKey) => {
    const data = channels?.[side];
    if (!data) return null;
    if (channelKey === "dev") {
      return data.Dev
        ? { label: data.Dev.Sha?.slice(0, 7), date: data.Dev.Date, url: data.Dev.Url }
        : null;
    }
    const release = channelKey === "stable" ? data.Stable : data.Prerelease;
    return release
      ? { label: release.Version, date: release.PublishedAt, url: release.Url }
      : null;
  };

  return (
    <>
      <CippHead title="Update Center" noTenant />
      <Box sx={{ flexGrow: 1 }}>
        <Container maxWidth="lg">
          <Stack spacing={3}>
            <OmzigPageHero
              title="ŌMZIG Update Center"
              subtitle="Install updates straight from CIPP's official GitHub — on a schedule or on demand — and opt into the beta and canary channels when you want tomorrow's build today."
              actions={
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<RefreshOutlined />}
                  onClick={() => status.refetch()}
                  disabled={status.isFetching}
                  sx={{ width: { xs: "100%", md: "auto" } }}
                >
                  {status.isFetching ? "Checking..." : "Check for updates"}
                </Button>
              }
            >
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  label={`Portal ${portalVersion ? `v${portalVersion}` : "—"}`}
                  sx={{ color: "#FFF", backgroundColor: alpha("#FFFFFF", 0.12) }}
                />
                <Chip
                  label={`API ${apiVersion ? `v${apiVersion}` : "—"}`}
                  sx={{ color: "#FFF", backgroundColor: alpha("#FFFFFF", 0.12) }}
                />
                {stableUpdateAvailable === true && (
                  <Chip label="Update available" color="warning" sx={{ fontWeight: 700 }} />
                )}
                {stableUpdateAvailable === false && (
                  <Chip label="Up to date with stable" color="success" sx={{ fontWeight: 700 }} />
                )}
              </Stack>
            </OmzigPageHero>

            {status.isError && (
              <Alert severity="error">
                Unable to load update status from the API. The Update Center needs the
                ListOmzigUpdateStatus endpoint deployed.
              </Alert>
            )}

            {status.isSuccess && !githubReady && (
              <Alert severity="warning">
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  One-click installs need two things set up first:
                </Typography>
                <Typography variant="body2" component="div">
                  1. The <code>omzig-update-install</code> workflow must exist on the default
                  branch of {status.data?.Repos?.Frontend?.Fork} and{" "}
                  {status.data?.Repos?.Api?.Fork} (it ships with the overlay PRs — merge them, or
                  cherry-pick the workflow files).
                  <br />
                  2. A GitHub fine-grained PAT with <strong>Contents: Read/Write</strong>,{" "}
                  <strong>Actions: Read/Write</strong>, <strong>Variables: Read/Write</strong> and{" "}
                  <strong>Pull requests: Read/Write</strong> on both repositories, pasted into
                  Settings → Integrations → GitHub.
                  <br />
                  Until then this page is read-only — you can still run the install workflow by
                  hand from each repository&apos;s Actions tab once step 1 is done.
                </Typography>
              </Alert>
            )}

            {/* Access control banner — who may trigger updates */}
            {status.isSuccess && (
              <Alert severity={isUpdater ? "success" : "info"} icon={<LockPersonOutlined />}>
                {!groupConfigured ? (
                  isSuperAdmin ? (
                    "Updates are locked down — no updater group is set yet. Choose the Entra security group whose members may trigger updates below."
                  ) : (
                    "Updates are locked down until a superadmin designates an updater group."
                  )
                ) : isUpdater ? (
                  <>
                    You&apos;re a member of the updater group
                    {access.UpdaterGroupName ? ` "${access.UpdaterGroupName}"` : ""} — you can
                    install updates and change the schedule.
                  </>
                ) : (
                  <>
                    Updates are restricted to members of the Entra group
                    {access.UpdaterGroupName ? ` "${access.UpdaterGroupName}"` : ""}. You can view
                    status here, but only group members can install or change the schedule.
                  </>
                )}
              </Alert>
            )}

            {/* Superadmin-only: designate the updater group */}
            {status.isSuccess && isSuperAdmin && (
              <Card>
                <CardHeader
                  avatar={
                    <Avatar variant="rounded" sx={{ background: `linear-gradient(135deg, ${omzigScale[400]}, ${omzigScale[700]})`, color: "#FFFFFF" }}>
                      <GroupsOutlined />
                    </Avatar>
                  }
                  title="Who can trigger updates"
                  subheader="Only members of this Entra security group may install updates or change the schedule. As a superadmin you can change the group at any time (you don't need to be a member to change it)."
                />
                <CardContent>
                  <Grid container spacing={2} alignItems="flex-start">
                    <Grid size={{ xs: 12, sm: 7 }}>
                      <Typography variant="caption" color="text.secondary">
                        Entra group object ID (GUID)
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="00000000-0000-0000-0000-000000000000"
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Friendly name (optional)
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="ŌMZIG Updaters"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Button
                        variant="contained"
                        onClick={handleSaveGroup}
                        disabled={execUpdates.isPending}
                        sx={{ width: { xs: "100%", sm: "auto" } }}
                      >
                        {activeAction === "group" && execUpdates.isPending ? "Saving..." : "Save updater group"}
                      </Button>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Find the object ID in Entra → Groups → your group → Overview. Leave blank and
                        save to lock updates down entirely.
                      </Typography>
                    </Grid>
                    {activeAction === "group" && <Grid size={{ xs: 12 }}><CippApiResults apiObject={execUpdates} /></Grid>}
                  </Grid>
                </CardContent>
              </Card>
            )}

            {status.isLoading ? (
              <Grid container spacing={2.5}>
                {[0, 1, 2].map((i) => (
                  <Grid key={i} size={{ xs: 12, md: 4 }}>
                    <Skeleton variant="rounded" height={300} />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Typography variant="h6">Channels</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Switch
                      size="small"
                      checked={installAsPr}
                      onChange={(e) => setInstallAsPr(e.target.checked)}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Open on-demand installs as review PRs instead of installing directly
                    </Typography>
                  </Stack>
                </Stack>

                <Grid container spacing={2.5}>
                  {CHANNELS.map((channel, index) => {
                    const frontendInfo = channelSideInfo("Frontend", channel.key);
                    const apiInfo = channelSideInfo("Api", channel.key);
                    const isActive = activeAction === `install-${channel.key}`;
                    const unavailable = channel.key === "prerelease" && !frontendInfo && !apiInfo;

                    return (
                      <Grid key={channel.key} size={{ xs: 12, md: 4 }}>
                        <Card
                          data-omzig-motion
                          sx={{
                            height: "100%",
                            position: "relative",
                            overflow: "hidden",
                            animation: `omzigFadeUp 420ms ease ${index * 60}ms both`,
                            "&::before": {
                              content: '""',
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              height: 3,
                              background: `linear-gradient(90deg, ${channel.from}, ${channel.to})`,
                            },
                          }}
                        >
                          <CardHeader
                            avatar={
                              <Avatar
                                variant="rounded"
                                sx={{
                                  background: `linear-gradient(135deg, ${channel.from}, ${channel.to})`,
                                  color: "#FFFFFF",
                                  boxShadow: `0 6px 18px -6px ${alpha(channel.from, 0.8)}`,
                                }}
                              >
                                {channel.icon}
                              </Avatar>
                            }
                            title={channel.title}
                            subheader={
                              channel.key === "stable"
                                ? "Recommended"
                                : channel.key === "prerelease"
                                  ? "Early access"
                                  : "Bleeding edge"
                            }
                          />
                          <CardContent>
                            <Stack spacing={2}>
                              <Typography variant="body2" color="text.secondary">
                                {channel.description}
                              </Typography>

                              <Stack spacing={1}>
                                {[
                                  { label: "Frontend", info: frontendInfo },
                                  { label: "API", info: apiInfo },
                                ].map(({ label, info }) => (
                                  <Stack
                                    key={label}
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="center"
                                  >
                                    <Typography variant="caption" color="text.secondary">
                                      {label}
                                    </Typography>
                                    {info ? (
                                      <Tooltip title={`Published ${formatDate(info.date)}`}>
                                        <Link
                                          href={info.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          variant="body2"
                                          sx={{ fontVariantNumeric: "tabular-nums" }}
                                        >
                                          {info.label}
                                        </Link>
                                      </Tooltip>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        {channel.key === "prerelease"
                                          ? "None published"
                                          : "Unavailable"}
                                      </Typography>
                                    )}
                                  </Stack>
                                ))}
                              </Stack>

                              {unavailable && (
                                <Alert severity="info" variant="outlined">
                                  No prerelease is currently published upstream — installing Beta
                                  right now uses the dev branch instead.
                                </Alert>
                              )}

                              <Divider />

                              <Tooltip
                                title={
                                  canWrite
                                    ? ""
                                    : !githubReady
                                      ? "Configure the GitHub integration to enable installs"
                                      : "Only members of the updater group can install updates"
                                }
                              >
                                <span style={{ display: "block" }}>
                                  <Button
                                    fullWidth
                                    variant={channel.key === "stable" ? "contained" : "outlined"}
                                    startIcon={<SystemUpdateAltOutlined />}
                                    onClick={() => handleInstall(channel.key)}
                                    disabled={!canWrite || execUpdates.isPending}
                                  >
                                    {isActive && execUpdates.isPending
                                      ? "Dispatching..."
                                      : effectivePrMode(channel.key)
                                        ? `Open ${channel.title} update PR`
                                        : `Install ${channel.title} now`}
                                  </Button>
                                </span>
                              </Tooltip>
                              {channel.key !== "stable" && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                  Beta and canary always open a review PR — they&apos;re never
                                  installed straight to production.
                                </Typography>
                              )}

                              <Typography variant="caption" color="text.secondary">
                                Or run it by hand:{" "}
                                <Link
                                  href={`https://github.com/${status.data?.Repos?.Frontend?.Fork}/actions/workflows/omzig-update-install.yml`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  frontend workflow
                                </Link>{" "}
                                ·{" "}
                                <Link
                                  href={`https://github.com/${status.data?.Repos?.Api?.Fork}/actions/workflows/omzig-update-install.yml`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  API workflow
                                </Link>
                              </Typography>

                              {isActive && <CippApiResults apiObject={execUpdates} />}
                              {isActive && execUpdates.isSuccess && (
                                <Typography variant="caption" color="text.secondary">
                                  Update dispatched — follow progress on the{" "}
                                  <Link
                                    href={`https://github.com/${status.data?.Repos?.Frontend?.Fork}/actions/workflows/omzig-update-install.yml`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    frontend
                                  </Link>{" "}
                                  and{" "}
                                  <Link
                                    href={`https://github.com/${status.data?.Repos?.Api?.Fork}/actions/workflows/omzig-update-install.yml`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    API
                                  </Link>{" "}
                                  workflow runs.
                                </Typography>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>

                {/* ---------- Scheduled updates ---------- */}
                <Card data-omzig-motion sx={{ animation: "omzigFadeUp 420ms ease 180ms both" }}>
                  <CardHeader
                    avatar={
                      <Avatar
                        variant="rounded"
                        sx={{
                          background: `linear-gradient(135deg, ${omzigScale[400]}, ${omzigScale[700]})`,
                          color: "#FFFFFF",
                        }}
                      >
                        <ScheduleOutlined />
                      </Avatar>
                    }
                    title="Scheduled updates"
                    subheader="Checks CIPP's official GitHub daily at 09:00 UTC and installs whatever your channel is tracking"
                  />
                  <CardContent>
                    <Stack spacing={2.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Switch
                          checked={autoUpdate}
                          onChange={(e) => setAutoUpdate(e.target.checked)}
                        />
                        <Typography variant="body2">
                          {autoUpdate ? "Scheduled updates are ON" : "Scheduled updates are OFF"}
                        </Typography>
                      </Stack>

                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Typography variant="caption" color="text.secondary">
                            Channel to track
                          </Typography>
                          <Select
                            fullWidth
                            size="small"
                            value={scheduleChannel}
                            onChange={(e) => setScheduleChannel(e.target.value)}
                          >
                            <MenuItem value="stable">Stable (recommended)</MenuItem>
                            <MenuItem value="prerelease">Beta (prerelease)</MenuItem>
                            <MenuItem value="dev">Canary (dev branch)</MenuItem>
                          </Select>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Typography variant="caption" color="text.secondary">
                            When an update is found
                          </Typography>
                          <Select
                            fullWidth
                            size="small"
                            value={scheduleMode}
                            onChange={(e) => setScheduleMode(e.target.value)}
                          >
                            <MenuItem value="install">Install it directly</MenuItem>
                            <MenuItem value="pr">Open a PR for review</MenuItem>
                          </Select>
                        </Grid>
                      </Grid>

                      <Box>
                        <Tooltip
                          title={
                            canWrite
                              ? ""
                              : !githubReady
                                ? "Configure the GitHub integration to make the schedule live"
                                : "Only members of the updater group can change the schedule"
                          }
                        >
                          <span style={{ display: "inline-block" }}>
                            <Button
                              variant="contained"
                              onClick={handleSaveSchedule}
                              disabled={!canWrite || execUpdates.isPending}
                              sx={{ width: { xs: "100%", sm: "auto" } }}
                            >
                              {activeAction === "schedule" && execUpdates.isPending
                                ? "Saving..."
                                : "Save schedule"}
                            </Button>
                          </span>
                        </Tooltip>
                      </Box>

                      {activeAction === "schedule" && <CippApiResults apiObject={execUpdates} />}
                      {scheduleResult && scheduleResult.AppliedToGitHub === false && (
                        <Alert severity="warning">
                          The schedule was saved, but it isn&apos;t live on the repositories yet:{" "}
                          {(scheduleResult.Errors || []).join(" ")}
                        </Alert>
                      )}
                      {scheduleResult && scheduleResult.AppliedToGitHub === true && (
                        <Alert severity="success">
                          Schedule is live — the daily install workflow on both repositories now
                          tracks the {scheduleResult.Channel} channel (
                          {scheduleResult.Mode === "pr" ? "PRs for review" : "direct installs"}).
                        </Alert>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </>
            )}
          </Stack>
        </Container>
      </Box>
    </>
  );
};

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;

export default Page;
