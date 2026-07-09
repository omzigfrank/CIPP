// rg-omzig-cipp-dev — subscription 48019666-dd78-439e-9890-030ab5156f23 (§17 item 6)
// No custom domain: dev rides the Front Door default hostname (§11.1).
using '../main.bicep'

param environment = 'dev'
param location = 'eastus2'
param partnerTenantId = '<omzig-entra-tenant-id>' // supplied at deploy time
param portalDomain = ''
param clientPortalDomain = ''
param budgetAmount = 400
param alertEmails = ['fdiaz@omzig.it']
