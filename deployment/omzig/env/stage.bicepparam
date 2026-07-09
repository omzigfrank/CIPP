// rg-omzig-cipp-stage — subscription 48019666-dd78-439e-9890-030ab5156f23 (§17 item 6)
using '../main.bicep'

param environment = 'stage'
param location = 'eastus2'
param partnerTenantId = '<omzig-entra-tenant-id>' // supplied at deploy time
param portalDomain = 'stage.dashboard.omzig.it'
param clientPortalDomain = ''
param budgetAmount = 400
param alertEmails = ['fdiaz@omzig.it']
