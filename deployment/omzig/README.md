# ŌMZIG Portal — Azure Infrastructure

Bicep for the three Omzig environments (Omzig Custom CIPP Build v1.1 §11):

| Environment | Resource group | Location | Domain |
|---|---|---|---|
| prod | `rg-omzig-cipp-prod` | East US 2 | `dashboard.omzig.it` + `client.dashboard.omzig.it` |
| stage | `rg-omzig-cipp-stage` | East US 2 | `stage.dashboard.omzig.it` |
| dev | `rg-omzig-cipp-dev` | Central US | SWA default hostname (no custom domain, no Front Door) |

All deploy into subscription `48019666-dd78-439e-9890-030ab5156f23`.

## Deploy

```bash
az account set --subscription 48019666-dd78-439e-9890-030ab5156f23

# what-if gate (CI enforces this before any apply)
az deployment sub what-if --location eastus2 \
  --template-file main.bicep --parameters env/prod.bicepparam

az deployment sub create --location eastus2 \
  --template-file main.bicep --parameters env/prod.bicepparam
```

DNS: CNAME each custom domain to the Front Door endpoint hostname emitted in the
deployment outputs, then Front Door issues the Azure-managed certificate.

## What this provisions

- **Front Door Premium + WAF** (OWASP DRS 2.1, bot manager, Omzig `/api/` rate
  rule) in front of a **Static Web App** (Next.js UI) linked to the **Function
  App** (CIPP-API, PowerShell 7.4). The `deployFrontDoor` parameter gates this
  stack: `true` for prod/stage, `false` for dev (saves ~$330/mo Premium AFD +
  WAF base cost; dev uses the SWA default hostname).
- **Container Apps environment + `omzig-mcp`** container app (§16.5) with
  dry-run-by-default env wiring, sharing Log Analytics / Key Vault / MI.
- **Key Vault** — RBAC-mode, soft-delete + purge protection; public network
  access disabled in prod (Private Endpoint wiring is milestone-2 follow-up).
  Holds the `CippStorageConnectionString` secret, delivered to the Function App
  as a versionless Key Vault reference so secret rotation propagates without
  redeployment.
- **Storage** — GRS in prod, plus the `omzig-audit-worm` container with a
  2,200-day (6-year) immutability policy for BAA-mode audit shipping (§7.9;
  all tenants default BAA=true per §17 item 11). Function App content share is
  declared in Bicep for idempotent redeploys.
- **Cosmos DB (serverless)** — continuous 7-day PITR backup, `omzig` database
  with the §14 containers (`omzig_tenants`, `omzig_audit`, `omzig_quotes`,
  `omzig_incident_windows`), local auth disabled (Entra-only).
- **Budget alert** — $400/mo baseline, notifications at 50/75/100% to
  `fdiaz@omzig.it` (§17 item 9; alert only, no hard cap). Teams-channel
  escalation is attached via an Action Group once the Ops webhook URL exists.
- **Managed identity + RBAC** for Function App and MCP app (Key Vault Secrets
  User, Storage Blob Data Contributor). No secrets in code or config.

## Known follow-ups (tracked for milestone 2)

- Private Endpoints + VNet integration for Key Vault / Storage / Cosmos
  (`publicNetworkAccess` already flips to `Disabled` in prod).
- Action Group with the Omzig Ops Teams webhook for budget escalation.
- ARM-template export for Sponsor-Instance parity (§11.3).
- Immutability policy **lock** in prod (locking is irreversible, so it is a
  deliberate manual step Frank performs after validation).
