// ŌMZIG Portal — subscription-scoped entry point.
// Omzig Custom CIPP Build v1.1 §11. Creates the environment resource group,
// the $400/mo budget alert (§17 item 9) and all portal resources.
//
// Deploy (what-if gated in CI):
//   az deployment sub what-if --location eastus2 \
//     --template-file main.bicep --parameters env/prod.bicepparam
targetScope = 'subscription'

@allowed(['dev', 'stage', 'prod'])
param environment string

@description('SWA-supported region for all resources.')
param location string = 'eastus2'

@description('Entra tenant ID hosting the portal identity.')
param partnerTenantId string

@description('Custom portal domain, empty for none (dev uses the Front Door default hostname).')
param portalDomain string = ''

@description('Client portal domain (§7.15), empty for none.')
param clientPortalDomain string = ''

@description('Monthly budget alert baseline in USD — alert only, no hard cap.')
param budgetAmount int = 400

@description('Budget + ops notification recipients.')
param alertEmails array = ['fdiaz@omzig.it']

@description('Deploy Front Door Premium + WAF. Required for prod/stage; dev can ride the SWA default hostname to save ~$330/mo.')
param deployFrontDoor bool = true

var rgName = 'rg-omzig-cipp-${environment}'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
  tags: {
    workload: 'omzig-portal'
    environment: environment
    owner: 'fdiaz@omzig.it'
  }
}

module resources 'resources.bicep' = {
  name: 'omzig-portal-resources'
  scope: rg
  params: {
    environment: environment
    location: location
    partnerTenantId: partnerTenantId
    portalDomain: portalDomain
    clientPortalDomain: clientPortalDomain
    deployFrontDoor: deployFrontDoor
  }
}

// §17 item 9: no hard cap — notification thresholds at 50/75/100% of $400,
// scoped to this workload's resource group.
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'budget-omzig-cipp-${environment}'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '2026-08-01T00:00:00Z'
      endDate: '2036-07-31T00:00:00Z'
    }
    filter: {
      dimensions: {
        name: 'ResourceGroupName'
        operator: 'In'
        values: [rgName]
      }
    }
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        contactEmails: alertEmails
        thresholdType: 'Actual'
      }
      actual75: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 75
        contactEmails: alertEmails
        thresholdType: 'Actual'
      }
      actual100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        contactEmails: alertEmails
        thresholdType: 'Actual'
      }
    }
  }
}

output resourceGroupName string = rg.name
output functionAppName string = resources.outputs.functionAppName
output staticWebAppName string = resources.outputs.staticWebAppName
output keyVaultName string = resources.outputs.keyVaultName
output mcpContainerAppName string = resources.outputs.mcpContainerAppName
output frontDoorEndpointHostname string = resources.outputs.frontDoorEndpointHostname
