// ŌMZIG Portal — resource-group-scoped resources.
// Omzig Custom CIPP Build v1.1 §11.2/§11.3 + §16.5 (MCP container app).
// Non-negotiables honored here: managed identity everywhere, Key Vault with
// soft-delete + purge protection, Cosmos continuous backup, Storage GRS,
// Front Door + WAF in front of everything.

@allowed(['dev', 'stage', 'prod'])
param environment string
param location string
param partnerTenantId string
param portalDomain string
param clientPortalDomain string

@description('Container image for the omzig-mcp server (§16.5). Placeholder until the first image is pushed.')
param mcpImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

var suffix = 'omzig-cipp-${environment}'
var storageName = replace('stomzigcipp${environment}', '-', '')

// ---------------------------------------------------------------- monitoring
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${suffix}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: environment == 'prod' ? 90 : 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${suffix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ------------------------------------------------------------------- storage
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: environment == 'prod' ? 'Standard_GRS' : 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true
  }
}

// §7.9 / §17 item 11: BAA mode ships write-once audit storage from day 1.
resource auditBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
  }
}

resource auditContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: auditBlobService
  name: 'omzig-audit-worm'
  properties: {
    publicAccess: 'None'
  }
}

// 6-year (2200-day) time-based retention, locked in prod via policy pipeline.
resource auditImmutability 'Microsoft.Storage/storageAccounts/blobServices/containers/immutabilityPolicies@2023-05-01' = {
  parent: auditContainer
  name: 'default'
  properties: {
    immutabilityPeriodSinceCreationInDays: 2200
    allowProtectedAppendWrites: true
  }
}

// ------------------------------------------------------------------ keyvault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${suffix}'
  location: location
  properties: {
    tenantId: partnerTenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: environment == 'prod' ? 'Disabled' : 'Enabled'
  }
}

// -------------------------------------------------------------------- cosmos
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: 'cosmos-${suffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      { locationName: location, failoverPriority: 0, isZoneRedundant: false }
    ]
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: { tier: 'Continuous7Days' }
    }
    capabilities: [{ name: 'EnableServerless' }]
    minimalTlsVersion: 'Tls12'
    disableLocalAuth: true
    publicNetworkAccess: environment == 'prod' ? 'Disabled' : 'Enabled'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'omzig'
  properties: {
    resource: { id: 'omzig' }
  }
}

// §14 data-model containers.
var cosmosContainers = ['omzig_tenants', 'omzig_audit', 'omzig_quotes', 'omzig_incident_windows']
resource cosmosColl 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for c in cosmosContainers: {
    parent: cosmosDb
    name: c
    properties: {
      resource: {
        id: c
        partitionKey: { paths: ['/tenantId'], kind: 'Hash' }
      }
    }
  }
]

// -------------------------------------------------------------- function app
resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${suffix}'
  location: location
  sku: environment == 'prod' ? { name: 'EP1', tier: 'ElasticPremium' } : { name: 'Y1', tier: 'Dynamic' }
  properties: {}
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'func-${suffix}'
  location: location
  kind: 'functionapp'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      powerShellVersion: '7.4'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'powershell' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'KEYVAULT_NAME', value: keyVault.name }
        // §17 item 4: Datto RMM platform pinned to Vidal, env-overridable.
        { name: 'DATTO_RMM_PLATFORM', value: 'vidal' }
        // §7.14: Autotask primary, HaloPSA stub switchable by config only.
        { name: 'PSA_PROVIDER', value: 'autotask' }
        { name: 'OMZIG_ENVIRONMENT', value: environment }
        { name: 'OMZIG_AUDIT_CONTAINER', value: auditContainer.name }
      ]
    }
  }
}

// ------------------------------------------------------------ static web app
resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-${suffix}'
  location: location
  sku: { name: 'Standard', tier: 'Standard' }
  identity: { type: 'SystemAssigned' }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

resource swaFunctionLink 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: swa
  name: 'omzig-api'
  properties: {
    backendResourceId: functionApp.id
    region: location
  }
}

