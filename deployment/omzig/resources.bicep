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

@description('Front Door Premium + WAF costs ~$330/mo base — required for prod/stage (§11.3), skippable in dev where the SWA default hostname is enough.')
param deployFrontDoor bool = true

var suffix = 'omzig-cipp-${environment}'
var storageName = replace('stomzigcipp${environment}', '-', '')
var functionContentShareName = 'func-${suffix}-content'

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

var storageConnectionString = 'DefaultEndpointsProtocol=https;EndpointSuffix=${az.environment().suffixes.storage};AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};BlobEndpoint=${storage.properties.primaryEndpoints.blob};FileEndpoint=${storage.properties.primaryEndpoints.file};QueueEndpoint=${storage.properties.primaryEndpoints.queue};TableEndpoint=${storage.properties.primaryEndpoints.table}'

resource functionFileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource functionContentShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: functionFileService
  name: functionContentShareName
  properties: {
    shareQuota: 5120
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

// CIPP's data-plane connection string lives in Key Vault; the Function App
// receives only a Key Vault *reference* so the account key never sits in
// plain-text site config. Versionless URI so key rotation propagates.
resource kvStorageSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'CippStorageConnectionString'
  properties: {
    value: storageConnectionString
  }
}

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
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        // Audit #5: never place the plain-text storage shared key in site config.
        // On the prod Elastic Premium plan the content-share connection string is
        // a Key Vault reference (same versionless secret as CIPP_STORAGE_...), and
        // WEBSITE_SKIP_CONTENTSHARE_VALIDATION lets the platform accept it (it
        // can't pre-validate the share behind a KV reference). Consumption (dev)
        // cannot resolve a KV reference for this setting at cold start, so dev
        // keeps the direct value — its vault/storage is non-production.
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: environment == 'prod' ? '@Microsoft.KeyVault(SecretUri=${kvStorageSecret.properties.secretUri})' : storageConnectionString
        }
        { name: 'WEBSITE_CONTENTSHARE', value: functionContentShare.name }
        { name: 'WEBSITE_SKIP_CONTENTSHARE_VALIDATION', value: environment == 'prod' ? '1' : '0' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'CIPP_STORAGE_CONNECTION_STRING', value: '@Microsoft.KeyVault(SecretUri=${kvStorageSecret.properties.secretUri})' }
        { name: 'CIPPNG', value: 'true' }
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
      // Audit #6: the MCP server is NOT internet-facing. It carries no
      // authentication and reaches the CIPP API, so external ingress would be
      // an open, unauthenticated front door. Internal ingress keeps it
      // reachable only from within the Container Apps environment. Enabling
      // external access later REQUIRES adding authentication (Container Apps
      // built-in auth / client cert) and fronting it with the WAF first.
      ingress: {
        external: false
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
// Audit #10: Contributor (not Owner) — CIPP needs blob read/write, not ADLS
// ownership/ACL control. Matches the deployment README.
var storageBlobDataContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe' // Storage Blob Data Contributor
)
var storageQueueDataContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor
)
var storageTableDataContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Storage Table Data Contributor
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

resource funcStorageBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageBlobDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDataContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcStorageQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageQueueDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: storageQueueDataContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource funcStorageTableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageTableDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: storageTableDataContributor
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Audit #6: the MCP server does not read Key Vault directly — it reaches
// secrets only indirectly through the authenticated CIPP API (OMZIG_API_BASE).
// The broad Key Vault Secrets User grant it previously held is removed to
// shrink the blast radius. If a future MCP tool genuinely needs a specific
// secret, add a role assignment scoped to that single secret, not the vault.

// ------------------------------------------------------- front door (+ WAF)
resource frontDoor 'Microsoft.Cdn/profiles@2024-02-01' = if (deployFrontDoor) {
  name: 'afd-${suffix}'
  location: 'global'
  sku: { name: 'Premium_AzureFrontDoor' } // Premium required for managed WAF rules
}

resource fdEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' = if (deployFrontDoor) {
  parent: frontDoor
  name: 'portal-${environment}'
  location: 'global'
  properties: { enabledState: 'Enabled' }
}

resource fdOriginGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = if (deployFrontDoor) {
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

resource fdOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = if (deployFrontDoor) {
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

resource wafPolicy 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2024-02-01' = if (deployFrontDoor) {
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

resource fdCustomDomain 'Microsoft.Cdn/profiles/customDomains@2024-02-01' = if (deployFrontDoor && !empty(portalDomain)) {
  parent: frontDoor
  name: replace(portalDomain, '.', '-')
  properties: {
    hostName: portalDomain
    tlsSettings: { certificateType: 'ManagedCertificate', minimumTlsVersion: 'TLS12' }
  }
}

resource fdClientDomain 'Microsoft.Cdn/profiles/customDomains@2024-02-01' = if (deployFrontDoor && !empty(clientPortalDomain)) {
  parent: frontDoor
  name: replace(clientPortalDomain, '.', '-')
  properties: {
    hostName: clientPortalDomain
    tlsSettings: { certificateType: 'ManagedCertificate', minimumTlsVersion: 'TLS12' }
  }
}

resource fdRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = if (deployFrontDoor) {
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

resource fdWafAssociation 'Microsoft.Cdn/profiles/securityPolicies@2024-02-01' = if (deployFrontDoor) {
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
output frontDoorEndpointHostname string = deployFrontDoor ? fdEndpoint!.properties.hostName : ''
