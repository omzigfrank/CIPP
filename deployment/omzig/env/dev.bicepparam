// rg-omzig-cipp-dev — subscription 48019666-dd78-439e-9890-030ab5156f23 (§17 item 6)
// No custom domain, and no Front Door: dev rides the SWA default hostname
// (deployFrontDoor=false saves the ~$330/mo Premium AFD + WAF base cost).
using '../main.bicep'

param environment = 'dev'
// Spec §11.1 says East US 2; dev runs in Central US (capacity/quota at first
// deploy, approved by Frank 2026-07-09). Stage and prod remain eastus2.
param location = 'centralus'
param partnerTenantId = '<omzig-entra-tenant-id>' // supplied at deploy time
param portalDomain = ''
param clientPortalDomain = ''
param budgetAmount = 400
param alertEmails = ['fdiaz@omzig.it']
param deployFrontDoor = false