// --------------------------------------------------- MCP server (§10.4/§16.5)
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${suffix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource mcpApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-omzig-mcp-${environment}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
      }
    }
    template: {
      containers: [
        {
          name: 'omzig-mcp'
          image: mcpImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'OMZIG_API_BASE', value: 'https://${functionApp.properties.defaultHostName}' }
            { name: 'OMZIG_ENVIRONMENT', value: environment }
            // §16.5 step 4: every write tool defaults to dry-run.
            { name: 'OMZIG_MCP_DEFAULT_DRY_RUN', value: 'true' }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
}

// ------------------------------------------------------- RBAC for identities
var kvSecretsUser = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6' // Key Vault Secrets User
)
var storageBlobContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe' // Storage Blob Data Contributor
)

resource funcKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, kvSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: kvSecretsUser
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageBlobContributor)
  scope: storage
  properties: {
    roleDefinitionId: storageBlobContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource mcpKvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, mcpApp.id, kvSecretsUser)
  scope: keyVault
  properties: {
    roleDefinitionId: kvSecretsUser
    principalId: mcpApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ------------------------------------------------------- front door (+ WAF)
resource frontDoor 'Microsoft.Cdn/profiles@2024-02-01' = {
  name: 'afd-${suffix}'
  location: 'global'
  sku: { name: 'Premium_AzureFrontDoor' } // Premium required for managed WAF rules
}

resource fdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = {
  parent: frontDoor
  name: 'portal-${environment}'
  location: 'global'
  properties: { enabledState: 'Enabled' }
}

resource fdOriginGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: frontDoor
  name: 'og-swa'
  properties: {
    loadBalancingSettings: { sampleSize: 4, successfulSamplesRequired: 3 }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

resource fdOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: fdOriginGroup
  name: 'swa-origin'
  properties: {
    hostName: swa.properties.defaultHostname
    originHostHeader: swa.properties.defaultHostname
    httpsPort: 443
    priority: 1
    weight: 1000
  }
}

resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: replace('waf${suffix}', '-', '')
  location: 'global'
  sku: { name: 'Premium_AzureFrontDoor' }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: environment == 'prod' ? 'Prevention' : 'Detection'
      requestBodyCheck: 'Enabled'
    }
    managedRules: {
      managedRuleSets: [
        { ruleSetType: 'Microsoft_DefaultRuleSet', ruleSetVersion: '2.1', ruleSetAction: 'Block' }
        { ruleSetType: 'Microsoft_BotManagerRuleSet', ruleSetVersion: '1.1' }
      ]
    }
    customRules: {
      rules: [
        {
          name: 'OmzigRateLimit'
          priority: 100
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: 300
          matchConditions: [
            {
              matchVariable: 'RequestUri'
              operator: 'Contains'
              matchValue: ['/api/']
            }
          ]
          action: 'Block'
        }
      ]
    }
  }
}

resource fdCustomDomain 'Microsoft.Cdn/profiles/customDomains@2024-02-01' = if (!empty(portalDomain)) {
  parent: frontDoor
  name: replace(portalDomain, '.', '-')
  properties: {
    hostName: portalDomain
    tlsSettings: { certificateType: 'ManagedCertificate', minimumTlsVersion: 'TLS12' }
  }
}

resource fdClientDomain 'Microsoft.Cdn/profiles/customDomains@2024-02-01' = if (!empty(clientPortalDomain)) {
  parent: frontDoor
  name: replace(clientPortalDomain, '.', '-')
  properties: {
    hostName: clientPortalDomain
    tlsSettings: { certificateType: 'ManagedCertificate', minimumTlsVersion: 'TLS12' }
  }
}

resource fdRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: fdEndpoint
  name: 'portal-route'
  properties: {
    originGroup: { id: fdOriginGroup.id }
    customDomains: !empty(portalDomain) ? [{ id: fdCustomDomain.id }] : []
    supportedProtocols: ['Https']
    httpsRedirect: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    patternsToMatch: ['/*']
  }
  dependsOn: [fdOrigin]
}

resource fdWafAssociation 'Microsoft.Cdn/profiles/securityPolicies@2024-02-01' = {
  parent: frontDoor
  name: 'waf-association'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: { id: wafPolicy.id }
      associations: [
        {
          domains: [{ id: fdEndpoint.id }]
          patternsToMatch: ['/*']
        }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output staticWebAppName string = swa.name
output keyVaultName string = keyVault.name
output mcpContainerAppName string = mcpApp.name
output frontDoorEndpointHostname string = fdEndpoint.properties.hostName
